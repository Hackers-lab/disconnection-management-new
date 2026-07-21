// scripts/replicate-roles.js
const { sheets } = require('@googleapis/sheets');
const { JWT, OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Decryption function matching lib/encryption.ts
function decrypt(encryptedText, secret) {
  if (!encryptedText) return '';
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  const [ivHex, authTagHex, encryptedDataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.createHash('sha256').update(secret).digest();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Load Environment Variables
const envPath = path.resolve(__dirname, '../.env.local');
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

const encryptionSecret = env.ENCRYPTION_KEY || 'fallback-secret-key-please-change';
const sourceSpreadsheetId = '1plesrRg5mtJR1j7k-2E4uK_VqlO7_ddkPNOAdeD_IEU';
const masterConfigSheetId = env.MASTER_CONFIG_SHEET;
const templateSpreadsheetId = env.DISCONNECTION_SHEET;

// Initialize Service Account Auth
const saAuth = new JWT({
  email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: env.GOOGLE_SHEETS_PRIVATE_KEY,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ]
});

const defaultSheetsClient = sheets({ version: 'v4', auth: saAuth });

async function getSheetsClientForTenant(spreadsheetId, encryptedToken, cccCode) {
  if (encryptedToken) {
    try {
      const refreshToken = decrypt(encryptedToken, encryptionSecret);
      if (refreshToken && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
        const oauth2Client = new OAuth2Client(
          env.GOOGLE_CLIENT_ID,
          env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const tenantClient = sheets({ version: 'v4', auth: oauth2Client });
        
        // Test auth by fetching spreadsheet metadata
        await tenantClient.spreadsheets.get({ spreadsheetId });
        console.log(`🔑 [OAuth Success] CCC ${cccCode} authenticated via decrypted OAuth refresh token.`);
        return tenantClient;
      }
    } catch (err) {
      console.warn(`⚠️ [OAuth Failed] OAuth decryption/connection failed for CCC ${cccCode}. Falling back to Service Account...`, err.message);
    }
  }
  
  // Fallback to Service Account
  try {
    await defaultSheetsClient.spreadsheets.get({ spreadsheetId });
    console.log(`🛡️ [SA Success] CCC ${cccCode} authenticated via Service Account.`);
    return defaultSheetsClient;
  } catch (err) {
    console.error(`❌ [Auth Failed] Both OAuth and Service Account failed to access spreadsheet for CCC ${cccCode}.`, err.message);
    return null;
  }
}

async function getMasterSheetsClient() {
  if (env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    try {
      const oauth2Client = new OAuth2Client(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
      const client = sheets({ version: 'v4', auth: oauth2Client });
      
      // Test credentials
      await client.spreadsheets.get({ spreadsheetId: templateSpreadsheetId });
      console.log(`🔑 [Master OAuth Success] Template authenticated via master OAuth refresh token.`);
      return client;
    } catch (err) {
      console.warn(`⚠️ [Master OAuth Failed] Master OAuth authentication failed. Falling back to Service Account...`, err.message);
    }
  }
  return defaultSheetsClient;
}

async function replicateAppRoles(sheetsClient, spreadsheetId, sourceValues, label) {
  try {
    // 1. Get spreadsheet metadata to check if AppRoles tab exists
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
    const hasAppRoles = meta.data.sheets.some(s => s.properties.title === 'AppRoles');
    
    // 2. If it doesn't exist, create it
    if (!hasAppRoles) {
      console.log(`   📝 Creating 'AppRoles' tab in ${label}...`);
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'AppRoles'
              }
            }
          }]
        }
      });
    }
    
    // 3. Clear existing values to prevent leftover rows/columns
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId,
      range: 'AppRoles!A1:Z100'
    });
    
    // 4. Update the values
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: 'AppRoles!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: sourceValues
      }
    });
    
    console.log(`   ✅ Successfully updated AppRoles in ${label}.`);
    return true;
  } catch (err) {
    console.error(`   ❌ Failed to replicate AppRoles in ${label}:`, err.message);
    return false;
  }
}

async function run() {
  try {
    console.log('🚀 Starting Role Permissions Replication...');
    
    // Step 1: Read source role permissions
    console.log(`📥 Reading source AppRoles from ${sourceSpreadsheetId}...`);
    const sourceRes = await defaultSheetsClient.spreadsheets.values.get({
      spreadsheetId: sourceSpreadsheetId,
      range: 'AppRoles!A1:Z100',
    });
    const sourceValues = sourceRes.data.values;
    if (!sourceValues || sourceValues.length === 0) {
      throw new Error('No AppRoles data found in the source spreadsheet.');
    }
    console.log(`   Read ${sourceValues.length} rows of role permissions.`);
    
    // Step 2: Update the template spreadsheet
    console.log(`\n📄 Updating Template Spreadsheet (${templateSpreadsheetId})...`);
    const masterClient = await getMasterSheetsClient();
    await replicateAppRoles(masterClient, templateSpreadsheetId, sourceValues, 'Template Spreadsheet');
    
    // Step 3: Fetch active tenants from master registry
    console.log(`\n📥 Fetching CCC Registry from ${masterConfigSheetId}...`);
    const registryRes = await defaultSheetsClient.spreadsheets.values.get({
      spreadsheetId: masterConfigSheetId,
      range: 'CCC_Registry!A2:E',
    });
    
    const rows = registryRes.data.values || [];
    console.log(`   Found ${rows.length} rows in registry.`);
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    for (const row of rows) {
      if (!row || !row[0]) continue;
      const cccCode = row[0].trim();
      const cccName = (row[1] || '').trim();
      const spreadsheetId = (row[2] || '').trim();
      const encryptedToken = (row[4] || '').trim();
      
      const label = `${cccName} (${cccCode})`;
      
      if (!spreadsheetId) {
        console.log(`\n⏭️ Skipping ${label} - No spreadsheet ID configured.`);
        skipCount++;
        continue;
      }
      
      console.log(`\n🔄 Processing ${label} [ID: ${spreadsheetId}]...`);
      const client = await getSheetsClientForTenant(spreadsheetId, encryptedToken, cccCode);
      if (!client) {
        failCount++;
        continue;
      }
      
      const success = await replicateAppRoles(client, spreadsheetId, sourceValues, label);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log('\n=========================================');
    console.log('🏁 Replication completed!');
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed:  ${failCount}`);
    console.log(`   Skipped: ${skipCount}`);
    console.log('=========================================');
  } catch (err) {
    console.error('💥 Critical script error:', err);
  }
}

run();
