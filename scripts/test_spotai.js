const https = require('https');

const SPOTAI_HOST = 'spotai.wbsedcl.in';

function postToSpotAi(path, payload, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: SPOTAI_HOST,
      port: 443,
      path: path,
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
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: body });
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

async function testSpotAi() {
  const consumers = ['300476577', '300506096', '300201830', '300610807'];

  console.log('Testing SpotAI without auth / with dummy tokens:');
  const res = await postToSpotAi('/spotaiportal/con_dtls', [{
    username: '',
    token: '',
    off_code: '6612107',
    con_id: '300476577',
    parameter: 'OSD',
    flag: 'O'
  }]).catch(e => e.message);
  console.log('Response empty token:', res);

  const resMaster = await postToSpotAi('/spotaiportal/con_dtls', [{
    username: '',
    token: '',
    off_code: '6612107',
    con_id: '300476577',
    parameter: 'MASTER',
    flag: 'C'
  }]).catch(e => e.message);
  console.log('Response MASTER empty token:', resMaster);
}

testSpotAi();
