const PORTAL_BASE_URL = 'https://spotai.wbsedcl.in';

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

export async function requestOfficerOtp(username: string, password: string) {
  const encryptedPassword = hkEncrypt(password);
  const url = `${PORTAL_BASE_URL}/spotaiportal/spot_ai_portal_login`;
  const payload = [{ username: username.trim(), password: encryptedPassword }];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    const result = Array.isArray(data) ? data[0] : data;
    return result;
  } catch {
    throw new Error(`SpotAI server response error: ${text.slice(0, 150)}`);
  }
}

export async function verifyOfficerOtp(username: string, otp: string) {
  const url = `${PORTAL_BASE_URL}/spotaiportal/spot_ai_portal_login`;
  const payload = [{ username: username.trim(), otp: otp.trim() }];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    const result = Array.isArray(data) ? data[0] : data;
    return result;
  } catch {
    throw new Error(`SpotAI server response error: ${text.slice(0, 150)}`);
  }
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
  const url = `${PORTAL_BASE_URL}/spotaiportal/con_dtls`;
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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    body: JSON.stringify([payload]),
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
  }

  return await res.json();
}
