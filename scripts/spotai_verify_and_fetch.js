const fs = require('fs');
const path = require('path');
const https = require('https');

const SPOTAI_HOST = 'spotai.wbsedcl.in';

function postToSpotAi(pathStr, payload, contentType = 'text/plain') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: SPOTAI_HOST,
      port: 443,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Array.isArray(parsed) ? parsed[0] : parsed);
        } catch {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`SpotAI server HTTP ${res.statusCode}: ${body.slice(0, 150)}`));
          } else {
            resolve({ raw: body });
          }
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SpotAI server connection timed out (15s).'));
    });

    req.on('error', (err) => {
      reject(new Error(`SpotAI network error: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

async function verifyOfficerOtp(username, otp) {
  const payload = [{ username: username.trim(), otp: otp.trim() }];
  return await postToSpotAi('/spotaiportal/spot_ai_portal_login', payload, 'text/plain');
}

async function fetchLiveConsumerDetails(username, token, offCode, conId, parameter, flag) {
  const payload = {
    username,
    token,
    off_code: offCode,
    con_id: conId.trim(),
    parameter,
    flag,
  };
  return await postToSpotAi('/spotaiportal/con_dtls', [payload], 'application/json');
}

async function main(tokenOverride) {
  const username = '90018747';
  let token = tokenOverride;
  let offCode = '6612107';
  let offName = 'KUSHIDA CCC';
  let name = 'PRAMOD KUMAR VERMA';
  let designation = 'JR. ENGINEER (ELEC.) GR.-II';

  if (!token) {
    const otp = process.argv[2];
    console.log(`Verifying OTP ${otp} for ${username}...`);
    const authRes = await verifyOfficerOtp(username, otp);
    console.log('Auth result:', JSON.stringify(authRes, null, 2));

    const msg = authRes?.message;
    token = typeof msg === 'object' ? (msg.JWT_token || msg.token) : (authRes.token || authRes.JWT_token);
    if (typeof msg === 'object') {
      offCode = msg.off_code || offCode;
      offName = msg.off_name || offName;
      name = msg.name || name;
      designation = msg.designation || designation;
    }
  }

  if (!token) {
    console.error('No token found!');
    return;
  }

  console.log(`\nUsing live session as: ${name} (${designation}) - Office: ${offName} (${offCode})`);
  console.log(`Token: ${token}`);

  const consumers = ['300476577', '300506096', '300201830', '300610807'];
  const outputDir = path.join(__dirname, '../spotai_responses');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = {};

  for (const conId of consumers) {
    console.log(`\n========================================`);
    console.log(`Fetching SpotAI 360 data for ${conId}...`);
    try {
      const [master, payments, osd, billing, readings, meter] = await Promise.all([
        fetchLiveConsumerDetails(username, token, offCode, conId, 'MASTER', 'C').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(username, token, offCode, conId, 'PAYMENT', 'P').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(username, token, offCode, conId, 'OSD', 'O').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(username, token, offCode, conId, 'BILLING', 'B').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(username, token, offCode, conId, 'READING', 'R').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(username, token, offCode, conId, 'METER', 'M').catch(e => ({ error: e.message })),
      ]);

      const fullData = {
        consumerId: conId,
        queryTimestamp: new Date().toISOString(),
        officer: name,
        designation,
        offCode,
        office: offName,
        master: Array.isArray(master?.message) ? master.message[0] : master,
        osd: Array.isArray(osd?.message) ? osd.message[0] : osd,
        billing: Array.isArray(billing?.message) ? billing.message : billing,
        payments: Array.isArray(payments?.message) ? payments.message : payments,
        readings: Array.isArray(readings?.message) ? readings.message : readings,
        meter: Array.isArray(meter?.message) ? meter.message : meter,
      };

      const filePath = path.join(outputDir, `spotai_response_${conId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2), 'utf8');
      console.log(`Saved: ${filePath}`);

      console.log('OSD Data:', JSON.stringify(fullData.osd, null, 2));
      console.log('Master Data:', JSON.stringify(fullData.master, null, 2));

      results[conId] = fullData;
    } catch (err) {
      console.error(`Error querying ${conId}:`, err);
    }
  }

  const summaryPath = path.join(outputDir, `spotai_all_consumers_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nSummary saved: ${summaryPath}`);
}

const tokenParam = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5MDAxODc0NyIsImlzcyI6InNwb3RhaSIsImV4cCI6MTc4NzY5MjgyNCwiaWF0IjoxNzg3NjA2NDI0fQ.YkrDSjD8Ys3_dOOUOz7_Vi7deaDDftWc8KwflTbPRck";
main(tokenParam).catch(console.error);
