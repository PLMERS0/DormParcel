import fs from 'fs/promises';
import path from 'path';
import type {
  CloudSettings,
  DashboardPayload,
  LineNotificationLog,
  Parcel,
  PreRegistration,
  StudentContact,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'dorm-parcel-db.json');

interface DatabaseState {
  parcels: Omit<Parcel, 'daysWaiting'>[];
  preRegistrations: PreRegistration[];
  students: StudentContact[];
  lineLogs: LineNotificationLog[];
  settings: CloudSettings;
}

function daysAgoIso(days: number, hoursOffset = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hoursOffset, 25, 0, 0);
  return d.toISOString();
}

export function computeDaysWaiting(arrivedAt: string, pickedUpAt?: string): number {
  const start = new Date(arrivedAt).getTime();
  const end = pickedUpAt ? new Date(pickedUpAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

function createInitialSeed(): DatabaseState {
  return {
    parcels: [
      {
        id: 'PCL-2611-001',
        studentName: 'ปวริศ วัฒนากูล',
        studentNickname: 'ภีม',
        floor: 'หอชาย 1 · ชั้น 3 (ม.5)',
        roomNumber: '308',
        trackingNumber: 'TH0194827165B',
        courier: 'Flash Express',
        senderName: 'Banana IT Official',
        shelfSlot: 'A-02',
        status: 'WAITING',
        arrivedAt: daysAgoIso(5, 11),
        recordedBy: 'ครูสมชาย (เวรเช้า)',
        lineNotified: true,
        lineNotifiedAt: daysAgoIso(5, 11),
        notes: 'กล่องอุปกรณ์อิเล็กทรอนิกส์ ระวังแตก',
      },
      {
        id: 'PCL-2611-002',
        studentName: 'ณัฐนิชา สุขสันต์',
        studentNickname: 'มายด์',
        floor: 'หอหญิง 2 · ชั้น 2 (ม.4)',
        roomNumber: '204',
        trackingNumber: 'KEX9941203847',
        courier: 'Kerry Express',
        senderName: 'คุณแม่ (สุภาพร)',
        shelfSlot: 'B-05',
        status: 'WAITING',
        arrivedAt: daysAgoIso(4, 14),
        recordedBy: 'ครูรัตนา (เวรบ่าย)',
        lineNotified: true,
        lineNotifiedAt: daysAgoIso(4, 14),
        notes: 'ของใช้ส่วนตัวและขนมจากบ้าน',
      },
      {
        id: 'PCL-2611-003',
        studentName: 'ธนกฤต อัครเดชา',
        studentNickname: 'กฤต',
        floor: 'หอชาย 2 · ชั้น 4 (ม.6)',
        roomNumber: '412',
        trackingNumber: '828491029384',
        courier: 'J&T Express',
        senderName: 'Naiin Bookstore',
        shelfSlot: 'A-09',
        status: 'WAITING',
        arrivedAt: daysAgoIso(1, 15),
        recordedBy: 'ครูสมชาย (เวรบ่าย)',
        lineNotified: true,
        lineNotifiedAt: daysAgoIso(1, 15),
        notes: 'หนังสือเตรียมสอบ A-Level',
      },
      {
        id: 'PCL-2611-004',
        studentName: 'พิชญาภา เจริญผล',
        studentNickname: 'แพร',
        floor: 'หอหญิง 1 · ชั้น 3 (ม.5)',
        roomNumber: '311',
        trackingNumber: 'SPXTH049182736',
        courier: 'SPX Express',
        senderName: 'Lazada Mall Care',
        shelfSlot: 'C-01',
        status: 'WAITING',
        arrivedAt: daysAgoIso(0, 9),
        recordedBy: 'ครูรัตนา (เวรเช้า)',
        lineNotified: true,
        lineNotifiedAt: daysAgoIso(0, 9),
        notes: 'ซองพลาสติกสีขาว ขนาดกลาง',
      },
      {
        id: 'PCL-2611-005',
        studentName: 'วรเมธ ศิริวัฒน์',
        studentNickname: 'เมธ',
        floor: 'หอชาย 1 · ชั้น 2 (ม.4)',
        roomNumber: '215',
        trackingNumber: 'ED492018492TH',
        courier: 'Thailand Post',
        senderName: 'สหกรณ์โอลิมปิกวิชาการ',
        shelfSlot: 'D-03',
        status: 'PICKED_UP',
        arrivedAt: daysAgoIso(2, 10),
        pickedUpAt: daysAgoIso(1, 17),
        receivedBy: 'วรเมธ ศิริวัฒน์ (รับเอง)',
        recordedBy: 'ครูสมชาย (เวรเช้า)',
        lineNotified: true,
        lineNotifiedAt: daysAgoIso(2, 10),
        notes: 'ซองเอกสาร EMS',
      },
      {
        id: 'PCL-2611-006',
        studentName: 'กัญญาวีร์ พงษ์ไพบูลย์',
        studentNickname: 'วีร์',
        floor: 'หอหญิง 2 · ชั้น 4 (ม.6)',
        roomNumber: '402',
        trackingNumber: 'LEXTH938471029',
        courier: 'Lazada Express',
        senderName: 'B2S Stationery',
        shelfSlot: 'B-08',
        status: 'PICKED_UP',
        arrivedAt: daysAgoIso(3, 13),
        pickedUpAt: daysAgoIso(2, 16),
        receivedBy: 'กัญญาวีร์ พงษ์ไพบูลย์ (รับเอง)',
        recordedBy: 'ครูรัตนา (เวรบ่าย)',
        lineNotified: true,
        lineNotifiedAt: daysAgoIso(3, 13),
        notes: 'อุปกรณ์วาดเขียนและสมุดโน้ต',
      },
    ],
    preRegistrations: [
      {
        id: 'PRE-2611-01',
        studentName: 'กิตติพงศ์ ใจดี',
        floor: 'หอชาย 2 · ชั้น 3',
        roomNumber: '304',
        trackingNumber: 'TH0145892341A',
        courier: 'Flash Express',
        senderName: 'Siam Book & Supply',
        expectedDate: new Date().toISOString().slice(0, 10),
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810011',
        note: 'แจ้งล่วงหน้าจากนักเรียน — สั่งเครื่องเขียนและสมุดแล็บ',
        status: 'EXPECTED',
        createdAt: daysAgoIso(1, 19),
      },
      {
        id: 'PRE-2611-02',
        studentName: 'ชนาธิป มั่นคง',
        floor: 'หอชาย 1 · ชั้น 4',
        roomNumber: '405',
        trackingNumber: 'KEX8831029481',
        courier: 'Kerry Express',
        senderName: 'SportPro Thailand',
        expectedDate: new Date().toISOString().slice(0, 10),
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810022',
        note: 'รองเท้ากีฬาสำหรับคาบพละ',
        status: 'EXPECTED',
        createdAt: daysAgoIso(0, 8),
      },
    ],
    students: [
      {
        id: 'STU-001',
        studentName: 'กิตติพงศ์ ใจดี',
        nickname: 'ต้นกล้า',
        floor: 'หอชาย 2 · ชั้น 3',
        roomNumber: '304',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810011',
        updatedAt: daysAgoIso(10, 9),
      },
      {
        id: 'STU-002',
        studentName: 'ปวริศ วัฒนากูล',
        nickname: 'ภีม',
        floor: 'หอชาย 1 · ชั้น 3',
        roomNumber: '308',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810012',
        updatedAt: daysAgoIso(12, 9),
      },
      {
        id: 'STU-003',
        studentName: 'ณัฐนิชา สุขสันต์',
        nickname: 'มายด์',
        floor: 'หอหญิง 2 · ชั้น 2',
        roomNumber: '204',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810013',
        updatedAt: daysAgoIso(8, 10),
      },
      {
        id: 'STU-004',
        studentName: 'ธนกฤต อัครเดชา',
        nickname: 'กฤต',
        floor: 'หอชาย 2 · ชั้น 4',
        roomNumber: '412',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810014',
        updatedAt: daysAgoIso(6, 11),
      },
      {
        id: 'STU-005',
        studentName: 'พิชญาภา เจริญผล',
        nickname: 'แพร',
        floor: 'หอหญิง 1 · ชั้น 3',
        roomNumber: '311',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810015',
        updatedAt: daysAgoIso(5, 14),
      },
    ],
    lineLogs: [
      {
        id: 'LOG-001',
        parcelId: 'PCL-2611-004',
        studentName: 'พิชญาภา เจริญผล',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810015',
        message:
          'แจ้งเตือนพัสดุมาถึงสำนักงานหอพัก\nผู้รับ: พิชญาภา เจริญผล (ห้อง 311)\nขนส่ง: SPX Express (SPXTH049182736)\nจุดรับ: ช่องวาง C-01 กรุณารับภายใน 3 วัน',
        deliveryMode: 'SIMULATED_QUEUE',
        success: true,
        sentAt: daysAgoIso(0, 9),
      },
      {
        id: 'LOG-002',
        parcelId: 'PCL-2611-001',
        studentName: 'ปวริศ วัฒนากูล',
        lineUserId: 'U8a72bc91d04f1e2903a8f12c9d810012',
        message:
          'แจ้งเตือนพัสดุค้างรับเกิน 3 วัน\nผู้รับ: ปวริศ วัฒนากูล (ห้อง 308)\nขนส่ง: Flash Express (TH0194827165B)\nค้างรับมาแล้ว 5 วัน กรุณาติดต่อรับที่สำนักงานหอพัก',
        deliveryMode: 'SIMULATED_QUEUE',
        success: true,
        sentAt: daysAgoIso(1, 18),
      },
    ],
    settings: {
      gasWebhookUrl: '',
      dormOfficeName: 'สำนักงานหอพักนักเรียนกลาง',
      overdueThresholdDays: 3,
    },
  };
}

let writeQueue = Promise.resolve();

async function ensureDbFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    const seed = createInitialSeed();
    await fs.writeFile(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
  }
}

async function readState(): Promise<DatabaseState> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  return JSON.parse(raw) as DatabaseState;
}

async function writeState(state: DatabaseState): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await ensureDbFile();
    await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  });
  return writeQueue;
}

export async function getDashboardData(): Promise<DashboardPayload> {
  const state = await readState();
  const parcels: Parcel[] = state.parcels
    .map((p) => ({
      ...p,
      daysWaiting: computeDaysWaiting(p.arrivedAt, p.pickedUpAt),
    }))
    .sort((a, b) => new Date(b.arrivedAt).getTime() - new Date(a.arrivedAt).getTime());

  return {
    parcels,
    preRegistrations: [...state.preRegistrations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    students: state.students,
    lineLogs: [...state.lineLogs].sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    ),
    settings: state.settings,
    lineApiConfigured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
  };
}

export async function createParcel(input: {
  studentName: string;
  studentNickname?: string;
  floor: string;
  roomNumber: string;
  trackingNumber: string;
  courier: string;
  senderName: string;
  shelfSlot: string;
  recordedBy: string;
  notes?: string;
  lineNotified?: boolean;
}): Promise<{ parcel: Parcel; matchedStudent?: StudentContact; matchedPreReg?: PreRegistration }> {
  const state = await readState();
  const now = new Date().toISOString();
  const id = `PCL-${new Date().getFullYear().toString().slice(-2)}${String(
    new Date().getMonth() + 1,
  ).padStart(2, '0')}-${String(state.parcels.length + 1).padStart(3, '0')}`;

  const cleanTrack = input.trackingNumber.trim().toUpperCase();
  const cleanName = input.studentName.trim();

  const matchedPreReg = state.preRegistrations.find(
    (pr) =>
      pr.status === 'EXPECTED' &&
      ((cleanTrack && pr.trackingNumber.trim().toUpperCase() === cleanTrack) ||
        pr.studentName.trim().toLowerCase() === cleanName.toLowerCase()),
  );

  if (matchedPreReg) {
    matchedPreReg.status = 'ARRIVED';
  }

  const matchedStudent = state.students.find(
    (s) =>
      s.studentName.trim().toLowerCase() === cleanName.toLowerCase() ||
      (s.nickname && s.nickname.trim().toLowerCase() === cleanName.toLowerCase()),
  );

  const newParcelBase: Omit<Parcel, 'daysWaiting'> = {
    id,
    studentName: cleanName,
    studentNickname: input.studentNickname?.trim() || matchedStudent?.nickname || '',
    floor: input.floor.trim() || matchedStudent?.floor || 'ไม่ระบุชั้น',
    roomNumber: input.roomNumber.trim() || matchedStudent?.roomNumber || '-',
    trackingNumber: cleanTrack || `LOCAL-${Date.now().toString().slice(-6)}`,
    courier: input.courier.trim() || 'อื่นๆ',
    senderName: input.senderName.trim() || 'ไม่ระบุผู้ส่ง',
    shelfSlot: input.shelfSlot.trim() || 'A-01',
    status: 'WAITING',
    arrivedAt: now,
    recordedBy: input.recordedBy.trim() || 'ครูเวรหอพัก',
    lineNotified: Boolean(input.lineNotified),
    lineNotifiedAt: input.lineNotified ? now : undefined,
    notes: input.notes?.trim() || '',
  };

  state.parcels.unshift(newParcelBase);
  await writeState(state);

  return {
    parcel: { ...newParcelBase, daysWaiting: 0 },
    matchedStudent,
    matchedPreReg,
  };
}

export async function markParcelPickedUp(
  parcelId: string,
  receivedBy: string,
): Promise<Parcel | null> {
  const state = await readState();
  const target = state.parcels.find((p) => p.id === parcelId);
  if (!target) return null;

  target.status = 'PICKED_UP';
  target.pickedUpAt = new Date().toISOString();
  target.receivedBy = receivedBy.trim() || `${target.studentName} (รับเอง)`;
  await writeState(state);

  return {
    ...target,
    daysWaiting: computeDaysWaiting(target.arrivedAt, target.pickedUpAt),
  };
}

export async function removeParcel(parcelId: string): Promise<boolean> {
  const state = await readState();
  const before = state.parcels.length;
  state.parcels = state.parcels.filter((p) => p.id !== parcelId);
  if (state.parcels.length === before) return false;
  await writeState(state);
  return true;
}

export async function createPreRegistration(input: {
  studentName: string;
  floor: string;
  roomNumber: string;
  trackingNumber: string;
  courier: string;
  senderName: string;
  expectedDate: string;
  lineUserId?: string;
  note?: string;
}): Promise<PreRegistration> {
  const state = await readState();
  const item: PreRegistration = {
    id: `PRE-${Date.now().toString().slice(-6)}`,
    studentName: input.studentName.trim(),
    floor: input.floor.trim(),
    roomNumber: input.roomNumber.trim(),
    trackingNumber: input.trackingNumber.trim().toUpperCase(),
    courier: input.courier.trim(),
    senderName: input.senderName.trim(),
    expectedDate: input.expectedDate || new Date().toISOString().slice(0, 10),
    lineUserId: input.lineUserId?.trim() || undefined,
    note: input.note?.trim() || undefined,
    status: 'EXPECTED',
    createdAt: new Date().toISOString(),
  };

  // If student provided Line User ID, also keep directory synced
  if (item.lineUserId) {
    const existingStudent = state.students.find(
      (s) => s.studentName.trim().toLowerCase() === item.studentName.toLowerCase(),
    );
    if (existingStudent) {
      existingStudent.lineUserId = item.lineUserId;
      existingStudent.floor = item.floor;
      existingStudent.roomNumber = item.roomNumber;
      existingStudent.updatedAt = new Date().toISOString();
    } else {
      state.students.push({
        id: `STU-${String(state.students.length + 1).padStart(3, '0')}`,
        studentName: item.studentName,
        floor: item.floor,
        roomNumber: item.roomNumber,
        lineUserId: item.lineUserId,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  state.preRegistrations.unshift(item);
  await writeState(state);
  return item;
}

export async function upsertStudentContact(input: {
  studentName: string;
  nickname?: string;
  floor: string;
  roomNumber: string;
  lineUserId: string;
}): Promise<StudentContact> {
  const state = await readState();
  const cleanName = input.studentName.trim();
  const existing = state.students.find(
    (s) => s.studentName.trim().toLowerCase() === cleanName.toLowerCase(),
  );
  if (existing) {
    existing.nickname = input.nickname?.trim() || existing.nickname;
    existing.floor = input.floor.trim();
    existing.roomNumber = input.roomNumber.trim();
    existing.lineUserId = input.lineUserId.trim();
    existing.updatedAt = new Date().toISOString();
    await writeState(state);
    return existing;
  }

  const created: StudentContact = {
    id: `STU-${String(state.students.length + 1).padStart(3, '0')}`,
    studentName: cleanName,
    nickname: input.nickname?.trim() || undefined,
    floor: input.floor.trim(),
    roomNumber: input.roomNumber.trim(),
    lineUserId: input.lineUserId.trim(),
    updatedAt: new Date().toISOString(),
  };
  state.students.unshift(created);
  await writeState(state);
  return created;
}

export async function recordLineNotification(
  log: Omit<LineNotificationLog, 'id' | 'sentAt'>,
): Promise<LineNotificationLog> {
  const state = await readState();
  const entry: LineNotificationLog = {
    ...log,
    id: `LOG-${Date.now().toString().slice(-6)}`,
    sentAt: new Date().toISOString(),
  };

  // Update parcel flag if matching parcel exists
  const parcel = state.parcels.find((p) => p.id === log.parcelId);
  if (parcel && log.success) {
    parcel.lineNotified = true;
    parcel.lineNotifiedAt = entry.sentAt;
  }

  state.lineLogs.unshift(entry);
  await writeState(state);
  return entry;
}

export async function updateCloudSettings(
  patch: Partial<CloudSettings>,
): Promise<CloudSettings> {
  const state = await readState();
  state.settings = {
    ...state.settings,
    ...patch,
  };
  await writeState(state);
  return state.settings;
}
