-- ============================================================================
-- schema.sql — โครงสร้างฐานข้อมูล Cloudflare D1 (SQLite) สำหรับ DormParcel
-- นำไปวางรันในแท็บ Console ของ D1 บนเว็บ Cloudflare Dashboard ได้ทันที
-- ============================================================================

CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_nickname TEXT DEFAULT '',
  floor TEXT NOT NULL DEFAULT 'ไม่ระบุชั้น',
  room_number TEXT NOT NULL DEFAULT '-',
  tracking_number TEXT NOT NULL,
  courier TEXT NOT NULL DEFAULT 'อื่นๆ',
  sender_name TEXT NOT NULL DEFAULT 'ไม่ระบุผู้ส่ง',
  shelf_slot TEXT NOT NULL DEFAULT 'A-01',
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'PICKED_UP')),
  arrived_at TEXT NOT NULL,
  picked_up_at TEXT,
  received_by TEXT,
  recorded_by TEXT NOT NULL DEFAULT 'ครูเวรหอพัก',
  line_notified INTEGER NOT NULL DEFAULT 0,
  line_notified_at TEXT,
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status);
CREATE INDEX IF NOT EXISTS idx_parcels_student ON parcels(student_name);
CREATE INDEX IF NOT EXISTS idx_parcels_tracking ON parcels(tracking_number);
CREATE INDEX IF NOT EXISTS idx_parcels_arrived ON parcels(arrived_at DESC);

CREATE TABLE IF NOT EXISTS pre_registrations (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  floor TEXT NOT NULL,
  room_number TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  courier TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT 'ไม่ระบุร้านค้า',
  expected_date TEXT NOT NULL,
  line_user_id TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK (status IN ('EXPECTED', 'ARRIVED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prereg_status ON pre_registrations(status);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL UNIQUE,
  nickname TEXT,
  floor TEXT NOT NULL,
  room_number TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS line_logs (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  delivery_mode TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('gasWebhookUrl', ''),
  ('dormOfficeName', 'สำนักงานหอพักนักเรียนกลาง'),
  ('overdueThresholdDays', '3');
