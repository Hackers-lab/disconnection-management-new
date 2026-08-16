const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// Load env
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

async function testPhase1Localhost() {
  console.log('\n🧪 Testing Phase 1 SQL Queries on Localhost Database...');

  // 1. Test ccc_registry
  const tenantsRes = await db.execute("SELECT ccc_code, ccc_name, spreadsheet_id FROM ccc_registry LIMIT 5");
  console.log(`✅ [1.2 ccc_registry] Query returned ${tenantsRes.rows.length} sample tenant records:`);
  tenantsRes.rows.forEach(r => console.log(`   - CCC: ${r.ccc_code} | Name: ${r.ccc_name}`));

  // 2. Test user_feedbacks
  const feedbacksRes = await db.execute("SELECT feedback_id, username, full_name, comment, rating FROM user_feedbacks WHERE status = 'approved' LIMIT 5");
  console.log(`\n✅ [1.5 user_feedbacks] Query returned ${feedbacksRes.rows.length} sample feedback records:`);
  feedbacksRes.rows.forEach(r => console.log(`   - [${r.rating}⭐] ${r.username} (${r.full_name}): "${r.comment.substring(0, 50)}..."`));

  console.log('\n🎉 Phase 1 Localhost Testing Verification PASSED cleanly!');
}

testPhase1Localhost();
