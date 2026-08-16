const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

// 1. Load Environment Variables
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    }
  }
}

const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_v4.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url: dbUrl, authToken: dbToken });

async function reseedAgenciesFromSheets() {
  console.log('🚀 Starting Clean Reseed of Contractor Agencies from Master Config & Tenant Sheets...');

  try {
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA busy_timeout = 5000');
  } catch {}

  // 1. Clear existing agency data to fix bad mappings
  console.log('🧹 Clearing existing agencies and agency_aliases tables...');
  await db.execute('PRAGMA foreign_keys = OFF');
  await db.execute('DELETE FROM agency_aliases');
  await db.execute('DELETE FROM agencies');
  await db.execute('PRAGMA foreign_keys = ON');
  console.log('✅ Tables cleared.');

  if (!process.env.GOOGLE_SHEETS_PRIVATE_KEY || !process.env.MASTER_CONFIG_SHEET) {
    console.warn('⚠️ Google Sheets credentials missing in environment.');
    return;
  }

  const auth = new JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheetsClient = sheets({ version: 'v4', auth });
  const masterSheetId = process.env.MASTER_CONFIG_SHEET;

  // 2. Fetch CCC Registry from Turso
  const cccRes = await db.execute('SELECT id, ccc_code, ccc_name, spreadsheet_id FROM ccc_registry');
  const cccMap = new Map(); // cccCode -> id
  cccRes.rows.forEach(r => {
    cccMap.set(String(r.ccc_code).trim(), r.id);
  });
  console.log(`📋 Loaded ${cccMap.size} tenant ccc_codes from ccc_registry.`);

  // 3. Read Master Config Sheet Agencies tab
  console.log('📥 Reading Agencies tab from Master Config Sheet...');
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'Agencies!A1:Z500',
  }).catch(() => null);

  const rows = res?.data?.values || [];
  if (rows.length < 2) {
    console.warn('⚠️ No data found in Agencies tab of Master Config Sheet.');
    return;
  }

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  const idIdx = headers.findIndex(h => h === 'id' || h.includes('vendor'));
  const nameIdx = headers.findIndex(h => h.includes('name'));
  const descIdx = headers.findIndex(h => h.includes('desc'));
  const activeIdx = headers.findIndex(h => h.includes('active'));
  const cccIdx = headers.findIndex(h => h.includes('ccc') || h.includes('tenant'));
  const contactIdx = headers.findIndex(h => h.includes('contact') || h.includes('person'));
  const mobileIdx = headers.findIndex(h => h.includes('mobile') || h.includes('phone'));
  const emailIdx = headers.findIndex(h => h.includes('email'));

  let insertedCount = 0;
  const seenAgencyPerCcc = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : String(row[1] || row[0] || '').trim();
    if (!name) continue;

    const cccCode = cccIdx >= 0 ? String(row[cccIdx] || '').trim() : String(row[4] || '').trim();
    if (!cccCode) continue;

    const cccId = cccMap.get(cccCode);
    if (!cccId) {
      console.warn(`   ⚠️ CCC Code '${cccCode}' for agency '${name}' not found in ccc_registry. Skipping.`);
      continue;
    }

    const uniqueKey = `${cccId}_${name.toLowerCase()}`;
    if (seenAgencyPerCcc.has(uniqueKey)) continue;
    seenAgencyPerCcc.add(uniqueKey);

    const description = descIdx >= 0 ? String(row[descIdx] || '').trim() : '';
    const isActiveStr = activeIdx >= 0 ? String(row[activeIdx] || 'true').trim() : 'true';
    const isActive = isActiveStr.toLowerCase() === 'true' || isActiveStr === '1' ? 1 : 0;

    const vendorCode = idIdx >= 0 && row[idIdx] && row[idIdx] !== name ? String(row[idIdx]).trim() : `VEND-${Date.now().toString(36).substring(3)}`;
    const contactPerson = contactIdx >= 0 ? String(row[contactIdx] || '').trim() : '';
    const mobileNumber = mobileIdx >= 0 ? String(row[mobileIdx] || '').trim() : '';
    const email = emailIdx >= 0 ? String(row[emailIdx] || '').trim() : '';

    await db.execute({
      sql: `INSERT INTO agencies (vendor_code, ccc_id, name, description, contact_person, mobile_number, email, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [vendorCode, cccId, name, description, contactPerson, mobileNumber, email, isActive],
    });
    insertedCount++;
  }

  // 4. Also scan tenant individual spreadsheets for CCC specific Agencies tabs
  for (const tenant of cccRes.rows) {
    const cccId = tenant.id;
    const cccCode = String(tenant.ccc_code).trim();
    const cccName = String(tenant.ccc_name).trim();
    const spreadsheetId = String(tenant.spreadsheet_id).trim();

    if (!spreadsheetId || spreadsheetId === masterSheetId) continue;

    try {
      const tenantRes = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: 'Agencies!A1:Z100',
      }).catch(() => null);

      const tRows = tenantRes?.data?.values || [];
      if (tRows.length < 2) continue;

      const tHeaders = tRows[0].map(h => String(h || '').trim().toLowerCase());
      const tNameIdx = tHeaders.findIndex(h => h.includes('name'));

      for (let i = 1; i < tRows.length; i++) {
        const row = tRows[i] || [];
        const name = tNameIdx >= 0 ? String(row[tNameIdx] || '').trim() : String(row[1] || row[0] || '').trim();
        if (!name) continue;

        const uniqueKey = `${cccId}_${name.toLowerCase()}`;
        if (seenAgencyPerCcc.has(uniqueKey)) continue;
        seenAgencyPerCcc.add(uniqueKey);

        const vendorCode = `VEND-${cccCode}-${Math.random().toString(36).substring(2, 6)}`;
        await db.execute({
          sql: `INSERT INTO agencies (vendor_code, ccc_id, name, description, is_active)
                VALUES (?, ?, ?, ?, 1)`,
          args: [vendorCode, cccId, name, `Agency for ${cccName}`],
        });
        insertedCount++;
      }
    } catch (err) {
      // Ignore missing tabs
    }
  }

  console.log(`\n🎉 Reseed Completed! Successfully inserted ${insertedCount} contractor agencies with exact CCC mappings.`);
}

reseedAgenciesFromSheets();
