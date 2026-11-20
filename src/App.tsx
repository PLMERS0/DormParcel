import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { ArchitectureAndCodePage } from './pages/ArchitectureAndCodePage.tsx';
import { LineAndCloudPage } from './pages/LineAndCloudPage.tsx';
import { StudentFormPage } from './pages/StudentFormPage.tsx';
import { StudentLookupPage } from './pages/StudentLookupPage.tsx';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage.tsx';
import type { DashboardPayload, PageId } from './types.ts';

const PAGE_ORDER: PageId[] = [
  'lookup',
  'preregister',
  'teacher',
  'line-cloud',
  'architecture',
];

const EMPTY_DATA: DashboardPayload = {
  parcels: [],
  preRegistrations: [],
  students: [],
  lineLogs: [],
  settings: {
    gasWebhookUrl: '',
    dormOfficeName: 'สำนักงานหอพักนักเรียนกลาง',
    overdueThresholdDays: 3,
  },
  lineApiConfigured: false,
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('lookup');
  const [direction, setDirection] = useState<number>(1);
  const [data, setData] = useState<DashboardPayload>(EMPTY_DATA);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) {
        throw new Error('ไม่สามารถโหลดข้อมูลพัสดุได้');
      }
      const payload = (await res.json()) as DashboardPayload;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    const timer = setInterval(() => {
      void fetchDashboard();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  const handleNavigate = (nextPage: PageId) => {
    if (nextPage === currentPage) return;
    const prevIdx = PAGE_ORDER.indexOf(currentPage);
    const nextIdx = PAGE_ORDER.indexOf(nextPage);
    setDirection(nextIdx >= prevIdx ? 1 : -1);
    setCurrentPage(nextPage);
    window.scrollTo({ top: 0, behavior: shouldReduceMotion ? 'auto' : 'smooth' });
  };

  const transitionVariants = {
    initial: (dir: number) =>
      shouldReduceMotion
        ? { opacity: 0 }
        : {
            opacity: 0,
            rotateY: dir * 7,
            z: -48,
            scale: 0.985,
          },
    animate: {
      opacity: 1,
      rotateY: 0,
      z: 0,
      scale: 1,
    },
    exit: (dir: number) =>
      shouldReduceMotion
        ? { opacity: 0 }
        : {
            opacity: 0,
            rotateY: dir * -7,
            z: -48,
            scale: 0.985,
          },
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar currentPage={currentPage} onNavigate={handleNavigate} />

      <main className="perspective-stage mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentPage}
            custom={direction}
            variants={transitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{
              duration: 0.28,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {currentPage === 'lookup' && (
              <StudentLookupPage
                parcels={data.parcels}
                overdueThresholdDays={data.settings.overdueThresholdDays}
                loading={loading}
                onNavigate={handleNavigate}
              />
            )}

            {currentPage === 'preregister' && (
              <StudentFormPage
                preRegistrations={data.preRegistrations}
                onRefresh={fetchDashboard}
              />
            )}

            {currentPage === 'teacher' && (
              <TeacherDashboardPage
                parcels={data.parcels}
                overdueThresholdDays={data.settings.overdueThresholdDays}
                onRefresh={fetchDashboard}
              />
            )}

            {currentPage === 'line-cloud' && (
              <LineAndCloudPage
                students={data.students}
                lineLogs={data.lineLogs}
                settings={data.settings}
                lineApiConfigured={data.lineApiConfigured}
                onRefresh={fetchDashboard}
              />
            )}

            {currentPage === 'architecture' && <ArchitectureAndCodePage />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{data.settings.dormOfficeName} · ระบบจัดการพัสดุหอพัก</p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => handleNavigate('lookup')}
              className="hover:text-slate-900 cursor-pointer"
            >
              ค้นหาพัสดุ
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('preregister')}
              className="hover:text-slate-900 cursor-pointer"
            >
              แบบฟอร์มนักเรียน
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('teacher')}
              className="hover:text-slate-900 cursor-pointer"
            >
              สแกน AI สำหรับครูหอ
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('architecture')}
              className="font-semibold text-teal-700 hover:underline cursor-pointer"
            >
              Data Flow &amp; โค้ด Code.gs
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
