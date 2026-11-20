export const SETUP_COLUMNS_GS = `/**
 * ============================================================================
 * 1. Setup_Columns.gs — รันฟังก์ชัน setupDormParcelColumns() เพียงครั้งเดียว
 * เพื่อสร้างแผ่นงาน (Sheets) คอลัมน์ทั้งหมด รูปแบบตาราง และสูตรคำนวณวันค้างรับอัตโนมัติ
 * ============================================================================
 */

function setupDormParcelColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = [
    {
      name: 'Parcels',
      headers: [
        'Parcel_ID',
        'Student_Name',
        'Floor',
        'Room_No',
        'Tracking_No',
        'Courier',
        'Sender_Name',
        'Shelf_Slot',
        'Status',
        'Arrived_At',
        'PickedUp_At',
        'Received_By',
        'Recorded_By',
        'Days_Waiting',
        'Line_Notified',
        'Notes'
      ],
      widths: [130, 180, 140, 80, 160, 130, 160, 90, 110, 150, 150, 160, 140, 110, 110, 220],
      headerBg: '#0F766E'
    },
    {
      name: 'Students',
      headers: [
        'Student_ID',
        'Student_Name',
        'Nickname',
        'Floor',
        'Room_No',
        'Line_User_ID',
        'Updated_At'
      ],
      widths: [110, 190, 110, 150, 90, 260, 160],
      headerBg: '#1E293B'
    },
    {
      name: 'PreRegistrations',
      headers: [
        'PreReg_ID',
        'Student_Name',
        'Floor',
        'Room_No',
        'Tracking_No',
        'Courier',
        'Sender_Name',
        'Expected_Date',
        'Line_User_ID',
        'Status',
        'Note',
        'Created_At'
      ],
      widths: [120, 180, 140, 80, 160, 130, 160, 120, 240, 110, 220, 150],
      headerBg: '#0369A1'
    },
    {
      name: 'LineLogs',
      headers: [
        'Log_ID',
        'Parcel_ID',
        'Student_Name',
        'Line_User_ID',
        'Message',
        'Delivery_Status',
        'Sent_At'
      ],
      widths: [120, 130, 180, 240, 360, 130, 160],
      headerBg: '#15803D'
    }
  ];

  schemas.forEach(function (schema) {
    let sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
    }

    // เขียนหัวตารางแถวที่ 1
    const headerRange = sheet.getRange(1, 1, 1, schema.headers.length);
    headerRange.setValues([schema.headers]);
    headerRange
      .setBackground(schema.headerBg)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setFontFamily('Noto Sans Thai')
      .setFontSize(10)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center');

    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);

    schema.widths.forEach(function (w, idx) {
      sheet.setColumnWidth(idx + 1, w);
    });
  });

  // ตั้งค่า Dropdown Validation สำหรับสถานะพัสดุในหน้า Parcels
  const parcelSheet = ss.getSheetByName('Parcels');
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['WAITING', 'PICKED_UP'], true)
    .setAllowInvalid(false)
    .build();
  parcelSheet.getRange('I2:I1000').setDataValidation(statusRule);

  // ตั้งค่า Dropdown Validation สำหรับ PreRegistrations
  const preSheet = ss.getSheetByName('PreRegistrations');
  const preRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['EXPECTED', 'ARRIVED'], true)
    .setAllowInvalid(false)
    .build();
  preSheet.getRange('J2:J1000').setDataValidation(preRule);

  // รูปแบบวันที่และสูตรตัวอย่างคอลัมน์ Days_Waiting
  parcelSheet.getRange('J2:K1000').setNumberFormat('yyyy-mm-dd hh:mm');

  SpreadsheetApp.flush();
  Logger.log('สร้างฐานข้อมูล DormParcel บน Google Sheets เรียบร้อยแล้วทั้ง 4 แผ่นงาน');
}
`;

export const BACKEND_CODE_GS = `/**
 * ============================================================================
 * 2. Code.gs — หลังบ้าน Google Apps Script Web App สำหรับระบบจัดการพัสดุหอพัก
 * วิธีตั้งค่า Script Properties (Project Settings > Script Properties):
 *   - GEMINI_API_KEY : คีย์สำหรับ AI สแกนใบปะหน้าพัสดุ
 *   - LINE_CHANNEL_ACCESS_TOKEN : โทเค็นจาก LINE Developers (Messaging API)
 * ============================================================================
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('DormParcel — ระบบจัดการพัสดุหอพัก')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * รองรับ HTTP POST กรณีเชื่อมต่อแบบ Webhook จากเว็บภายนอกหรือ Line Webhook
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'addParcel' && body.parcel) {
      const res = saveNewParcel(body.parcel);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, data: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body.action === 'submitPreReg' && body.preRegistration) {
      const res = submitPreRegistration(body.preRegistration);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, data: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body.action === 'markPickedUp' && body.parcelId) {
      const res = markParcelPickedUp(body.parcelId, body.receivedBy || '');
      return ContentService.createTextOutput(JSON.stringify({ ok: true, data: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ดึงข้อมูลทั้งหมดสำหรับแสดงหน้า Dashboard และหน้าค้นหานักเรียน
 */
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const parcelsSheet = ss.getSheetByName('Parcels');
  const preSheet = ss.getSheetByName('PreRegistrations');
  const studentSheet = ss.getSheetByName('Students');

  const now = new Date();
  const parcelRows = readSheetObjects_(parcelsSheet).map(function (row) {
    const arrived = row.Arrived_At ? new Date(row.Arrived_At) : now;
    const end = row.Status === 'PICKED_UP' && row.PickedUp_At ? new Date(row.PickedUp_At) : now;
    const daysWaiting = Math.max(0, Math.floor((end.getTime() - arrived.getTime()) / 86400000));
    row.Days_Waiting = daysWaiting;
    return row;
  }).reverse();

  const preRegistrations = readSheetObjects_(preSheet).reverse();
  const students = readSheetObjects_(studentSheet);

  return {
    parcels: parcelRows,
    preRegistrations: preRegistrations,
    students: students,
    updatedAt: now.toISOString()
  };
}

/**
 * ค้นหาพัสดุแบบเรียลไทม์ด้วยชื่อนักเรียน ชั้น/ห้อง หรือเลขพัสดุ
 */
function searchParcels(query) {
  const data = getDashboardData();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return data.parcels;
  return data.parcels.filter(function (p) {
    return (
      String(p.Student_Name || '').toLowerCase().indexOf(q) !== -1 ||
      String(p.Tracking_No || '').toLowerCase().indexOf(q) !== -1 ||
      String(p.Floor || '').toLowerCase().indexOf(q) !== -1 ||
      String(p.Room_No || '').toLowerCase().indexOf(q) !== -1
    );
  });
}

/**
 * ใช้ Gemini Vision API สแกนรูปถ่ายจ่าหน้าพัสดุอัตโนมัติ
 */
function scanParcelLabelWithAI(base64Image, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Script Properties');
  }

  const cleanBase64 = base64Image.indexOf(',') !== -1 ? base64Image.split(',')[1] : base64Image;
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key=' +
    encodeURIComponent(apiKey);

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text:
              'สกัดข้อมูลใบปะหน้าพัสดุเป็น JSON เท่านั้น: ' +
              '{"recipientName":"","senderName":"","trackingNumber":"","courier":"","floor":"","roomNumber":"","notes":""}'
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const raw = response.getContentText();
  if (code >= 400) {
    throw new Error('Gemini API Error (' + code + '): ' + raw);
  }

  const parsed = JSON.parse(raw);
  const text = parsed.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

/**
 * บันทึกพัสดุใหม่ลง Google Sheet, อัปเดต PreRegistration และแจ้งเตือน Line OA ทันที
 */
function saveNewParcel(form) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Parcels');
  const now = new Date();
  const id = 'PCL-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyMMdd-HHmmss');

  const rowValues = [
    id,
    form.studentName || '',
    form.floor || '',
    form.roomNumber || '',
    String(form.trackingNumber || '').toUpperCase(),
    form.courier || 'อื่นๆ',
    form.senderName || '',
    form.shelfSlot || 'A-01',
    'WAITING',
    now,
    '',
    '',
    form.recordedBy || 'ครูเวรหอพัก',
    '=IF(I' + (sheet.getLastRow() + 1) + '="WAITING", INT(NOW()-J' + (sheet.getLastRow() + 1) + '), INT(K' + (sheet.getLastRow() + 1) + '-J' + (sheet.getLastRow() + 1) + '))',
    false,
    form.notes || ''
  ];

  sheet.appendRow(rowValues);
  const insertedRow = sheet.getLastRow();

  // อัปเดตสถานะรายการที่นักเรียนแจ้งล่วงหน้าไว้ (ถ้าตรงกัน)
  const preMatchLineId = matchAndClosePreRegistration_(ss, form.studentName, form.trackingNumber);

  // ค้นหา Line User ID ของนักเรียนเพื่อยิง Push Message ทันที
  let lineSent = false;
  if (form.sendLine !== false) {
    const lineUserId = findStudentLineId_(ss, form.studentName) || preMatchLineId;
    if (lineUserId) {
      const msg =
        '📦 แจ้งเตือนพัสดุมาถึงสำนักงานหอพัก\\n' +
        'ผู้รับ: ' + form.studentName + ' (' + (form.floor || '-') + ' ห้อง ' + (form.roomNumber || '-') + ')\\n' +
        'ขนส่ง: ' + (form.courier || '-') + ' (' + (form.trackingNumber || '-') + ')\\n' +
        'จุดรับ: ช่องวาง ' + (form.shelfSlot || 'A-01') + '\\n' +
        'กรุณาติดต่อรับได้ที่สำนักงานหอพักครับ/ค่ะ';
      lineSent = sendLineOAPush(lineUserId, msg, id, form.studentName);
      if (lineSent) {
        sheet.getRange(insertedRow, 15).setValue(true);
      }
    }
  }

  return { ok: true, id: id, lineSent: lineSent };
}

/**
 * บันทึกการรับพัสดุเรียบร้อยแล้ว
 */
function markParcelPickedUp(parcelId, receivedBy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Parcels');
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === parcelId) {
      sheet.getRange(r + 1, 9).setValue('PICKED_UP');
      sheet.getRange(r + 1, 11).setValue(new Date());
      sheet.getRange(r + 1, 12).setValue(receivedBy || values[r][1]);
      return { ok: true, parcelId: parcelId };
    }
  }
  throw new Error('ไม่พบพัสดุรหัส ' + parcelId);
}

/**
 * บันทึกแบบฟอร์มแจ้งพัสดุเข้าล่วงหน้าจากฝั่งนักเรียน
 */
function submitPreRegistration(form) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PreRegistrations');
  const now = new Date();
  const id = 'PRE-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyMMdd-HHmmss');

  sheet.appendRow([
    id,
    form.studentName || '',
    form.floor || '',
    form.roomNumber || '',
    String(form.trackingNumber || '').toUpperCase(),
    form.courier || 'อื่นๆ',
    form.senderName || '',
    form.expectedDate || Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd'),
    form.lineUserId || '',
    'EXPECTED',
    form.note || '',
    now
  ]);

  return { ok: true, id: id };
}

/**
 * ส่ง Line OA Messaging API Push Notification และบันทึก Log
 */
function sendLineOAPush(lineUserId, messageText, parcelId, studentName) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName('LineLogs');
  const logId = 'LOG-' + Date.now();

  if (!token || !lineUserId) {
    logSheet.appendRow([logId, parcelId, studentName, lineUserId || '-', messageText, 'SKIPPED_NO_TOKEN', new Date()]);
    return false;
  }

  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    payload: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: messageText }]
    }),
    muteHttpExceptions: true
  });

  const ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  logSheet.appendRow([
    logId,
    parcelId,
    studentName,
    lineUserId,
    messageText,
    ok ? 'SENT_OK' : 'ERROR_' + res.getResponseCode(),
    new Date()
  ]);
  return ok;
}

/**
 * ตั้ง Time-driven Trigger ทุกวันเวลา 18:00 น. เพื่อเตือนพัสดุค้างรับ >= 3 วันผ่าน Line OA
 */
function dailyOverdueReminderTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = getDashboardData();
  data.parcels.forEach(function (p) {
    if (p.Status === 'WAITING' && Number(p.Days_Waiting) >= 3) {
      const lineId = findStudentLineId_(ss, p.Student_Name);
      if (lineId) {
        const msg =
          '⏰ แจ้งเตือนพัสดุค้างรับ ' + p.Days_Waiting + ' วันแล้ว\\n' +
          'ผู้รับ: ' + p.Student_Name + '\\n' +
          'ขนส่ง: ' + p.Courier + ' (' + p.Tracking_No + ')\\n' +
          'กรุณามารับที่สำนักงานหอพักด้วยครับ/ค่ะ';
        sendLineOAPush(lineId, msg, p.Parcel_ID, p.Student_Name);
      }
    }
  });
}

/* ---------- Helper Functions ---------- */
function readSheetObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i];
    });
    return obj;
  });
}

function findStudentLineId_(ss, studentName) {
  const sheet = ss.getSheetByName('Students');
  const list = readSheetObjects_(sheet);
  const target = String(studentName || '').trim().toLowerCase();
  const match = list.find(function (s) {
    return String(s.Student_Name || '').trim().toLowerCase() === target;
  });
  return match ? match.Line_User_ID : '';
}

function matchAndClosePreRegistration_(ss, studentName, trackingNumber) {
  const sheet = ss.getSheetByName('PreRegistrations');
  if (!sheet || sheet.getLastRow() < 2) return '';
  const values = sheet.getDataRange().getValues();
  const cleanName = String(studentName || '').trim().toLowerCase();
  const cleanTrack = String(trackingNumber || '').trim().toUpperCase();

  for (let r = 1; r < values.length; r++) {
    const rowName = String(values[r][1] || '').trim().toLowerCase();
    const rowTrack = String(values[r][4] || '').trim().toUpperCase();
    const rowStatus = values[r][9];
    if (rowStatus === 'EXPECTED' && ((cleanTrack && rowTrack === cleanTrack) || rowName === cleanName)) {
      sheet.getRange(r + 1, 10).setValue('ARRIVED');
      return values[r][8] || '';
    }
  }
  return '';
}
`;

export const FRONTEND_INDEX_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DormParcel — ระบบจัดการพัสดุหอพัก</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #f4f7fa;
      --surface: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #0f766e;
      --accent-soft: #ccfbf1;
      --warn: #d97706;
      --danger: #dc2626;
      --radius: 20px;
      --shadow-card: 0 2px 6px rgba(15, 23, 42, 0.04), 0 18px 38px -12px rgba(15, 23, 42, 0.10);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Plus Jakarta Sans', 'Noto Sans Thai', sans-serif;
      background: radial-gradient(circle at top right, #e6f4f1 0%, var(--bg) 48%);
      color: var(--text);
      min-height: 100vh;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 30;
      backdrop-filter: blur(14px);
      background: rgba(255, 255, 255, 0.85);
      border-bottom: 1px solid rgba(15, 23, 42, 0.07);
    }
    .nav-wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
    .nav-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .nav-btn {
      border: none;
      background: transparent;
      padding: 9px 15px;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      transition: all 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .nav-btn.active {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 8px 18px -6px rgba(15, 118, 110, 0.45);
    }
    main {
      max-width: 1180px;
      margin: 28px auto;
      padding: 0 20px 60px;
      perspective: 1400px;
    }
    .page {
      display: none;
      transform-style: preserve-3d;
    }
    .page.active {
      display: block;
      animation: pageFlipIn 360ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes pageFlipIn {
      from {
        opacity: 0;
        transform: perspective(1200px) rotateY(-8deg) translateZ(-40px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: perspective(1200px) rotateY(0deg) translateZ(0px) scale(1);
      }
    }
    .card {
      background: var(--surface);
      border-radius: var(--radius);
      border: 1px solid rgba(15, 23, 42, 0.06);
      box-shadow: var(--shadow-card);
      padding: 24px;
      transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 240ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05), 0 24px 44px -12px rgba(15, 23, 42, 0.14);
    }
    .grid-kpi {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
      margin-bottom: 22px;
    }
    .kpi-val { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 6px; }
    .input, select, textarea {
      width: 100%;
      padding: 11px 14px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      font-family: inherit;
      font-size: 14px;
      background: #fff;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 11px 20px;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 10px 20px -8px rgba(15, 118, 110, 0.5);
    }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    th { color: var(--muted); font-weight: 600; font-size: 12px; }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
  </style>
</head>
<body>
  <header>
    <div class="nav-wrap">
      <div class="brand">DormParcel หอพัก</div>
      <div class="nav-links">
        <button class="nav-btn active" onclick="switchPage('lookup', this)">ค้นหาพัสดุนักเรียน</button>
        <button class="nav-btn" onclick="switchPage('prereg', this)">แจ้งพัสดุเข้าล่วงหน้า</button>
        <button class="nav-btn" onclick="switchPage('teacher', this)">ครูหอ &amp; AI สแกน</button>
      </div>
    </div>
  </header>

  <main>
    <!-- PAGE 1: Student Search -->
    <section id="page-lookup" class="page active">
      <div class="grid-kpi">
        <div class="card"><div style="color:var(--muted);font-size:13px">พัสดุรอรับทั้งหมด</div><div id="kpi-waiting" class="kpi-val">0</div></div>
        <div class="card"><div style="color:var(--danger);font-size:13px">ค้างรับเกิน 3 วัน</div><div id="kpi-overdue" class="kpi-val" style="color:var(--danger)">0</div></div>
        <div class="card"><div style="color:var(--accent);font-size:13px">รับแล้วทั้งหมด</div><div id="kpi-picked" class="kpi-val" style="color:var(--accent)">0</div></div>
      </div>

      <div class="card">
        <h2 style="margin:0 0 12px">เช็คพัสดุของฉันแบบเรียลไทม์</h2>
        <input id="searchBox" class="input" placeholder="พิมพ์ชื่อนักเรียน ชั้น/ห้อง หรือเลขพัสดุ..." oninput="renderParcels()" />
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>ชื่อผู้รับ</th><th>ชั้น / ห้อง</th><th>เลขพัสดุ · ขนส่ง</th><th>ช่องวาง</th><th>สถานะ &amp; ค้างมาแล้ว</th>
              </tr>
            </thead>
            <tbody id="parcelTableBody"></tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- PAGE 2: Student Pre-Register Form -->
    <section id="page-prereg" class="page">
      <div class="card">
        <h2 style="margin:0 0 16px">แบบฟอร์มแจ้งพัสดุเข้าล่วงหน้า (บันทึกลง Google Sheet)</h2>
        <form onsubmit="handlePreRegSubmit(event)" class="form-grid">
          <div><label>ชื่อ-นามสกุลนักเรียน</label><input id="pre-name" class="input" required /></div>
          <div><label>ชั้น / หอพัก</label><input id="pre-floor" class="input" placeholder="เช่น หอชาย 2 ชั้น 3" required /></div>
          <div><label>เลขห้อง</label><input id="pre-room" class="input" required /></div>
          <div><label>เลขพัสดุ (Tracking)</label><input id="pre-track" class="input" required /></div>
          <div><label>บริษัทขนส่ง</label><input id="pre-courier" class="input" placeholder="Flash / Kerry / J&T" required /></div>
          <div><label>Line User ID (สำหรับรับแจ้งเตือน)</label><input id="pre-line" class="input" placeholder="Uxxxxxxxx..." /></div>
          <div style="grid-column:1/-1"><button class="btn-primary" type="submit">บันทึกข้อมูลแจ้งพัสดุเข้า</button></div>
        </form>
      </div>
    </section>

    <!-- PAGE 3: Teacher AI Scanner & Overdue Tracker -->
    <section id="page-teacher" class="page">
      <div class="card" style="margin-bottom:20px">
        <h2 style="margin:0 0 12px">ครูหอ: ถ่ายรูปหรืออัปโหลดใบปะหน้าพัสดุ (AI OCR)</h2>
        <input type="file" accept="image/*" capture="environment" onchange="handleScanImage(event)" />
        <p id="scanStatus" style="color:var(--muted);font-size:13px"></p>
        <form onsubmit="handleAddParcel(event)" class="form-grid">
          <div><label>ชื่อนักเรียนผู้รับ</label><input id="t-name" class="input" required /></div>
          <div><label>ชั้น / หอพัก</label><input id="t-floor" class="input" required /></div>
          <div><label>ห้อง</label><input id="t-room" class="input" required /></div>
          <div><label>เลขพัสดุ</label><input id="t-track" class="input" required /></div>
          <div><label>ขนส่ง</label><input id="t-courier" class="input" required /></div>
          <div><label>ช่องวางพัสดุ</label><input id="t-shelf" class="input" value="A-01" required /></div>
          <div style="grid-column:1/-1"><button class="btn-primary" type="submit">อัปโหลดขึ้นเว็บ &amp; แจ้งเตือน Line OA</button></div>
        </form>
      </div>

      <div class="card">
        <h3 style="margin:0 0 10px">รายการพัสดุรอรับ / ติดตามวันค้างรับ</h3>
        <div id="teacherWaitingList"></div>
      </div>
    </section>
  </main>

  <script>
    let allParcels = [];

    function switchPage(pageId, btn) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('page-' + pageId).classList.add('active');
      btn.classList.add('active');
    }

    function loadData() {
      google.script.run.withSuccessHandler(function(res) {
        allParcels = res.parcels || [];
        renderParcels();
      }).getDashboardData();
    }

    function renderParcels() {
      const q = (document.getElementById('searchBox').value || '').toLowerCase();
      const waiting = allParcels.filter(p => p.Status === 'WAITING');
      const overdue = waiting.filter(p => Number(p.Days_Waiting) >= 3);
      const picked = allParcels.filter(p => p.Status === 'PICKED_UP');

      document.getElementById('kpi-waiting').textContent = waiting.length;
      document.getElementById('kpi-overdue').textContent = overdue.length;
      document.getElementById('kpi-picked').textContent = picked.length;

      const filtered = allParcels.filter(p =>
        !q ||
        String(p.Student_Name).toLowerCase().includes(q) ||
        String(p.Tracking_No).toLowerCase().includes(q) ||
        String(p.Floor).toLowerCase().includes(q)
      );

      document.getElementById('parcelTableBody').innerHTML = filtered.map(p => \`
        <tr>
          <td><strong>\${p.Student_Name}</strong></td>
          <td>\${p.Floor} · ห้อง \${p.Room_No}</td>
          <td>\${p.Tracking_No} · \${p.Courier}</td>
          <td>\${p.Shelf_Slot}</td>
          <td>\${p.Status === 'PICKED_UP' ? 'รับแล้ว' : 'รอรับ (ค้าง ' + p.Days_Waiting + ' วัน)'}</td>
        </tr>
      \`).join('');

      document.getElementById('teacherWaitingList').innerHTML = waiting.map(p => \`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #e2e8f0">
          <div><strong>\${p.Student_Name}</strong> (\${p.Floor}) · \${p.Tracking_No} · ค้าง \${p.Days_Waiting} วัน</div>
          <button class="nav-btn active" onclick="confirmPickup('\${p.Parcel_ID}')">ยืนยันรับแล้ว</button>
        </div>
      \`).join('');
    }

    function handleScanImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('scanStatus').textContent = 'กำลังอ่านข้อมูลจากใบปะหน้าด้วย AI...';
      const reader = new FileReader();
      reader.onload = function() {
        google.script.run.withSuccessHandler(function(info) {
          document.getElementById('t-name').value = info.recipientName || '';
          document.getElementById('t-floor').value = info.floor || '';
          document.getElementById('t-room').value = info.roomNumber || '';
          document.getElementById('t-track').value = info.trackingNumber || '';
          document.getElementById('t-courier').value = info.courier || '';
          document.getElementById('scanStatus').textContent = 'สแกนสำเร็จ! ตรวจสอบข้อมูลแล้วกดบันทึก';
        }).scanParcelLabelWithAI(reader.result, file.type);
      };
      reader.readAsDataURL(file);
    }

    function handleAddParcel(e) {
      e.preventDefault();
      google.script.run.withSuccessHandler(function() {
        e.target.reset();
        loadData();
      }).saveNewParcel({
        studentName: document.getElementById('t-name').value,
        floor: document.getElementById('t-floor').value,
        roomNumber: document.getElementById('t-room').value,
        trackingNumber: document.getElementById('t-track').value,
        courier: document.getElementById('t-courier').value,
        shelfSlot: document.getElementById('t-shelf').value
      });
    }

    function handlePreRegSubmit(e) {
      e.preventDefault();
      google.script.run.withSuccessHandler(function() {
        e.target.reset();
        loadData();
      }).submitPreRegistration({
        studentName: document.getElementById('pre-name').value,
        floor: document.getElementById('pre-floor').value,
        roomNumber: document.getElementById('pre-room').value,
        trackingNumber: document.getElementById('pre-track').value,
        courier: document.getElementById('pre-courier').value,
        lineUserId: document.getElementById('pre-line').value
      });
    }

    function confirmPickup(parcelId) {
      google.script.run.withSuccessHandler(loadData).markParcelPickedUp(parcelId, '');
    }

    window.onload = loadData;
  </script>
</body>
</html>
`;
