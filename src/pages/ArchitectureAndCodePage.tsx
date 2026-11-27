import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  Code2,
  Copy,
  Database,
  Download,
  FileCode2,
  Globe,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import {
  BACKEND_CODE_GS,
  FRONTEND_INDEX_HTML,
  SETUP_COLUMNS_GS,
} from '../data/gasTemplates.ts';
import {
  CLOUDFLARE_SCHEMA_SQL,
  CLOUDFLARE_WORKER_TS,
  CLOUDFLARE_WRANGLER_TOML,
} from '../data/cloudflareTemplates.ts';

type PlatformMode = 'cloudflare' | 'gas';
type GasTab = 'setup' | 'backend' | 'frontend';
type CfTab = 'schema' | 'wrangler' | 'worker';

const DATA_FLOW_STEPS = [
  {
    step: '01',
    title: 'ฝั่งนักเรียน: แจ้งล่วงหน้า & ค้นหา',
    actor: 'Web Front-end (Index.html)',
    detail:
      'นักเรียนกรอกแบบฟอร์มแจ้งพัสดุเข้าล่วงหน้า (ชื่อ, ชั้น, ห้อง, เลขพัสดุ, Line ID) ลงสู่ Google Sheet (PreRegistrations) หรือพิมพ์ชื่อค้นหาสถานะพัสดุของตนเองแบบเรียลไทม์',
    icon: UserCheck,
  },
  {
    step: '02',
    title: 'ฝั่งครูหอ: ถ่ายรูปใบปะหน้า + AI OCR',
    actor: 'Teacher Dashboard + Gemini Vision',
    detail:
      'ครูหอถ่ายรูปหรืออัปโหลดใบปะหน้าพัสดุ ระบบส่งภาพเข้า Server / Gemini API เพื่อแยกชื่อผู้รับ, ชื่อผู้ส่ง, ชั้น/ห้อง, เลขพัสดุ และบริษัทขนส่งให้อัตโนมัติ',
    icon: Camera,
  },
  {
    step: '03',
    title: 'ประมวลผลหลังบ้าน & Cloud Sheet',
    actor: 'Code.gs / Express API',
    detail:
      'บันทึกข้อมูลเข้าชีต Parcels จับคู่กับ PreRegistrations ที่แจ้งล่วงหน้า คำนวณจำนวนวันค้างรับ (Days_Waiting) และอัปเดตสถานะ WAITING / PICKED_UP',
    icon: Database,
  },
  {
    step: '04',
    title: 'แจ้งเตือน Line OA อัตโนมัติ',
    actor: 'LINE Messaging API (Push)',
    detail:
      'ดึง Line_User_ID จากชีต Students เพื่อส่ง Push Message แจ้งเตือนนักเรียนทันทีที่พัสดุมาถึง และมี Time-driven Trigger เตือนซ้ำเมื่อค้างเกิน 3 วัน',
    icon: Bell,
  },
  {
    step: '05',
    title: 'แสดงผลหน้าเว็บ & ปิดงานรับของ',
    actor: 'Real-time MPA Dashboard',
    detail:
      'หน้าเว็บแสดงผลแบบ Multi-page พร้อมแอนิเมชัน 3D เมื่อนักเรียนมารับของ ครูหอกดยืนยันเพื่อเปลี่ยนสถานะเป็น PICKED_UP และบันทึกเวลาปิดงาน',
    icon: Globe,
  },
];

const SHEET_SCHEMAS = [
  {
    sheet: 'Parcels',
    purpose: 'เก็บรายการพัสดุหลัก สถานะ ช่องวาง และวันค้างรับ',
    columns:
      'Parcel_ID · Student_Name · Floor · Room_No · Tracking_No · Courier · Sender_Name · Shelf_Slot · Status · Arrived_At · PickedUp_At · Received_By · Recorded_By · Days_Waiting · Line_Notified · Notes',
  },
  {
    sheet: 'Students',
    purpose: 'ฐานข้อมูลจับคู่ชื่อนักเรียน ชั้น/ห้อง กับ Line User ID',
    columns:
      'Student_ID · Student_Name · Nickname · Floor · Room_No · Line_User_ID · Updated_At',
  },
  {
    sheet: 'PreRegistrations',
    purpose: 'รายการที่นักเรียนกรอกฟอร์มแจ้งพัสดุเข้าล่วงหน้า',
    columns:
      'PreReg_ID · Student_Name · Floor · Room_No · Tracking_No · Courier · Sender_Name · Expected_Date · Line_User_ID · Status · Note · Created_At',
  },
  {
    sheet: 'LineLogs',
    purpose: 'บันทึกประวัติการยิงแจ้งเตือนผ่าน Line OA',
    columns:
      'Log_ID · Parcel_ID · Student_Name · Line_User_ID · Message · Delivery_Status · Sent_At',
  },
];

export function ArchitectureAndCodePage() {
  const [platform, setPlatform] = useState<PlatformMode>('cloudflare');
  const [gasTab, setGasTab] = useState<GasTab>('setup');
  const [cfTab, setCfTab] = useState<CfTab>('schema');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const gasCodeMap: Record<
    GasTab,
    { filename: string; title: string; subtitle: string; content: string }
  > = {
    setup: {
      filename: 'Setup_Columns.gs',
      title: '1. โค้ดสร้างคอลัมน์หลังบ้านทันที (Setup_Columns.gs)',
      subtitle:
        'นำไปวางใน Apps Script แล้วกด Run ฟังก์ชัน setupDormParcelColumns() เพียงครั้งเดียว จะสร้างทั้ง 4 แผ่นงาน พร้อมหัวตาราง สี ความกว้างคอลัมน์ และ Dropdown ทันที',
      content: SETUP_COLUMNS_GS,
    },
    backend: {
      filename: 'Code.gs',
      title: '2. โค้ดหลังบ้าน Google Apps Script (Code.gs)',
      subtitle:
        'รวมฟังก์ชัน doGet, doPost, ค้นหาเรียลไทม์, AI สแกนใบปะหน้า, คำนวณวันค้างรับ, แจ้งเตือน Line OA ทันที และ Trigger เตือนค้างรับรายวัน',
      content: BACKEND_CODE_GS,
    },
    frontend: {
      filename: 'Index.html',
      title: '3. โค้ดหน้าบ้าน Google Apps Script (Index.html)',
      subtitle:
        'UI แบบ Multi-page ทันสมัย มีแสงเงา มุมโค้งมน และ Animation Transition แบบ 3D Perspective รองรับทั้งฝั่งนักเรียนและฝั่งครูหอ',
      content: FRONTEND_INDEX_HTML,
    },
  };

  const cfCodeMap: Record<
    CfTab,
    { filename: string; title: string; subtitle: string; content: string }
  > = {
    schema: {
      filename: 'schema.sql',
      title: '1. โครงสร้างฐานข้อมูล Cloudflare D1 (schema.sql)',
      subtitle:
        'สร้างตาราง parcels, pre_registrations, students, line_logs และ settings บน SQLite Edge Database ของ Cloudflare ทันที',
      content: CLOUDFLARE_SCHEMA_SQL,
    },
    wrangler: {
      filename: 'wrangler.toml',
      title: '2. ค่าคอนฟิกโฮสติ้ง + D1 + Cron (wrangler.toml)',
      subtitle:
        'ตั้งค่าเสิร์ฟไฟล์หน้าบ้าน ./dist ผ่าน Static Assets พร้อมผูกฐานข้อมูล D1 และตั้งเวลา Cron แจ้งเตือนค้างรับทุกวัน 18:00 น.',
      content: CLOUDFLARE_WRANGLER_TOML,
    },
    worker: {
      filename: 'worker.ts',
      title: '3. โค้ดหลังบ้าน Cloudflare Worker API (worker.ts)',
      subtitle:
        'รองรับทุก API ของเว็บ React ชุดนี้ทันที (/api/dashboard, /api/parcels, /api/ai/scan-label, /api/line/notify) รวมถึง Cron Trigger รายวัน',
      content: CLOUDFLARE_WORKER_TS,
    },
  };

  const currentCode =
    platform === 'cloudflare' ? cfCodeMap[cfTab] : gasCodeMap[gasTab];
  const activeKey = `${platform}-${platform === 'cloudflare' ? cfTab : gasTab}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentCode.content);
    setCopiedKey(activeKey);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode.content], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentCode.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Architecture & Data Flow Diagram */}
      <section className="surface-elevated rounded-3xl p-6 sm:p-8">
        <div className="border-b border-slate-100 pb-5">
          <p className="text-xs font-semibold text-teal-700">
            System Architecture &amp; Data Flow
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            การออกแบบ Data Flow ระบบจัดการพัสดุหอพัก
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            เชื่อมการทำงานระหว่างฝั่งนักเรียน (ค้นหา + แจ้งล่วงหน้า), ฝั่งครูหอ (AI สแกนใบปะหน้า + ปิดงาน),
            ฐานข้อมูล Google Sheet และระบบแจ้งเตือน Line OA แบบไร้รอยต่อ
          </p>
        </div>

        {/* 5-Stage Visual Flow */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
          {DATA_FLOW_STEPS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular text-xs font-bold text-teal-700">
                      ขั้นตอนที่ {item.step}
                    </span>
                    <Icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-teal-800">
                    {item.actor}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {item.detail}
                  </p>
                </div>

                {idx < DATA_FLOW_STEPS.length - 1 && (
                  <div className="mt-3 hidden items-center justify-end text-slate-400 lg:flex">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Google Sheet Database Schema Table */}
        <div className="mt-8 border-t border-slate-100 pt-6">
          <h2 className="text-base font-bold text-slate-900">
            โครงสร้างแผ่นงาน Google Sheets (4 Sheets)
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {SHEET_SCHEMAS.map((schema) => (
              <div
                key={schema.sheet}
                className="rounded-2xl border border-slate-200/80 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular text-sm font-bold text-slate-900">
                    {schema.sheet}
                  </span>
                  <span className="text-xs text-teal-700 font-medium">
                    สร้างอัตโนมัติด้วย Setup_Columns.gs
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{schema.purpose}</p>
                <p className="mt-2.5 font-mono-tabular text-[11px] leading-relaxed text-slate-500">
                  {schema.columns}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Complete Code Exporter Section */}
      <section className="surface-elevated rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-teal-700">
              Deployment &amp; Database Migration Bundles
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              ชุดโค้ดสำหรับโฮสติ้งและฐานข้อมูล
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Platform Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => setPlatform('cloudflare')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  platform === 'cloudflare'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Cloudflare (Workers + D1)
              </button>
              <button
                type="button"
                onClick={() => setPlatform('gas')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  platform === 'gas'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Google Apps Script (Sheets)
              </button>
            </div>

            {/* File Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {platform === 'cloudflare'
                ? (
                    [
                      { id: 'schema', label: '1. schema.sql' },
                      { id: 'wrangler', label: '2. wrangler.toml' },
                      { id: 'worker', label: '3. worker.ts' },
                    ] as { id: CfTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCfTab(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                        cfTab === tab.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))
                : (
                    [
                      { id: 'setup', label: '1. Setup_Columns.gs' },
                      { id: 'backend', label: '2. Code.gs' },
                      { id: 'frontend', label: '3. Index.html' },
                    ] as { id: GasTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setGasTab(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                        gasTab === tab.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              {(platform === 'gas' && gasTab === 'frontend') ||
              (platform === 'cloudflare' && cfTab === 'wrangler') ? (
                <FileCode2 className="h-4 w-4 text-teal-700" />
              ) : (
                <Code2 className="h-4 w-4 text-teal-700" />
              )}
              {currentCode.title}
            </h3>
            <p className="mt-1 text-xs text-slate-600">{currentCode.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              {copiedKey === activeKey ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>คัดลอกโค้ด</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>ดาวน์โหลด {currentCode.filename}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">
            <span className="font-mono-tabular">{currentCode.filename}</span>
            <span className="font-mono-tabular">
              {currentCode.content.split('\n').length} บรรทัด
            </span>
          </div>
          <pre className="max-h-[520px] overflow-auto p-4 font-mono-tabular text-xs leading-relaxed text-slate-100">
            <code>{currentCode.content}</code>
          </pre>
        </div>

        {platform === 'cloudflare' ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-700">
            <p className="font-bold text-slate-900">ขั้นตอนย้ายโฮสติ้งและฐานข้อมูลไป Cloudflare Workers + D1:</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>ติดตั้งเครื่องมือและล็อกอิน: <code className="font-mono-tabular">npm i -D wrangler && npx wrangler login</code></li>
              <li>สร้างฐานข้อมูล D1: <code className="font-mono-tabular">npx wrangler d1 create dorm-parcel-db</code> แล้วนำ <code className="font-mono-tabular">database_id</code> ไปใส่ใน <code className="font-mono-tabular">wrangler.toml</code></li>
              <li>สร้างตารางฐานข้อมูล: <code className="font-mono-tabular">npx wrangler d1 execute dorm-parcel-db --remote --file=./schema.sql</code></li>
              <li>ตั้งค่า Secrets: <code className="font-mono-tabular">npx wrangler secret put GEMINI_API_KEY</code> และ <code className="font-mono-tabular">npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN</code></li>
              <li>Build หน้าบ้านและ Deploy ขึ้น Cloudflare: <code className="font-mono-tabular">npm run build && npx wrangler deploy</code></li>
            </ol>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-700">
            <p className="font-bold text-slate-900">วิธีนำไปติดตั้งใน Google Sheets (ใช้เวลา 3 นาที):</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>สร้าง Google Sheets ใหม่ แล้วไปที่เมนู Extensions (ส่วนขยาย) &gt; Apps Script</li>
              <li>สร้างไฟล์สคริปต์ชื่อ Setup_Columns.gs และวางโค้ดส่วนที่ 1 จากนั้นกด Run ฟังก์ชัน setupDormParcelColumns() เพื่อให้สร้างหัวตารางทั้งหมดทันที</li>
              <li>วางโค้ดส่วนที่ 2 ลงในไฟล์ Code.gs และสร้างไฟล์ HTML ชื่อ Index แล้ววางโค้ดส่วนที่ 3</li>
              <li>ไปที่ Project Settings &gt; Script Properties เพิ่มคีย์ GEMINI_API_KEY และ LINE_CHANNEL_ACCESS_TOKEN แล้วกด Deploy &gt; New deployment &gt; Web app</li>
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
