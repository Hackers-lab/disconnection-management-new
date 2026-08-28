const https = require('https');

const SPOTAI_HOST = 'spotai.wbsedcl.in';
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5MDAxODc0NyIsImlzcyI6InNwb3RhaSIsImV4cCI6MTc4NzY5NDQ1NywiaWF0IjoxNzg3NjA4MDU3fQ.IQPTpyuo4AlV8LY-nuU-WkrmLfzqpufYY8aauK3l1k4';
const username = '90018747';
const offCode = '6612107';
const cid = '300618202';

function postToSpotAi(pathStr, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = https.request({
      hostname: SPOTAI_HOST, port: 443, path: pathStr, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function inspect() {
  const params = ['MASTER', 'OSD', 'BILLING', 'PAYMENT', 'READING', 'METER'];
  const flags = ['C', 'O', 'B', 'P', 'R', 'M'];
  
  for (let i = 0; i < params.length; i++) {
    const res = await postToSpotAi('/spotaiportal/con_dtls', [{
      username, token, off_code: offCode, con_id: cid, parameter: params[i], flag: flags[i]
    }]);
    console.log(`\n=== Parameter: ${params[i]} (Flag: ${flags[i]}) ===`);
    console.log(JSON.stringify(res, null, 2));
  }
}

inspect().catch(console.error);
