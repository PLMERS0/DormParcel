import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PageId, Parcel } from '../types.ts';

interface StudentLookupPageProps {
  parcels: Parcel[];
  overdueThresholdDays: number;
  loading: boolean;
  onNavigate: (page: PageId) => void;
}

type FilterTab = 'ALL' | 'WAITING' | 'OVERDUE' | 'PICKED_UP';

function formatThaiDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StudentLookupPage({
  parcels,
  overdueThresholdDays,
  loading,
  onNavigate,
}: StudentLookupPageProps) {
  const [query, setQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [selectedFloor, setSelectedFloor] = useState('ALL');
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);

  const floors = useMemo(() => {
    const unique = Array.from(new Set(parcels.map((p) => p.floor).filter(Boolean)));
    return ['ALL', ...unique];
  }, [parcels]);

  const metrics = useMemo(() => {
    const waiting = parcels.filter((p) => p.status === 'WAITING');
    const overdue = waiting.filter((p) => p.daysWaiting >= overdueThresholdDays);
    const picked = parcels.filter((p) => p.status === 'PICKED_UP');
    const notified = parcels.filter((p) => p.lineNotified);
    return {
      waitingCount: waiting.length,
      overdueCount: overdue.length,
      pickedCount: picked.length,
      notifiedCount: notified.length,
    };
  }, [parcels, overdueThresholdDays]);

  const filteredParcels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parcels.filter((p) => {
      if (filterTab === 'WAITING' && p.status !== 'WAITING') return false;
      if (
        filterTab === 'OVERDUE' &&
        !(p.status === 'WAITING' && p.daysWaiting >= overdueThresholdDays)
      ) {
        return false;
      }
      if (filterTab === 'PICKED_UP' && p.status !== 'PICKED_UP') return false;
      if (selectedFloor !== 'ALL' && p.floor !== selectedFloor) return false;

      if (!q) return true;
      return (
        p.studentName.toLowerCase().includes(q) ||
        (p.studentNickname || '').toLowerCase().includes(q) ||
        p.trackingNumber.toLowerCase().includes(q) ||
        p.floor.toLowerCase().includes(q) ||
        p.roomNumber.toLowerCase().includes(q) ||
        p.senderName.toLowerCase().includes(q) ||
        p.courier.toLowerCase().includes(q)
      );
    });
  }, [parcels, query, filterTab, selectedFloor, overdueThresholdDays]);

  return (
    <div className="space-y-8">
      {/* Split Hero Section */}
      <section className="surface-elevated rounded-3xl p-6 sm:p-8 lg:p-10">
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-6 lg:col-span-7">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wide text-teal-700">
                สำนักงานหอพักนักเรียน · ติดตามสถานะเรียลไทม์
              </p>
              <h1
                className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                ตรวจสอบพัสดุของฉัน และสถานะค้างรับในหอพัก
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                พิมพ์ชื่อ-นามสกุล ชื่อเล่น ห้องพัก หรือเลขพัสดุ เพื่อดูว่าพัสดุมาถึงสำนักงานหอพักแล้วหรือยัง
                วางอยู่ช่องไหน ค้างรับมาแล้วกี่วัน และมีรายการใดที่ยังไม่มารับ
              </p>
            </div>

            {/* Real-time Search Input */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาชื่อนักเรียน, ชื่อเล่น, ห้อง 304, หรือเลขพัสดุ..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-3.5 pl-12 pr-10 text-sm text-slate-900 shadow-inner transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none sm:text-base"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="ล้างคำค้นหา"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>ตัวอย่างการค้นหา: ปวริศ · ห้อง 204 · Flash Express</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate('preregister')}
                  className="font-semibold text-teal-700 hover:underline cursor-pointer"
                >
                  กำลังรอของมาส่ง? แจ้งพัสดุเข้าล่วงหน้า →
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            {!heroImgError ? (
              <div className="relative h-60 overflow-hidden rounded-2xl border border-slate-200/80 shadow-md lg:h-full lg:min-h-[260px]">
                <img
                  src="/src/assets/images/dorm_mailroom_hero_1795143559124.jpg"
                  alt="เคาน์เตอร์รับ-ส่งพัสดุสำนักงานหอพักนักเรียน"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-xs font-medium text-teal-200">
                    จุดรับพัสดุสำนักงานหอพัก
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    เปิดรับพัสดุทุกวัน 08:00 – 20:00 น. · แจ้งเตือนอัตโนมัติผ่าน Line OA
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 to-slate-100 p-6 text-center">
                <Package className="h-10 w-10 text-teal-700" />
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  สำนักงานหอพักนักเรียนกลาง
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  เปิดบริการ 08:00 – 20:00 น.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="surface-elevated rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">พัสดุรอรับที่สำนักงาน</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {metrics.waitingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">รายการที่ยังไม่มารับ</p>
        </div>

        <div className="surface-elevated rounded-2xl p-5">
          <p className="text-xs font-medium text-red-700">
            ค้างรับเกิน {overdueThresholdDays} วัน
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-red-600">
            {metrics.overdueCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">ควรรีบติดต่อรับพัสดุ</p>
        </div>

        <div className="surface-elevated rounded-2xl p-5">
          <p className="text-xs font-medium text-emerald-700">รับพัสดุไปแล้ว</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-700">
            {metrics.pickedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">ปิดงานเรียบร้อย</p>
        </div>

        <div className="surface-elevated rounded-2xl p-5">
          <p className="text-xs font-medium text-teal-700">แจ้งเตือน Line OA แล้ว</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-teal-700">
            {metrics.notifiedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">จากทั้งหมด {parcels.length} ชิ้น</p>
        </div>
      </section>

      {/* Real-Time Parcel Ledger */}
      <section className="surface-elevated rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              รายการพัสดุทั้งหมดในระบบ
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              แสดง {filteredParcels.length} จาก {parcels.length} รายการ · กดที่รายการเพื่อดูรายละเอียด
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { id: 'ALL', label: 'ทั้งหมด' },
                  { id: 'WAITING', label: 'รอรับ' },
                  { id: 'OVERDUE', label: `ค้าง ≥ ${overdueThresholdDays} วัน` },
                  { id: 'PICKED_UP', label: 'รับแล้ว' },
                ] as { id: FilterTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    filterTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              aria-label="กรองตามชั้นหรือหอพัก"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
            >
              {floors.map((fl) => (
                <option key={fl} value={fl}>
                  {fl === 'ALL' ? 'ทุกหอพัก / ทุกชั้น' : fl}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="py-14 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              ไม่พบพัสดุที่ตรงกับคำค้นหา
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ลองล้างตัวกรอง หรือแจ้งพัสดุเข้าล่วงหน้าเพื่อให้ครูหอตรวจสอบ
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilterTab('ALL');
                setSelectedFloor('ALL');
              }}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              แสดงพัสดุทั้งหมด
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 pr-4">ผู้รับ (นักเรียน)</th>
                    <th className="py-3.5 px-4">หอพัก · ชั้น · ห้อง</th>
                    <th className="py-3.5 px-4">เลขพัสดุ · ขนส่ง</th>
                    <th className="py-3.5 px-4">ผู้ส่ง / ร้านค้า</th>
                    <th className="py-3.5 px-4">ช่องวาง</th>
                    <th className="py-3.5 px-4 text-right">ค้างมาแล้ว</th>
                    <th className="py-3.5 pl-4">สถานะล่าสุด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredParcels.map((p) => {
                    const isOverdue =
                      p.status === 'WAITING' && p.daysWaiting >= overdueThresholdDays;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedParcel(p)}
                        className="cursor-pointer transition-colors hover:bg-slate-50/90"
                      >
                        <td className="py-3.5 pr-4">
                          <div className="font-semibold text-slate-900">
                            {p.studentName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {p.studentNickname ? `ชื่อเล่น ${p.studentNickname} · ` : ''}
                            มาถึง {formatThaiDate(p.arrivedAt)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          <div>{p.floor}</div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            ห้อง {p.roomNumber}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-mono-tabular text-xs font-semibold text-slate-800">
                            {p.trackingNumber}
                          </div>
                          <div className="text-xs text-slate-500">{p.courier}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{p.senderName}</td>
                        <td className="py-3.5 px-4 font-mono-tabular font-semibold text-teal-700">
                          {p.shelfSlot}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold">
                          {p.status === 'PICKED_UP' ? (
                            <span className="text-slate-400">0 วัน</span>
                          ) : (
                            <span
                              className={
                                isOverdue ? 'text-red-600' : 'text-amber-700'
                              }
                            >
                              {p.daysWaiting} วัน
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 pl-4">
                          {p.status === 'PICKED_UP' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              รับแล้ว
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              ค้างรับนาน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                              <Clock className="h-4 w-4 shrink-0" />
                              รอรับที่หอ
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="mt-4 space-y-3 md:hidden">
              {filteredParcels.map((p) => {
                const isOverdue =
                  p.status === 'WAITING' && p.daysWaiting >= overdueThresholdDays;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedParcel(p)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{p.studentName}</p>
                        <p className="text-xs text-slate-500">
                          {p.floor} · ห้อง {p.roomNumber}
                        </p>
                      </div>
                      {p.status === 'PICKED_UP' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> รับแล้ว
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> ค้าง {p.daysWaiting} วัน
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <Clock className="h-3.5 w-3.5" /> รอรับ ({p.daysWaiting} วัน)
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-mono-tabular font-medium">
                        {p.trackingNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{p.courier}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-teal-700">ช่อง {p.shelfSlot}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Parcel Detail Modal */}
      {selectedParcel && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
          onClick={() => setSelectedParcel(null)}
        >
          <div
            className="surface-elevated w-full max-w-lg rounded-3xl p-6 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="font-mono-tabular text-xs font-semibold text-teal-700">
                  {selectedParcel.id}
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  {selectedParcel.studentName}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedParcel.floor} · ห้อง {selectedParcel.roomNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParcel(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Truck className="h-3.5 w-3.5" /> บริษัทขนส่ง
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {selectedParcel.courier}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">เลขพัสดุ</dt>
                <dd className="mt-1 font-mono-tabular font-semibold text-slate-900">
                  {selectedParcel.trackingNumber}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> จุดวางพัสดุ
                </dt>
                <dd className="mt-1 font-mono-tabular font-semibold text-teal-700">
                  ช่องวาง {selectedParcel.shelfSlot}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ผู้ส่ง / ร้านค้า</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {selectedParcel.senderName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">วันที่มาถึงหอพัก</dt>
                <dd className="mt-1 text-slate-700">
                  {formatThaiDate(selectedParcel.arrivedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ระยะเวลาค้างรับ</dt>
                <dd className="mt-1 font-mono-tabular font-semibold text-slate-900">
                  {selectedParcel.status === 'PICKED_UP'
                    ? 'รับพัสดุแล้ว'
                    : `${selectedParcel.daysWaiting} วัน`}
                </dd>
              </div>
            </dl>

            {selectedParcel.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
                หมายเหตุ: {selectedParcel.notes}
              </div>
            )}

            {selectedParcel.status === 'PICKED_UP' && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3.5 text-xs text-emerald-800">
                รับพัสดุโดย: {selectedParcel.receivedBy || selectedParcel.studentName} ·{' '}
                {formatThaiDate(selectedParcel.pickedUpAt)}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedParcel(null)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
