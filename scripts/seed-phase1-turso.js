const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

// 1. Load environment variables from .env.local
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

// 2. Initialize Database Client
const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_v4.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
console.log(`🔌 Connecting to Turso Database at: ${dbUrl.startsWith('file:') ? dbUrl : dbUrl.substring(0, 20) + '...'}`);
const db = createClient({ url: dbUrl, authToken: dbToken });

async function runPhase1Seed() {
  try {
    console.log('\n🚀 [Phase 1] Executing DDL Schema Setup...');
    const schemaPath = path.join(__dirname, '../lib/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await db.execute(stmt);
      } catch (err) {
        if (!err.message?.includes('already exists')) {
          console.warn(`DDL Notice: ${stmt.substring(0, 40)}...`, err.message);
        }
      }
    }
    console.log('✅ Core DDL tables created successfully.');

    // 3. Initialize Google Sheets Client for Migration Seeding
    if (!process.env.GOOGLE_SHEETS_PRIVATE_KEY || !process.env.MASTER_CONFIG_SHEET) {
      console.log('⚠️ Skipping Google Sheets seeding (missing env keys). Local DDL setup complete.');
      return;
    }

    const auth = new JWT({
      email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheetsClient = sheets({ version: 'v4', auth });
    const masterSheetId = process.env.MASTER_CONFIG_SHEET;

    // ── 3.1 Seed Tenants (ccc_registry) ──
    console.log('\n📋 [1.2] Seeding Customer Care Center (CCC) Tenants into ccc_registry...');
    const regRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'CCC_Registry!A2:E100',
    }).catch(e => { console.warn('Could not read CCC_Registry:', e.message); return null; });

    if (regRes?.data?.values) {
      for (const row of regRes.data.values) {
        if (!row || !row[0]) continue;
        const cccCode = String(row[0]).trim();
        const cccName = String(row[1] || '').trim();
        const spreadsheetId = String(row[2] || '').trim();
        const driveFolderId = String(row[3] || '').trim();
        const refreshToken = String(row[4] || '').trim();

        await db.execute({
          sql: `INSERT INTO ccc_registry (ccc_code, ccc_name, spreadsheet_id, drive_folder_id, drive_refresh_token)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(ccc_code) DO UPDATE SET
                  ccc_name = excluded.ccc_name,
                  spreadsheet_id = excluded.spreadsheet_id,
                  drive_folder_id = excluded.drive_folder_id,
                  drive_refresh_token = excluded.drive_refresh_token,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [cccCode, cccName, spreadsheetId, driveFolderId, refreshToken],
        });
      }
      console.log(`✅ Seeded ${regRes.data.values.length} Customer Care Center tenants.`);
    }

    // ── 3.2 Seed Users (users from Master_Credentials) ──
    console.log('\n👥 [1.3] Seeding Users into users table...');
    const usersRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'Master_Credentials!A2:J500',
    }).catch(e => { console.warn('Could not read Master_Credentials tab:', e.message); return null; });

    if (usersRes?.data?.values) {
      for (const row of usersRes.data.values) {
        if (!row || !row[1]) continue;
        const id = String(row[0] || '').trim();
        const username = String(row[1] || '').trim();
        const password = String(row[2] || 'password').trim();
        const role = String(row[3] || 'viewer').trim();
        const cccCode = String(row[4] || '').trim();
        const fullName = String(row[5] || username).trim();
        const subStatus = String(row[7] || 'active').trim();
        const subExpiry = String(row[8] || '').trim();
        const bypassSub = String(row[9] || 'false').toLowerCase() === 'true' ? 1 : 0;

        // Get ccc_id from registry
        let cccId = null;
        const targetCode = cccCode || (/^\d+$/.test(username) ? username : null);
        if (targetCode && targetCode !== 'SYSTEM') {
          const cccRes = await db.execute({
            sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`,
            args: [targetCode],
          });
          cccId = cccRes.rows[0]?.id || null;
        }

        const userId = id ? `usr_${id}_${username.toLowerCase()}` : `usr_${username.toLowerCase()}`;
        await db.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, ccc_id, status, subscription_status, subscription_expires_at, bypass_subscription)
                VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                  password_hash = excluded.password_hash,
                  full_name = excluded.full_name,
                  role = excluded.role,
                  ccc_id = excluded.ccc_id,
                  subscription_status = excluded.subscription_status,
                  subscription_expires_at = excluded.subscription_expires_at,
                  bypass_subscription = excluded.bypass_subscription,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [userId, username, password, fullName, role, cccId, subStatus, subExpiry, bypassSub],
        });
      }
      // Auto-match any admin accounts whose username is a CCC code
      await db.execute(`UPDATE users SET ccc_id = (SELECT id FROM ccc_registry WHERE ccc_registry.ccc_code = users.username) WHERE role = 'admin' AND ccc_id IS NULL AND username IN (SELECT ccc_code FROM ccc_registry)`);
      console.log(`✅ Seeded ${usersRes.data.values.length} user accounts from Master_Credentials.`);
    }

    // ── 3.3 Seed Agencies (agencies) ──
    console.log('\n🏢 [1.4] Seeding Agencies into agencies table...');
    const agenciesRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'Agencies!A2:E500',
    }).catch(e => { console.warn('Could not read Agencies tab:', e.message); return null; });

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
          const cccRes = await db.execute({
            sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`,
            args: [cccCode],
          });
          cccId = cccRes.rows[0]?.id || null;
        }

        if (cccId) {
          await db.execute({
            sql: `INSERT INTO agencies (name, description, is_active, ccc_id)
                  VALUES (?, ?, ?, ?)`,
            args: [name, description, isActive, cccId],
          });
          agencyCount++;
        }
      }
      console.log(`✅ Seeded ${agencyCount} contractor agencies.`);
    }

    // ── 3.4 Seed App Roles & Permissions (app_roles) ──
    console.log('\n🔐 [1.5] Seeding Global App Roles into app_roles table...');
    const rolesRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'AppRoles!A2:L50',
    }).catch(e => { console.warn('Could not read AppRoles tab:', e.message); return null; });

    if (rolesRes?.data?.values) {
      const moduleNames = [
        'disconnection', 'reconnection', 'deemed', 'dtr', 'meter',
        'nsc', 'consumer_master', 'admin', 'meter_replacement', 'dtr_painting', 'material'
      ];
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
          sql: `INSERT INTO app_roles (ccc_id, role, permissions_json)
                VALUES (NULL, ?, ?)
                ON CONFLICT(ccc_id, role) DO UPDATE SET
                  permissions_json = excluded.permissions_json,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [role, JSON.stringify(perms)],
        });
        rolesCount++;
      }
      console.log(`✅ Seeded ${rolesCount} global role configurations.`);
    }

    // ── 3.5 Seed User Feedbacks (user_feedbacks) ──
    console.log('\n💬 [1.6] Seeding User Feedbacks into user_feedbacks table...');
    const feedbackRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'Feedbacks!A2:I500',
    }).catch(e => { console.warn('Could not read Feedbacks tab:', e.message); return null; });

    if (feedbackRes?.data?.values) {
      let feedbackCount = 0;
      for (const row of feedbackRes.data.values) {
        if (!row || !row[6]) continue; // comment required
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
          const cccRes = await db.execute({
            sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`,
            args: [cccCode],
          });
          cccId = cccRes.rows[0]?.id || null;
        }

        await db.execute({
          sql: `INSERT INTO user_feedbacks (feedback_id, username, full_name, supply_office, ccc_id, rating, comment, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(feedback_id) DO UPDATE SET
                  comment = excluded.comment,
                  rating = excluded.rating,
                  status = excluded.status`,
          args: [feedbackId, username, fullName, supplyOffice, cccId, rating, comment, status],
        });
        feedbackCount++;
      }
      console.log(`✅ Seeded ${feedbackCount} user feedbacks.`);
    }

    console.log('\n🎉 Phase 1 Seeding & Schema Setup Completed Successfully!');
  } catch (err) {
    console.error('💥 Phase 1 Seeding Error:', err);
  }
}

runPhase1Seed();
