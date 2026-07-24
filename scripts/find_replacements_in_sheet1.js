// scripts/find_replacements_in_sheet1.js
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

// Parse .env.local manually
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
const spreadsheetId = env.DISCONNECTION_SHEET;

const auth = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

async function run() {
  try {
    console.log('Fetching Sheet1 and Meter_Replacement...');
    const [sheet1Res, mrRes] = await Promise.all([
      sheetsClient.spreadsheets.values.get({ spreadsheetId, range: "'Sheet1'" }),
      sheetsClient.spreadsheets.values.get({ spreadsheetId, range: "'Meter_Replacement'" })
    ]);

    const s1Rows = sheet1Res.data.values || [];
    const mrRows = mrRes.data.values || [];

    if (s1Rows.length < 2) {
      console.log('No data in Sheet1.');
      return;
    }
    if (mrRows.length < 2) {
      console.log('No data in Meter_Replacement.');
      return;
    }

    const s1Consumers = new Set(s1Rows.slice(1).map(r => String(r[2] || '').trim()));
    console.log(`Sheet1 has ${s1Consumers.size} unique consumers.`);

    console.log('\nCross-referencing Meter_Replacement with Sheet1:');
    mrRows.slice(1).forEach((r, idx) => {
      const repId = r[0];
      const cid = String(r[1] || '').trim();
      const status = r[8];
      const exists = s1Consumers.has(cid);
      console.log(`Replacement ${repId} (Consumer ${cid}): Status = ${status} | Exists in Sheet1 = ${exists}`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
