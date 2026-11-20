import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MessageSquare,
  Save,
  UserPlus,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type {
  CloudSettings,
  LineNotificationLog,
  StudentContact,
} from '../types.ts';

interface LineAndCloudPageProps {
  students: StudentContact[];
  lineLogs: LineNotificationLog[];
  settings: CloudSettings;
  lineApiConfigured: boolean;
  onRefresh: () => Promise<void>;
}

export function LineAndCloudPage({
  students,
  lineLogs,
  settings,
  lineApiConfigured,
  onRefresh,
}: LineAndCloudPageProps) {
  const [studentName, setStudentName] = useState('');
  const [nickname, setNickname] = useState('');
  const [floor, setFloor] = useState('หอชาย 2 · ชั้น 3');
  const [roomNumber, setRoomNumber] = useState('');
  const [lineUserId, setLineUserId] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);

  const [gasUrl, setGasUrl] = useState(settings.gasWebhookUrl);
  const [threshold, setThreshold] = useState(settings.overdueThresholdDays);
  const [savingSettings, setSavingSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSaveStudent = async (e: FormEvent) => {
    e.preventDefault();
    setSavingStudent(true);
    setNotice(null);
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          nickname,
          floor,
          roomNumber,
          lineUserId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'บันทึกไม่สำเร็จ');
      }
      setStudentName('');
      setNickname('');
      setRoomNumber('');
      setLineUserId('');
      setNotice('บันทึกข้อมูล Line User ID ของนักเรียนเรียบร้อยแล้ว');
      await onRefresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'บันทึกผิดพลาด');
    } finally {
      setSavingStudent(false);
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setNotice(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gasWebhookUrl: gasUrl,
          overdueThresholdDays: Number(threshold) || 3,
        }),
      });
      if (!res.ok) throw new Error('บันทึกการตั้งค่าไม่สำเร็จ');
      setNotice('อัปเดตการเชื่อมต่อ Google Sheet Webhook และเกณฑ์แจ้งเตือนค้างรับแล้ว');
      await onRefresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-8">
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}

      {/* Top Row: Cloud Sheet Sync + Line OA Config */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <section className="surface-elevated rounded-3xl p-6 sm:p-7 lg:col-span-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Google Sheet &amp; Cloud Sync
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                ซิงค์ข้อมูลขึ้น Google Sheet &amp; ส่งออก CSV
              </h2>
            </div>
            <FileSpreadsheet className="h-6 w-6 text-teal-700 shrink-0" />
          </div>

          <form onSubmit={handleSaveSettings} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Google Apps Script Web App URL (ไม่บังคับ — สำหรับส่งข้อมูลเข้า Sheet อัตโนมัติ)
              </label>
              <input
                type="url"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="font-mono-tabular w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                เกณฑ์พัสดุค้างรับนาน (จำนวนวัน)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="font-mono-tabular w-32 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>{savingSettings ? 'กำลังบันทึก...' : 'บันทึกการเชื่อมต่อ'}</span>
              </button>

              <a
                href="/api/export/csv"
                download
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                <span>ดาวน์โหลด CSV เข้า Google Sheets</span>
              </a>
            </div>
          </form>
        </section>

        {/* Add / Map Student Line User ID */}
        <section className="surface-elevated rounded-3xl p-6 sm:p-7 lg:col-span-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Line OA Student Mapping ·{' '}
                {lineApiConfigured
                  ? 'เชื่อมต่อ LINE Messaging API จริงแล้ว'
                  : 'โหมดคิวจำลอง (เพิ่ม LINE_CHANNEL_ACCESS_TOKEN เพื่อยิงจริง)'}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                จับคู่ชื่อนักเรียนกับ Line User ID
              </h2>
            </div>
            <UserPlus className="h-6 w-6 text-teal-700 shrink-0" />
          </div>

          <form onSubmit={handleSaveStudent} className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                ชื่อ-นามสกุลนักเรียน *
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="เช่น กิตติพงศ์ ใจดี"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                ชื่อเล่น
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="เช่น ต้นกล้า"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                ห้องพัก *
              </label>
              <input
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="304"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Line User ID (33 ตัวอักษรขึ้นต้นด้วย U) *
              </label>
              <input
                type="text"
                required
                value={lineUserId}
                onChange={(e) => setLineUserId(e.target.value)}
                placeholder="U8a72bc91d04f1e2903a8f12c9d810011"
                className="font-mono-tabular w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs focus:border-teal-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 pt-1">
              <button
                type="submit"
                disabled={savingStudent}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>{savingStudent ? 'กำลังบันทึก...' : 'บันทึกรายชื่อ Line OA'}</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Bottom Row: Student Directory & Line Push Audit Logs */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <section className="surface-elevated rounded-3xl p-6 sm:p-7 lg:col-span-6">
          <h3 className="text-base font-bold text-slate-900">
            ทะเบียนนักเรียนที่เชื่อม Line OA ({students.length} คน)
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3">ชื่อนักเรียน</th>
                  <th className="py-2.5 px-3">หอพัก · ห้อง</th>
                  <th className="py-2.5 pl-3">Line User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st) => (
                  <tr key={st.id}>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">
                      {st.studentName}
                      {st.nickname ? ` (${st.nickname})` : ''}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {st.floor} · {st.roomNumber}
                    </td>
                    <td className="py-2.5 pl-3 font-mono-tabular text-slate-500">
                      {st.lineUserId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface-elevated rounded-3xl p-6 sm:p-7 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              ประวัติการส่งข้อความ Line OA ({lineLogs.length})
            </h3>
            <MessageSquare className="h-4 w-4 text-emerald-700" />
          </div>

          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
            {lineLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">
                    ถึง: {log.studentName}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {log.deliveryMode === 'LINE_API_PUSH'
                      ? 'LINE API Push'
                      : 'คิวแจ้งเตือนสำเร็จ'}
                  </span>
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">
                  {log.message}
                </pre>
                <p className="mt-2 font-mono-tabular text-[11px] text-slate-400">
                  {new Date(log.sentAt).toLocaleString('th-TH')} · {log.lineUserId}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
