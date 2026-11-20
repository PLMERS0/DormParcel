import { CheckCircle2, Clock, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { PreRegistration } from '../types.ts';

interface StudentFormPageProps {
  preRegistrations: PreRegistration[];
  onRefresh: () => Promise<void>;
}

const COURIER_OPTIONS = [
  'Flash Express',
  'Kerry Express',
  'J&T Express',
  'Thailand Post',
  'SPX Express',
  'Lazada Express',
  'DHL',
  'อื่นๆ',
];

export function StudentFormPage({
  preRegistrations,
  onRefresh,
}: StudentFormPageProps) {
  const [studentName, setStudentName] = useState('');
  const [floor, setFloor] = useState('หอชาย 2 · ชั้น 3');
  const [roomNumber, setRoomNumber] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courier, setCourier] = useState('Flash Express');
  const [senderName, setSenderName] = useState('');
  const [expectedDate, setExpectedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [lineUserId, setLineUserId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/preregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          floor,
          roomNumber,
          trackingNumber,
          courier,
          senderName,
          expectedDate,
          lineUserId,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
      }

      setStudentName('');
      setRoomNumber('');
      setTrackingNumber('');
      setSenderName('');
      setNote('');
      setFeedback({
        type: 'success',
        message:
          'บันทึกข้อมูลแจ้งพัสดุเข้าล่วงหน้าลง Cloud สำเร็จ! เมื่อครูหอสแกนรับพัสดุ ระบบจะจับคู่และแจ้งเตือน Line OA อัตโนมัติ',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งข้อมูล',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
      {/* Left: Student Pre-Registration Cloud Form */}
      <section className="surface-elevated rounded-3xl p-6 sm:p-8 lg:col-span-7">
        <div className="border-b border-slate-100 pb-5">
          <p className="text-xs font-semibold text-teal-700">
            Student Cloud Form · เชื่อมต่อฐานข้อมูลและ Google Sheet
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            แบบฟอร์มแจ้งพัสดุเข้าล่วงหน้า
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            กรอกข้อมูลพัสดุที่กำลังจัดส่งมาหอพัก เพื่อให้ระบบจับคู่อัตโนมัติทันทีที่ของมาถึงสำนักงาน
            และแสดงสถานะล่าสุดบนหน้าเว็บได้อย่างแม่นยำ
          </p>
        </div>

        {feedback && (
          <div
            className={`mt-5 rounded-2xl border p-4 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                ชื่อ-นามสกุลนักเรียน *
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="เช่น กิตติพงศ์ ใจดี"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
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
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                เลขห้องพัก *
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
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                เลขพัสดุ (Tracking Number) *
              </label>
              <input
                type="text"
                required
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="เช่น TH0145892341A"
                className="font-mono-tabular w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm uppercase text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                บริษัทขนส่ง *
              </label>
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              >
                {COURIER_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                ชื่อร้านค้า / ผู้ส่ง
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="เช่น Siam Book & Supply"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                วันที่คาดว่าจะถึง
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Line User ID (สำหรับรับแจ้งเตือน Line OA)
              </label>
              <input
                type="text"
                value={lineUserId}
                onChange={(e) => setLineUserId(e.target.value)}
                placeholder="U8a72bc91d04f... (ถ้ามี)"
                className="font-mono-tabular w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              รายละเอียดเพิ่มเติม (เช่น เก็บเงินปลายทาง, ของแตกหักง่าย)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ระบุหมายเหตุสำหรับครูเวรหอพัก..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? 'กำลังบันทึกลงคลาวด์...' : 'ส่งข้อมูลแจ้งพัสดุเข้า'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Right: Pre-Registered Parcels Status Feed */}
      <section className="surface-elevated flex flex-col rounded-3xl p-6 sm:p-8 lg:col-span-5">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">
            รายการแจ้งพัสดุเข้าล่าสุด
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            สถานะจะเปลี่ยนเป็น "ถึงหอพักแล้ว" อัตโนมัติเมื่อครูหอสแกนรับของ
          </p>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
          {preRegistrations.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              ยังไม่มีรายการแจ้งล่วงหน้า
            </p>
          ) : (
            preRegistrations.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{item.studentName}</p>
                    <p className="text-xs text-slate-500">
                      {item.floor} · ห้อง {item.roomNumber}
                    </p>
                  </div>
                  {item.status === 'ARRIVED' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      ถึงหอพักแล้ว
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                      <Clock className="h-3.5 w-3.5" />
                      รอของมาส่ง
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {item.trackingNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.courier}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.senderName}</span>
                </div>

                {item.note && (
                  <p className="mt-2 text-xs text-slate-500">{item.note}</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
