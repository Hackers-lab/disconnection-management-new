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

async function getSheetRows() {
  const kushidaSheetId = '16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '').trim();
          if (/^\d{9}$/.test(val)) {
            const obj = { rowIdx: i + 1 };
            headers.forEach((h, idx) => {
              if (row[idx] !== undefined && row[idx] !== '') obj[h] = row[idx];
            });
            map[val] = obj;
          }
        }
      }
      return map;
    } catch (e) {
      if (attempt === 3) {
        console.error('Failed to fetch Sheet1 after 3 attempts:', e.message);
        return {};
      }
      console.log(`Sheet API retry attempt ${attempt}... waiting 3s`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return {};
}

async function fetchLivePdf(conId) {
  try {
    const url = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${conId}`;
    const firstRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const buf = Buffer.from(await firstRes.arrayBuffer());
    let pdfBuf = null;

    if (buf.length >= 5 && buf.toString('utf-8', 0, 5) === '%PDF-') {
      pdfBuf = buf;
    } else {
      const html = buf.toString('utf-8');
      const windowMatch =
        html.match(/openExternalWindow\([^,]+,\s*'([^']+)'\)/i) ||
        html.match(/openExternalWindow\([^,]+,\s*['"]([^'"]+)['"]/i) ||
        html.match(/href=['"]([^'"]+\.pdf[^'"]*)['"]/i);

      if (windowMatch && windowMatch[1]) {
        const rawRelUrl = windowMatch[1];
        const decodedRelUrl = rawRelUrl.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        const redUrl = new URL(decodedRelUrl, url).toString();

        const setCookies = typeof firstRes.headers.getSetCookie === 'function'
          ? firstRes.headers.getSetCookie()
          : [firstRes.headers.get('set-cookie')].filter(Boolean);

        const cookieHeader = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');

        const secondRes = await fetch(redUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': cookieHeader,
            'Referer': url
          }
        });

        const sBuf = Buffer.from(await secondRes.arrayBuffer());
        if (sBuf.length >= 5 && sBuf.toString('utf-8', 0, 5) === '%PDF-') {
          pdfBuf = sBuf;
        }
      }
    }

    if (!pdfBuf) return { error: 'No PDF / Zero Dues' };

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

async function matchAll() {
  console.log('1. Loading Google Sheet (Sheet1)...');
  const sheetMap = await getSheetRows();
  console.log(`Found ${Object.keys(sheetMap).length} rows in Sheet1.\n`);

  console.log('2. Matching all 18 consumers across Sheet1, Live WebDynpro PDF, and SpotAI...\n');
  const matchedReport = [];

  for (const cid of consumers) {
    // Load SpotAI saved response
    const spotFile = path.join(__dirname, `../spotai_responses/spotai_response_${cid}.json`);
    let spotData = {};
    if (fs.existsSync(spotFile)) {
      try { spotData = JSON.parse(fs.readFileSync(spotFile, 'utf8')); } catch (e) {}
    }

    const sheetData = sheetMap[cid] || null;
    const pdfData = await fetchLivePdf(cid);
    await new Promise(r => setTimeout(r, 600)); // Be polite to portal

    const master = spotData.master || {};
    const osd = spotData.osd || {};
    const bills = Array.isArray(spotData.billing) ? spotData.billing : [];
    const latestBill = bills[0] || null;

    const row = {
      consumerId: cid,
      name: master.ZNAME || sheetData?.Name || 'N/A',
      sheet1_NetOs: sheetData ? sheetData['D2 Net O/S'] : 'Not in Sheet1',
      pdf_UnpaidOsd: pdfData.osd !== undefined ? `₹${pdfData.osd}` : (pdfData.error || 'N/A'),
      pdf_Lpsc: pdfData.lpsc !== undefined ? `₹${pdfData.lpsc}` : 'N/A',
      pdf_TotalDemand: pdfData.totalDues !== undefined ? `₹${pdfData.totalDues}` : 'N/A',
      spot_MasterOsd: master.ZTOT_OSD ? `₹${parseFloat(master.ZTOT_OSD)}` : 'N/A',
      spot_T6: osd?.T6?.[0]?.AMT ? `₹${parseFloat(osd.T6[0].AMT)}` : 'N/A',
      spot_T3_PriorCarryover: osd?.T3?.[0]?.AMT ? `₹${parseFloat(osd.T3[0].AMT)}` : 'N/A',
      spot_L4_LiveLpsc: osd?.L4?.[0]?.AMT ? `₹${parseFloat(osd.L4[0].AMT)}` : 'N/A',
      latestBillMonth: latestBill?.BIL_MM_YY || 'N/A',
      latestBillDueDate: latestBill?.DUE_DATE || 'N/A',
      isLatestBillOverdue: latestBill?.DUE_DATE 
        ? (new Date(latestBill.DUE_DATE.split('.').reverse().join('-')) < new Date() ? 'YES (OVERDUE)' : 'NO (IN GRACE)')
        : 'N/A'
    };

    matchedReport.push(row);
    console.log(`[${cid}] ${row.name}: Sheet=${row.sheet1_NetOs} | PDF=${row.pdf_UnpaidOsd} | SpotMaster=${row.spot_MasterOsd} | SpotLPSC=${row.spot_L4_LiveLpsc}`);
  }

  const outPath = path.join(__dirname, '../spotai_responses/matched_18_consumers_3_sources.json');
  fs.writeFileSync(outPath, JSON.stringify(matchedReport, null, 2), 'utf8');
  console.log(`\nComplete matched report saved to ${outPath}`);
}

matchAll().catch(console.error);
