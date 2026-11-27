/**
 * worker.ts — Backend API + Cron Trigger สำหรับ Cloudflare Workers + Cloudflare D1
 * หลัง Deploy ไฟล์นี้พร้อม wrangler.jsonc แล้ว สามารถผูก D1 Database (ชื่อตัวแปร DB)
 * และเพิ่ม Secrets (GEMINI_API_KEY, LINE_CHANNEL_ACCESS_TOKEN) บนหน้าเว็บ Cloudflare Dashboard ได้ทันที
 */

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface AssetsFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

export interface Env {
  DB?: D1Database;
  ASSETS: AssetsFetcher;
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
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();
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
  db: D1Database,
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
        `แจ้งเตือนพัสดุค้างรับเกินกำหนด (${parcel.daysWaiting} วัน)`,
        `ผู้รับ: ${parcel.studentName} (${parcel.floor} · ห้อง ${parcel.roomNumber})`,
        `ขนส่ง: ${parcel.courier} (${parcel.trackingNumber})`,
        `จุดวางพัสดุ: ช่อง ${parcel.shelfSlot}`,
        `กรุณาติดต่อรับพัสดุที่สำนักงานหอพักโดยเร็วที่สุด`,
      ].join('\n')
    : [
        `แจ้งเตือนพัสดุมาถึงสำนักงานหอพัก`,
        `ผู้รับ: ${parcel.studentName} (${parcel.floor} · ห้อง ${parcel.roomNumber})`,
        `ขนส่ง: ${parcel.courier} (${parcel.trackingNumber})`,
        `ผู้ส่ง: ${parcel.senderName}`,
        `จุดวางพัสดุ: ช่อง ${parcel.shelfSlot}`,
        `ติดต่อรับได้ที่สำนักงานหอพักนักเรียน`,
      ].join('\n');

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
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: 'text', text: message }],
        }),
      });
      if (!resp.ok) {
        success = false;
        errorMsg = `LINE API ${resp.status}: ${await resp.text()}`;
      }
    } catch (e) {
      success = false;
      errorMsg = e instanceof Error ? e.message : 'Network error';
    }
  }

  const logId = `LOG-${Date.now().toString().slice(-6)}`;
  const sentAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO line_logs (id, parcel_id, student_name, line_user_id, message, delivery_mode, success, sent_at, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      logId,
      parcel.id,
      parcel.studentName,
      targetLineId,
      message,
      deliveryMode,
      success ? 1 : 0,
      sentAt,
      errorMsg,
    )
    .run();

  if (success) {
    await db
      .prepare('UPDATE parcels SET line_notified = 1, line_notified_at = ? WHERE id = ?')
      .bind(sentAt, parcel.id)
      .run();
  }

  return {
    id: logId,
    parcelId: parcel.id,
    studentName: parcel.studentName,
    lineUserId: targetLineId,
    message,
    deliveryMode,
    success,
    sentAt,
    error: errorMsg || undefined,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        runtime: 'cloudflare-workers',
        dbBound: Boolean(env.DB),
        timestamp: new Date().toISOString(),
      });
    }

    if (!env.DB) {
      return jsonResponse(
        {
          error:
            'ยังไม่ได้ผูกฐานข้อมูล D1 (ตัวแปร DB) — กรุณาไปที่ Cloudflare Dashboard > Workers > dormparcel > Settings > Bindings แล้วเพิ่ม D1 database ชื่อตัวแปร DB',
        },
        503,
      );
    }

    const db = env.DB;

    try {
      if (pathname === '/api/dashboard' && request.method === 'GET') {
        const [parcelsRes, preRes, studentsRes, logsRes, settings] = await Promise.all([
          db.prepare('SELECT * FROM parcels ORDER BY arrived_at DESC').all<Record<string, unknown>>(),
          db.prepare('SELECT * FROM pre_registrations ORDER BY created_at DESC').all<Record<string, unknown>>(),
          db.prepare('SELECT * FROM students ORDER BY updated_at DESC').all<Record<string, unknown>>(),
          db.prepare('SELECT * FROM line_logs ORDER BY sent_at DESC LIMIT 100').all<Record<string, unknown>>(),
          getSettingsMap(db),
        ]);

        const parcels = parcelsRes.results.map((r) => ({
          id: String(r.id),
          studentName: String(r.student_name),
          studentNickname: String(r.student_nickname || ''),
          floor: String(r.floor),
          roomNumber: String(r.room_number),
          trackingNumber: String(r.tracking_number),
          courier: String(r.courier),
          senderName: String(r.sender_name),
          shelfSlot: String(r.shelf_slot),
          status: String(r.status),
          arrivedAt: String(r.arrived_at),
          pickedUpAt: r.picked_up_at ? String(r.picked_up_at) : undefined,
          receivedBy: r.received_by ? String(r.received_by) : undefined,
          recordedBy: String(r.recorded_by),
          lineNotified: Boolean(r.line_notified),
          lineNotifiedAt: r.line_notified_at ? String(r.line_notified_at) : undefined,
          notes: String(r.notes || ''),
          daysWaiting: computeDaysWaiting(
            String(r.arrived_at),
            r.picked_up_at ? String(r.picked_up_at) : undefined,
          ),
        }));

        const preRegistrations = preRes.results.map((r) => ({
          id: String(r.id),
          studentName: String(r.student_name),
          floor: String(r.floor),
          roomNumber: String(r.room_number),
          trackingNumber: String(r.tracking_number),
          courier: String(r.courier),
          senderName: String(r.sender_name),
          expectedDate: String(r.expected_date),
          lineUserId: r.line_user_id ? String(r.line_user_id) : undefined,
          note: r.note ? String(r.note) : undefined,
          status: String(r.status),
          createdAt: String(r.created_at),
        }));

        const students = studentsRes.results.map((r) => ({
          id: String(r.id),
          studentName: String(r.student_name),
          nickname: r.nickname ? String(r.nickname) : undefined,
          floor: String(r.floor),
          roomNumber: String(r.room_number),
          lineUserId: String(r.line_user_id),
          updatedAt: String(r.updated_at),
        }));

        const lineLogs = logsRes.results.map((r) => ({
          id: String(r.id),
          parcelId: String(r.parcel_id),
          studentName: String(r.student_name),
          lineUserId: String(r.line_user_id),
          message: String(r.message),
          deliveryMode: String(r.delivery_mode),
          success: Boolean(r.success),
          sentAt: String(r.sent_at),
          error: r.error ? String(r.error) : undefined,
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
          return jsonResponse(
            {
              error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Cloudflare Variables and Secrets',
              code: 'BILLING_REQUIRED',
            },
            403,
          );
        }
        const { base64Image, mimeType } = (await request.json()) as {
          base64Image?: string;
          mimeType?: string;
        };
        if (!base64Image) {
          return jsonResponse({ error: 'กรุณาแนบไฟล์รูปภาพใบปะหน้าพัสดุ' }, 400);
        }

        const cleanBase64 = base64Image.includes(',')
          ? base64Image.split(',')[1]
          : base64Image;
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
                    {
                      text:
                        'สกัดข้อมูลใบปะหน้าพัสดุเป็น JSON: {"recipientName":"","senderName":"","trackingNumber":"","courier":"","floor":"","roomNumber":"","notes":"","confidence":95}',
                    },
                  ],
                },
              ],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );

        if (!geminiRes.ok) {
          const code = geminiRes.status === 403 ? 'BILLING_REQUIRED' : 'SCAN_FAILED';
          return jsonResponse({ error: await geminiRes.text(), code }, geminiRes.status);
        }

        const data = (await geminiRes.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return jsonResponse(JSON.parse(text));
      }

      if (pathname === '/api/parcels' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        if (!body.studentName || !body.trackingNumber) {
          return jsonResponse({ error: 'กรุณาระบุชื่อนักเรียนผู้รับและเลขพัสดุ' }, 400);
        }

        const now = new Date().toISOString();
        const id = `PCL-${now.slice(2, 4)}${now.slice(5, 7)}-${Date.now().toString().slice(-4)}`;
        const cleanTrack = String(body.trackingNumber).trim().toUpperCase();
        const cleanName = String(body.studentName).trim();

        const matchedPre = await db
          .prepare(
            `SELECT * FROM pre_registrations WHERE status = 'EXPECTED' AND (UPPER(tracking_number) = ? OR LOWER(student_name) = LOWER(?)) LIMIT 1`,
          )
          .bind(cleanTrack, cleanName)
          .first<Record<string, unknown>>();

        if (matchedPre) {
          await db
            .prepare("UPDATE pre_registrations SET status = 'ARRIVED' WHERE id = ?")
            .bind(matchedPre.id)
            .run();
        }

        const matchedStudent = await db
          .prepare(
            'SELECT * FROM students WHERE LOWER(student_name) = LOWER(?) OR LOWER(nickname) = LOWER(?) LIMIT 1',
          )
          .bind(cleanName, cleanName)
          .first<Record<string, unknown>>();

        const parcel = {
          id,
          studentName: cleanName,
          studentNickname:
            String(body.studentNickname || '').trim() ||
            String(matchedStudent?.nickname || ''),
          floor:
            String(body.floor || '').trim() ||
            String(matchedStudent?.floor || 'ไม่ระบุชั้น'),
          roomNumber:
            String(body.roomNumber || '').trim() ||
            String(matchedStudent?.room_number || '-'),
          trackingNumber: cleanTrack,
          courier: String(body.courier || '').trim() || 'อื่นๆ',
          senderName: String(body.senderName || '').trim() || 'ไม่ระบุผู้ส่ง',
          shelfSlot: String(body.shelfSlot || '').trim() || 'A-01',
          status: 'WAITING' as const,
          arrivedAt: now,
          recordedBy: String(body.recordedBy || '').trim() || 'ครูเวรหอพัก',
          notes: String(body.notes || '').trim(),
          daysWaiting: 0,
        };

        await db
          .prepare(
            `INSERT INTO parcels (id, student_name, student_nickname, floor, room_number, tracking_number, courier, sender_name, shelf_slot, status, arrived_at, recorded_by, line_notified, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, 0, ?)`,
          )
          .bind(
            parcel.id,
            parcel.studentName,
            parcel.studentNickname,
            parcel.floor,
            parcel.roomNumber,
            parcel.trackingNumber,
            parcel.courier,
            parcel.senderName,
            parcel.shelfSlot,
            parcel.arrivedAt,
            parcel.recordedBy,
            parcel.notes,
          )
          .run();

        let lineLog = null;
        if (body.sendLineNotification !== false) {
          const lineId =
            (matchedStudent?.line_user_id ? String(matchedStudent.line_user_id) : undefined) ||
            (matchedPre?.line_user_id ? String(matchedPre.line_user_id) : undefined);
          lineLog = await sendLinePushAndLog(env, db, parcel, lineId, false);
        }

        return jsonResponse(
          { parcel, matchedPreReg: matchedPre || undefined, lineLog },
          201,
        );
      }

      const pickupMatch = pathname.match(/^\/api\/parcels\/([^/]+)\/pickup$/);
      if (pickupMatch && request.method === 'PATCH') {
        const id = decodeURIComponent(pickupMatch[1]);
        const { receivedBy } = (await request.json()) as { receivedBy?: string };
        const existing = await db
          .prepare('SELECT * FROM parcels WHERE id = ?')
          .bind(id)
          .first<Record<string, unknown>>();
        if (!existing) return jsonResponse({ error: 'ไม่พบพัสดุรายการนี้' }, 404);

        const pickedUpAt = new Date().toISOString();
        const receiver =
          (receivedBy || '').trim() || `${String(existing.student_name)} (รับเอง)`;
        await db
          .prepare("UPDATE parcels SET status = 'PICKED_UP', picked_up_at = ?, received_by = ? WHERE id = ?")
          .bind(pickedUpAt, receiver, id)
          .run();

        return jsonResponse({
          id,
          status: 'PICKED_UP',
          pickedUpAt,
          receivedBy: receiver,
          daysWaiting: computeDaysWaiting(String(existing.arrived_at), pickedUpAt),
        });
      }

      const deleteMatch = pathname.match(/^\/api\/parcels\/([^/]+)$/);
      if (deleteMatch && request.method === 'DELETE') {
        const id = decodeURIComponent(deleteMatch[1]);
        await db.prepare('DELETE FROM parcels WHERE id = ?').bind(id).run();
        return jsonResponse({ deleted: true });
      }

      if (pathname === '/api/preregister' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        const id = `PRE-${Date.now().toString().slice(-6)}`;
        const now = new Date().toISOString();
        await db
          .prepare(
            `INSERT INTO pre_registrations (id, student_name, floor, room_number, tracking_number, courier, sender_name, expected_date, line_user_id, note, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXPECTED', ?)`,
          )
          .bind(
            id,
            String(body.studentName || '').trim(),
            String(body.floor || 'ไม่ระบุชั้น'),
            String(body.roomNumber || '-'),
            String(body.trackingNumber || '').trim().toUpperCase(),
            String(body.courier || 'อื่นๆ'),
            String(body.senderName || 'ไม่ระบุร้านค้า'),
            String(body.expectedDate || now.slice(0, 10)),
            body.lineUserId ? String(body.lineUserId) : null,
            body.note ? String(body.note) : null,
            now,
          )
          .run();
        return jsonResponse({ id, status: 'EXPECTED', createdAt: now }, 201);
      }

      if (pathname === '/api/students' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        const now = new Date().toISOString();
        const id = `STU-${Date.now().toString().slice(-5)}`;
        await db
          .prepare(
            `INSERT INTO students (id, student_name, nickname, floor, room_number, line_user_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(student_name) DO UPDATE SET
               nickname = COALESCE(excluded.nickname, students.nickname),
               floor = excluded.floor,
               room_number = excluded.room_number,
               line_user_id = excluded.line_user_id,
               updated_at = excluded.updated_at`,
          )
          .bind(
            id,
            String(body.studentName || '').trim(),
            body.nickname ? String(body.nickname) : null,
            String(body.floor || 'ไม่ระบุชั้น'),
            String(body.roomNumber || '-'),
            String(body.lineUserId || '').trim(),
            now,
          )
          .run();
        return jsonResponse({ ok: true }, 201);
      }

      if (pathname === '/api/line/notify' && request.method === 'POST') {
        const { parcelId, isOverdueReminder } = (await request.json()) as {
          parcelId: string;
          isOverdueReminder?: boolean;
        };
        const p = await db
          .prepare('SELECT * FROM parcels WHERE id = ?')
          .bind(parcelId)
          .first<Record<string, unknown>>();
        if (!p) return jsonResponse({ error: 'ไม่พบพัสดุ' }, 404);
        const stu = await db
          .prepare('SELECT line_user_id FROM students WHERE LOWER(student_name) = LOWER(?)')
          .bind(p.student_name)
          .first<{ line_user_id?: string }>();
        const log = await sendLinePushAndLog(
          env,
          db,
          {
            id: String(p.id),
            studentName: String(p.student_name),
            floor: String(p.floor),
            roomNumber: String(p.room_number),
            trackingNumber: String(p.tracking_number),
            courier: String(p.courier),
            senderName: String(p.sender_name),
            shelfSlot: String(p.shelf_slot),
            daysWaiting: computeDaysWaiting(
              String(p.arrived_at),
              p.picked_up_at ? String(p.picked_up_at) : undefined,
            ),
          },
          stu?.line_user_id,
          Boolean(isOverdueReminder),
        );
        return jsonResponse(log);
      }

      if (pathname === '/api/settings' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) {
          await db
            .prepare(
              'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            )
            .bind(k, String(v ?? ''))
            .run();
        }
        return jsonResponse(await getSettingsMap(db));
      }

      if (pathname === '/api/export/csv' && request.method === 'GET') {
        const { results } = await db
          .prepare('SELECT * FROM parcels ORDER BY arrived_at DESC')
          .all<Record<string, unknown>>();
        const header = [
          'Parcel ID',
          'Student Name',
          'Floor',
          'Room',
          'Tracking Number',
          'Courier',
          'Sender',
          'Shelf Slot',
          'Status',
          'Arrived At',
          'Days Waiting',
        ];
        const rows = results.map((r) => [
          r.id,
          r.student_name,
          r.floor,
          r.room_number,
          r.tracking_number,
          r.courier,
          r.sender_name,
          r.shelf_slot,
          r.status,
          r.arrived_at,
          String(
            computeDaysWaiting(
              String(r.arrived_at),
              r.picked_up_at ? String(r.picked_up_at) : undefined,
            ),
          ),
        ]);
        const csv =
          '\uFEFF' +
          [header, ...rows]
            .map((row) =>
              row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
            )
            .join('\n');
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="dorm-parcels-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Worker error' },
        500,
      );
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (!env.DB) return;
    const db = env.DB;
    const settings = await getSettingsMap(db);
    const { results } = await db
      .prepare("SELECT * FROM parcels WHERE status = 'WAITING'")
      .all<Record<string, unknown>>();
    for (const p of results) {
      const days = computeDaysWaiting(String(p.arrived_at));
      if (days >= settings.overdueThresholdDays) {
        const stu = await db
          .prepare('SELECT line_user_id FROM students WHERE LOWER(student_name) = LOWER(?)')
          .bind(p.student_name)
          .first<{ line_user_id?: string }>();
        if (stu?.line_user_id) {
          await sendLinePushAndLog(
            env,
            db,
            {
              id: String(p.id),
              studentName: String(p.student_name),
              floor: String(p.floor),
              roomNumber: String(p.room_number),
              trackingNumber: String(p.tracking_number),
              courier: String(p.courier),
              senderName: String(p.sender_name),
              shelfSlot: String(p.shelf_slot),
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
