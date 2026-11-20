import { GoogleGenAI, Type } from '@google/genai';
import type { ScannedLabelResult } from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class GeminiServiceError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function scanParcelLabelImage(
  base64Data: string,
  mimeType: string,
): Promise<ScannedLabelResult> {
  const ai = getAiClient();

  const cleanBase64 = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text:
              'อ่านข้อมูลจากรูปใบปะหน้าพัสดุนี้สำหรับระบบหอพักนักเรียนไทย แล้วสกัดข้อมูลออกมาเป็น JSON:\n' +
              '- recipientName: ชื่อผู้รับ (นักเรียน) ภาษาไทยหรืออังกฤษที่ชัดเจน\n' +
              '- senderName: ชื่อผู้ส่งหรือร้านค้า\n' +
              '- trackingNumber: เลขพัสดุ / Tracking No.\n' +
              '- courier: ชื่อบริษัทขนส่ง (เช่น Flash Express, Kerry Express, J&T Express, Thailand Post, SPX Express, Lazada Express, DHL)\n' +
              '- floor: ชื่ออาคารหอพัก/ชั้น หรือระดับชั้น (ถ้าพบ เช่น หอพักชาย 2 · ชั้น 3)\n' +
              '- roomNumber: เลขห้อง (ถ้าพบ เช่น 304)\n' +
              '- notes: รายละเอียดเพิ่มเติมบนฉลาก (เช่น COD, ระวังแตก, ที่อยู่ย่อ)\n' +
              '- confidence: ค่าความมั่นใจ 0-100\n' +
              'หากไม่พบฟิลด์ใดให้ใส่สตริงว่าง "" (ยกเว้น confidence ให้ประเมินเป็นตัวเลข)',
          },
        ],
      },
      config: {
        systemInstruction:
          'You are an accurate Thai & English shipping label OCR assistant for a school dormitory parcel office. Always preserve Thai names accurately.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recipientName: { type: Type.STRING },
            senderName: { type: Type.STRING },
            trackingNumber: { type: Type.STRING },
            courier: { type: Type.STRING },
            floor: { type: Type.STRING },
            roomNumber: { type: Type.STRING },
            notes: { type: Type.STRING },
            confidence: { type: Type.INTEGER },
          },
          required: [
            'recipientName',
            'senderName',
            'trackingNumber',
            'courier',
            'floor',
            'roomNumber',
            'notes',
            'confidence',
          ],
        },
      },
    });

    const text = (response.text ?? '').trim();
    if (!text) {
      throw new GeminiServiceError('AI ไม่ได้ส่งข้อมูลผลลัพธ์กลับมา กรุณาลองใหม่อีกครั้ง', 502);
    }

    return JSON.parse(text) as ScannedLabelResult;
  } catch (err) {
    if (err instanceof GeminiServiceError) throw err;
    const rawMsg = err instanceof Error ? err.message : String(err);

    if (
      rawMsg.includes('PERMISSION_DENIED') ||
      rawMsg.includes('403') ||
      rawMsg.includes('billing') ||
      rawMsg.includes('free tier is not available')
    ) {
      throw new GeminiServiceError(
        'โปรเจกต์นี้ต้องใช้ Gemini API Key ที่เปิด Billing แล้ว กรุณาเลือกหรือตรวจสอบ API Key ใน Settings > Secrets',
        403,
      );
    }
    if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('400')) {
      throw new GeminiServiceError(
        'Gemini API Key ไม่ถูกต้อง กรุณาตรวจสอบใน Settings > Secrets',
        400,
      );
    }
    if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
      throw new GeminiServiceError(
        'โควต้าการใช้งาน Gemini API เต็มชั่วคราว กรุณารอสักครู่หรืออัปเกรด Billing ใน Settings > Secrets',
        429,
      );
    }
    throw new GeminiServiceError(rawMsg, 500);
  }
}
