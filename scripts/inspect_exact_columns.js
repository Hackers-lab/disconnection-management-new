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
const kushidaSheetId = "16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY";

async function inspectTabColumns(tabName) {
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: kushidaSheetId,
      range: `'${tabName}'!A1:Z5`,
    });
    const rows = res.data.values || [];
    console.log(`\n========================================`);
    console.log(`TAB: "${tabName}"`);
    console.log(`========================================`);
    if (rows.length > 0) {
      console.log(`HEADER (Row 1):`);
      rows[0].forEach((colName, index) => {
        console.log(`  Index ${index} [Column ${String.fromCharCode(65 + (index % 26))}] : "${colName}"`);
      });
      if (rows.length > 1) {
        console.log(`SAMPLE DATA (Row 2):`, JSON.stringify(rows[1]));
      }
    } else {
      console.log(`(Empty Tab)`);
    }
  } catch (e) {
    console.error(`Error reading ${tabName}:`, e.message);
  }
}

async function main() {
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: kushidaSheetId });
  const tabTitles = meta.data.sheets.map(s => s.properties.title);
  console.log("All tabs in Kushida CCC:", tabTitles);

  for (const t of tabTitles) {
    await inspectTabColumns(t);
  }
}

main();
