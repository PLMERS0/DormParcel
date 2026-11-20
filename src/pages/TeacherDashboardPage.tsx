import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Parcel, ScannedLabelResult } from '../types.ts';

interface TeacherDashboardPageProps {
  parcels: Parcel[];
  overdueThresholdDays: number;
  onRefresh: () => Promise<void>;
}

const COURIERS = [
  'Flash Express',
  'Kerry Express',
  'J&T Express',
  'Thailand Post',
  'SPX Express',
  'Lazada Express',
  'DHL',
  'อื่นๆ',
];

const SAMPLE_LABEL_PATH = '/src/assets/images/sample_parcel_label_1795143558737.jpg';

export function TeacherDashboardPage({
  parcels,
  overdueThresholdDays,
  onRefresh,
}: TeacherDashboardPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'info' | 'success' | 'warn' | 'error';
    message: string;
  } | null>(null);

  // Verification / Add parcel form state
  const [studentName, setStudentName] = useState('');
  const [studentNickname, setStudentNickname] = useState('');
  const [floor, setFloor] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courier, setCourier] = useState('Flash Express');
  const [senderName, setSenderName] = useState('');
  const [shelfSlot, setShelfSlot] = useState('A-01');
  const [recordedBy, setRecordedBy] = useState('ครูเวรหอพัก');
  const [notes, setNotes] = useState('');
  const [sendLineNotification, setSendLineNotification] = useState(true);
  const [savingParcel, setSavingParcel] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Table filter & pickup modal state
  const [statusFilter, setStatusFilter] = useState<'WAITING' | 'OVERDUE' | 'PICKED_UP'>('WAITING');
  const [pickupTarget, setPickupTarget] = useState<Parcel | null>(null);
  const [receivedByInput, setReceivedByInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const runAiScan = async (base64Image: string, mimeType: string) => {
    setScanning(true);
    setScanFeedback({
      type: 'info',
      message: 'AI กำลังวิเคราะห์ภาพใบปะหน้าพัสดุ (ชื่อผู้รับ, ผู้ส่ง, เลขพัสดุ, ขนส่ง, ชั้น/ห้อง)...',
    });

    try {
      const res = await fetch('/api/ai/scan-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'BILLING_REQUIRED') {
          setScanFeedback({
            type: 'warn',
            message:
              'การอ่านภาพอัตโนมัติด้วย Gemini AI ต้องใช้ API Key ที่เปิด Billing แล้วใน Settings > Secrets — คุณยังดูรูปใบปะหน้าด้านบนแล้วกรอกข้อมูลลงแบบฟอร์มทางขวาได้ทันที',
          });
          return;
        }
        throw new Error(data.error || 'AI ไม่สามารถอ่านใบปะหน้าได้');
      }

      const result = data as ScannedLabelResult;
      if (result.recipientName) setStudentName(result.recipientName);
      if (result.floor) setFloor(result.floor);
      if (result.roomNumber) setRoomNumber(result.roomNumber);
      if (result.trackingNumber) setTrackingNumber(result.trackingNumber);
      if (result.courier) {
        const matched = COURIERS.find((c) =>
          result.courier.toLowerCase().includes(c.split(' ')[0].toLowerCase()),
        );
        setCourier(matched || result.courier);
      }
      if (result.senderName) setSenderName(result.senderName);
      if (result.notes) setNotes(result.notes);

      setScanFeedback({
        type: 'success',
        message: `สแกนใบปะหน้าสำเร็จ (ความแม่นยำ ${result.confidence}%) — ตรวจสอบข้อมูลด้านขวาแล้วกดบันทึก`,
      });
    } catch (err) {
      setScanFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างสแกนภาพ',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleFillSampleForm = () => {
    setPreviewUrl(SAMPLE_LABEL_PATH);
    setStudentName('กิตติพงศ์ ใจดี');
    setStudentNickname('ต้นกล้า');
    setFloor('หอชาย 2 · ชั้น 3');
    setRoomNumber('304');
    setTrackingNumber('TH0145892341A');
    setCourier('Flash Express');
    setSenderName('Siam Book & Supply');
    setShelfSlot('A-04');
    setNotes('ตัวอย่างใบปะหน้าจากรูปภาพ — กรอกข้อมูลพร้อมทดสอบแจ้งเตือน Line OA');
    setScanFeedback({
      type: 'info',
      message: 'เติมข้อมูลตัวอย่างลงในแบบฟอร์มแล้ว ตรวจสอบและกด "อัปโหลดขึ้นเว็บ & แจ้งเตือน" ได้เลย',
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setPreviewUrl(result);
      void runAiScan(result, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  };

  const handleUseSampleImage = async () => {
    try {
      setScanning(true);
      setPreviewUrl(SAMPLE_LABEL_PATH);
      const imgResp = await fetch(SAMPLE_LABEL_PATH);
      const blob = await imgResp.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('ไม่สามารถโหลดรูปตัวอย่างได้'));
        reader.readAsDataURL(blob);
      });
      await runAiScan(base64, blob.type || 'image/jpeg');
    } catch (err) {
      setScanning(false);
      setScanFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'โหลดรูปตัวอย่างไม่สำเร็จ',
      });
    }
  };

  const handleSaveParcel = async (e: FormEvent) => {
    e.preventDefault();
    setSavingParcel(true);
    setSaveBanner(null);

    try {
      const res = await fetch('/api/parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          studentNickname,
          floor,
          roomNumber,
          trackingNumber,
          courier,
          senderName,
          shelfSlot,
          recordedBy,
          notes,
          sendLineNotification,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกพัสดุไม่สำเร็จ');
      }

      const preMsg = data.matchedPreReg
        ? ' · จับคู่กับรายการแจ้งล่วงหน้าของนักเรียนแล้ว'
        : '';
      const lineMsg = data.lineLog
        ? ' · สร้างคิวแจ้งเตือน Line OA แล้ว'
        : '';
      setSaveBanner(`บันทึกพัสดุ ${data.parcel.id} ขึ้นหน้าเว็บเรียบร้อย${preMsg}${lineMsg}`);

      setStudentName('');
      setStudentNickname('');
      setFloor('');
      setRoomNumber('');
      setTrackingNumber('');
      setSenderName('');
      setNotes('');
      setPreviewUrl('');
      setScanFeedback(null);

      await onRefresh();
    } catch (err) {
      setScanFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก',
      });
    } finally {
      setSavingParcel(false);
    }
  };

  const handleConfirmPickup = async () => {
    if (!pickupTarget) return;
    setProcessingId(pickupTarget.id);
    try {
      const res = await fetch(`/api/parcels/${pickupTarget.id}/pickup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedBy: receivedByInput || `${pickupTarget.studentName} (รับเอง)`,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'อัปเดตสถานะไม่สำเร็จ');
      }
      setPickupTarget(null);
      setReceivedByInput('');
      await onRefresh();
    } catch (err) {
      setSaveBanner(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendLineReminder = async (parcel: Parcel) => {
    setProcessingId(parcel.id);
    try {
      const res = await fetch('/api/line/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcelId: parcel.id,
          isOverdueReminder: parcel.daysWaiting >= overdueThresholdDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ส่งแจ้งเตือนไม่สำเร็จ');
      setSaveBanner(
        `ส่งแจ้งเตือน Line OA ถึง ${parcel.studentName} (${data.deliveryMode === 'LINE_API_PUSH' ? 'ส่งจริงผ่าน LINE API' : 'บันทึกคิวแจ้งเตือนแล้ว'})`,
      );
      await onRefresh();
    } catch (err) {
      setSaveBanner(err instanceof Error ? err.message : 'ส่งแจ้งเตือนล้มเหลว');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteParcel = async (parcelId: string) => {
    setProcessingId(parcelId);
    try {
      await fetch(`/api/parcels/${parcelId}`, { method: 'DELETE' });
      await onRefresh();
    } finally {
      setProcessingId(null);
    }
  };

  const managedList = useMemo(() => {
    return parcels
      .filter((p) => {
        if (statusFilter === 'WAITING') return p.status === 'WAITING';
        if (statusFilter === 'OVERDUE') {
          return p.status === 'WAITING' && p.daysWaiting >= overdueThresholdDays;
        }
        return p.status === 'PICKED_UP';
      })
      .sort((a, b) => b.daysWaiting - a.daysWaiting);
  }, [parcels, statusFilter, overdueThresholdDays]);

  return (
    <div className="space-y-8">
      {/* Scanner & Add Parcel Split */}
      <section className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* Left: AI Camera / Photo Label Scanner */}
        <div className="surface-elevated flex flex-col justify-between rounded-3xl p-6 sm:p-7 lg:col-span-5">
          <div>
            <p className="text-xs font-semibold text-teal-700">
              AI Vision Label OCR · สำหรับครูเวรหอพัก
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              สแกนหรือถ่ายรูปใบปะหน้าพัสดุ
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              AI จะจำแนกชื่อผู้รับ ชื่อผู้ส่ง เลขพัสดุ บริษัทขนส่ง และหอพัก/ชั้นให้อัตโนมัติ
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 flex min-h-[240px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-4 text-center transition-colors hover:border-teal-600 hover:bg-teal-50/30"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="ตัวอย่างใบปะหน้าพัสดุที่สแกน"
                  referrerPolicy="no-referrer"
                  className="max-h-64 w-auto rounded-xl object-contain shadow-sm"
                />
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                    <Camera className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">
                    คลิกเพื่อถ่ายรูปหรือเลือกไฟล์ใบปะหน้า
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    รองรับ JPG, PNG, WebP จากกล้องมือถือหรือคอมพิวเตอร์
                  </p>
                </>
              )}
            </div>

            {scanFeedback && (
              <div
                className={`mt-4 rounded-xl border p-3 text-xs leading-relaxed ${
                  scanFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : scanFeedback.type === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : scanFeedback.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-sky-200 bg-sky-50 text-sky-800'
                }`}
              >
                {scanning && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />}
                {scanFeedback.message}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={scanning}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>อัปโหลด / ถ่ายรูปใหม่</span>
            </button>

            <button
              type="button"
              disabled={scanning}
              onClick={handleUseSampleImage}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>สแกนรูปตัวอย่างด้วย AI</span>
            </button>
          </div>
        </div>

        {/* Right: Verification & Auto-Upload Form */}
        <div className="surface-elevated rounded-3xl p-6 sm:p-7 lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                ตรวจสอบข้อมูล &amp; อัปโหลดขึ้นหน้าเว็บ
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                กรอกข้อมูลด้วยตนเอง หรือให้ AI เติมอัตโนมัติก่อนกดอัปโหลดและแจ้งเตือน Line OA
              </p>
            </div>
            <button
              type="button"
              onClick={handleFillSampleForm}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              เติมข้อมูลตัวอย่างลงฟอร์ม
            </button>
          </div>

          {saveBanner && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
              {saveBanner}
            </div>
          )}

          <form onSubmit={handleSaveParcel} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ชื่อนักเรียนผู้รับ *
                </label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="ชื่อ-นามสกุลผู้รับ"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ชื่อเล่น (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={studentNickname}
                  onChange={(e) => setStudentNickname(e.target.value)}
                  placeholder="เช่น ต้นกล้า"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  หอพัก / ชั้น *
                </label>
                <input
                  type="text"
                  required
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  placeholder="เช่น หอชาย 2 · ชั้น 3"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  เลขห้อง *
                </label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="เช่น 304"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  เลขพัสดุ (Tracking No.) *
                </label>
                <input
                  type="text"
                  required
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="TH0145892341A"
                  className="font-mono-tabular w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm uppercase text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  บริษัทขนส่ง *
                </label>
                <select
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                >
                  {COURIERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!COURIERS.includes(courier) && (
                    <option value={courier}>{courier}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ผู้ส่ง / ร้านค้า
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Siam Book & Supply"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ช่องวางพัสดุ *
                  </label>
                  <input
                    type="text"
                    required
                    value={shelfSlot}
                    onChange={(e) => setShelfSlot(e.target.value)}
                    placeholder="A-01"
                    className="font-mono-tabular w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ครูผู้บันทึก
                  </label>
                  <input
                    type="text"
                    value={recordedBy}
                    onChange={(e) => setRecordedBy(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                หมายเหตุเพิ่มเติม
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น กล่องใหญ่, ระวังแตก"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={sendLineNotification}
                  onChange={(e) => setSendLineNotification(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>แจ้งเตือนผ่าน Line OA ถึงนักเรียนทันทีเมื่ออัปโหลด</span>
              </label>

              <button
                type="submit"
                disabled={savingParcel}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                {savingParcel ? 'กำลังอัปโหลด...' : 'อัปโหลดขึ้นเว็บ & แจ้งเตือน'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Overdue & Pickup Tracker */}
      <section className="surface-elevated rounded-3xl p-6 sm:p-7">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ติดตามการรับพัสดุ &amp; พัสดุค้างรับ
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              เรียงลำดับตามจำนวนวันที่ค้างรับจากมากไปน้อย · ครูหอสามารถกดยืนยันการรับหรือส่ง Line แจ้งเตือนซ้ำได้ทันที
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'WAITING', label: 'ยังไม่มารับทั้งหมด' },
                { id: 'OVERDUE', label: `ค้างเกิน ${overdueThresholdDays} วัน` },
                { id: 'PICKED_UP', label: 'รับแล้ว' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {managedList.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            ไม่มีรายการพัสดุในหมวดหมู่นี้
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {managedList.map((p) => {
              const isOverdue =
                p.status === 'WAITING' && p.daysWaiting >= overdueThresholdDays;
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {p.studentName}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-600">
                        {p.floor} · ห้อง {p.roomNumber}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="font-mono-tabular text-xs font-semibold text-teal-700">
                        ช่อง {p.shelfSlot}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular">{p.trackingNumber}</span>
                      <span>·</span>
                      <span>{p.courier}</span>
                      <span>·</span>
                      <span>ผู้ส่ง: {p.senderName}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {p.status === 'WAITING' ? (
                      <>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums ${
                            isOverdue ? 'text-red-600' : 'text-amber-700'
                          }`}
                        >
                          {isOverdue ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                          ค้างมาแล้ว {p.daysWaiting} วัน
                        </span>

                        <button
                          type="button"
                          disabled={processingId === p.id}
                          onClick={() => handleSendLineReminder(p)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          <span>ส่ง Line ซ้ำ</span>
                        </button>

                        <button
                          type="button"
                          disabled={processingId === p.id}
                          onClick={() => {
                            setPickupTarget(p);
                            setReceivedByInput(`${p.studentName} (รับเอง)`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>ยืนยันรับแล้ว</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          รับโดย {p.receivedBy || p.studentName}
                        </span>
                        <button
                          type="button"
                          disabled={processingId === p.id}
                          onClick={() => handleDeleteParcel(p.id)}
                          aria-label="ลบรายการ"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pickup Confirmation Dialog */}
      {pickupTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
          onClick={() => setPickupTarget(null)}
        >
          <div
            className="surface-elevated w-full max-w-md rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  ยืนยันการส่งมอบพัสดุ
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {pickupTarget.studentName} · {pickupTarget.trackingNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickupTarget(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                ชื่อผู้มารับพัสดุจริง (รับเอง / เพื่อนรับแทน)
              </label>
              <input
                type="text"
                value={receivedByInput}
                onChange={(e) => setReceivedByInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPickupTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={processingId === pickupTarget.id}
                onClick={handleConfirmPickup}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
              >
                บันทึกว่ารับพัสดุแล้ว
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
