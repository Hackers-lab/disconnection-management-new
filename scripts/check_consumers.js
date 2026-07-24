// scripts/check_consumers.js
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
    // Handle escaped newlines in private key
    value = value.replace(/\\n/g, '\n');
    env[match[1]] = value;
  }
});

const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY;
const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL;
const spreadsheetId = env.DISCONNECTION_SHEET;
const sheetName = 'Sheet1';

const auth = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

async function run() {
  try {
    console.log('Fetching sheet data...');
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'`,
    });
    const rows = response.data.values || [];
    if (rows.length < 2) {
      console.log('No data found in Sheet1.');
      return;
    }
    const headers = rows[0].map(h => String(h || '').trim());

    const cids = ['342427886', '300609990'];
    cids.forEach(cid => {
      const matchIdx = rows.findIndex(r => String(r[2] || '').trim() === cid);
      if (matchIdx !== -1) {
        const row = rows[matchIdx];
        console.log(`\nConsumer ID: ${cid} (Row ${matchIdx + 1})`);
        headers.forEach((h, idx) => {
          console.log(`  ${h}: ${row[idx] || ''}`);
        });
      } else {
        console.log(`\nConsumer ID: ${cid} not found in Sheet1.`);
      }
    });
  } catch (err) {
    console.error('Error fetching sheet:', err);
  }
}

run();
