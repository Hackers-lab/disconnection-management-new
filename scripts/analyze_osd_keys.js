const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../spotai_responses');
const files = fs.readdirSync(dir).filter(f => f.startsWith('spotai_response_') && f.endsWith('.json'));

console.log(`Found ${files.length} consumer JSON files. Analyzing OSD keys...\n`);

const allKeys = new Set();
const keyValues = {};

files.forEach(f => {
  const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const osd = json.osd || {};
  const cid = json.consumerId;

  console.log(`--- Consumer: ${cid} (${json.master?.ZNAME || 'N/A'}) ---`);
  for (const [k, arr] of Object.entries(osd)) {
    if (Array.isArray(arr) && arr.length > 0) {
      const nonZero = arr.filter(item => parseFloat(item.AMT || '0') > 0);
      if (nonZero.length > 0 || k.startsWith('T') || k.startsWith('L')) {
        console.log(`  ${k}:`, arr);
      }
    }
  }
  console.log('');
});
