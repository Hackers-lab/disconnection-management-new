const https = require('https');
const fs = require('fs');
const path = require('path');

const otp = process.argv[2];
const cid = '342294907';
const SPOTAI_HOST = 'spotai.wbsedcl.in';
const username = '90018747';
const offCode = '6612107';

if (!otp) {
  console.error('Please pass OTP as argument');
  process.exit(1);
}

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

async function verifyAndFetch() {
  console.log(`Verifying OTP ${otp}...`);
  const verifyRes = await postToSpotAi('/spotaiportal/spot_ai_portal_login', [{
    username,
    otp
  }]);

  console.log('OTP Verification Response:', JSON.stringify(verifyRes, null, 2));

  const json = Array.isArray(verifyRes) ? verifyRes[0] : verifyRes;
  const token = json?.message?.JWT_token || verifyRes?.message?.JWT_token;
  if (!token) {
    console.error('Failed to obtain JWT token:', verifyRes);
    return;
  }

  console.log('\nJWT Token obtained successfully!');

  const fetchParam = (param, flag) => postToSpotAi('/spotaiportal/con_dtls', [{
    username, token, off_code: offCode, con_id: cid, parameter: param, flag
  }]);

  console.log(`\nFetching 360 details for ${cid}...`);
  const [master, payments, osd, billing, readings, meter] = await Promise.all([
    fetchParam('MASTER', 'C'),
    fetchParam('PAYMENT', 'P'),
    fetchParam('OSD', 'O'),
    fetchParam('BILLING', 'B'),
    fetchParam('READING', 'R'),
    fetchParam('METER', 'M'),
  ]);

  const full = {
    consumerId: cid,
    queryTimestamp: new Date().toISOString(),
    officer: "PRAMOD KUMAR VERMA",
    designation: "JR. ENGINEER (ELEC.) GR.-II",
    offCode: "6612107",
    office: "KUSHIDA CCC",
    master: Array.isArray(master?.message) ? master.message[0] : master,
    osd: Array.isArray(osd?.message) ? osd.message[0] : osd,
    billing: Array.isArray(billing?.message) ? billing.message : billing,
    payments: Array.isArray(payments?.message) ? payments.message : payments,
    readings: Array.isArray(readings?.message) ? readings.message : readings,
    meter: Array.isArray(meter?.message) ? meter.message : meter,
  };

  const outputDir = path.join(__dirname, '../spotai_responses');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `spotai_response_${cid}.json`);
  fs.writeFileSync(outPath, JSON.stringify(full, null, 2), 'utf8');
  console.log(`\nSaved SpotAI response to: ${outPath}`);

  console.log('\n--- SpotAI Master ---');
  console.log(JSON.stringify(full.master, null, 2));

  console.log('\n--- SpotAI OSD ---');
  console.log(JSON.stringify(full.osd, null, 2));

  console.log('\n--- SpotAI Billing (Latest 3) ---');
  console.log(JSON.stringify(Array.isArray(full.billing) ? full.billing.slice(0, 3) : full.billing, null, 2));
}

verifyAndFetch().catch(console.error);
