const https = require('https');

const SPOTAI_HOST = 'spotai.wbsedcl.in';

function hkEncrypt(passwordStr) {
  const secretKey = '@FrTu^^&!#$%^/41';
  const keyLen = secretKey.length;
  const xorChars = [];
  for (let r = 0; r < passwordStr.length; r++) {
    const cCode = passwordStr.charCodeAt(r);
    const kCode = secretKey.charCodeAt(r % keyLen);
    xorChars.push(String.fromCharCode(cCode ^ kCode));
  }
  const xorStr = xorChars.join('');
  return Buffer.from(xorStr, 'latin1').toString('base64');
}

function postToSpotAi(path, payload, contentType = 'text/plain') {
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

async function requestOtp(username, password) {
  const encryptedPassword = hkEncrypt(password);
  const payload = [{ username: username.trim(), password: encryptedPassword }];
  console.log('Sending OTP request to SpotAI...');
  const res = await postToSpotAi('/spotaiportal/spot_ai_portal_login', payload, 'text/plain');
  console.log('SpotAI Response:', JSON.stringify(res, null, 2));
}

requestOtp('90018747', 'Nokia@6600').catch(console.error);
