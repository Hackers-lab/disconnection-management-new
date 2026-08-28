const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
    value = value.replace(/\\n/g, '\n');
    env[match[1]] = value;
  }
});

const consumers = ['300476577', '300506096', '300201830', '300610807'];

const auth = new JWT({
  email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: env.GOOGLE_SHEETS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

async function getCccSpreadsheets() {
  const masterId = env.MASTER_CONFIG_SHEET;
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterId,
    range: 'CCC_Registry!A1:Z50'
  });
  console.log('CCC_Registry:', res.data.values);
  const rows = res.data.values || [];
  const header = rows[0];
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    list.push({
      name: r[0] || r[1] || `CCC-${i}`,
      spreadsheetId: r.find(val => typeof val === 'string' && val.length > 20 && !val.includes(' ') && !val.includes('@'))
    });
  }
  return list;
}

async function main() {
  const cccList = await getCccSpreadsheets();
  console.log('Found CCCs:', cccList);

  for (const ccc of cccList) {
    if (!ccc.spreadsheetId) continue;
    console.log(`\n========================================`);
    console.log(`Searching CCC: ${ccc.name} (ID: ${ccc.spreadsheetId})`);
    try {
      const sMeta = await sheetsClient.spreadsheets.get({ spreadsheetId: ccc.spreadsheetId });
      const sheetTitles = sMeta.data.sheets.map(s => s.properties.title);
      console.log(`Sheets in CCC: ${sheetTitles.join(', ')}`);

      for (const title of sheetTitles) {
        // Fetch up to 20000 rows
        const data = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: ccc.spreadsheetId,
          range: `'${title}'!A1:AZ20000`
        });
        const rows = data.data.values || [];
        if (rows.length === 0) continue;
        const headers = rows[0].map(h => String(h || '').trim());
        
        for (const cid of consumers) {
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const r = rows[rIdx];
            if (r.some(cell => String(cell || '').trim() === cid)) {
              console.log(`\n  [FOUND] Consumer ${cid} in Sheet "${title}" Row ${rIdx + 1}`);
              headers.forEach((h, idx) => {
                if (r[idx] !== undefined && r[idx] !== '') {
                  console.log(`    ${h}: ${r[idx]}`);
                }
              });
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error reading ${ccc.name}:`, e.message);
    }
  }
}

main().catch(console.error);
