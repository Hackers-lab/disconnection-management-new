// scripts/repair-tenant-dates.js
/**
 * Standalone tool to scan and repair corrupted or flipped dates (e.g. 08.12.2026 -> 12-08-2026) in tenant Google Sheets.
 * 
 * Usage:
 *   node scripts/repair-tenant-dates.js [SPREADSHEET_ID] [SHEET_NAME]
 * 
 * Examples:
 *   node scripts/repair-tenant-dates.js
 *   node scripts/repair-tenant-dates.js 1AbC-xyz12345
 *   node scripts/repair-tenant-dates.js 1AbC-xyz12345 Sheet1
 */

const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local or .env
function loadEnv() {
  const env = {};
  const paths = [path.join(__dirname, '../.env.local'), path.join(__dirname, '../.env')];
  for (const envPath of paths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          let value = match[2] ? match[2].trim() : '';
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          value = value.replace(/\\n/g, '\n');
          if (!env[match[1]]) {
            env[match[1]] = value;
          }
        }
      });
    }
  }
  return env;
}

const env = loadEnv();
const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_SHEETS_PRIVATE_KEY;
const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SHEETS_CLIENT_EMAIL;

if (!privateKey || !clientEmail) {
  console.error('❌ Error: GOOGLE_SHEETS_PRIVATE_KEY or GOOGLE_SHEETS_CLIENT_EMAIL missing.');
  process.exit(1);
}

const auth = new JWT({
  email: clientEmail,
  key: privateKey.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheetsClient = sheets({ version: 'v4', auth });

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1; // 1-12

function sanitizeDate(rawDate) {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const trimmed = rawDate.trim();
  if (!trimmed || trimmed === '-') return null;

  const clean = trimmed.replace(/[./]/g, '-');
  const parts = clean.split('-');

  if (parts.length !== 3) return null;

  let p1 = parseInt(parts[0], 10);
  let p2 = parseInt(parts[1], 10);
  let p3 = parseInt(parts[2], 10);

  if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

  // Handle YYYY-MM-DD
  if (p1 > 1000) {
    let y = p1;
    let m = p2;
    let d = p3;

    if (y === CURRENT_YEAR && m > CURRENT_MONTH && d <= CURRENT_MONTH) {
      const tmp = d;
      d = m;
      m = tmp;
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d)}-${pad(m)}-${y}`;
  }

  // Handle DD-MM-YYYY or MM-DD-YYYY
  let day = p1;
  let month = p2;
  let year = p3;
  if (year < 100) year += 2000;

  // If month > 12, it was US MM-DD-YYYY
  if (month > 12 && day <= 12) {
    const tmp = day;
    day = month;
    month = tmp;
  }
  // If year is current year and month > currentMonth while day <= currentMonth (Google Sheets US locale flip)
  else if (year === CURRENT_YEAR && month > CURRENT_MONTH && day <= CURRENT_MONTH) {
    const tmp = day;
    day = month;
    month = tmp;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const formatted = `${pad(day)}-${pad(month)}-${year}`;
  return formatted !== trimmed ? formatted : null;
}

function colLetter(i) {
  let s = '';
  let t = i;
  while (t >= 0) {
    s = String.fromCharCode((t % 26) + 65) + s;
    t = Math.floor(t / 26) - 1;
  }
  return s;
}

async function run() {
  const targetSpreadsheetId = process.argv[2] || env.DISCONNECTION_SHEET || process.env.DISCONNECTION_SHEET;
  const targetSheetName = process.argv[3] || env.GOOGLE_SHEET_NAME || 'Sheet1';

  if (!targetSpreadsheetId) {
    console.error('❌ Please provide a spreadsheet ID: node scripts/repair-tenant-dates.js <SPREADSHEET_ID>');
    process.exit(1);
  }

  console.log(`\n=============================================================`);
  console.log(`🔍 Scanning Spreadsheet: ${targetSpreadsheetId}`);
  console.log(`📄 Target Tab:          ${targetSheetName}`);
  console.log(`📅 Current Reference:   Month ${CURRENT_MONTH}/${CURRENT_YEAR}`);
  console.log(`=============================================================\n`);

  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: targetSpreadsheetId,
      range: `'${targetSheetName}'!A:Z`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = res.data.values || [];
    if (rows.length < 2) {
      console.log('No data rows found in this sheet.');
      return;
    }

    const headers = rows[0].map(h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const disconDateColIdx = headers.findIndex(h => h.includes('discondate') || h.includes('disconnectiondate'));
    const consumerIdColIdx = headers.findIndex(h => h.includes('consumerid') || h.includes('consumer_id'));

    if (disconDateColIdx === -1) {
      console.error('❌ Discon Date column not found in headers:', rows[0]);
      return;
    }

    const col = colLetter(disconDateColIdx);
    const updates = [];

    for (let i = 1; i < rows.length; i++) {
      const rawVal = (rows[i][disconDateColIdx] || '').trim();
      const consumerId = consumerIdColIdx !== -1 ? rows[i][consumerIdColIdx] : `Row ${i + 1}`;

      const fixed = sanitizeDate(rawVal);
      if (fixed && fixed !== rawVal) {
        updates.push({
          row: i + 1,
          consumerId,
          from: rawVal,
          to: fixed,
          range: `'${targetSheetName}'!${col}${i + 1}`,
          values: [[fixed]],
        });
      }
    }

    console.log(`📊 Scanned ${rows.length - 1} records.`);

    if (updates.length === 0) {
      console.log('✨ All dates are already properly formatted and canonical! No changes needed.');
      return;
    }

    console.log(`⚠️  Found ${updates.length} dates that need repair:\n`);
    const previewCount = Math.min(updates.length, 10);
    for (let j = 0; j < previewCount; j++) {
      const u = updates[j];
      console.log(`  [Row ${u.row}] Consumer ${u.consumerId.padEnd(12)}: "${u.from}"  ➔  "${u.to}"`);
    }
    if (updates.length > previewCount) {
      console.log(`  ... and ${updates.length - previewCount} more rows.`);
    }

    console.log(`\n⏳ Applying batch updates in RAW mode to prevent Google Sheets from re-flipping...`);

    const batchData = updates.map(u => ({ range: u.range, values: u.values }));
    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId: targetSpreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: batchData,
      },
    });

    console.log(`\n✅ SUCCESS: Repaired ${updates.length} rows in Google Sheet!`);
  } catch (e) {
    console.error('❌ Error repairing sheet:', e.message || e);
  }
}

run();
