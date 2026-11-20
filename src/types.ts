export type PageId =
  | 'lookup'
  | 'preregister'
  | 'teacher'
  | 'line-cloud'
  | 'architecture';

export type ParcelStatus = 'WAITING' | 'PICKED_UP';

export interface Parcel {
  id: string;
  studentName: string;
  studentNickname?: string;
  floor: string;
  roomNumber: string;
  trackingNumber: string;
  courier: string;
  senderName: string;
  shelfSlot: string;
  status: ParcelStatus;
  arrivedAt: string;
  pickedUpAt?: string;
  receivedBy?: string;
  recordedBy: string;
  lineNotified: boolean;
  lineNotifiedAt?: string;
  notes?: string;
  daysWaiting: number;
}

export interface PreRegistration {
  id: string;
  studentName: string;
  floor: string;
  roomNumber: string;
  trackingNumber: string;
  courier: string;
  senderName: string;
  expectedDate: string;
  lineUserId?: string;
  note?: string;
  status: 'EXPECTED' | 'ARRIVED';
  createdAt: string;
}

export interface StudentContact {
  id: string;
  studentName: string;
  nickname?: string;
  floor: string;
  roomNumber: string;
  lineUserId: string;
  updatedAt: string;
}

export interface LineNotificationLog {
  id: string;
  parcelId: string;
  studentName: string;
  lineUserId: string;
  message: string;
  deliveryMode: 'LINE_API_PUSH' | 'SIMULATED_QUEUE';
  success: boolean;
  sentAt: string;
  error?: string;
}

export interface CloudSettings {
  gasWebhookUrl: string;
  dormOfficeName: string;
  overdueThresholdDays: number;
}

export interface ScannedLabelResult {
  recipientName: string;
  senderName: string;
  trackingNumber: string;
  courier: string;
  floor: string;
  roomNumber: string;
  notes: string;
  confidence: number;
}

export interface DashboardPayload {
  parcels: Parcel[];
  preRegistrations: PreRegistration[];
  students: StudentContact[];
  lineLogs: LineNotificationLog[];
  settings: CloudSettings;
  lineApiConfigured: boolean;
}
