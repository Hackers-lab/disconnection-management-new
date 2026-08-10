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

// 2. Initialize libSQL Database Client (local SQLite file or Turso Cloud)
const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_kushida.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url: dbUrl, authToken: dbToken });

async function initSchema() {
  console.log("--> Initializing Turso SQL Database Schema...");
  const schemaSqlPath = path.join(__dirname, '../lib/schema.sql');
  const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
  
  // Split statements by semicolon
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      console.error(`Error executing DDL statement: ${stmt.substring(0, 50)}...`, err.message);
    }
  }
  console.log("✅ Schema initialized successfully!");
}

async function main() {
  const startTime = Date.now();
  console.log("==================================================");
  console.log("STARTING KUSHIDA CCC (6612107) DATA ETL MIGRATION");
  console.log("==================================================");

  await initSchema();

  const cccCodeTarget = "6612107";
  let tenantSpreadsheetId = "";

  // Step 1: Read Master Registry to find Kushida CCC spreadsheet ID
  console.log("\n[Step 1] Reading CCC Registry...");
  const regRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'CCC_Registry'!A1:Z100`,
  });
  const regRows = regRes.data.values || [];
  regRows.slice(1).forEach(r => {
    if (r[0] === cccCodeTarget) {
      tenantSpreadsheetId = r[2];
    }
  });

  if (!tenantSpreadsheetId) {
    tenantSpreadsheetId = "16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY"; // Kushida CCC default
  }
  console.log(`✅ Found Kushida CCC Spreadsheet ID: ${tenantSpreadsheetId}`);

  // Step 2: Migrate Agencies & Aliases
  console.log("\n[Step 2] Migrating Agencies for Kushida CCC...");
  const agencyRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'Agencies'!A2:E200`,
  });
  const agencyRows = agencyRes.data.values || [];
  const agencyMapByName = new Map(); // name -> agency_id
  
  for (const r of agencyRows) {
    const idStr = r[0] || "";
    const name = r[1] || "";
    const desc = r[2] || "";
    const isActive = String(r[3]).toLowerCase() === "true";
    const ccc = String(r[4] || "").trim();

    if (ccc === cccCodeTarget || ccc === "SYSTEM") {
      const vendorMatch = desc.match(/vendor\s*code\s*:?\s*(\w+)/i) || name.match(/vendor\s*code\s*:?\s*(\w+)/i);
      const vendorCode = vendorMatch ? vendorMatch[1] : `TEMP-VND-${ccc}-${idStr}`;

      try {
        const ins = await db.execute({
          sql: `INSERT INTO agencies (vendor_code, ccc_code, name, description, is_active)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(vendor_code) DO UPDATE SET name=excluded.name
                RETURNING id`,
          args: [vendorCode, cccCodeTarget, name, desc, isActive ? 1 : 0]
        });
        const agencyId = Number(ins.rows[0].id);
        agencyMapByName.set(name.trim().toUpperCase(), agencyId);
        agencyMapByName.set(vendorCode.trim().toUpperCase(), agencyId);

        // Register Aliases
        await db.execute({
          sql: `INSERT INTO agency_aliases (agency_id, alias_name, ccc_code)
                VALUES (?, ?, ?)
                ON CONFLICT(ccc_code, alias_name) DO NOTHING`,
          args: [agencyId, name.trim().toUpperCase(), cccCodeTarget]
        });
        await db.execute({
          sql: `INSERT INTO agency_aliases (agency_id, alias_name, ccc_code)
                VALUES (?, ?, ?)
                ON CONFLICT(ccc_code, alias_name) DO NOTHING`,
          args: [agencyId, vendorCode.trim().toUpperCase(), cccCodeTarget]
        });
      } catch (err) {
        console.error(`Failed agency insert: ${name}`, err.message);
      }
    }
  }
  console.log(`✅ Migrated ${agencyMapByName.size} agency lookup aliases.`);

  // Step 3: Migrate Users & Credentials
  console.log("\n[Step 3] Migrating User Credentials...");
  const userRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'Master_Credentials'!A2:J200`,
  });
  const userRows = userRes.data.values || [];
  let userCount = 0;
  for (const r of userRows) {
    const id = String(r[0] || "");
    const username = String(r[1] || "");
    const password = String(r[2] || "");
    const role = String(r[3] || "");
    const ccc = String(r[4] || "");
    const name = String(r[5] || "");

    if (ccc === cccCodeTarget || ccc === "SYSTEM" || role === "superuser") {
      try {
        await db.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, ccc_code)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET full_name=excluded.full_name`,
          args: [id || username, username, password, name, role, ccc]
        });
        userCount++;
      } catch (err) {
        console.error(`Failed user insert: ${username}`, err.message);
      }
    }
  }
  console.log(`✅ Migrated ${userCount} user accounts.`);

  // Step 4: Migrate Master Consumer Registry (49k+ Rows)
  console.log("\n[Step 4] Migrating Master Consumer Registry (Consumer_Master)...");
  const masterRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: tenantSpreadsheetId,
    range: `'Consumer_Master'!A2:J60000`,
  });
  const masterRows = masterRes.data.values || [];
  console.log(`Found ${masterRows.length} Master Consumer rows in Google Sheet.`);

  const consumerIdToPkMap = new Map(); // consumer_id -> master_consumer PK
  const BATCH_SIZE = 1000;
  let masterInserted = 0;

  for (let i = 0; i < masterRows.length; i += BATCH_SIZE) {
    const batch = masterRows.slice(i, i + BATCH_SIZE);
    const txStatements = batch
      .filter(r => r && r[0])
      .map(r => ({
        sql: `INSERT INTO master_consumers (ccc_code, consumer_id, name, care_of, address, base_class, meter_no, zone, mobile, latitude, longitude)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(ccc_code, consumer_id) DO UPDATE SET name=excluded.name
              RETURNING id, consumer_id`,
        args: [
          cccCodeTarget,
          String(r[0]).trim(),
          r[1] || "",
          r[2] || "",
          r[3] || "",
          r[4] || "",
          r[5] || "",
          r[6] || "",
          r[7] || "",
          r[8] ? parseFloat(r[8]) : null,
          r[9] ? parseFloat(r[9]) : null,
        ]
      }));

    try {
      const results = await db.batch(txStatements, "write");
      results.forEach((res, idx) => {
        if (res.rows && res.rows[0]) {
          const pk = Number(res.rows[0].id);
          const cid = String(batch[idx][0]).trim();
          consumerIdToPkMap.set(cid, pk);
          masterInserted++;
        }
      });
    } catch (batchErr) {
      // Fallback row-by-row if batch hits any issue
      for (const stmt of txStatements) {
        try {
          const res = await db.execute(stmt);
          if (res.rows && res.rows[0]) {
            consumerIdToPkMap.set(String(stmt.args[1]), Number(res.rows[0].id));
            masterInserted++;
          }
        } catch (rErr) {
          // ignore single dup error
        }
      }
    }

    if (i % 5000 === 0 && i > 0) {
      console.log(` ... Processed ${i} / ${masterRows.length} Master Consumers`);
    }
  }
  console.log(`✅ Successfully loaded ${masterInserted} Master Consumers into Turso DB.`);

  // Step 5: Migrate Active Disconnections (Sheet1 / Disconnections)
  console.log("\n[Step 5] Migrating Disconnections (Sheet1)...");
  let disconRows = [];
  try {
    const dcRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: tenantSpreadsheetId,
      range: `'Sheet1'!A2:Z10000`,
    });
    disconRows = dcRes.data.values || [];
  } catch (e) {
    console.log("No Sheet1 tab found, attempting Disconnections tab...");
    const dcRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: tenantSpreadsheetId,
      range: `'Disconnections'!A2:Z10000`,
    });
    disconRows = dcRes.data.values || [];
  }

  console.log(`Found ${disconRows.length} active disconnection records.`);
  let disconInserted = 0;
  let totalD2NetOSSum = 0;

  for (const r of disconRows) {
    const cid = r[2] ? String(r[2]).trim() : "";
    if (!cid) continue;

    let masterPk = consumerIdToPkMap.get(cid);
    if (!masterPk) {
      // Auto-provision stub Master Consumer row
      try {
        const stubIns = await db.execute({
          sql: `INSERT INTO master_consumers (ccc_code, consumer_id, name, address, mobile)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(ccc_code, consumer_id) DO NOTHING
                RETURNING id`,
          args: [cccCodeTarget, cid, r[3] || "AUTO PROVISIONED", r[4] || "", r[17] || ""]
        });
        if (stubIns.rows && stubIns.rows[0]) {
          masterPk = Number(stubIns.rows[0].id);
          consumerIdToPkMap.set(cid, masterPk);
        }
      } catch (e) {}
    }

    if (!masterPk) continue;

    const d2Amount = r[13] ? parseFloat(String(r[13]).replace(/[^\d.-]/g, "")) || 0 : 0;
    totalD2NetOSSum += d2Amount;
    const agencyNameStr = r[20] ? String(r[20]).trim().toUpperCase() : "";
    const agencyId = agencyMapByName.get(agencyNameStr) || null;

    try {
      await db.execute({
        sql: `INSERT INTO disconnection_records (
                ccc_code, master_consumer_id, month_key, d2_net_os, discon_status,
                discon_date, agency_id, notes, reading, image_url
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          cccCodeTarget,
          masterPk,
          '2026-08',
          d2Amount,
          r[14] || 'PENDING',
          r[15] || '',
          agencyId,
          r[22] || '',
          r[23] || '',
          r[24] || ''
        ]
      });
      disconInserted++;
    } catch (err) {
      console.error(`Failed discon insert for consumer ${cid}:`, err.message);
    }
  }

  console.log(`✅ Loaded ${disconInserted} Disconnection records.`);
  console.log(`💰 Total D2 Net Outstanding Sum: ₹${totalD2NetOSSum.toFixed(2)}`);

  // Step 6: Migrate Subscriptions (Default Legacy Pro active until Sept 30)
  console.log("\n[Step 6] Initializing Subscription Status...");
  await db.execute({
    sql: `INSERT INTO subscriptions (ccc_code, tier_type, status, expires_at)
          VALUES (?, 'PRO', 'ACTIVE', '2026-09-30')
          ON CONFLICT(ccc_code) DO UPDATE SET status='ACTIVE'`,
    args: [cccCodeTarget]
  });
  console.log("✅ Kushida CCC subscription active through 2026-09-30.");

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n==================================================");
  console.log(`KUSHIDA CCC ETL MIGRATION COMPLETE IN ${totalTimeSec} SECONDS!`);
  console.log("==================================================");
}

main().catch(err => {
  console.error("Migration Fatal Error:", err);
});
