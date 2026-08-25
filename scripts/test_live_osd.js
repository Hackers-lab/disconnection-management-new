const pdf = require('pdf-parse');

const consumers = ['342294907'];

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
    rawText: text
  };
}

async function testAll() {
  for (const cid of consumers) {
    console.log(`\n========================================`);
    console.log(`Checking Live PDF OSD for ${cid}...`);
    try {
      const res = await fetchLivePdfOsd(cid);
      console.log('Result:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.error(`Error for ${cid}:`, e.message);
    }
  }
}

testAll();
