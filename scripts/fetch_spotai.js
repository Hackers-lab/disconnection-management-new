const fs = require('fs');
const path = require('path');
const https = require('https');

const SPOTAI_HOST = 'spotai.wbsedcl.in';

const session = {
  username: "90018747",
  token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5MDAxODc0NyIsImlzcyI6InNwb3RhaSIsImV4cCI6MTc4NzY5MjAyMiwiaWF0IjoxNzg3NjA1NjIyfQ.hL3fasFwQosxWK1bWshBOj0IdIFXqK8C4vLnvuNXxdM",
  offCode: "6612107",
  offName: "KUSHIDA CCC",
  name: "PRAMOD KUMAR VERMA",
  designation: "JR. ENGINEER (ELEC.) GR.-II"
};

const consumers = ['300476577', '300506096', '300201830', '300610807'];

function postToSpotAi(pathStr, payload, contentType = 'application/json') {
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

async function run() {
  const outputDir = path.join(__dirname, '../spotai_responses');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = {};

  for (const conId of consumers) {
    console.log(`\n========================================`);
    console.log(`Querying SpotAI for Consumer: ${conId}...`);

    try {
      const [master, payments, osd, billing, readings, meter] = await Promise.all([
        fetchLiveConsumerDetails(session.username, session.token, session.offCode, conId, 'MASTER', 'C').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(session.username, session.token, session.offCode, conId, 'PAYMENT', 'P').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(session.username, session.token, session.offCode, conId, 'OSD', 'O').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(session.username, session.token, session.offCode, conId, 'BILLING', 'B').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(session.username, session.token, session.offCode, conId, 'READING', 'R').catch(e => ({ error: e.message })),
        fetchLiveConsumerDetails(session.username, session.token, session.offCode, conId, 'METER', 'M').catch(e => ({ error: e.message })),
      ]);

      const fullData = {
        consumerId: conId,
        queryTimestamp: new Date().toISOString(),
        officer: session.name,
        office: session.offName,
        master,
        osd,
        billing,
        payments,
        readings,
        meter
      };

      const filePath = path.join(outputDir, `spotai_response_${conId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2), 'utf8');
      console.log(`Saved full response to: ${filePath}`);

      console.log('--- OSD Response ---');
      console.log(JSON.stringify(osd, null, 2));

      console.log('--- Master Response ---');
      console.log(JSON.stringify(master, null, 2));

      results[conId] = fullData;
    } catch (err) {
      console.error(`Error querying ${conId}:`, err);
    }
  }

  const summaryPath = path.join(outputDir, `spotai_all_consumers_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nSaved summary to: ${summaryPath}`);
}

run();
