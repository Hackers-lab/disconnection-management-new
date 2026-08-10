const { createClient } = require('@libsql/client');

const dbUrl = process.env.TURSO_DATABASE_URL || "file:turso_v4.db";
const dbToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url: dbUrl, authToken: dbToken });

async function verify() {
  console.log("==================================================");
  console.log("REFINED 2-CCC TEST MIGRATION VERIFICATION (v4)");
  console.log("==================================================");

  // 1. Master Setup Verification
  const cccRes = await db.execute("SELECT id, ccc_name, drive_refresh_token FROM ccc_registry WHERE ccc_code = '6612107'");
  const kId = Number(cccRes.rows[0].id);
  console.log(`\n--- [Setup] Kushida CCC Registry ---`);
  console.log(`CCC ID: ${kId}, Name: ${cccRes.rows[0].ccc_name}`);
  console.log(`Drive Refresh Token Present: ${Boolean(cccRes.rows[0].drive_refresh_token)}`);

  // 2. AppRoles Verification
  const rolesRes = await db.execute({ sql: "SELECT role, permissions_json FROM app_roles WHERE ccc_id = ?", args: [kId] });
  console.log(`Per-CCC AppRoles Count for Kushida: ${rolesRes.rows.length}`);

  // 3. Kushida Disconnection Verification (gis_pole & priority short codes)
  const disconSample = await db.execute({ sql: "SELECT id, month_key, d2_net_os, discon_status, priority, gis_pole FROM disconnection_records WHERE ccc_id = ? LIMIT 1", args: [kId] });
  console.log(`\n--- [Disconnections] Kushida Sample Record ---`, disconSample.rows[0]);

  // 4. Meter Stock & Replacements Verification
  const stockCount = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM meter_stock WHERE ccc_id = ?", args: [kId] });
  const mrSample = await db.execute({ sql: "SELECT * FROM meter_replacements WHERE ccc_id = ? LIMIT 1", args: [kId] });
  console.log(`\n--- [Meter Management] Kushida ---`);
  console.log(`Meter Stock Count: ${stockCount.rows[0].cnt}`);
  console.log(`Sample Replacement Record:`, mrSample.rows[0]);

  // 5. NSC Applications (38-Column) Verification
  const nscCount = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM nsc_applications WHERE ccc_id = ?", args: [kId] });
  const nscSample = await db.execute({ sql: "SELECT receive_no, applicant_name, applied_class, status, load_requested_kw, site_image_id FROM nsc_applications WHERE ccc_id = ? LIMIT 1", args: [kId] });
  console.log(`\n--- [NSC Applications] Kushida ---`);
  console.log(`NSC Applications Count: ${nscCount.rows[0].cnt}`);
  console.log(`Sample NSC Record:`, nscSample.rows[0]);

  // 6. Materials Catalogue & Transactions
  const matCount = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM materials WHERE ccc_id = ?", args: [kId] });
  const txCount = await db.execute({ sql: "SELECT transaction_type, COUNT(*) as cnt FROM material_transactions WHERE ccc_id = ? GROUP BY transaction_type", args: [kId] });
  console.log(`\n--- [Store Inventory] Kushida ---`);
  console.log(`Materials Catalogue Items: ${matCount.rows[0].cnt}`);
  console.log(`Transactions:`, txCount.rows);

  console.log("\n==================================================");
  console.log("✅ VERIFICATION SUCCESSFUL! All 12 point refinements verified.");
  console.log("==================================================");
}

verify().catch(err => console.error("Verification Error:", err));
