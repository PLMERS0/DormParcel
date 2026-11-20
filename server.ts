import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GeminiServiceError, scanParcelLabelImage } from './server/gemini.ts';
import {
  createParcel,
  createPreRegistration,
  getDashboardData,
  markParcelPickedUp,
  recordLineNotification,
  removeParcel,
  updateCloudSettings,
  upsertStudentContact,
} from './server/store.ts';
import type { Parcel } from './src/types.ts';

const PORT = Number(process.env.PORT) || 3000;

function buildLineParcelMessage(parcel: Parcel, isOverdueReminder = false): string {
  if (isOverdueReminder) {
    return [
      `แจ้งเตือนพัสดุค้างรับเกินกำหนด (${parcel.daysWaiting} วัน)`,
      `ผู้รับ: ${parcel.studentName} (${parcel.floor} · ห้อง ${parcel.roomNumber})`,
      `ขนส่ง: ${parcel.courier} (${parcel.trackingNumber})`,
      `จุดวางพัสดุ: ช่อง ${parcel.shelfSlot}`,
      `กรุณาติดต่อรับพัสดุที่สำนักงานหอพักโดยเร็วที่สุด`,
    ].join('\n');
  }

  return [
    `แจ้งเตือนพัสดุมาถึงสำนักงานหอพัก`,
    `ผู้รับ: ${parcel.studentName} (${parcel.floor} · ห้อง ${parcel.roomNumber})`,
    `ขนส่ง: ${parcel.courier} (${parcel.trackingNumber})`,
    `ผู้ส่ง: ${parcel.senderName}`,
    `จุดวางพัสดุ: ช่อง ${parcel.shelfSlot}`,
    `ติดต่อรับได้ที่สำนักงานหอพักนักเรียน`,
  ].join('\n');
}

async function dispatchLineNotification(
  parcel: Parcel,
  lineUserId: string | undefined,
  isOverdueReminder = false,
) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const targetLineId = lineUserId || 'LINE_OA_UNLINKED';
  const message = buildLineParcelMessage(parcel, isOverdueReminder);

  if (token && lineUserId && !lineUserId.startsWith('LINE_OA_')) {
    try {
      const resp = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: 'text', text: message }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return await recordLineNotification({
          parcelId: parcel.id,
          studentName: parcel.studentName,
          lineUserId: targetLineId,
          message,
          deliveryMode: 'LINE_API_PUSH',
          success: false,
          error: `LINE API ${resp.status}: ${errText}`,
        });
      }

      return await recordLineNotification({
        parcelId: parcel.id,
        studentName: parcel.studentName,
        lineUserId: targetLineId,
        message,
        deliveryMode: 'LINE_API_PUSH',
        success: true,
      });
    } catch (err) {
      return await recordLineNotification({
        parcelId: parcel.id,
        studentName: parcel.studentName,
        lineUserId: targetLineId,
        message,
        deliveryMode: 'LINE_API_PUSH',
        success: false,
        error: err instanceof Error ? err.message : 'Network error sending LINE push',
      });
    }
  }

  return await recordLineNotification({
    parcelId: parcel.id,
    studentName: parcel.studentName,
    lineUserId: targetLineId,
    message,
    deliveryMode: 'SIMULATED_QUEUE',
    success: true,
  });
}

async function syncToGasWebhook(webhookUrl: string, payload: unknown) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('Optional GAS webhook sync warning:', err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/dashboard', async (_req, res) => {
    try {
      const data = await getDashboardData();
      res.json(data);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load dashboard data',
      });
    }
  });

  app.post('/api/ai/scan-label', async (req, res) => {
    try {
      const { base64Image, mimeType } = req.body as {
        base64Image?: string;
        mimeType?: string;
      };
      if (!base64Image) {
        return res.status(400).json({ error: 'กรุณาแนบไฟล์รูปภาพใบปะหน้าพัสดุ' });
      }
      const extracted = await scanParcelLabelImage(
        base64Image,
        mimeType || 'image/jpeg',
      );
      res.json(extracted);
    } catch (err) {
      const status = err instanceof GeminiServiceError ? err.status : 500;
      const message =
        err instanceof Error
          ? err.message
          : 'ไม่สามารถสแกนใบปะหน้าพัสดุด้วย AI ได้ในขณะนี้';

      if (status >= 500) {
        console.error('Gemini scan-label unexpected error:', message);
      }

      const code =
        status === 403
          ? 'BILLING_REQUIRED'
          : status === 429
            ? 'RATE_LIMITED'
            : status === 400
              ? 'INVALID_KEY'
              : 'SCAN_FAILED';

      res.status(status).json({ error: message, code });
    }
  });

  app.post('/api/parcels', async (req, res) => {
    try {
      const body = req.body;
      if (!body.studentName || !body.trackingNumber) {
        return res
          .status(400)
          .json({ error: 'กรุณาระบุชื่อนักเรียนผู้รับและเลขพัสดุ' });
      }

      const shouldNotifyLine = body.sendLineNotification !== false;
      const { parcel, matchedStudent, matchedPreReg } = await createParcel({
        studentName: body.studentName,
        studentNickname: body.studentNickname,
        floor: body.floor || '',
        roomNumber: body.roomNumber || '',
        trackingNumber: body.trackingNumber,
        courier: body.courier || 'อื่นๆ',
        senderName: body.senderName || '',
        shelfSlot: body.shelfSlot || 'A-01',
        recordedBy: body.recordedBy || 'ครูเวรหอพัก',
        notes: body.notes,
        lineNotified: shouldNotifyLine,
      });

      let lineLog = null;
      if (shouldNotifyLine) {
        const lineId = matchedStudent?.lineUserId || matchedPreReg?.lineUserId;
        lineLog = await dispatchLineNotification(parcel, lineId, false);
      }

      const dashboard = await getDashboardData();
      if (dashboard.settings.gasWebhookUrl) {
        void syncToGasWebhook(dashboard.settings.gasWebhookUrl, {
          action: 'addParcel',
          parcel,
        });
      }

      res.status(201).json({
        parcel,
        matchedPreReg,
        lineLog,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create parcel',
      });
    }
  });

  app.patch('/api/parcels/:id/pickup', async (req, res) => {
    try {
      const { id } = req.params;
      const { receivedBy } = req.body as { receivedBy?: string };
      const updated = await markParcelPickedUp(id, receivedBy || '');
      if (!updated) {
        return res.status(404).json({ error: 'ไม่พบพัสดุรายการนี้' });
      }
      const dashboard = await getDashboardData();
      if (dashboard.settings.gasWebhookUrl) {
        void syncToGasWebhook(dashboard.settings.gasWebhookUrl, {
          action: 'markPickedUp',
          parcelId: id,
          receivedBy: updated.receivedBy,
        });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to mark parcel picked up',
      });
    }
  });

  app.delete('/api/parcels/:id', async (req, res) => {
    try {
      const ok = await removeParcel(req.params.id);
      if (!ok) {
        return res.status(404).json({ error: 'ไม่พบรายการพัสดุ' });
      }
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to delete parcel',
      });
    }
  });

  app.post('/api/preregister', async (req, res) => {
    try {
      const body = req.body;
      if (!body.studentName || !body.trackingNumber) {
        return res
          .status(400)
          .json({ error: 'กรุณากรอกชื่อนักเรียนและเลขพัสดุให้ครบถ้วน' });
      }
      const created = await createPreRegistration({
        studentName: body.studentName,
        floor: body.floor || 'ไม่ระบุชั้น',
        roomNumber: body.roomNumber || '-',
        trackingNumber: body.trackingNumber,
        courier: body.courier || 'อื่นๆ',
        senderName: body.senderName || 'ไม่ระบุร้านค้า',
        expectedDate: body.expectedDate || new Date().toISOString().slice(0, 10),
        lineUserId: body.lineUserId,
        note: body.note,
      });

      const dashboard = await getDashboardData();
      if (dashboard.settings.gasWebhookUrl) {
        void syncToGasWebhook(dashboard.settings.gasWebhookUrl, {
          action: 'submitPreReg',
          preRegistration: created,
        });
      }

      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to submit pre-registration',
      });
    }
  });

  app.post('/api/students', async (req, res) => {
    try {
      const body = req.body;
      if (!body.studentName || !body.lineUserId) {
        return res
          .status(400)
          .json({ error: 'กรุณาระบุชื่อนักเรียนและ Line User ID' });
      }
      const student = await upsertStudentContact({
        studentName: body.studentName,
        nickname: body.nickname,
        floor: body.floor || 'ไม่ระบุชั้น',
        roomNumber: body.roomNumber || '-',
        lineUserId: body.lineUserId,
      });
      res.status(201).json(student);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save student contact',
      });
    }
  });

  app.post('/api/line/notify', async (req, res) => {
    try {
      const { parcelId, isOverdueReminder } = req.body as {
        parcelId?: string;
        isOverdueReminder?: boolean;
      };
      const dashboard = await getDashboardData();
      const parcel = dashboard.parcels.find((p) => p.id === parcelId);
      if (!parcel) {
        return res.status(404).json({ error: 'ไม่พบพัสดุที่ต้องการแจ้งเตือน' });
      }
      const student = dashboard.students.find(
        (s) =>
          s.studentName.trim().toLowerCase() ===
          parcel.studentName.trim().toLowerCase(),
      );
      const log = await dispatchLineNotification(
        parcel,
        student?.lineUserId,
        Boolean(isOverdueReminder),
      );
      res.json(log);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to send LINE notification',
      });
    }
  });

  app.post('/api/settings', async (req, res) => {
    try {
      const updated = await updateCloudSettings(req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update settings',
      });
    }
  });

  app.get('/api/export/csv', async (_req, res) => {
    try {
      const data = await getDashboardData();
      const header = [
        'Parcel ID',
        'Student Name',
        'Floor',
        'Room',
        'Tracking Number',
        'Courier',
        'Sender',
        'Shelf Slot',
        'Status',
        'Arrived At',
        'Days Waiting',
        'Picked Up At',
        'Received By',
        'Recorded By',
        'Line Notified',
      ];
      const rows = data.parcels.map((p) => [
        p.id,
        p.studentName,
        p.floor,
        p.roomNumber,
        p.trackingNumber,
        p.courier,
        p.senderName,
        p.shelfSlot,
        p.status,
        p.arrivedAt,
        String(p.daysWaiting),
        p.pickedUpAt || '',
        p.receivedBy || '',
        p.recordedBy,
        p.lineNotified ? 'Yes' : 'No',
      ]);
      const csvBody = [header, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="dorm-parcels-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send('\uFEFF' + csvBody);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'CSV export failed',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DormParcel server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
