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

async function main() {
  console.log("=== DEEP ANALYSIS OF DATA FLAWS IN GOOGLE SHEETS ===");

  // 1. Inspect Agencies tab
  const agRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'Agencies'!A1:E200`,
  });
  const agencyRows = agRes.data.values || [];
  console.log(`\nTotal Agencies in Sheet: ${agencyRows.length - 1}`);
  let missingVendorCode = 0;
  let vendorCodeInDesc = 0;
  
  agencyRows.slice(1).forEach((r, idx) => {
    const name = r[1] || "";
    const desc = r[2] || "";
    const ccc = r[4] || "";
    const vendorMatch = desc.match(/vendor\s*code\s*:?\s*(\w+)/i) || name.match(/vendor\s*code\s*:?\s*(\w+)/i);
    
    if (vendorMatch) {
      vendorCodeInDesc++;
      console.log(`[Agency ${r[0]}] ${name} (CCC ${ccc}) -> Extracted Vendor Code: "${vendorMatch[1]}" from Description`);
    } else {
      missingVendorCode++;
      console.log(`[Agency ${r[0]}] ${name} (CCC ${ccc}) -> NO VENDOR CODE FOUND in Name or Description!`);
    }
  });

  console.log(`\nAgency Summary: ${vendorCodeInDesc} vendor codes extracted from text; ${missingVendorCode} completely missing vendor codes.`);

  // 2. Inspect Master_Credentials tab
  const uRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterConfigSheet,
    range: `'Master_Credentials'!A1:J200`,
  });
  const userRows = uRes.data.values || [];
  console.log(`\nTotal Users in Sheet: ${userRows.length - 1}`);
  userRows.slice(1).forEach((r) => {
    console.log(`User ID ${r[0]}: username="${r[1]}", role="${r[3]}", ccc="${r[4]}", name="${r[5]}", agencies="${r[6]}"`);
  });
}

main();
