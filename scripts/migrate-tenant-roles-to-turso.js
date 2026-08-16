const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    }
  }
}

const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_v4.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url: dbUrl, authToken: dbToken });

const MODULES = [
  "disconnection", "reconnection", "deemed", "dtr", "meter", "nsc",
  "consumer_master", "admin", "meter_replacement", "dtr_painting",
  "material", "osd", "safety", "misc_inspection"
];

async function migrateTenantRolesToTurso() {
  console.log('🚀 Starting Per-CCC AppRoles Migration from Tenant Sheets to Turso SQL...');

  if (!process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    console.warn('⚠️ GOOGLE_SHEETS_PRIVATE_KEY missing. Skipping tenant sheet roles migration.');
    return;
  }

  const auth = new JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheetsClient = sheets({ version: 'v4', auth });

  // 1. Fetch all CCC Tenants from Turso ccc_registry
  const cccRes = await db.execute("SELECT id, ccc_code, ccc_name, spreadsheet_id FROM ccc_registry");
  console.log(`📋 Found ${cccRes.rows.length} CCC tenants in ccc_registry.`);

  let totalMigrated = 0;

  for (const tenant of cccRes.rows) {
    const cccId = tenant.id;
    const cccCode = String(tenant.ccc_code).trim();
    const cccName = String(tenant.ccc_name).trim();
    const spreadsheetId = String(tenant.spreadsheet_id).trim();

    if (!spreadsheetId) continue;

    try {
      // Read AppRoles tab from the tenant's spreadsheet
      const rolesRes = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: 'AppRoles!A1:Z50',
      }).catch(() => null);

      if (!rolesRes?.data?.values || rolesRes.data.values.length < 2) continue;

      const rows = rolesRes.data.values;
      const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const roleName = String(row[0] || '').trim();
        if (!roleName) continue;

        const permissionsObj = {};
        MODULES.forEach(mod => {
          const modIdx = headers.findIndex(h => h.toLowerCase() === mod.toLowerCase());
          if (modIdx !== -1 && row[modIdx]) {
            permissionsObj[mod] = String(row[modIdx]).split(',').map(s => s.trim()).filter(Boolean);
          } else {
            permissionsObj[mod] = [];
          }
        });

        const jsonStr = JSON.stringify(permissionsObj);

        await db.execute({
          sql: `INSERT INTO app_roles (ccc_id, role, permissions_json)
                VALUES (?, ?, ?)
                ON CONFLICT(ccc_id, role) DO UPDATE SET
                  permissions_json = excluded.permissions_json,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [cccId, roleName, jsonStr],
        });

        totalMigrated++;
      }
      console.log(`   ✅ Migrated custom AppRoles for ${cccName} (${cccCode}).`);
    } catch (err) {
      console.warn(`   ⚠️ Could not migrate AppRoles for ${cccName} (${cccCode}):`, err.message);
    }
  }

  console.log(`\n🎉 Successfully migrated ${totalMigrated} per-CCC custom roles into Turso app_roles!`);
}

migrateTenantRolesToTurso();
