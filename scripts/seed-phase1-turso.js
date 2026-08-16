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

    // ── 3.2 Seed Users & Sessions (users) ──
    console.log('\n👥 [1.3] Seeding Users into users table...');
    const usersRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'Users!A2:J100',
    }).catch(e => { console.warn('Could not read Users tab:', e.message); return null; });

    if (usersRes?.data?.values) {
      for (const row of usersRes.data.values) {
        if (!row || !row[0]) continue;
        const username = String(row[0] || '').trim();
        const passwordHash = String(row[1] || 'hashed_default').trim();
        const fullName = String(row[2] || username).trim();
        const role = String(row[3] || 'viewer').trim();
        const mobile = String(row[4] || '').trim();
        const email = String(row[5] || '').trim();
        const cccCode = String(row[6] || '').trim();
        const status = String(row[7] || 'ACTIVE').trim();

        // Get ccc_id from registry
        let cccId = null;
        if (cccCode) {
          const cccRes = await db.execute({
            sql: `SELECT id FROM ccc_registry WHERE ccc_code = ?`,
            args: [cccCode],
          });
          cccId = cccRes.rows[0]?.id || null;
        }

        const userId = `usr_${username.toLowerCase()}`;
        await db.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, mobile_number, email, ccc_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                  password_hash = excluded.password_hash,
                  full_name = excluded.full_name,
                  role = excluded.role,
                  mobile_number = excluded.mobile_number,
                  email = excluded.email,
                  ccc_id = excluded.ccc_id,
                  status = excluded.status,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [userId, username, passwordHash, fullName, role, mobile || null, email || null, cccId, status],
        });
      }
      console.log(`✅ Seeded ${usersRes.data.values.length} user accounts.`);
    }

    // ── 3.3 Seed User Feedbacks (user_feedbacks) ──
    console.log('\n💬 [1.5] Seeding User Feedbacks into user_feedbacks table...');
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
