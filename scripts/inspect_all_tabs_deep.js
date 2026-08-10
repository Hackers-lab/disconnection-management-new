const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');
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
const masterConfigSheet = env.MASTER_CONFIG_SHEET;
const kushidaSheet = "16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY";

async function inspectMasterConfig() {
  console.log("==================================================");
  console.log("INSPECTING MASTER CONFIG SHEET TABS & HEADERS");
  console.log("==================================================");

  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: masterConfigSheet });
  const sheetNames = meta.data.sheets.map(s => s.properties.title);
  console.log("Master Config Tabs:", sheetNames);

  for (const name of sheetNames) {
    try {
      const res = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: masterConfigSheet,
        range: `'${name}'!1:2`
      });
      const rows = res.data.values || [];
      console.log(`\n--- Tab: [${name}] ---`);
      console.log("Headers:", rows[0] || []);
      if (rows[1]) console.log("Sample Row 1:", rows[1]);
    } catch (e) {
      console.error(`Error reading master config tab ${name}:`, e.message);
    }
  }
}

async function inspectKushidaTabs() {
  console.log("\n==================================================");
  console.log("INSPECTING KUSHIDA CCC TABS & HEADERS");
  console.log("==================================================");

  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: kushidaSheet });
  const sheetNames = meta.data.sheets.map(s => s.properties.title);
  console.log("Kushida Tabs:", sheetNames);

  for (const name of sheetNames) {
    try {
      const res = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: kushidaSheet,
        range: `'${name}'!1:2`
      });
      const rows = res.data.values || [];
      console.log(`\n--- Tab: [${name}] ---`);
      console.log("Headers:", rows[0] || []);
      if (rows[1]) console.log("Sample Row 1:", rows[1]);
    } catch (e) {
      console.error(`Error reading Kushida tab ${name}:`, e.message);
    }
  }
}

async function main() {
  await inspectMasterConfig();
  await inspectKushidaTabs();
}

main().catch(err => console.error(err));
