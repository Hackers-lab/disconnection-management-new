const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

const consumers = [
  '342351120', '342351129', '342253755', '342352898', '342352998',
  '342353024', '300623382', '300660490', '300793705', '300800972',
  '300828552', '300891757', '300894595', '342467694', '300141945',
  '342363377', '342465520', '342155961'
];

const SPOTAI_HOST = 'spotai.wbsedcl.in';
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5MDAxODc0NyIsImlzcyI6InNwb3RhaSIsImV4cCI6MTc4NzczODEwNSwiaWF0IjoxNzg3NjUxNzA1fQ.V-FLGw5FsYv52Jbt7s8LuJAKnnOIzGAdHnZThqP4_3E';
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
  try {
    const url = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${conId}`;
    const firstRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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

    if (!pdfBuf) return { error: 'PDF not returned' };
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
      osd,
      lpsc,
      totalDues: Math.round((osd + lpsc) * 100) / 100,
      readingDate: readingMatch ? readingMatch[1] : 'N/A'
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function getSheetRows() {
  try {
    const kushidaSheetId = '16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY';
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: kushidaSheetId,
      range: 'Sheet1!A1:AZ10000'
    });
    const rows = res.data.values || [];
    if (rows.length === 0) return {};
    const headers = rows[0].map(h => String(h || '').trim());
    const map = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cid = String(row[3] || '').trim();
      if (cid) {
        const obj = { rowIdx: i + 1 };
        headers.forEach((h, idx) => {
          if (row[idx] !== undefined && row[idx] !== '') obj[h] = row[idx];
        });
        map[cid] = obj;
      }
    }
    return map;
  } catch (e) {
    console.warn('Google Sheets API rate limited, proceeding without Sheet1 cache:', e.message);
    return {};
  }
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

async function run() {
  console.log(`Loading Google Sheet data...`);
  const sheetMap = await getSheetRows();

  console.log(`Processing ${consumers.length} consumers across all 3 systems...\n`);
  const results = [];

  for (const cid of consumers) {
    console.log(`--> Fetching ${cid}...`);
    const sheetData = sheetMap[cid] || null;
    const [pdfData, spotData] = await Promise.all([
      fetchLivePdf(cid),
      getSpotAi(cid)
    ]);

    // Parse SpotAI numbers
    const master = spotData.master || {};
    const osd = spotData.osd || {};
    const bills = Array.isArray(spotData.billing) ? spotData.billing : [];
    
    const latestBill = bills[0] || null;
    const prevBill = bills[1] || null;

    const resObj = {
      consumerId: cid,
      name: master.ZNAME || sheetData?.Name || 'N/A',
      sheetNetOs: sheetData ? sheetData['D2 Net O/S'] : 'Not in Sheet1',
      pdfOsd: pdfData.osd !== undefined ? pdfData.osd : pdfData.error,
      pdfLpsc: pdfData.lpsc !== undefined ? pdfData.lpsc : null,
      spotMasterOsd: master.ZTOT_OSD ? parseFloat(master.ZTOT_OSD) : 0,
      spotT6: osd?.T6?.[0]?.AMT ? parseFloat(osd.T6[0].AMT) : 0,
      spotT3_Carryover: osd?.T3?.[0]?.AMT ? parseFloat(osd.T3[0].AMT) : 0,
      spotT2_CurrentEnergy: osd?.T2?.[0]?.AMT ? parseFloat(osd.T2[0].AMT) : 0,
      spotT1_FutureInstallments: osd?.T1?.[0]?.AMT ? parseFloat(osd.T1[0].AMT) : 0,
      spotT5_Fees: osd?.T5?.[0]?.AMT ? parseFloat(osd.T5[0].AMT) : 0,
      spotL4_Lpsc: osd?.L4?.[0]?.AMT ? parseFloat(osd.L4[0].AMT) : 0,
      spotA3_Count: Array.isArray(osd?.A3) ? osd.A3.length : 0,
      spotA3_Invoices: Array.isArray(osd?.A3) ? osd.A3.map(a => `${a.DUE_FROM}-${a.DUE_TO}: ₹${a.AMT}`) : [],
      latestBillMonth: latestBill?.BIL_MM_YY || 'N/A',
      latestBillDueDate: latestBill?.DUE_DATE || 'N/A',
      latestBillAmtBfrDue: latestBill?.AMT_BFR_D_DT || 'N/A',
      latestBillAmtAftrDue: latestBill?.AMT_AFTR_DUE_DT || 'N/A',
      prevBillMonth: prevBill?.BIL_MM_YY || 'N/A',
      prevBillDueDate: prevBill?.DUE_DATE || 'N/A',
      prevBillAmtAftrDue: prevBill?.AMT_AFTR_DUE_DT || 'N/A'
    };

    results.push(resObj);
  }

  const outSummaryPath = path.join(__dirname, '../spotai_responses/batch_18_consumers_analysis.json');
  fs.writeFileSync(outSummaryPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nAll 18 consumers processed and saved to ${outSummaryPath}`);
  console.log(JSON.stringify(results, null, 2));
}

run().catch(console.error);
