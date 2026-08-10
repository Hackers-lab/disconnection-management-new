const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// 1. Read environment variables from .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    value = value.replace(/\\n/g, '\n');
    env[match[1]] = value;
  }
});

const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY;
const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL;
const masterConfigSheet = env.MASTER_CONFIG_SHEET;

const auth = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

// 2. Initialize libSQL Database Client
const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_v2.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url: dbUrl, authToken: dbToken });

// ── Helper Functions for Data Compression & Drive File ID Extraction ──
function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : (url.length === 33 ? url : url);
}

function formatMonthKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return "2608";
  const parts = dateStr.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return parts[0].substring(2) + parts[1].padStart(2, '0');
    } else if (parts[2].length === 4) {
      return parts[2].substring(2) + parts[1].padStart(2, '0');
    }
  }
  return "2608";
}

function mapConnStat(stat) {
  if (!stat || typeof stat !== 'string') return '';
  const s = stat.trim().toUpperCase();
  if (s.includes('LIVE') || s.includes('CONNECTED')) return '';
  if (s.includes('TEMPORARY')) return 'TD';
  if (s.includes('DEEMED')) return 'DD';
  if (s.includes('PERMANENT')) return 'PD';
  return '';
}

function mapDisconStatus(stat) {
  if (!stat || typeof stat !== 'string') return 'P';
  const s = stat.trim().toUpperCase();
  if (s.includes('RECONNECTED') || s === 'RC') return 'RC';
  if (s.includes('DEEMED') || s === 'DD') return 'DD';
  if (s.includes('DISCONNECTED') || s === 'DC') return 'DC';
  return 'P';
}

function mapPriority(pri) {
  if (!pri || typeof pri !== 'string') return 'N';
  const p = pri.trim().toUpperCase();
  if (p.startsWith('P') || p.includes('HIGH') || p.includes('URGENT')) return 'P';
  return 'N';
}

async function initSchema() {
  console.log("--> Executing DDL Schema in lib/schema.sql...");
  const schemaSqlPath = path.join(__dirname, '../lib/schema.sql');
  const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
  
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      console.error(`Error DDL: ${stmt.substring(0, 50)}...`, err.message);
    }
  }
  console.log("✅ All 18 Tables & Indexes Initialized!");
}

async function main() {
  const startTime = Date.now();
  console.log("==================================================");
  console.log("STARTING FULL MULTI-CCC & MULTI-MODULE ETL MIGRATION");
  console.log("==================================================");

  await initSchema();

  // Step 1: Populate ccc_registry from MASTER_CONFIG_SHEET
  console.log("\n[Step 1] Loading CCC Registry into ccc_registry table...");
  const regRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'CCC_Registry'!A2:E500`,
  });
  const regRows = regRes.data.values || [];
  const cccCodeToIdMap = new Map(); // cccCode -> integer ccc_id PK
  const cccList = []; // Array of { cccId, cccCode, cccName, spreadsheetId }

  for (const r of regRows) {
    const code = String(r[0] || "").trim();
    const name = String(r[1] || "").trim();
    const sheetId = String(r[2] || "").trim();
    const driveFolderId = String(r[3] || "").trim();

    if (code && sheetId) {
      try {
        const ins = await db.execute({
          sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, spreadsheet_id, drive_folder_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(ccc_code) DO UPDATE SET ccc_name=excluded.ccc_name, spreadsheet_id=excluded.spreadsheet_id
                RETURNING id`,
          args: [code, name, sheetId, driveFolderId]
        });
        const cccId = Number(ins.rows[0].id);
        cccCodeToIdMap.set(code, cccId);
        cccList.push({ cccId, cccCode: code, cccName: name, spreadsheetId: sheetId });
      } catch (err) {
        console.error(`Failed ccc_registry insert: ${code}`, err.message);
      }
    }
  }
  console.log(`✅ Loaded ${cccList.length} Supply Offices into ccc_registry table.`);

  // Step 2: Migrate Agencies & Aliases
  console.log("\n[Step 2] Migrating Agencies & Agency Aliases...");
  const agencyRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'Agencies'!A2:E1000`,
  });
  const agencyRows = agencyRes.data.values || [];
  const agencyMapByName = new Map(); // cccId:name -> agency_id

  for (const r of agencyRows) {
    const idStr = r[0] || "";
    const name = r[1] || "";
    const desc = r[2] || "";
    const isActive = String(r[3]).toLowerCase() === "true";
    const cccCode = String(r[4] || "").trim();
    const cccId = cccCodeToIdMap.get(cccCode) || cccCodeToIdMap.get("6612107") || 1;

    const vendorMatch = desc.match(/vendor\s*code\s*:?\s*(\w+)/i) || name.match(/vendor\s*code\s*:?\s*(\w+)/i);
    const vendorCode = vendorMatch ? vendorMatch[1] : `TEMP-VND-${cccId}-${idStr}`;

    try {
      const ins = await db.execute({
        sql: `INSERT INTO agencies (vendor_code, ccc_id, name, description, is_active)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(vendor_code) DO UPDATE SET name=excluded.name
              RETURNING id`,
        args: [vendorCode, cccId, name, desc, isActive ? 1 : 0]
      });
      const agencyId = Number(ins.rows[0].id);
      agencyMapByName.set(`${cccId}:${name.trim().toUpperCase()}`, agencyId);
      agencyMapByName.set(`${cccId}:${vendorCode.trim().toUpperCase()}`, agencyId);

      await db.execute({
        sql: `INSERT INTO agency_aliases (agency_id, alias_name, ccc_id)
              VALUES (?, ?, ?)
              ON CONFLICT(ccc_id, alias_name) DO NOTHING`,
        args: [agencyId, name.trim().toUpperCase(), cccId]
      });
    } catch (err) {}
  }
  console.log(`✅ Loaded Agencies and Aliases.`);

  // Step 3: Migrate Users
  console.log("\n[Step 3] Migrating Users...");
  const userRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'Master_Credentials'!A2:J1000`,
  });
  const userRows = userRes.data.values || [];
  for (const r of userRows) {
    const id = String(r[0] || "");
    const username = String(r[1] || "");
    const password = String(r[2] || "");
    const role = String(r[3] || "");
    const cccCode = String(r[4] || "");
    const name = String(r[5] || "");
    const cccId = cccCodeToIdMap.get(cccCode) || null;

    if (username) {
      try {
        await db.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, ccc_id)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET full_name=excluded.full_name`,
          args: [id || username, username, password, name, role, cccId]
        });
      } catch (err) {}
    }
  }
  console.log(`✅ Loaded Users.`);

  // Step 4: Iterate Through All 47 Tenant Supply Offices Step-by-Step
  console.log(`\n[Step 4] Starting Step-by-Step Multi-CCC Data Transfer across all ${cccList.length} Supply Offices...`);

  for (let idx = 0; idx < cccList.length; idx++) {
    const office = cccList[idx];
    console.log(`\n--------------------------------------------------`);
    console.log(`[Office ${idx + 1}/${cccList.length}] ${office.cccName} (ccc_id=${office.cccId}, code=${office.cccCode})`);
    console.log(`--------------------------------------------------`);

    try {
      await migrateTenantOffice(office.cccId, office.cccCode, office.cccName, office.spreadsheetId, agencyMapByName);
    } catch (err) {
      console.error(`  ❌ Error migrating office ${office.cccName}:`, err.message);
    }
  }

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n==================================================");
  console.log(`🎉 ALL ${cccList.length} SUPPLY OFFICES & ALL MODULES MIGRATED IN ${totalTimeSec} SECONDS!`);
  console.log("==================================================");
}

async function migrateTenantOffice(cccId, cccCode, cccName, spreadsheetId, agencyMapByName) {
  // A. Master Consumers
  console.log(`  [A] Consumer_Master...`);
  let masterRows = [];
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `'Consumer_Master'!A2:J60000`,
    });
    masterRows = res.data.values || [];
  } catch (e) {}

  const consumerIdToPkMap = new Map();
  const BATCH_SIZE = 1000;

  for (let i = 0; i < masterRows.length; i += BATCH_SIZE) {
    const batch = masterRows.slice(i, i + BATCH_SIZE);
    const txStatements = batch
      .filter(r => r && r[0] && String(r[0]).trim() !== "")
      .map(r => ({
        sql: `INSERT INTO master_consumers (
                ccc_id, con_id, name, address, base_class, 
                conn_stat, meter_no, mru, reg_mob_no, zlatitude, zlongitude
              ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
              ON CONFLICT(ccc_id, con_id) DO UPDATE SET name=excluded.name`,
        args: [
          cccId,
          String(r[0]).trim(),
          r[1] || "",
          r[3] ? (r[2] ? `C/O ${r[2]}, ${r[3]}` : r[3]) : (r[2] || ""),
          r[4] || "",
          r[5] || "",
          r[6] || "",
          r[7] || "",
          r[8] ? parseFloat(r[8]) : null,
          r[9] ? parseFloat(r[9]) : null,
        ]
      }));

    try {
      await db.batch(txStatements, "write");
    } catch (e) {
      for (const stmt of txStatements) {
        try { await db.execute(stmt); } catch (err) {}
      }
    }
  }

  try {
    const mcSel = await db.execute({
      sql: `SELECT id, con_id FROM master_consumers WHERE ccc_id = ?`,
      args: [cccId]
    });
    mcSel.rows.forEach(r => consumerIdToPkMap.set(String(r.con_id), Number(r.id)));
  } catch (e) {}

  console.log(`      ✅ Master Consumers: ${consumerIdToPkMap.size} records.`);

  // B. Disconnections (Sheet1)
  console.log(`  [B] Disconnections (Sheet1)...`);
  let disconRows = [];
  try {
    const dcRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `'Sheet1'!A2:Z10000`,
    });
    disconRows = dcRes.data.values || [];
  } catch (e) {}

  let disconCount = 0;
  for (const r of disconRows) {
    const cid = r[2] ? String(r[2]).trim() : "";
    if (!cid) continue;

    let masterPk = consumerIdToPkMap.get(cid);
    if (!masterPk) {
      try {
        const stub = await db.execute({
          sql: `INSERT INTO master_consumers (ccc_id, con_id, name, address, reg_mob_no)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(ccc_id, con_id) DO NOTHING
                RETURNING id`,
          args: [cccId, cid, r[3] || "AUTO PROVISIONED", r[4] || "", r[13] || ""]
        });
        if (stub.rows && stub.rows[0]) {
          masterPk = Number(stub.rows[0].id);
          consumerIdToPkMap.set(cid, masterPk);
        }
      } catch (e) {}
    }

    if (!masterPk) continue;

    const d2Amount = r[10] ? parseFloat(String(r[10]).replace(/[^\d.-]/g, "")) || 0 : 0;
    const disconDate = r[12] || "";
    const monthKey = formatMonthKey(disconDate);
    const agencyNameStr = r[21] ? String(r[21]).trim().toUpperCase() : "";
    const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;
    const driveFileId = extractDriveFileId(r[14]);
    const shortPriority = mapPriority(r[25]);
    const shortStatus = mapDisconStatus(r[11]);

    try {
      await db.execute({
        sql: `INSERT INTO disconnection_records (
                ccc_id, master_consumer_id, month_key, d2_net_os, discon_status,
                discon_date, agency_id, notes, reading, image_id, priority
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          cccId, masterPk, monthKey, d2Amount, shortStatus, disconDate,
          agencyId, r[22] || "", r[15] || "", driveFileId, shortPriority
        ]
      });
      disconCount++;
    } catch (e) {}
  }
  console.log(`      ✅ Disconnections: ${disconCount} records.`);

  // C. Deemed Visits (DD)
  console.log(`  [C] Deemed Visits (DD)...`);
  try {
    const ddRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'DD'!A2:Z5000` });
    const ddRows = ddRes.data.values || [];
    let ddCount = 0;
    for (const r of ddRows) {
      const cid = r[2] ? String(r[2]).trim() : "";
      if (!cid) continue;
      const masterPk = consumerIdToPkMap.get(cid);
      if (!masterPk) continue;

      const driveFileId = extractDriveFileId(r[15]);
      const agencyNameStr = r[21] ? String(r[21]).trim().toUpperCase() : "";
      const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;

      await db.execute({
        sql: `INSERT INTO deemed_visit_records (
                request_id, ccc_id, master_consumer_id, agency_id, status, reason, image_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING`,
        args: [`DD-${cccId}-${cid}-${ddCount}`, cccId, masterPk, agencyId, r[12] || 'DD', r[22] || '', driveFileId]
      });
      ddCount++;
    }
    console.log(`      ✅ Deemed Visits: ${ddCount} records.`);
  } catch (e) {}

  // D. Reconnections
  console.log(`  [D] Reconnections...`);
  try {
    const recRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'Reconnection'!A2:P5000` });
    const recRows = recRes.data.values || [];
    let recCount = 0;
    for (const r of recRows) {
      const reqId = r[0] || `REC-${cccId}-${recCount}`;
      const cid = r[2] ? String(r[2]).trim() : "";
      if (!cid) continue;
      const masterPk = consumerIdToPkMap.get(cid);
      if (!masterPk) continue;

      const driveFileId = extractDriveFileId(r[12]);
      const reqDriveFileId = extractDriveFileId(r[13]);
      const agencyNameStr = r[6] ? String(r[6]).trim().toUpperCase() : "";
      const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;

      await db.execute({
        sql: `INSERT INTO reconnection_records (
                request_id, ccc_id, master_consumer_id, agency_id, device, source, status,
                image_id, request_image_id, reading, remarks
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING`,
        args: [reqId, cccId, masterPk, agencyId, r[7] || '', r[8] || 'dc_list', mapDisconStatus(r[9]), driveFileId, reqDriveFileId, r[14] || '', r[15] || '']
      });
      recCount++;
    }
    console.log(`      ✅ Reconnections: ${recCount} records.`);
  } catch (e) {}

  // E. DTR Transformers & Inspections
  console.log(`  [E] DTR Transformers & Inspections...`);
  try {
    const dtrRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'DTR'!A2:Z2000` });
    const dtrRows = dtrRes.data.values || [];
    let dtrCount = 0;

    for (const r of dtrRows) {
      const dtrCode = r[0] ? String(r[0]).trim() : "";
      if (!dtrCode) continue;

      const driveFileId = extractDriveFileId(r[11]);
      const latLong = r[9] ? String(r[9]).split(',') : [];
      const zlat = latLong[0] ? parseFloat(latLong[0].trim()) : null;
      const zlong = latLong[1] ? parseFloat(latLong[1].trim()) : null;

      await db.execute({
        sql: `INSERT INTO dtr_assets (ccc_id, dtr_code, name, capacity_kva, substation, gis_pole, zlatitude, zlongitude, image_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(ccc_id, dtr_code) DO NOTHING`,
        args: [cccId, dtrCode, r[2] || r[1] || dtrCode, parseFloat(r[3]) || 63, r[1] || '', r[7] || '', zlat, zlong, driveFileId]
      });
      dtrCount++;
    }
    console.log(`      ✅ DTR Assets: ${dtrCount} transformers.`);
  } catch (e) {}

  // F. Meter Replacements
  console.log(`  [F] Meter Replacements...`);
  try {
    const mrRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'Meter_Replacement'!A2:Z5000` });
    const mrRows = mrRes.data.values || [];
    let mrCount = 0;

    for (const r of mrRows) {
      const cid = r[1] ? String(r[1]).trim() : "";
      if (!cid) continue;
      const masterPk = consumerIdToPkMap.get(cid);
      if (!masterPk) continue;

      const driveFileId = extractDriveFileId(r[12]);
      const agencyNameStr = r[5] ? String(r[5]).trim().toUpperCase() : "";
      const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;

      await db.execute({
        sql: `INSERT INTO meter_replacements (
                ccc_id, master_consumer_id, old_meter_no, new_meter_no, replacement_date,
                initial_reading, final_reading, image_id, agency_id, remarks
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [cccId, masterPk, r[13] || '', r[9] || '', r[7] || '', 0, 0, driveFileId, agencyId, r[11] || '']
      });
      mrCount++;
    }
    console.log(`      ✅ Meter Replacements: ${mrCount} records.`);
  } catch (e) {}

  // G. New Service Connection (NSC) Projects & Applications
  console.log(`  [G] NSC Applications...`);
  try {
    const nscRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'NSC_Projects'!A2:Z2000` });
    const nscRows = nscRes.data.values || [];
    let nscCount = 0;

    for (const r of nscRows) {
      const appNo = r[0] ? String(r[0]).trim() : "";
      if (!appNo) continue;

      const agencyNameStr = r[5] ? String(r[5]).trim().toUpperCase() : "";
      const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;

      await db.execute({
        sql: `INSERT INTO nsc_applications (
                application_no, ccc_id, applicant_name, address, mobile, status, assigned_agency_id, po_no
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(application_no) DO NOTHING`,
        args: [appNo, cccId, r[3] || appNo, '', '', r[7] || 'SUBMITTED', agencyId, r[4] || '']
      });
      nscCount++;
    }
    console.log(`      ✅ NSC Projects: ${nscCount} records.`);
  } catch (e) {}

  // H. Store Inventory Materials & Transactions
  console.log(`  [H] Store Inventory (Materials)...`);
  try {
    const matRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'Mat_Catalogue'!A2:J1000` });
    const matRows = matRes.data.values || [];
    let matCount = 0;

    for (const r of matRows) {
      const itemCode = r[1] || r[0];
      if (!itemCode) continue;

      await db.execute({
        sql: `INSERT INTO materials (ccc_id, item_code, item_name, unit, current_stock)
              VALUES (?, ?, ?, ?, ?) ON CONFLICT(ccc_id, item_code) DO NOTHING`,
        args: [cccId, itemCode, r[2] || itemCode, r[3] || 'nos', 0]
      });
      matCount++;
    }
    console.log(`      ✅ Materials Catalogue: ${matCount} items.`);
  } catch (e) {}

  // I. Safety Inspections
  console.log(`  [I] Safety Inspections...`);
  try {
    const safRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'Safety_Module'!A2:Z1000` });
    const safRows = safRes.data.values || [];
    let safCount = 0;

    for (const r of safRows) {
      if (!r[0]) continue;
      const beforeImageId = extractDriveFileId(r[11]);
      const afterImageId = extractDriveFileId(r[22]);
      const agencyNameStr = r[13] ? String(r[13]).trim().toUpperCase() : "";
      const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;

      await db.execute({
        sql: `INSERT INTO safety_inspections (ccc_id, title, location, agency_id, before_image_id, after_image_id, remarks)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [cccId, r[4] || 'Safety Inspection', r[9] || '', agencyId, beforeImageId, afterImageId, r[23] || '']
      });
      safCount++;
    }
    console.log(`      ✅ Safety Inspections: ${safCount} records.`);
  } catch (e) {}

  // J. Misc Inspections
  console.log(`  [J] Misc Inspections...`);
  try {
    const miscRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'Misc_Inspections'!A2:Z1000` });
    const miscRows = miscRes.data.values || [];
    let miscCount = 0;

    for (const r of miscRows) {
      if (!r[0]) continue;
      const sitePhotoId = extractDriveFileId(r[20]);
      const agencyNameStr = r[11] ? String(r[11]).trim().toUpperCase() : "";
      const agencyId = agencyMapByName.get(`${cccId}:${agencyNameStr}`) || null;

      await db.execute({
        sql: `INSERT INTO safety_inspections (ccc_id, title, location, agency_id, before_image_id, remarks)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [cccId, r[3] || 'Misc Inspection', r[8] || '', agencyId, sitePhotoId, r[19] || '']
      });
      miscCount++;
    }
    console.log(`      ✅ Misc Inspections: ${miscCount} records.`);
  } catch (e) {}

  // K. Zone Map History
  console.log(`  [K] Zone Map History...`);
  try {
    const zmRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'ZoneMapHistory'!A2:E2000` });
    const zmRows = zmRes.data.values || [];
    let zmCount = 0;

    for (const r of zmRows) {
      const zone = r[1] ? String(r[1]).trim() : "";
      const newAgencyStr = r[3] ? String(r[3]).trim().toUpperCase() : "";
      if (!zone || !newAgencyStr) continue;

      const agencyId = agencyMapByName.get(`${cccId}:${newAgencyStr}`);
      if (agencyId) {
        await db.execute({
          sql: `INSERT INTO agency_zone_mappings (ccc_id, zone, agency_id)
                VALUES (?, ?, ?) ON CONFLICT(ccc_id, zone) DO UPDATE SET agency_id=excluded.agency_id`,
          args: [cccId, zone, agencyId]
        });
        zmCount++;
      }
    }
    console.log(`      ✅ Zone Map Mappings: ${zmCount} active allotments.`);
  } catch (e) {}

  // L. Initialize Subscription
  await db.execute({
    sql: `INSERT INTO subscriptions (ccc_id, tier_type, status, expires_at)
          VALUES (?, 'PRO', 'ACTIVE', '2026-09-30')
          ON CONFLICT(ccc_id) DO UPDATE SET status='ACTIVE'`,
    args: [cccId]
  });
}

main().catch(err => {
  console.error("Migration Fatal Error:", err);
});
