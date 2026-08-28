const fs = require('fs');
const path = require('path');
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

const auth = new JWT({
  email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: env.GOOGLE_SHEETS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });
const consumers = ['300476577', '300506096', '300201830', '300610807'];

async function main() {
  // 1. Read Master_Credentials
  try {
    const credRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: env.MASTER_CONFIG_SHEET,
      range: 'Master_Credentials!A1:Z50'
    });
    console.log('Master_Credentials rows:', credRes.data.values);
  } catch (e) {
    console.log('Error reading Master_Credentials:', e.message);
  }

  // 2. Read Kushida Sheet1 (the disconnection list as on 17.8)
  const kushidaSheetId = '16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY';
  try {
    const s1Res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: kushidaSheetId,
      range: 'Sheet1!A1:AZ10000'
    });
    const rows = s1Res.data.values || [];
    console.log(`\nKushida Sheet1 total rows: ${rows.length}`);
    if (rows.length > 0) {
      const headers = rows[0].map(h => String(h || '').trim());
      console.log('Headers in Kushida Sheet1:', headers);
      
      consumers.forEach(cid => {
        const found = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.some(cell => String(cell || '').trim() === cid)) {
            found.push({ rowIdx: i + 1, row });
          }
        }
        if (found.length > 0) {
          console.log(`\n>>> [Kushida Sheet1] MATCH for Consumer ${cid} (${found.length} entries):`);
          found.forEach(m => {
            console.log(`  Row ${m.rowIdx}:`);
            headers.forEach((h, idx) => {
              if (m.row[idx] !== undefined && m.row[idx] !== '') {
                console.log(`    ${h}: ${m.row[idx]}`);
              }
            });
          });
        } else {
          console.log(`\n>>> [Kushida Sheet1] Consumer ${cid} NOT found in current active Sheet1.`);
        }
      });
    }
  } catch (e) {
    console.log('Error reading Kushida Sheet1:', e.message);
  }
}

main().catch(console.error);
