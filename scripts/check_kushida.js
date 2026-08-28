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

const consumers = ['300476577', '300506096', '300201830', '300610807'];

const auth = new JWT({
  email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: env.GOOGLE_SHEETS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

const kushidaSpreadsheetId = '16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY';

async function checkKushida() {
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: kushidaSpreadsheetId });
  console.log('Kushida sheets:', meta.data.sheets.map(s => s.properties.title));

  for (const s of meta.data.sheets) {
    const title = s.properties.title;
    console.log(`\n--- Reading "${title}" ---`);
    const data = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: kushidaSpreadsheetId,
      range: `'${title}'!A1:AZ25000`
    });
    const rows = data.data.values || [];
    if (rows.length === 0) continue;
    const header = rows[0].map(h => String(h || '').trim());
    console.log(`Total rows in ${title}: ${rows.length}`);
    
    // Find consumer ID column
    const cidCol = header.findIndex(h => /consumer.*id|con.*id|consumer_no|consumer/i.test(h));
    
    for (const cid of consumers) {
      const matches = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (cidCol !== -1) {
          if (String(row[cidCol] || '').trim() === cid) {
            matches.push({ rowIdx: i + 1, row });
          }
        } else {
          if (row.some(c => String(c || '').trim() === cid)) {
            matches.push({ rowIdx: i + 1, row });
          }
        }
      }
      
      if (matches.length > 0) {
        console.log(`\n  >> Found ${cid} in ${title} (${matches.length} matches):`);
        matches.forEach(m => {
          console.log(`     Row ${m.rowIdx}:`);
          header.forEach((h, idx) => {
            if (m.row[idx]) console.log(`       ${h}: ${m.row[idx]}`);
          });
        });
      }
    }
  }
}

checkKushida().catch(console.error);
