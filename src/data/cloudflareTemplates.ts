export const CLOUDFLARE_SCHEMA_SQL = `-- ============================================================================
-- schema.sql — โครงสร้างฐานข้อมูล Cloudflare D1 (SQLite) สำหรับ DormParcel
-- วิธีรัน:
--   npx wrangler d1 execute dorm-parcel-db --remote --file=./schema.sql
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
`;

export const CLOUDFLARE_WRANGLER_TOML = `# ============================================================================
# wrangler.toml — ค่าคอนฟิกสำหรับโฮสติ้งบน Cloudflare Workers + Static Assets + D1
# ============================================================================
name = "dorm-parcel"
main = "worker.ts"
compatibility_date = "2026-01-01"

# เสิร์ฟไฟล์หน้าบ้าน React (หลังรัน npm run build) จากโฟลเดอร์ ./dist
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

# ผูกฐานข้อมูล Cloudflare D1
# สร้างครั้งแรกด้วยคำสั่ง: npx wrangler d1 create dorm-parcel-db
# แล้วนำ database_id ที่ได้มาแทนที่ด้านล่าง
[[d1_databases]]
binding = "DB"
database_name = "dorm-parcel-db"
database_id = "YOUR_D1_DATABASE_ID"

# ตั้งเวลา Cron Trigger ทุกวัน 18:00 น. เวลาไทย (11:00 UTC)
# เพื่อแจ้งเตือน Line OA สำหรับพัสดุค้างรับเกินเกณฑ์อัตโนมัติ
[triggers]
crons = ["0 11 * * *"]
`;

export const CLOUDFLARE_WORKER_TS = `/**
 * ============================================================================
 * worker.ts — Backend API + Cron Trigger บน Cloudflare Workers + Cloudflare D1
 * วิธีตั้งค่า Secrets (รันใน Terminal):
 *   npx wrangler secret put GEMINI_API_KEY
 *   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
 * ============================================================================
 */

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function computeDaysWaiting(arrivedAt: string, pickedUpAt?: string | null): number {
  const start = new Date(arrivedAt).getTime();
  const end = pickedUpAt ? new Date(pickedUpAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

async function getSettingsMap(db: D1Database) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of results) map[row.key] = row.value;
  return {
    gasWebhookUrl: map.gasWebhookUrl || '',
    dormOfficeName: map.dormOfficeName || 'สำนักงานหอพักนักเรียนกลาง',
    overdueThresholdDays: Number(map.overdueThresholdDays || '3'),
  };
}

async function sendLinePushAndLog(
  env: Env,
  parcel: {
    id: string;
    studentName: string;
    floor: string;
    roomNumber: string;
    trackingNumber: string;
    courier: string;
    senderName: string;
    shelfSlot: string;
    daysWaiting: number;
  },
  lineUserId: string | undefined,
  isOverdueReminder = false,
) {
  const targetLineId = lineUserId || 'LINE_OA_UNLINKED';
  const message = isOverdueReminder
    ? [
        \`แจ้งเตือนพัสดุค้างรับเกินกำหนด (\${parcel.daysWaiting} วัน)\`,
        \`ผู้รับ: \${parcel.studentName} (\${parcel.floor} · ห้อง \${parcel.roomNumber})\`,
        \`ขนส่ง: \${parcel.courier} (\${parcel.trackingNumber})\`,
        \`จุดวางพัสดุ: ช่อง \${parcel.shelfSlot}\`,
        \`กรุณาติดต่อรับพัสดุที่สำนักงานหอพักโดยเร็วที่สุด\`,
      ].join('\\n')
    : [
        \`แจ้งเตือนพัสดุมาถึงสำนักงานหอพัก\`,
        \`ผู้รับ: \${parcel.studentName} (\${parcel.floor} · ห้อง \${parcel.roomNumber})\`,
        \`ขนส่ง: \${parcel.courier} (\${parcel.trackingNumber})\`,
        \`ผู้ส่ง: \${parcel.senderName}\`,
        \`จุดวางพัสดุ: ช่อง \${parcel.shelfSlot}\`,
        \`ติดต่อรับได้ที่สำนักงานหอพักนักเรียน\`,
      ].join('\\n');

  let deliveryMode: 'LINE_API_PUSH' | 'SIMULATED_QUEUE' = 'SIMULATED_QUEUE';
  let success = true;
  let errorMsg: string | null = null;

  if (env.LINE_CHANNEL_ACCESS_TOKEN && lineUserId && !lineUserId.startsWith('LINE_OA_')) {
    deliveryMode = 'LINE_API_PUSH';
    try {
      const resp = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: \`Bearer \${env.LINE_CHANNEL_ACCESS_TOKEN}\`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: 'text', text: message }],
        }),
      });
      if (!resp.ok) {
        success = false;
        errorMsg = \`LINE API \${resp.status}: \${await resp.text()}\`;
      }
    } catch (e) {
      success = false;
      errorMsg = e instanceof Error ? e.message : 'Network error';
    }
  }

  const logId = \`LOG-\${Date.now().toString().slice(-6)}\`;
  const sentAt = new Date().toISOString();

  await env.DB.prepare(
    \`INSERT INTO line_logs (id, parcel_id, student_name, line_user_id, message, delivery_mode, success, sent_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
  )
    .bind(logId, parcel.id, parcel.studentName, targetLineId, message, deliveryMode, success ? 1 : 0, sentAt, errorMsg)
    .run();

  if (success) {
    await env.DB.prepare('UPDATE parcels SET line_notified = 1, line_notified_at = ? WHERE id = ?')
      .bind(sentAt, parcel.id)
      .run();
  }

  return { id: logId, parcelId: parcel.id, studentName: parcel.studentName, lineUserId: targetLineId, message, deliveryMode, success, sentAt, error: errorMsg };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({ ok: true, runtime: 'cloudflare-workers', timestamp: new Date().toISOString() });
      }

      if (pathname === '/api/dashboard' && request.method === 'GET') {
        const [parcelsRes, preRes, studentsRes, logsRes, settings] = await Promise.all([
          env.DB.prepare('SELECT * FROM parcels ORDER BY arrived_at DESC').all(),
          env.DB.prepare('SELECT * FROM pre_registrations ORDER BY created_at DESC').all(),
          env.DB.prepare('SELECT * FROM students ORDER BY updated_at DESC').all(),
          env.DB.prepare('SELECT * FROM line_logs ORDER BY sent_at DESC LIMIT 100').all(),
          getSettingsMap(env.DB),
        ]);

        const parcels = (parcelsRes.results as any[]).map((r) => ({
          id: r.id,
          studentName: r.student_name,
          studentNickname: r.student_nickname || '',
          floor: r.floor,
          roomNumber: r.room_number,
          trackingNumber: r.tracking_number,
          courier: r.courier,
          senderName: r.sender_name,
          shelfSlot: r.shelf_slot,
          status: r.status,
          arrivedAt: r.arrived_at,
          pickedUpAt: r.picked_up_at || undefined,
          receivedBy: r.received_by || undefined,
          recordedBy: r.recorded_by,
          lineNotified: Boolean(r.line_notified),
          lineNotifiedAt: r.line_notified_at || undefined,
          notes: r.notes || '',
          daysWaiting: computeDaysWaiting(r.arrived_at, r.picked_up_at),
        }));

        const preRegistrations = (preRes.results as any[]).map((r) => ({
          id: r.id,
          studentName: r.student_name,
          floor: r.floor,
          roomNumber: r.room_number,
          trackingNumber: r.tracking_number,
          courier: r.courier,
          senderName: r.sender_name,
          expectedDate: r.expected_date,
          lineUserId: r.line_user_id || undefined,
          note: r.note || undefined,
          status: r.status,
          createdAt: r.created_at,
        }));

        const students = (studentsRes.results as any[]).map((r) => ({
          id: r.id,
          studentName: r.student_name,
          nickname: r.nickname || undefined,
          floor: r.floor,
          roomNumber: r.room_number,
          lineUserId: r.line_user_id,
          updatedAt: r.updated_at,
        }));

        const lineLogs = (logsRes.results as any[]).map((r) => ({
          id: r.id,
          parcelId: r.parcel_id,
          studentName: r.student_name,
          lineUserId: r.line_user_id,
          message: r.message,
          deliveryMode: r.delivery_mode,
          success: Boolean(r.success),
          sentAt: r.sent_at,
          error: r.error || undefined,
        }));

        return jsonResponse({
          parcels,
          preRegistrations,
          students,
          lineLogs,
          settings,
          lineApiConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
        });
      }

      if (pathname === '/api/ai/scan-label' && request.method === 'POST') {
        if (!env.GEMINI_API_KEY) {
          return jsonResponse({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Cloudflare Secrets', code: 'BILLING_REQUIRED' }, 403);
        }
        const { base64Image, mimeType } = (await request.json()) as { base64Image?: string; mimeType?: string };
        if (!base64Image) return jsonResponse({ error: 'กรุณาแนบไฟล์รูปภาพใบปะหน้าพัสดุ' }, 400);

        const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
        const geminiRes = await fetch(
          \`https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key=\${encodeURIComponent(env.GEMINI_API_KEY)}\`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
                  { text: 'สกัดข้อมูลใบปะหน้าพัสดุเป็น JSON: {"recipientName":"","senderName":"","trackingNumber":"","courier":"","floor":"","roomNumber":"","notes":"","confidence":95}' },
                ],
              }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );

        if (!geminiRes.ok) {
          const code = geminiRes.status === 403 ? 'BILLING_REQUIRED' : 'SCAN_FAILED';
          return jsonResponse({ error: await geminiRes.text(), code }, geminiRes.status);
        }

        const data = (await geminiRes.json()) as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return jsonResponse(JSON.parse(text));
      }

      if (pathname === '/api/parcels' && request.method === 'POST') {
        const body = (await request.json()) as any;
        if (!body.studentName || !body.trackingNumber) {
          return jsonResponse({ error: 'กรุณาระบุชื่อนักเรียนผู้รับและเลขพัสดุ' }, 400);
        }

        const now = new Date().toISOString();
        const id = \`PCL-\${now.slice(2, 4)}\${now.slice(5, 7)}-\${Date.now().toString().slice(-4)}\`;
        const cleanTrack = String(body.trackingNumber).trim().toUpperCase();
        const cleanName = String(body.studentName).trim();

        const matchedPre = await env.DB.prepare(
          \`SELECT * FROM pre_registrations WHERE status = 'EXPECTED' AND (UPPER(tracking_number) = ? OR LOWER(student_name) = LOWER(?)) LIMIT 1\`,
        ).bind(cleanTrack, cleanName).first<any>();

        if (matchedPre) {
          await env.DB.prepare("UPDATE pre_registrations SET status = 'ARRIVED' WHERE id = ?").bind(matchedPre.id).run();
        }

        const matchedStudent = await env.DB.prepare(
          'SELECT * FROM students WHERE LOWER(student_name) = LOWER(?) OR LOWER(nickname) = LOWER(?) LIMIT 1',
        ).bind(cleanName, cleanName).first<any>();

        const parcel = {
          id,
          studentName: cleanName,
          studentNickname: body.studentNickname?.trim() || matchedStudent?.nickname || '',
          floor: body.floor?.trim() || matchedStudent?.floor || 'ไม่ระบุชั้น',
          roomNumber: body.roomNumber?.trim() || matchedStudent?.room_number || '-',
          trackingNumber: cleanTrack,
          courier: body.courier?.trim() || 'อื่นๆ',
          senderName: body.senderName?.trim() || 'ไม่ระบุผู้ส่ง',
          shelfSlot: body.shelfSlot?.trim() || 'A-01',
          status: 'WAITING' as const,
          arrivedAt: now,
          recordedBy: body.recordedBy?.trim() || 'ครูเวรหอพัก',
          notes: body.notes?.trim() || '',
          daysWaiting: 0,
        };

        await env.DB.prepare(
          \`INSERT INTO parcels (id, student_name, student_nickname, floor, room_number, tracking_number, courier, sender_name, shelf_slot, status, arrived_at, recorded_by, line_notified, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, 0, ?)\`,
        ).bind(
          parcel.id, parcel.studentName, parcel.studentNickname, parcel.floor, parcel.roomNumber,
          parcel.trackingNumber, parcel.courier, parcel.senderName, parcel.shelfSlot,
          parcel.arrivedAt, parcel.recordedBy, parcel.notes,
        ).run();

        let lineLog = null;
        if (body.sendLineNotification !== false) {
          const lineId = matchedStudent?.line_user_id || matchedPre?.line_user_id;
          lineLog = await sendLinePushAndLog(env, parcel, lineId, false);
        }

        return jsonResponse({ parcel, matchedPreReg: matchedPre || undefined, lineLog }, 201);
      }

      const pickupMatch = pathname.match(/^\\/api\\/parcels\\/([^/]+)\\/pickup$/);
      if (pickupMatch && request.method === 'PATCH') {
        const id = decodeURIComponent(pickupMatch[1]);
        const { receivedBy } = (await request.json()) as { receivedBy?: string };
        const existing = await env.DB.prepare('SELECT * FROM parcels WHERE id = ?').bind(id).first<any>();
        if (!existing) return jsonResponse({ error: 'ไม่พบพัสดุรายการนี้' }, 404);

        const pickedUpAt = new Date().toISOString();
        const receiver = (receivedBy || '').trim() || \`\${existing.student_name} (รับเอง)\`;
        await env.DB.prepare("UPDATE parcels SET status = 'PICKED_UP', picked_up_at = ?, received_by = ? WHERE id = ?")
          .bind(pickedUpAt, receiver, id)
          .run();

        return jsonResponse({
          id,
          status: 'PICKED_UP',
          pickedUpAt,
          receivedBy: receiver,
          daysWaiting: computeDaysWaiting(existing.arrived_at, pickedUpAt),
        });
      }

      const deleteMatch = pathname.match(/^\\/api\\/parcels\\/([^/]+)$/);
      if (deleteMatch && request.method === 'DELETE') {
        const id = decodeURIComponent(deleteMatch[1]);
        await env.DB.prepare('DELETE FROM parcels WHERE id = ?').bind(id).run();
        return jsonResponse({ deleted: true });
      }

      if (pathname === '/api/preregister' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const id = \`PRE-\${Date.now().toString().slice(-6)}\`;
        const now = new Date().toISOString();
        await env.DB.prepare(
          \`INSERT INTO pre_registrations (id, student_name, floor, room_number, tracking_number, courier, sender_name, expected_date, line_user_id, note, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXPECTED', ?)\`,
        ).bind(
          id, body.studentName.trim(), body.floor || 'ไม่ระบุชั้น', body.roomNumber || '-',
          String(body.trackingNumber).trim().toUpperCase(), body.courier || 'อื่นๆ',
          body.senderName || 'ไม่ระบุร้านค้า', body.expectedDate || now.slice(0, 10),
          body.lineUserId || null, body.note || null, now,
        ).run();
        return jsonResponse({ id, status: 'EXPECTED', createdAt: now }, 201);
      }

      if (pathname === '/api/students' && request.method === 'POST') {
        const body = (await request.json()) as any;
        const now = new Date().toISOString();
        const id = \`STU-\${Date.now().toString().slice(-5)}\`;
        await env.DB.prepare(
          \`INSERT INTO students (id, student_name, nickname, floor, room_number, line_user_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(student_name) DO UPDATE SET
             nickname = COALESCE(excluded.nickname, students.nickname),
             floor = excluded.floor,
             room_number = excluded.room_number,
             line_user_id = excluded.line_user_id,
             updated_at = excluded.updated_at\`,
        ).bind(id, body.studentName.trim(), body.nickname || null, body.floor || 'ไม่ระบุชั้น', body.roomNumber || '-', body.lineUserId.trim(), now).run();
        return jsonResponse({ ok: true }, 201);
      }

      if (pathname === '/api/line/notify' && request.method === 'POST') {
        const { parcelId, isOverdueReminder } = (await request.json()) as { parcelId: string; isOverdueReminder?: boolean };
        const p = await env.DB.prepare('SELECT * FROM parcels WHERE id = ?').bind(parcelId).first<any>();
        if (!p) return jsonResponse({ error: 'ไม่พบพัสดุ' }, 404);
        const stu = await env.DB.prepare('SELECT line_user_id FROM students WHERE LOWER(student_name) = LOWER(?)').bind(p.student_name).first<any>();
        const log = await sendLinePushAndLog(
          env,
          {
            id: p.id,
            studentName: p.student_name,
            floor: p.floor,
            roomNumber: p.room_number,
            trackingNumber: p.tracking_number,
            courier: p.courier,
            senderName: p.sender_name,
            shelfSlot: p.shelf_slot,
            daysWaiting: computeDaysWaiting(p.arrived_at, p.picked_up_at),
          },
          stu?.line_user_id,
          Boolean(isOverdueReminder),
        );
        return jsonResponse(log);
      }

      if (pathname === '/api/settings' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) {
          await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(k, String(v ?? ''))
            .run();
        }
        return jsonResponse(await getSettingsMap(env.DB));
      }

      if (pathname === '/api/export/csv' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM parcels ORDER BY arrived_at DESC').all<any>();
        const header = ['Parcel ID', 'Student Name', 'Floor', 'Room', 'Tracking Number', 'Courier', 'Sender', 'Shelf Slot', 'Status', 'Arrived At', 'Days Waiting'];
        const rows = results.map((r) => [
          r.id, r.student_name, r.floor, r.room_number, r.tracking_number, r.courier,
          r.sender_name, r.shelf_slot, r.status, r.arrived_at, String(computeDaysWaiting(r.arrived_at, r.picked_up_at)),
        ]);
        const csv = '\\uFEFF' + [header, ...rows].map((row) => row.map((c) => \`"\${String(c).replace(/"/g, '""')}"\`).join(',')).join('\\n');
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': \`attachment; filename="dorm-parcels-\${new Date().toISOString().slice(0, 10)}.csv"\`,
          },
        });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Worker error' }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const settings = await getSettingsMap(env.DB);
    const { results } = await env.DB.prepare("SELECT * FROM parcels WHERE status = 'WAITING'").all<any>();
    for (const p of results) {
      const days = computeDaysWaiting(p.arrived_at);
      if (days >= settings.overdueThresholdDays) {
        const stu = await env.DB.prepare('SELECT line_user_id FROM students WHERE LOWER(student_name) = LOWER(?)').bind(p.student_name).first<any>();
        if (stu?.line_user_id) {
          await sendLinePushAndLog(
            env,
            {
              id: p.id,
              studentName: p.student_name,
              floor: p.floor,
              roomNumber: p.room_number,
              trackingNumber: p.tracking_number,
              courier: p.courier,
              senderName: p.sender_name,
              shelfSlot: p.shelf_slot,
              daysWaiting: days,
            },
            stu.line_user_id,
            true,
          );
        }
      }
    }
  },
};
`;
