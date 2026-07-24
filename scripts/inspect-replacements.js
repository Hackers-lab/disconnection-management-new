const fs = require('fs');
const path = require('path');
const { sheets } = require('@googleapis/sheets');
const { GoogleAuth } = require('google-auth-library');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

const clientEmail = env['GOOGLE_SHEETS_CLIENT_EMAIL'];
const privateKey = env['GOOGLE_SHEETS_PRIVATE_KEY'] ? env['GOOGLE_SHEETS_PRIVATE_KEY'].replace(/\\n/g, '\n') : '';
const sheetId = env['DISCONNECTION_SHEET'];

const auth = new GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheetsClient = sheets({ version: 'v4', auth });

async function run() {
  try {
    console.log(`Connecting to spreadsheet: ${sheetId}`);
    
    // Fetch Meter_Replacement sheet
    const repRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Meter_Replacement!A:O',
    });
    const repRows = repRes.data.values || [];
    console.log(`\n=== METER REPLACEMENT ROWS (${repRows.length - 1} records) ===`);
    console.log(repRows[0] ? repRows[0].join(' | ') : 'No headers');
    repRows.slice(1).forEach((r, idx) => {
      console.log(`Row ${idx + 2}: ${r.join(' | ')}`);
    });
    
    // Fetch Meter_Issues sheet
    const issueRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Meter_Issues!A:U',
    });
    const issueRows = issueRes.data.values || [];
    console.log(`\n=== METER ISSUES ROWS (${issueRows.length - 1} records) ===`);
    console.log(issueRows[0] ? issueRows[0].join(' | ') : 'No headers');
    issueRows.slice(1).forEach((i, idx) => {
      console.log(`Row ${idx + 2}: ${i.join(' | ')}`);
    });

  } catch (err) {
    console.error('Error during inspection:', err);
  }
}

run();
