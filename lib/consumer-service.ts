import https from 'https';

const SPOTAI_HOST = 'spotai.wbsedcl.in';

export function hkEncrypt(passwordStr: string): string {
  const secretKey = '@FrTu^^&!#$%^/41';
  const keyLen = secretKey.length;
  const xorChars: string[] = [];
  for (let r = 0; r < passwordStr.length; r++) {
    const cCode = passwordStr.charCodeAt(r);
    const kCode = secretKey.charCodeAt(r % keyLen);
    xorChars.push(String.fromCharCode(cCode ^ kCode));
  }
  const xorStr = xorChars.join('');
  return Buffer.from(xorStr, 'latin1').toString('base64');
}

function postToSpotAi(path: string, payload: any, contentType: string = 'text/plain'): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options: https.RequestOptions = {
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
      res.on('data', (chunk) => {
        body += chunk;
      });
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

export async function requestOfficerOtp(username: string, password: string) {
  const encryptedPassword = hkEncrypt(password);
  const payload = [{ username: username.trim(), password: encryptedPassword }];
  return await postToSpotAi('/spotaiportal/spot_ai_portal_login', payload, 'text/plain');
}

export async function verifyOfficerOtp(username: string, otp: string) {
  const payload = [{ username: username.trim(), otp: otp.trim() }];
  return await postToSpotAi('/spotaiportal/spot_ai_portal_login', payload, 'text/plain');
}

export async function fetchLiveConsumerDetails(
  username: string,
  token: string,
  offCode: string,
  conId: string,
  parameter: 'MASTER' | 'PAYMENT' | 'OSD' | 'BILLING' | 'READING' | 'METER',
  flag: 'C' | 'P' | 'O' | 'B' | 'R' | 'M',
  printdoc?: string
) {
  const payload: any = {
    username,
    token,
    off_code: offCode,
    con_id: conId.trim(),
    parameter,
    flag,
  };

  if (printdoc) {
    payload.printdoc = printdoc;
  }

  return await postToSpotAi('/spotaiportal/con_dtls', [payload], 'application/json');
}
