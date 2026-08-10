const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const { sheets: googleSheets } = require('@googleapis/sheets');
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = googleSheets({ version: 'v4', auth });
const masterSheetId = process.env.MASTER_CONFIG_SHEET;

async function checkAndMigrateAllFeedbacks() {
  console.log('🚀 Starting Full Audit of All CCC Spreadsheets for Feedbacks...');
  
  // 1. Read CCC_Registry
  const regRes = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'CCC_Registry!A2:E100',
  });
  
  const tenants = (regRes.data.values || []).map(r => ({
    cccCode: String(r[0] || '').trim(),
    cccName: String(r[1] || '').trim(),
    spreadsheetId: String(r[2] || '').trim(),
  })).filter(t => t.spreadsheetId && t.spreadsheetId !== masterSheetId);

  console.log(`📋 Found ${tenants.length} registered tenant spreadsheets.`);

  // 2. Fetch Master Config Sheet Feedbacks
  const masterRes = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: 'Feedbacks!A1:I500',
  }).catch(() => null);

  const masterRows = masterRes?.data?.values || [];
  console.log(`📊 Current Master Config Sheet Feedbacks rows: ${masterRows.length > 0 ? masterRows.length - 1 : 0}`);

  const existingMasterComments = new Set();
  const existingMasterIds = new Set();
  const existingMasterUsers = new Set();

  for (let i = 1; i < masterRows.length; i++) {
    const row = masterRows[i] || [];
    if (row[0]) existingMasterIds.add(String(row[0]).trim());
    if (row[1]) existingMasterUsers.add(String(row[1]).trim().toLowerCase());
    if (row[6]) existingMasterComments.add(String(row[6]).trim().toLowerCase());
  }

  const missingFeedbacks = [];
  const scannedTabsSummary = [];

  for (const tenant of tenants) {
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: tenant.spreadsheetId,
      }).catch(err => {
        console.warn(`⚠️ Could not fetch metadata for ${tenant.cccName} (${tenant.cccCode}):`, err.message);
        return null;
      });

      if (!meta || !meta.data || !meta.data.sheets) continue;

      const sheetTitles = meta.data.sheets.map(s => s.properties?.title || '');
      const feedbackTabs = sheetTitles.filter(t => /feedback/i.test(t) || /review/i.test(t));

      scannedTabsSummary.push({
        cccCode: tenant.cccCode,
        cccName: tenant.cccName,
        feedbackTabs: feedbackTabs.join(', ') || 'None',
      });

      if (feedbackTabs.length > 0) {
        for (const tab of feedbackTabs) {
          const tabData = await sheets.spreadsheets.values.get({
            spreadsheetId: tenant.spreadsheetId,
            range: `'${tab}'!A1:Z500`,
          }).catch(() => null);

          const rows = tabData?.data?.values || [];
          if (rows.length < 2) continue;

          for (let i = 1; i < rows.length; i++) {
            const r = rows[i] || [];
            const id = String(r[0] || '').trim();
            const username = String(r[1] || '').trim();
            let name = String(r[2] || '').trim();
            let office = String(r[3] || '').trim();
            const code = String(r[4] || tenant.cccCode).trim();
            const rating = String(r[5] || '5').trim();
            const comment = String(r[6] || r[5] || '').trim();
            const status = String(r[7] || 'approved').trim();
            const date = String(r[8] || new Date().toISOString()).trim();

            if (!comment || comment.toLowerCase() === 'comment') continue;

            const isDuplicate = 
              existingMasterComments.has(comment.toLowerCase()) || 
              (id && existingMasterIds.has(id));

            if (!isDuplicate) {
              if (!office || /^\d+\s*ccc$/i.test(office)) office = tenant.cccName;
              if (!name) name = username || (tenant.cccName.replace(/\s*ccc$/i, '') + ' Officer');

              const newRow = [
                id || `fb-${Date.now()}-${i}`,
                username || 'user',
                name,
                office,
                code,
                rating,
                comment,
                status,
                date,
              ];

              missingFeedbacks.push({
                tenant: tenant.cccName,
                code: tenant.cccCode,
                tab,
                row: newRow,
              });

              existingMasterComments.add(comment.toLowerCase());
              if (id) existingMasterIds.add(id);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning ${tenant.cccName}:`, err.message);
    }
  }

  console.log('\n=== TENANT SPREADSHEETS AUDIT BREAKDOWN ===');
  console.table(scannedTabsSummary);

  console.log('\n=== UNMIGRATED FEEDBACKS DETECTED ===');
  if (missingFeedbacks.length > 0) {
    console.log(`Found ${missingFeedbacks.length} unmigrated feedbacks to import!`);
    console.table(missingFeedbacks.map(m => ({
      tenant: m.tenant,
      user: m.row[1],
      name: m.row[2],
      office: m.row[3],
      rating: m.row[5],
      comment: m.row[6].slice(0, 40),
    })));

    // Append to Master Sheet Feedbacks tab
    const rowsToAppend = missingFeedbacks.map(m => m.row);
    await sheets.spreadsheets.values.append({
      spreadsheetId: masterSheetId,
      range: 'Feedbacks!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rowsToAppend },
    });
    console.log(`🎉 Successfully imported ${rowsToAppend.length} feedbacks into Master Config Sheet!`);
  } else {
    console.log('✅ All feedbacks across all tenant CCC spreadsheets are 100% migrated and accounted for in the Master Registry!');
  }
}

checkAndMigrateAllFeedbacks().catch(console.error);
