const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

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

const auth = new JWT({
  email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: env.GOOGLE_SHEETS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });
const db = createClient({ url: "file:turso_v2.db" });

async function run() {
  console.log("Fetching Master Consumers from Kushida sheet...");
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: "16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY",
    range: `'Consumer_Master'!A2:J60000`,
  });
  const rows = res.data.values || [];
  console.log(`Fetched ${rows.length} rows.`);

  const cccId = 1; // Kushida
  const BATCH_SIZE = 500;
  let inserted = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const txStatements = batch
      .filter(r => r && r[0] && String(r[0]).trim() !== "")
      .map(r => ({
        sql: `INSERT INTO master_consumers (
                ccc_id, con_id, name, care_of, address, base_class, 
                conn_stat, meter_no, mru, reg_mob_no, zlatitude, zlongitude
              ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
              ON CONFLICT(ccc_id, con_id) DO UPDATE SET name=excluded.name`,
        args: [
          cccId,
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
      await db.batch(txStatements, "write");
      inserted += txStatements.length;
    } catch (err) {
      console.error(`Batch ${i} error:`, err.message);
    }
  }

  const durationSec = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Inserted ${inserted} rows in ${durationSec} seconds!`);

  const countRes = await db.execute("SELECT COUNT(*) as cnt FROM master_consumers WHERE ccc_id = 1");
  console.log(`SQL Master Consumer Count: ${countRes.rows[0].cnt}`);
}

run();
