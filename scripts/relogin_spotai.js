const https = require('https');

function hkEncrypt(passwordStr) {
  const secretKey = '@FrTu^^&!#$%^/41';
  const keyLen = secretKey.length;
  const xorChars = [];
  for (let r = 0; r < passwordStr.length; r++) {
    const cCode = passwordStr.charCodeAt(r);
    const kCode = secretKey.charCodeAt(r % keyLen);
    xorChars.push(String.fromCharCode(cCode ^ kCode));
  }
  return Buffer.from(xorChars.join(''), 'latin1').toString('base64');
}

function postToSpotAi(pathStr, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = https.request({
      hostname: 'spotai.wbsedcl.in', port: 443, path: pathStr, method: 'POST',
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

async function requestOtp() {
  const encPass = hkEncrypt('Nokia@6600');
  const res = await postToSpotAi('/spotaiportal/spot_ai_portal_login', [{
    username: '90018747',
    password: encPass
  }]);
  console.log('OTP Request Response:', JSON.stringify(res, null, 2));
}

requestOtp().catch(console.error);
