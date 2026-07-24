// scripts/check_replacements.js
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
    const mrRes = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: "'Meter_Replacement'" });
    const mrRows = mrRes.data.values || [];
    if (mrRows.length < 2) return;

    const headers = mrRows[0].map(h => String(h || '').trim());
    console.log('Headers:', headers);

    const targetIds = ['MR-0002', 'MR-0005'];
    targetIds.forEach(targetId => {
      const matchIdx = mrRows.findIndex(r => String(r[0] || '').trim() === targetId);
      if (matchIdx !== -1) {
        const row = mrRows[matchIdx];
        console.log(`\nReplacement ID: ${targetId} (Row ${matchIdx + 1})`);
        headers.forEach((h, idx) => {
          console.log(`  ${h}: ${row[idx] || ''}`);
        });
      } else {
        console.log(`\nReplacement ID ${targetId} not found.`);
      }
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
