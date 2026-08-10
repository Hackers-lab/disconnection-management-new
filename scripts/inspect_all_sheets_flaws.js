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

const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY;
const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL;
const masterConfigSheet = env.MASTER_CONFIG_SHEET;

const auth = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

async function inspectSheet(spreadsheetId, label) {
  console.log(`\n========================================`);
  console.log(`INSPECTING SPREADSHEET [${label}]: ${spreadsheetId}`);
  console.log(`========================================`);

  try {
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
    const sheetProperties = meta.data.sheets.map(s => ({
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount,
      columnCount: s.properties.gridProperties?.columnCount
    }));

    console.log(`Found ${sheetProperties.length} tabs:`);
    sheetProperties.forEach(s => console.log(` - Tab: "${s.title}" (${s.rowCount}x${s.columnCount})`));

    for (const sheetProps of sheetProperties) {
      const tabName = sheetProps.title;
      try {
        const res = await sheetsClient.spreadsheets.values.get({
          spreadsheetId,
          range: `'${tabName}'!A1:Z20`, // Get first 20 rows
        });
        const rows = res.data.values || [];
        console.log(`\n--- TAB: "${tabName}" (Sample ${rows.length} rows) ---`);
        if (rows.length > 0) {
          console.log(`Header (Row 1):`, JSON.stringify(rows[0]));
          if (rows.length > 1) {
            console.log(`Sample Row 2:`, JSON.stringify(rows[1]));
          }
          if (rows.length > 2) {
            console.log(`Sample Row 3:`, JSON.stringify(rows[2]));
          }
        } else {
          console.log(`(Empty sheet)`);
        }
      } catch (tabErr) {
        console.error(`Error reading tab "${tabName}":`, tabErr.message);
      }
    }
  } catch (err) {
    console.error(`Error reading spreadsheet [${label}]:`, err.message);
  }
}

async function main() {
  if (masterConfigSheet) {
    await inspectSheet(masterConfigSheet, "MASTER_CONFIG_SHEET");
  }

  // Also inspect one tenant sheet if CCC_Registry is present in MASTER_CONFIG_SHEET
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterConfigSheet,
      range: `'CCC_Registry'!A1:Z10`,
    });
    const rows = res.data.values || [];
    console.log("\n--- CCC_REGISTRY SAMPLE ---");
    console.log("Headers:", JSON.stringify(rows[0]));
    if (rows.length > 1) {
      console.log("Row 1:", JSON.stringify(rows[1]));
      // Inspect first tenant spreadsheet ID (usually column C or D)
      const sampleTenantSheetId = rows[1].find(cell => String(cell).length > 20 && String(cell).startsWith('1'));
      if (sampleTenantSheetId) {
        await inspectSheet(sampleTenantSheetId, "SAMPLE_TENANT_SHEET");
      }
    }
  } catch (e) {
    console.error("Could not fetch CCC_Registry:", e.message);
  }
}

main();
