const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_v2.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url: dbUrl, authToken: dbToken });

async function verify() {
  console.log("==================================================");
  console.log("KUSHIDA CCC (6612107) DATA INTEGRITY VERIFICATION");
  console.log("==================================================");

  // Get Kushida CCC integer ID
  const cccRes = await db.execute("SELECT id, ccc_code, ccc_name FROM ccc_registry WHERE ccc_code = '6612107'");
  if (!cccRes.rows.length) {
    console.error("Kushida CCC not found in ccc_registry table!");
    return;
  }
  const cccId = Number(cccRes.rows[0].id);
  console.log(`Found Kushida CCC in ccc_registry: id=${cccId}, code='${cccRes.rows[0].ccc_code}', name='${cccRes.rows[0].ccc_name}'`);

  // 1. Check Agencies
  const agRes = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM agencies WHERE ccc_id = ?",
    args: [cccId]
  });
  console.log(`Agencies Count in SQL: ${agRes.rows[0].cnt}`);

  // 2. Check Users
  const uRes = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM users WHERE ccc_id = ? OR role = 'superuser'",
    args: [cccId]
  });
  console.log(`Users Count in SQL: ${uRes.rows[0].cnt}`);

  // 3. Check Master Consumers
  const mcRes = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM master_consumers WHERE ccc_id = ?",
    args: [cccId]
  });
  const totalMaster = Number(mcRes.rows[0].cnt);
  console.log(`Master Consumers Count in SQL: ${totalMaster}`);

  // 4. Check Disconnection Records
  const dcRes = await db.execute({
    sql: "SELECT COUNT(*) as cnt, SUM(d2_net_os) as total_os FROM disconnection_records WHERE ccc_id = ?",
    args: [cccId]
  });
  const totalDiscon = Number(dcRes.rows[0].cnt);
  const totalOs = parseFloat(dcRes.rows[0].total_os || 0);

  console.log(`Active Disconnections Count in SQL: ${totalDiscon}`);
  console.log(`Total Financial D2 Net OS Sum in SQL: ₹${totalOs.toFixed(2)}`);

  // 5. Check Sample Consumer Lookup Latency
  const t0 = Date.now();
  const sampleLookup = await db.execute({
    sql: "SELECT * FROM master_consumers WHERE ccc_id = ? LIMIT 5",
    args: [cccId]
  });
  const latency = Date.now() - t0;
  console.log(`\n⚡ SQL Query Latency (5 rows): ${latency}ms`);
  console.log("Sample Master Consumer Row 1:", sampleLookup.rows[0]);

  // 6. Check Sample Disconnection Lookup
  const sampleDiscon = await db.execute({
    sql: "SELECT * FROM disconnection_records WHERE ccc_id = ? LIMIT 1",
    args: [cccId]
  });
  if (sampleDiscon.rows.length) {
    console.log("Sample Disconnection Row 1:", sampleDiscon.rows[0]);
  }

  console.log("\n==================================================");
  if (totalMaster > 0 && totalDiscon > 0) {
    console.log("✅ VERIFICATION SUCCESSFUL! All datasets loaded clean.");
  } else {
    console.log("⚠️ VERIFICATION INCOMPLETE: Data still loading or zero rows found.");
  }
  console.log("==================================================");
}

verify().catch(err => console.error("Verification Error:", err));
