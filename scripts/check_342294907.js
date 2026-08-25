const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

const cid = '342294907';
const SPOTAI_HOST = 'spotai.wbsedcl.in';
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5MDAxODc0NyIsImlzcyI6InNwb3RhaSIsImV4cCI6MTc4NzY5NDQ1NywiaWF0IjoxNzg3NjA4MDU3fQ.IQPTpyuo4AlV8LY-nuU-WkrmLfzqpufYY8aauK3l1k4';
const username = '90018747';
const offCode = '6612107';

// Load .env.local
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
    value = value.replace(/\\n/g, '\n');
    env[match[1]] = value;
  }
});

const auth = new JWT({
  email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: env.GOOGLE_SHEETS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

function postToSpotAi(pathStr, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = https.request({
      hostname: SPOTAI_HOST, port: 443, path: pathStr, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
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

async function fetchLivePdf(conId) {
  const url = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${conId}`;
  const firstRes = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buf = Buffer.from(await firstRes.arrayBuffer());
  let pdfBuf = null;
  if (buf.length >= 5 && buf.toString('utf-8', 0, 5) === '%PDF-') {
    pdfBuf = buf;
  } else {
    const html = buf.toString('utf-8');
    const match = html.match(/openExternalWindow\([^,]+,\s*'([^']+)'\)/i) ||
                  html.match(/openExternalWindow\([^,]+,\s*['"]([^'"]+)['"]/i) ||
                  html.match(/href=['"]([^'"]+\.pdf[^'"]*)['"]/i);
    if (match && match[1]) {
      const rel = match[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      const redUrl = new URL(rel, url).toString();
      const cookies = firstRes.headers.getSetCookie?.() || [firstRes.headers.get('set-cookie')].filter(Boolean);
      const cookieHdr = cookies.map(c => c.split(';')[0]).join('; ');
      const secondRes = await fetch(redUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookieHdr, Referer: url }
      });
      const sBuf = Buffer.from(await secondRes.arrayBuffer());
      if (sBuf.length >= 5 && sBuf.toString('utf-8', 0, 5) === '%PDF-') {
        pdfBuf = sBuf;
      }
    }
  }

  if (!pdfBuf) throw new Error('PDF not returned from WebDynpro');
  const parsed = await pdf(pdfBuf);
  const text = parsed.text || '';
  
  let osd = 0;
  const osdMatch = text.match(/total unpaid bill amount is Rs\.\s*([\d\.]+)/i);
  if (osdMatch) osd = parseFloat(osdMatch[1]);

  let lpsc = 0;
  const lpscMatch = text.match(/Late Payment Surcharge \(LPSC\) amount of Rs\.\s*([\d\.]+)/i);
  if (lpscMatch) lpsc = parseFloat(lpscMatch[1]);

  const readingMatch = text.match(/reading dated\s*([\d\.]+)/i);

  return {
    rawText: text,
    osd,
    lpsc,
    totalDues: Math.round((osd + lpsc) * 100) / 100,
    readingDate: readingMatch ? readingMatch[1] : 'N/A'
  };
}

async function getSheet(conId) {
  const kushidaSheetId = '16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: kushidaSheetId,
    range: 'Sheet1!A1:AZ10000'
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return null;
  const headers = rows[0].map(h => String(h || '').trim());
  const matchIdx = rows.findIndex(r => r.some(c => String(c || '').trim() === conId));
  if (matchIdx === -1) return null;
  const row = rows[matchIdx];
  const obj = { rowIdx: matchIdx + 1 };
  headers.forEach((h, i) => {
    if (row[i] !== undefined && row[i] !== '') obj[h] = row[i];
  });
  return obj;
}

async function getSpotAi(conId) {
  const fetchParam = (param, flag) => postToSpotAi('/spotaiportal/con_dtls', [{
    username, token, off_code: offCode, con_id: conId, parameter: param, flag
  }]);

  const [master, payments, osd, billing, readings, meter] = await Promise.all([
    fetchParam('MASTER', 'C').catch(e => ({ error: e.message })),
    fetchParam('PAYMENT', 'P').catch(e => ({ error: e.message })),
    fetchParam('OSD', 'O').catch(e => ({ error: e.message })),
    fetchParam('BILLING', 'B').catch(e => ({ error: e.message })),
    fetchParam('READING', 'R').catch(e => ({ error: e.message })),
    fetchParam('METER', 'M').catch(e => ({ error: e.message })),
  ]);

  const full = {
    consumerId: conId,
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
  fs.writeFileSync(path.join(outputDir, `spotai_response_${conId}.json`), JSON.stringify(full, null, 2), 'utf8');

  return full;
}

async function main() {
  console.log(`Checking 3 sources for consumer: ${cid}...\n`);
  
  console.log('--- 1. Checking Google Sheet (17.8) ---');
  const sheet = await getSheet(cid).catch(e => ({ error: e.message }));
  console.log('Sheet result:', JSON.stringify(sheet, null, 2));

  console.log('\n--- 2. Checking Live WebDynpro PDF ---');
  const pdfRes = await fetchLivePdf(cid).catch(e => ({ error: e.message }));
  console.log('PDF result:', JSON.stringify(pdfRes, null, 2));

  console.log('\n--- 3. Checking SpotAI ---');
  const spotRes = await getSpotAi(cid).catch(e => ({ error: e.message }));
  console.log('SpotAI Master:', JSON.stringify(spotRes?.master, null, 2));
  console.log('SpotAI OSD:', JSON.stringify(spotRes?.osd, null, 2));
  console.log('SpotAI Billing:', JSON.stringify(spotRes?.billing, null, 2));
}

main().catch(console.error);
