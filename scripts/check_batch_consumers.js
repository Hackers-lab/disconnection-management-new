const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');
const { sheets } = require('@googleapis/sheets');
const { JWT } = require('google-auth-library');

const consumers = [
  '300172451',
  '300172614',
  '300135879',
  '342093137',
  '300747655',
  '301166688',
  '301170084',
  '342367166',
  '300166832',
  '301937435',
  '301937436'
];

const SPOTAI_HOST = 'spotai.wbsedcl.in';
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5MDAxODc0NyIsImlzcyI6InNwb3RhaSIsImV4cCI6MTc4NzY5MjgyNCwiaWF0IjoxNzg3NjA2NDI0fQ.YkrDSjD8Ys3_dOOUOz7_Vi7deaDDftWc8KwflTbPRck';
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

async function fetchSpotAiDetails(conId, param, flag) {
  const payload = {
    username,
    token,
    off_code: offCode,
    con_id: conId.trim(),
    parameter: param,
    flag: flag,
  };
  return await postToSpotAi('/spotaiportal/con_dtls', [payload], 'application/json');
}

async function fetchLivePdfOsd(consumerId) {
  const wbsedclUrl = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${consumerId}`;
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  let pdfBuffer = null;

  const firstRes = await fetch(wbsedclUrl, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!firstRes.ok) {
    throw new Error(`WBSEDCL Portal returned HTTP status ${firstRes.status}`);
  }

  const firstArrayBuffer = await firstRes.arrayBuffer();
  const firstBuffer = Buffer.from(firstArrayBuffer);

  if (firstBuffer.length >= 5 && firstBuffer.toString("utf-8", 0, 5) === "%PDF-") {
    pdfBuffer = firstBuffer;
  } else {
    const setCookies = typeof firstRes.headers.getSetCookie === "function"
      ? firstRes.headers.getSetCookie()
      : [firstRes.headers.get("set-cookie")].filter(Boolean);

    const cookieHeader = setCookies
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

    const html = firstBuffer.toString("utf-8");

    const windowMatch =
      html.match(/openExternalWindow\([^,]+,\s*'([^']+)'\)/i) ||
      html.match(/openExternalWindow\([^,]+,\s*['"]([^'"]+)['"]/i) ||
      html.match(/window\.open\(['"]([^'"]+)['"]/i) ||
      html.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
      html.match(/href=['"]([^'"]+\.pdf[^'"]*)['"]/i);

    let redirectUrl = null;

    if (windowMatch && windowMatch[1]) {
      const rawRelUrl = windowMatch[1];
      const decodedRelUrl = rawRelUrl.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );

      try {
        redirectUrl = new URL(decodedRelUrl, wbsedclUrl).toString();
      } catch (e) {
        redirectUrl = null;
      }
    }

    if (redirectUrl) {
      const secondRes = await fetch(redirectUrl, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "Accept": "application/pdf,application/octet-stream,*/*",
          "Accept-Encoding": "gzip, deflate, br",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          Referer: wbsedclUrl,
        },
      });

      if (secondRes.ok) {
        const secondArrayBuffer = await secondRes.arrayBuffer();
        const secondBuffer = Buffer.from(secondArrayBuffer);
        if (secondBuffer.length >= 5 && secondBuffer.toString("utf-8", 0, 5) === "%PDF-") {
          pdfBuffer = secondBuffer;
        }
      }
    }
  }

  if (!pdfBuffer) {
    throw new Error("Returned document is not a valid PDF file.");
  }

  const pdfData = await pdf(pdfBuffer);
  const text = pdfData.text || "";

  let docType = "UNKNOWN";
  const upperText = text.toUpperCase();
  if (upperText.includes("NO DUES CERTIFICATE")) {
    docType = "NO DUES CERTIFICATE";
  } else if (upperText.includes("OUTSTANDING REPORT")) {
    docType = "OUTSTANDING REPORT";
  }

  const nameMatch = text.match(/Name\s*:\s*(.+)/);
  const name = nameMatch ? nameMatch[1].trim() : "N/A";

  const addrMatch = text.match(/Service Location Address\s*:\s*([\s\S]*?)(?=Office Name\s*:)/);
  const address = addrMatch ? addrMatch[1].replace(/\s+/g, " ").trim() : "N/A";

  const officeMatch = text.match(/Office Name\s*:\s*(.+)/);
  const office = officeMatch ? officeMatch[1].trim() : "N/A";

  const statusMatch = text.match(/Connection Status\s*:\s*(.+)/);
  const connectionStatus = statusMatch ? statusMatch[1].trim() : "N/A";

  const connDateMatch = text.match(/Date of Service Connection\s*:\s*(.+)/);
  const connDate = connDateMatch ? connDateMatch[1].trim() : "N/A";

  let osd = 0.0;
  const osdMatch = text.match(/total unpaid bill amount is Rs\.\s*([\d\.]+)/i);
  if (osdMatch) {
    osd = parseFloat(osdMatch[1]);
  } else if (docType === "NO DUES CERTIFICATE" || text.toLowerCase().includes("no unpaid bill")) {
    osd = 0.0;
  }

  let lpsc = 0.0;
  const lpscMatch = text.match(/Late Payment Surcharge \(LPSC\) amount of Rs\.\s*([\d\.]+)/i);
  if (lpscMatch) {
    lpsc = parseFloat(lpscMatch[1]);
  }

  const totalDues = Math.round((osd + lpsc) * 100) / 100;

  const readingMatch = text.match(/reading dated\s*([\d\.]+)/i);
  const readingDate = readingMatch ? readingMatch[1] : "N/A";

  return {
    consumerId,
    name,
    address,
    office,
    connectionStatus,
    connDate,
    docType,
    osd,
    lpsc,
    totalDues,
    readingDate,
    rawText: text
  };
}

async function getGoogleSheetData() {
  console.log('Fetching Google Sheet data for Kushida CCC (16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY)...');
  const kushidaSpreadsheetId = '16Cx8VXfdTv63yfcrD9j0qTffhHoa5EFJ4IZ9BaUlRxY';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: kushidaSpreadsheetId,
    range: 'Sheet1!A1:AZ10000'
  });
  const rows = res.data.values || [];
  const sheetMap = {};
  if (rows.length > 0) {
    const headers = rows[0].map(h => String(h || '').trim());
    const cidCol = headers.findIndex(h => /consumer.*id|con.*id/i.test(h));
    const osdCol = headers.findIndex(h => /d2.*net.*o\/s|osd|outstanding/i.test(h));
    const dueRangeCol = headers.findIndex(h => /duedate.*range|o\/s.*range/i.test(h));
    const agencyCol = headers.findIndex(h => /agency/i.test(h));
    const statusCol = headers.findIndex(h => /discon.*status|status/i.test(h));
    const nameCol = headers.findIndex(h => /^name$/i.test(h));

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const cid = String(r[cidCol] || '').trim();
      if (cid) {
        sheetMap[cid] = {
          rowIdx: i + 1,
          name: r[nameCol] || '',
          d2NetOsd: r[osdCol] || '',
          dueRange: r[dueRangeCol] || '',
          agency: r[agencyCol] || '',
          status: r[statusCol] || '',
          rawRow: r
        };
      }
    }
  }
  return sheetMap;
}

async function runAll() {
  const outputDir = path.join(__dirname, '../spotai_responses');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('--- Step 1: Loading Sheet Data ---');
  let sheetMap = {};
  try {
    sheetMap = await getGoogleSheetData();
  } catch (e) {
    console.error('Google Sheet error:', e.message);
  }

  const batchResults = [];

  for (const cid of consumers) {
    console.log(`\n======================================================`);
    console.log(`Processing Consumer ID: ${cid}`);

    // 1. Google sheet
    const sheetData = sheetMap[cid] || null;

    // 2. Live PDF
    let livePdf = null;
    try {
      livePdf = await fetchLivePdfOsd(cid);
    } catch (e) {
      console.error(`Live PDF Error for ${cid}:`, e.message);
      livePdf = { error: e.message };
    }

    // 3. SpotAI
    let spotAiMaster = null;
    let spotAiOsd = null;
    let spotAiFull = null;
    try {
      const [master, payments, osd, billing, readings, meter] = await Promise.all([
        fetchSpotAiDetails(cid, 'MASTER', 'C').catch(e => ({ error: e.message })),
        fetchSpotAiDetails(cid, 'PAYMENT', 'P').catch(e => ({ error: e.message })),
        fetchSpotAiDetails(cid, 'OSD', 'O').catch(e => ({ error: e.message })),
        fetchSpotAiDetails(cid, 'BILLING', 'B').catch(e => ({ error: e.message })),
        fetchSpotAiDetails(cid, 'READING', 'R').catch(e => ({ error: e.message })),
        fetchSpotAiDetails(cid, 'METER', 'M').catch(e => ({ error: e.message })),
      ]);

      spotAiFull = {
        consumerId: cid,
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

      const filePath = path.join(outputDir, `spotai_response_${cid}.json`);
      fs.writeFileSync(filePath, JSON.stringify(spotAiFull, null, 2), 'utf8');
      console.log(`Saved SpotAI JSON to: ${filePath}`);

      spotAiMaster = spotAiFull.master;
      spotAiOsd = spotAiFull.osd;
    } catch (e) {
      console.error(`SpotAI Error for ${cid}:`, e.message);
    }

    const item = {
      consumerId: cid,
      name: spotAiMaster?.ZNAME || livePdf?.name || sheetData?.name || 'N/A',
      tariff: spotAiMaster?.ZTARIFF || 'N/A',
      meter: spotAiMaster?.ZMET1 || 'N/A',
      office: spotAiMaster?.ZOFF_NAME || livePdf?.office || 'N/A',
      sheet: sheetData ? {
        found: true,
        d2NetOsd: sheetData.d2NetOsd,
        dueRange: sheetData.dueRange,
        agency: sheetData.agency,
        status: sheetData.status
      } : { found: false },
      livePdf: livePdf ? {
        osd: livePdf.osd,
        lpsc: livePdf.lpsc,
        totalDues: livePdf.totalDues,
        readingDate: livePdf.readingDate,
        connectionStatus: livePdf.connectionStatus,
        docType: livePdf.docType
      } : null,
      spotAi: spotAiOsd ? {
        energyOsd_T4: spotAiOsd.T4?.[0]?.AMT || '0.00',
        otherDues_T5: spotAiOsd.T5?.[0]?.AMT || '0.00',
        totalOsd_T6: spotAiOsd.T6?.[0]?.AMT || '0.00',
        lpsc_L4: spotAiOsd.L4?.[0]?.AMT || '0.00',
        unpaidInvoices_A3: spotAiOsd.A3 || []
      } : null
    };

    batchResults.push(item);
  }

  const batchSummaryPath = path.join(outputDir, 'spotai_batch_summary_11_consumers.json');
  fs.writeFileSync(batchSummaryPath, JSON.stringify(batchResults, null, 2), 'utf8');
  console.log(`\nSaved Batch Summary to: ${batchSummaryPath}`);
}

runAll().catch(console.error);
