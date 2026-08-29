const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
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

const cloudUrl = 'libsql://disconnection-kv-vercel-icfg-kujamkj5goqn06ie5yhdsmpq.aws-us-east-1.turso.io';
const authToken = env.TURSO_AUTH_TOKEN;

console.log('🔌 Connecting directly to Turso Cloud DB:', cloudUrl);
const db = createClient({ url: cloudUrl, authToken });

async function seedCloud() {
  console.log('\n🚀 [1/6] Executing DDL Schema Setup on Cloud Turso...');
  const schemaPath = path.join(__dirname, '../lib/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      if (!err.message?.includes('already exists')) {
        console.warn('DDL Notice:', err.message);
      }
    }
  }
  console.log('✅ Core DDL tables created successfully in Cloud Turso.');

  const auth = new JWT({
    email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheetsClient = sheets({ version: 'v4', auth });
  const masterSheetId = env.MASTER_CONFIG_SHEET;

  // 1. Seed CCC_Registry
  console.log('\n📋 [2/6] Seeding CCC_Registry into Cloud Turso...');
  const regRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'CCC_Registry!A2:E100',
  });
  if (regRes?.data?.values) {
    for (const row of regRes.data.values) {
      if (!row || !row[0]) continue;
      await db.execute({
        sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, spreadsheet_id, drive_folder_id, drive_refresh_token) 
              VALUES (?, ?, ?, ?, ?) 
              ON CONFLICT(ccc_code) DO UPDATE SET 
                ccc_name=excluded.ccc_name, 
                spreadsheet_id=excluded.spreadsheet_id, 
                drive_folder_id=excluded.drive_folder_id, 
                drive_refresh_token=excluded.drive_refresh_token, 
                updated_at=CURRENT_TIMESTAMP`,
        args: [String(row[0]).trim(), String(row[1] || '').trim(), String(row[2] || '').trim(), String(row[3] || '').trim(), String(row[4] || '').trim()]
      });
    }
    console.log(`✅ Seeded ${regRes.data.values.length} CCC office tenants into Cloud Turso.`);
  }

  // 2. Seed Users from Master_Credentials
  console.log('\n👥 [3/6] Seeding Users from Master_Credentials into Cloud Turso...');
  const usersRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'Master_Credentials!A2:J500',
  });
  if (usersRes?.data?.values) {
    for (const row of usersRes.data.values) {
      if (!row || !row[1]) continue;
      const id = String(row[0] || '').trim();
      const username = String(row[1] || '').trim();
      const password = String(row[2] || 'password').trim();
      const role = String(row[3] || 'viewer').trim();
      const cccCode = String(row[4] || '').trim();
      const fullName = String(row[5] || username).trim();
      const agencies = String(row[6] || '').trim();
      const subStatus = String(row[7] || 'active').trim();
      const subExpiry = String(row[8] || '').trim();
      const bypassSub = String(row[9] || 'false').toLowerCase() === 'true' ? 1 : 0;

      let cccId = null;
      const targetCode = cccCode || (/^\d+$/.test(username) ? username : null);
      if (targetCode && targetCode !== 'SYSTEM') {
        const cccRes = await db.execute({ sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`, args: [targetCode] });
        cccId = cccRes.rows[0]?.id || null;
      }
      const userId = id ? `usr_${id}_${username.toLowerCase()}` : `usr_${username.toLowerCase()}`;
      await db.execute({
        sql: `INSERT INTO users (id, username, password_hash, full_name, role, ccc_id, agencies, status, subscription_status, subscription_expires_at, bypass_subscription) 
              VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?) 
              ON CONFLICT(username) DO UPDATE SET 
                password_hash=excluded.password_hash, 
                full_name=excluded.full_name, 
                role=excluded.role, 
                ccc_id=excluded.ccc_id, 
                agencies=excluded.agencies, 
                subscription_status=excluded.subscription_status, 
                subscription_expires_at=excluded.subscription_expires_at, 
                bypass_subscription=excluded.bypass_subscription, 
                updated_at=CURRENT_TIMESTAMP`,
        args: [userId, username, password, fullName, role, cccId, agencies, subStatus, subExpiry, bypassSub]
      });
    }
    await db.execute(`UPDATE users SET ccc_id = (SELECT id FROM ccc_registry WHERE ccc_registry.ccc_code = users.username) WHERE role = 'admin' AND ccc_id IS NULL AND username IN (SELECT ccc_code FROM ccc_registry)`);
    console.log(`✅ Seeded ${usersRes.data.values.length} user accounts into Cloud Turso.`);
  }

  // 3. Seed Agencies
  console.log('\n🏢 [4/6] Seeding Agencies into Cloud Turso...');
  const agenciesRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'Agencies!A2:E500',
  });
  if (agenciesRes?.data?.values) {
    let agencyCount = 0;
    for (const row of agenciesRes.data.values) {
      if (!row || !row[1]) continue;
      const name = String(row[1] || '').trim();
      const description = String(row[2] || name).trim();
      const isActive = String(row[3] || 'true').toLowerCase() === 'true' ? 1 : 0;
      const cccCode = String(row[4] || '').trim();
      let cccId = null;
      if (cccCode) {
        const cccRes = await db.execute({ sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`, args: [cccCode] });
        cccId = cccRes.rows[0]?.id || null;
      }
      if (cccId) {
        await db.execute({
          sql: `INSERT INTO agencies (name, description, is_active, ccc_id) VALUES (?, ?, ?, ?)`,
          args: [name, description, isActive, cccId]
        });
        agencyCount++;
      }
    }
    console.log(`✅ Seeded ${agencyCount} contractor agencies into Cloud Turso.`);
  }

  // 4. Seed AppRoles
  console.log('\n🔐 [5/6] Seeding AppRoles into Cloud Turso...');
  const rolesRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'AppRoles!A2:L50',
  });
  if (rolesRes?.data?.values) {
    const moduleNames = ['disconnection', 'reconnection', 'deemed', 'dtr', 'meter', 'nsc', 'consumer_master', 'admin', 'meter_replacement', 'dtr_painting', 'material'];
    let rolesCount = 0;
    for (const row of rolesRes.data.values) {
      if (!row || !row[0]) continue;
      const role = String(row[0]).trim().toLowerCase();
      const perms = {};
      moduleNames.forEach((mod, idx) => {
        const val = row[idx + 1] ? String(row[idx + 1]).trim() : '';
        perms[mod] = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
      });
      await db.execute({
        sql: `INSERT INTO app_roles (ccc_id, role, permissions_json) VALUES (NULL, ?, ?) ON CONFLICT(ccc_id, role) DO UPDATE SET permissions_json=excluded.permissions_json, updated_at=CURRENT_TIMESTAMP`,
        args: [role, JSON.stringify(perms)]
      });
      rolesCount++;
    }
    console.log(`✅ Seeded ${rolesCount} global role configurations into Cloud Turso.`);
  }

  // 5. Seed Feedbacks
  console.log('\n💬 [6/6] Seeding Feedbacks into Cloud Turso...');
  const feedbackRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'Feedbacks!A2:I500',
  });
  if (feedbackRes?.data?.values) {
    let feedbackCount = 0;
    for (const row of feedbackRes.data.values) {
      if (!row || !row[6]) continue;
      const feedbackId = String(row[0] || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`).trim();
      const username = String(row[1] || 'Officer').trim();
      const fullName = String(row[2] || username).trim();
      const supplyOffice = String(row[3] || '').trim();
      const cccCode = String(row[4] || '').trim();
      const rating = Number(row[5] || 5);
      const comment = String(row[6] || '').trim();
      const status = String(row[7] || 'approved').trim().toLowerCase();
      let cccId = null;
      if (cccCode) {
        const cccRes = await db.execute({ sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`, args: [cccCode] });
        cccId = cccRes.rows[0]?.id || null;
      }
      await db.execute({
        sql: `INSERT INTO user_feedbacks (feedback_id, username, full_name, supply_office, ccc_id, rating, comment, status) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
              ON CONFLICT(feedback_id) DO UPDATE SET 
                comment=excluded.comment, 
                rating=excluded.rating, 
                status=excluded.status`,
        args: [feedbackId, username, fullName, supplyOffice, cccId, rating, comment, status]
      });
      feedbackCount++;
    }
    console.log(`✅ Seeded ${feedbackCount} user feedbacks into Cloud Turso.`);
  }

  console.log('\n🎉 ALL MASTER TABLES SUCCESSFULLY CREATED AND POPULATED ON CLOUD TURSO!');
}

seedCloud().catch(err => {
  console.error('Error seeding Cloud Turso:', err);
});
