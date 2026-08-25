const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

let env = {};
try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] ? match[2].trim() : '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
      value = value.replace(/\\n/g, '\n');
      env[match[1]] = value;
    }
  });
} catch (e) {
  console.log('No .env.local found or error reading it');
}

const url = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN_TOKEN;

async function main() {
  if (!url) {
    console.log('No Turso URL configured in environment or .env.local.');
    return;
  }

  const client = createClient({ url, authToken });
  console.log('Connecting to Turso...');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS GIS_captures (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      date_formatted TEXT,
      time_formatted TEXT,
      lat REAL,
      lng REAL,
      accuracy REAL,
      location_name TEXT,
      note TEXT NOT NULL,
      uploaded_by TEXT,
      uploaded_by_name TEXT,
      user_role TEXT,
      office_code TEXT,
      agency TEXT,
      created_at INTEGER DEFAULT (unixepoch() * 1000)
    );
  `);
  console.log('✅ Created table GIS_captures');

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_gis_captures_tenant ON GIS_captures(tenant_id, timestamp DESC);
  `);
  console.log('✅ Created index idx_gis_captures_tenant');

  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table';");
  console.log('Tables in Turso database:', tables.rows.map(r => r.name));
}

main().catch(console.error);
