const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
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

async function main() {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN
  });
  const res = await client.execute("SELECT key, substr(value, 1, 100) as preview FROM system_kv_store WHERE key LIKE '%spot%' OR key LIKE '%token%' OR key LIKE '%session%' OR key LIKE '%cred%' OR key LIKE '%auth%'");
  console.log('Relevant KV items:', res.rows);
}

main().catch(console.error);
