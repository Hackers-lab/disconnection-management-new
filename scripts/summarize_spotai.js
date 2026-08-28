const fs = require('fs');
const path = require('path');

const summary = JSON.parse(fs.readFileSync(path.join(__dirname, '../spotai_responses/spotai_all_consumers_summary.json'), 'utf8'));

console.log('=== SpotAI Extracted Details ===\n');

for (const [cid, data] of Object.entries(summary)) {
  const m = data.master || {};
  const o = data.osd || {};
  
  const t4 = o.T4?.[0]?.AMT || '0.00';
  const t5 = o.T5?.[0]?.AMT || '0.00';
  const t6 = o.T6?.[0]?.AMT || '0.00';
  const l4 = o.L4?.[0]?.AMT || '0.00';
  const unpaidInvoices = o.A3 || [];

  console.log(`Consumer ID: ${cid}`);
  console.log(`  Name: ${m.ZNAME}`);
  console.log(`  Premise: ${m.ZPREMISE_TYPE} | Tariff: ${m.ZTARIFF} | Meter: ${m.ZMET1}`);
  console.log(`  SpotAI Total OSD (T6): Rs. ${t6} (Energy: Rs. ${t4}, Other: Rs. ${t5})`);
  console.log(`  SpotAI LPSC (L4): Rs. ${l4}`);
  console.log(`  SpotAI Invoices count (A3): ${unpaidInvoices.length}`);
  unpaidInvoices.forEach(inv => {
    console.log(`    - Inv #${inv.INV_NO}: Rs. ${inv.AMT} (Due: ${inv.DUE_FROM})`);
  });
  console.log('');
}
