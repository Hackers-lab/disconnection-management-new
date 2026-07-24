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
const sheetId = env['MASTER_CONFIG_SHEET'];

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
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Master_Credentials!A2:J',
    });
    const rows = res.data.values || [];
    
    const users = rows
      .filter(row => row && row.length > 0)
      .map(([id, username, password, role, cccCode, name, agencies, subStatus, subExpiresAt, bypassSub], index) => ({
        _sheetRow: index + 2,
        id: String(id || ""),
        username: String(username || ""),
        password: String(password || ""),
        role: String(role || ""),
        cccCode: String(cccCode || ""),
        name: String(name || ""),
        agencies: agencies ? String(agencies).split(",") : [],
        subscriptionStatus: subStatus ? String(subStatus).trim() : "active",
        subscriptionExpiresAt: subExpiresAt ? String(subExpiresAt).trim() : "",
        bypassSubscription: bypassSub ? String(bypassSub).trim().toUpperCase() === "TRUE" : false,
      }));

    console.log(`Searching for "Maity"...`);
    const results = users.filter(u => 
      u.name.toLowerCase().includes('maity') || 
      u.username.toLowerCase().includes('maity')
    );
    
    if (results.length === 0) {
      console.log('No user found containing "Maity".');
    } else {
      results.forEach(u => console.log(JSON.stringify(u, null, 2)));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
