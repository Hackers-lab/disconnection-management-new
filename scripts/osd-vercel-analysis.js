/**
 * OSD Check Module - Vercel Usage Analysis Script
 * ================================================
 * This script performs a real OSD check for a given Consumer ID (bypassing auth)
 * by directly calling the WBSEDCL portal, and measures all resource costs
 * (bandwidth, compute, response sizes) that would be incurred on Vercel.
 *
 * Usage: node scripts/osd-vercel-analysis.js [consumerId]
 * Default Consumer ID: 301326079
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");
const zlib = require("zlib");

// ─── CONFIG ───
const CONSUMER_ID = process.argv[2] || "301326079";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Vercel Hobby Plan Limits (monthly)
const VERCEL_LIMITS = {
  fastOriginTransferGB: 10,
  bandwidthGB: 100,
  serverlessGbHrs: 100,
  serverlessInvocations: 100_000,
  edgeRequests: 1_000_000,
  edgeMiddlewareInvocations: 1_000_000,
  functionMemoryMB: 512, // from vercel.json config
  maxDurationSec: 30,    // from vercel.json config
};

// Metrics accumulators
const metrics = {
  // Network
  externalRequestCount: 0,
  externalBytesSent: 0,
  externalBytesReceived: 0,
  
  // Vercel-specific
  serverlessInvocations: 1, // The OSD API call itself = 1 invocation
  edgeRequests: 1,          // Initial request hits Vercel edge first
  edgeMiddlewareInvocations: 1, // Auth middleware check
  
  // Compute
  functionStartTime: 0,
  functionEndTime: 0,
  functionDurationMs: 0,
  
  // Response
  apiResponseSizeBytes: 0,
  pdfSizeBytes: 0,
  pdfBase64SizeBytes: 0,
  
  // Origin Transfer (serverless → edge)
  fastOriginTransferBytes: 0,
  
  // Bandwidth (edge → client browser)
  clientBandwidthBytes: 0,

  // Requests detail log
  requestLog: [],
};

// ─── HELPERS ───

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function formatPercent(used, limit) {
  return `${((used / limit) * 100).toFixed(4)}%`;
}

function fetchUrl(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const mod = url.protocol === "https:" ? https : http;

    const reqHeaders = {
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
      ...options.headers,
    };

    const reqStartTime = Date.now();
    
    // Estimate request size (headers + URL)
    const requestHeaderSize = Object.entries(reqHeaders)
      .reduce((sum, [k, v]) => sum + k.length + String(v).length + 4, 0);
    const requestSize = requestHeaderSize + urlString.length + 50; // approximate HTTP overhead
    
    metrics.externalRequestCount++;
    metrics.externalBytesSent += requestSize;

    const req = mod.request(
      url,
      {
        method: options.method || "GET",
        headers: reqHeaders,
        timeout: 25000,
      },
      (res) => {
        const chunks = [];
        let rawSize = 0;

        res.on("data", (chunk) => {
          chunks.push(chunk);
          rawSize += chunk.length;
        });

        res.on("end", () => {
          const reqDuration = Date.now() - reqStartTime;
          const rawBuffer = Buffer.concat(chunks);
          
          // Track raw bytes received (compressed on wire)
          metrics.externalBytesReceived += rawSize;
          
          // Decompress if needed
          const encoding = res.headers["content-encoding"];
          let bodyBuffer = rawBuffer;
          
          try {
            if (encoding === "gzip") {
              bodyBuffer = zlib.gunzipSync(rawBuffer);
            } else if (encoding === "deflate") {
              bodyBuffer = zlib.inflateSync(rawBuffer);
            } else if (encoding === "br") {
              bodyBuffer = zlib.brotliDecompressSync(rawBuffer);
            }
          } catch (e) {
            // If decompression fails, use raw buffer
            bodyBuffer = rawBuffer;
          }

          const responseHeaderSize = Object.entries(res.headers)
            .reduce((sum, [k, v]) => sum + k.length + String(v).length + 4, 0);

          metrics.requestLog.push({
            url: urlString.substring(0, 80) + (urlString.length > 80 ? "..." : ""),
            method: options.method || "GET",
            status: res.statusCode,
            requestSizeBytes: requestSize,
            responseWireBytes: rawSize,
            responseDecompressedBytes: bodyBuffer.length,
            responseHeaderBytes: responseHeaderSize,
            durationMs: reqDuration,
            contentType: res.headers["content-type"] || "unknown",
            encoding: encoding || "none",
          });

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            setCookies:
              res.headers["set-cookie"] || [],
            body: bodyBuffer,
            rawSize,
          });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.end();
  });
}

// ─── MAIN OSD CHECK SIMULATION ───

async function runOsdCheck(consumerId) {
  console.log("═".repeat(70));
  console.log("  OSD CHECK MODULE - VERCEL USAGE ANALYSIS");
  console.log("  Consumer ID: " + consumerId);
  console.log("  Timestamp: " + new Date().toISOString());
  console.log("═".repeat(70));
  console.log();

  // Validate consumer ID
  if (!/^\d{9}$/.test(consumerId)) {
    console.error("ERROR: Consumer ID must be a 9-digit number. Got:", consumerId);
    process.exit(1);
  }

  metrics.functionStartTime = Date.now();

  // ── STEP 1: Initial WebDynpro Request ──
  console.log("── STEP 1: Initial WBSEDCL Portal Request ──");
  const wbsedclUrl = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${consumerId}`;
  console.log(`   URL: ${wbsedclUrl}`);

  let pdfBuffer = null;
  let osdData = null;

  try {
    const firstRes = await fetchUrl(wbsedclUrl, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    console.log(`   Status: ${firstRes.statusCode}`);
    console.log(`   Response Wire Size: ${formatBytes(firstRes.rawSize)}`);
    console.log(`   Response Decompressed: ${formatBytes(firstRes.body.length)}`);

    if (firstRes.statusCode !== 200) {
      console.error(`   ERROR: WBSEDCL returned HTTP ${firstRes.statusCode}`);
      metrics.functionEndTime = Date.now();
      metrics.functionDurationMs = metrics.functionEndTime - metrics.functionStartTime;
      printReport(consumerId, null);
      return;
    }

    // Check if response is directly a PDF
    if (
      firstRes.body.length >= 5 &&
      firstRes.body.toString("utf-8", 0, 5) === "%PDF-"
    ) {
      console.log("   ✓ Direct PDF response received!");
      pdfBuffer = firstRes.body;
    } else {
      // ── STEP 2: Parse HTML for redirect URL ──
      console.log();
      console.log("── STEP 2: Parse SAP WebDynpro HTML for PDF redirect ──");

      const cookieHeader = (Array.isArray(firstRes.setCookies) ? firstRes.setCookies : [firstRes.setCookies])
        .filter(Boolean)
        .map((c) => String(c).split(";")[0])
        .filter(Boolean)
        .join("; ");

      console.log(`   Cookies: ${cookieHeader ? cookieHeader.substring(0, 60) + "..." : "(none)"}`);

      const html = firstRes.body.toString("utf-8");

      const windowMatch =
        html.match(/openExternalWindow\([^,]+,\s*'([^']+)'\)/i) ||
        html.match(/openExternalWindow\([^,]+,\s*['"]([^'"]+)['"]/i) ||
        html.match(/window\.open\(['"]([^'"]+)['"]/i) ||
        html.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
        html.match(/href=['"]([^'"]+\.pdf[^'"]*)['"]/) ;

      let redirectUrl = null;

      if (windowMatch && windowMatch[1]) {
        const rawRelUrl = windowMatch[1];
        const decodedRelUrl = rawRelUrl.replace(
          /\\x([0-9a-fA-F]{2})/g,
          (_, hex) => String.fromCharCode(parseInt(hex, 16))
        );
        try {
          redirectUrl = new URL(decodedRelUrl, wbsedclUrl).toString();
        } catch {
          redirectUrl = null;
        }
      }

      if (redirectUrl) {
        console.log(`   Redirect URL: ${redirectUrl.substring(0, 80)}...`);

        // ── STEP 3: Fetch PDF from redirect ──
        console.log();
        console.log("── STEP 3: Fetch PDF from redirect URL ──");

        const secondRes = await fetchUrl(redirectUrl, {
          headers: {
            Accept: "application/pdf,application/octet-stream,*/*",
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            Referer: wbsedclUrl,
          },
        });

        console.log(`   Status: ${secondRes.statusCode}`);
        console.log(`   Response Wire Size: ${formatBytes(secondRes.rawSize)}`);
        console.log(`   Response Decompressed: ${formatBytes(secondRes.body.length)}`);

        if (
          secondRes.statusCode === 200 &&
          secondRes.body.length >= 5 &&
          secondRes.body.toString("utf-8", 0, 5) === "%PDF-"
        ) {
          console.log("   ✓ PDF successfully fetched!");
          pdfBuffer = secondRes.body;
        } else {
          console.log("   ✗ Response is not a valid PDF");
        }
      } else {
        console.log("   ✗ No redirect URL found in HTML");
      }
    }
  } catch (err) {
    console.error(`   ERROR: ${err.message}`);
  }

  // ── STEP 4: Parse PDF (simulate) ──
  if (pdfBuffer) {
    console.log();
    console.log("── STEP 4: PDF Parsing & Data Extraction ──");
    metrics.pdfSizeBytes = pdfBuffer.length;
    console.log(`   PDF Size: ${formatBytes(pdfBuffer.length)}`);

    // Try to parse the PDF text (using a simple approach since we can't require pdf-parse in standalone)
    const pdfText = pdfBuffer.toString("utf-8");
    
    // Extract fields just like the API does
    let docType = "UNKNOWN";
    const upperText = pdfText.toUpperCase();
    if (upperText.includes("NO DUES CERTIFICATE")) {
      docType = "NO DUES CERTIFICATE";
    } else if (upperText.includes("OUTSTANDING REPORT")) {
      docType = "OUTSTANDING REPORT";
    }

    const nameMatch = pdfText.match(/Name\s*:\s*(.+)/);
    const name = nameMatch ? nameMatch[1].trim().substring(0, 50) : "N/A";

    let osd = 0.0;
    const osdMatch = pdfText.match(/total unpaid bill amount is Rs\.\s*([\d.]+)/i);
    if (osdMatch) {
      osd = parseFloat(osdMatch[1]);
    }

    let lpsc = 0.0;
    const lpscMatch = pdfText.match(/Late Payment Surcharge \(LPSC\) amount of Rs\.\s*([\d.]+)/i);
    if (lpscMatch) {
      lpsc = parseFloat(lpscMatch[1]);
    }

    const totalDues = Math.round((osd + lpsc) * 100) / 100;

    osdData = { consumerId, name, docType, osd, lpsc, totalDues };

    console.log(`   Document Type: ${docType}`);
    console.log(`   Consumer Name: ${name}`);
    console.log(`   OSD: ₹${osd.toFixed(2)}`);
    console.log(`   LPSC: ₹${lpsc.toFixed(2)}`);
    console.log(`   Total Dues: ₹${totalDues.toFixed(2)}`);

    // Calculate base64 size (this is what gets sent in the JSON response)
    const pdfBase64 = pdfBuffer.toString("base64");
    metrics.pdfBase64SizeBytes = Buffer.byteLength(pdfBase64, "utf-8");
    console.log(`   PDF Base64 Size: ${formatBytes(metrics.pdfBase64SizeBytes)}`);

    // Build the JSON response that the API would return
    const apiResponse = JSON.stringify({
      success: true,
      data: {
        consumerId,
        name,
        address: "N/A",
        office: "N/A",
        connectionStatus: "N/A",
        connDate: "N/A",
        docType,
        osd,
        lpsc,
        totalDues,
        pdfBase64,
        fileSizeKb: Math.round((pdfBuffer.length / 1024) * 10) / 10,
      },
    });

    metrics.apiResponseSizeBytes = Buffer.byteLength(apiResponse, "utf-8");
    console.log(`   Full API Response Size: ${formatBytes(metrics.apiResponseSizeBytes)}`);
  }

  metrics.functionEndTime = Date.now();
  metrics.functionDurationMs = metrics.functionEndTime - metrics.functionStartTime;

  // Calculate Vercel-specific metrics
  // Fast Origin Transfer = API response from serverless → Vercel edge
  metrics.fastOriginTransferBytes = metrics.apiResponseSizeBytes;
  // Client Bandwidth = what the browser downloads (same as API response for JSON)
  metrics.clientBandwidthBytes = metrics.apiResponseSizeBytes;

  printReport(consumerId, osdData);
}

function printReport(consumerId, osdData) {
  console.log();
  console.log("╔" + "═".repeat(68) + "╗");
  console.log("║" + "  VERCEL USAGE ANALYSIS REPORT".padEnd(68) + "║");
  console.log("║" + `  Consumer ID: ${consumerId}`.padEnd(68) + "║");
  console.log("║" + `  Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`.padEnd(68) + "║");
  console.log("╚" + "═".repeat(68) + "╝");

  // ── Section 1: OSD Result Summary ──
  console.log();
  console.log("┌─── OSD CHECK RESULT ──────────────────────────────────────────────┐");
  if (osdData) {
    console.log(`│  Status:       ${osdData.docType.padEnd(52)}│`);
    console.log(`│  Consumer:     ${osdData.name.padEnd(52)}│`);
    console.log(`│  OSD Amount:   ₹${osdData.osd.toFixed(2).padEnd(50)}│`);
    console.log(`│  LPSC:         ₹${osdData.lpsc.toFixed(2).padEnd(50)}│`);
    console.log(`│  Total Dues:   ₹${osdData.totalDues.toFixed(2).padEnd(50)}│`);
  } else {
    console.log("│  FAILED - Could not retrieve OSD data from WBSEDCL              │");
  }
  console.log("└───────────────────────────────────────────────────────────────────┘");

  // ── Section 2: External Network Requests ──
  console.log();
  console.log("┌─── EXTERNAL NETWORK REQUESTS (Serverless → WBSEDCL) ─────────────┐");
  console.log(`│  Total Requests Made:    ${String(metrics.externalRequestCount).padEnd(42)}│`);
  console.log(`│  Total Bytes Sent:       ${formatBytes(metrics.externalBytesSent).padEnd(42)}│`);
  console.log(`│  Total Bytes Received:   ${formatBytes(metrics.externalBytesReceived).padEnd(42)}│`);
  console.log("│                                                                   │");
  console.log("│  Request Breakdown:                                               │");

  for (const r of metrics.requestLog) {
    console.log("│  ─────────────────────────────────────────────────────────────    │");
    console.log(`│    ${r.method} ${r.url.padEnd(58)}│`);
    console.log(`│    Status: ${r.status}  |  Duration: ${r.durationMs}ms  |  Encoding: ${r.encoding}`.padEnd(68) + "│");
    console.log(`│    Req Size: ${formatBytes(r.requestSizeBytes)}  |  Resp Wire: ${formatBytes(r.responseWireBytes)}  |  Decompressed: ${formatBytes(r.responseDecompressedBytes)}`.padEnd(68) + "│");
    console.log(`│    Content-Type: ${r.contentType.substring(0, 48)}`.padEnd(68) + "│");
  }
  console.log("└───────────────────────────────────────────────────────────────────┘");

  // ── Section 3: PDF & Response Metrics ──
  console.log();
  console.log("┌─── PDF & API RESPONSE METRICS ────────────────────────────────────┐");
  console.log(`│  Raw PDF Size:           ${formatBytes(metrics.pdfSizeBytes).padEnd(42)}│`);
  console.log(`│  PDF Base64 Encoded:     ${formatBytes(metrics.pdfBase64SizeBytes).padEnd(42)}│`);
  console.log(`│  Base64 Expansion:       ${(metrics.pdfSizeBytes > 0 ? ((metrics.pdfBase64SizeBytes / metrics.pdfSizeBytes) * 100).toFixed(1) + "%" : "N/A").padEnd(42)}│`);
  console.log(`│  Full API JSON Response: ${formatBytes(metrics.apiResponseSizeBytes).padEnd(42)}│`);
  console.log("└───────────────────────────────────────────────────────────────────┘");

  // ── Section 4: Compute Metrics ──
  console.log();
  console.log("┌─── SERVERLESS COMPUTE METRICS ────────────────────────────────────┐");
  console.log(`│  Function Duration:      ${(metrics.functionDurationMs + " ms").padEnd(42)}│`);
  console.log(`│  Function Memory:        ${(VERCEL_LIMITS.functionMemoryMB + " MB (configured in vercel.json)").padEnd(42)}│`);
  
  // GB-Hours = (memoryMB / 1024) * (durationSec / 3600)
  const gbHours = (VERCEL_LIMITS.functionMemoryMB / 1024) * (metrics.functionDurationMs / 1000 / 3600);
  console.log(`│  GB-Hours Consumed:      ${gbHours.toExponential(4).padEnd(42)}│`);
  console.log(`│  Max Duration Limit:     ${(VERCEL_LIMITS.maxDurationSec + " seconds").padEnd(42)}│`);
  console.log(`│  Duration % of Limit:    ${((metrics.functionDurationMs / 1000 / VERCEL_LIMITS.maxDurationSec * 100).toFixed(1) + "%").padEnd(42)}│`);
  console.log("└───────────────────────────────────────────────────────────────────┘");

  // ── Section 5: Vercel Usage Impact per OSD Check ──
  console.log();
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║           VERCEL USAGE COST PER SINGLE OSD CHECK                ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");

  const originTransferGB = metrics.fastOriginTransferBytes / (1024 * 1024 * 1024);
  const bandwidthGB = metrics.clientBandwidthBytes / (1024 * 1024 * 1024);

  const usageRows = [
    {
      metric: "Fast Origin Transfer",
      used: formatBytes(metrics.fastOriginTransferBytes),
      limit: `${VERCEL_LIMITS.fastOriginTransferGB} GB`,
      pct: formatPercent(originTransferGB, VERCEL_LIMITS.fastOriginTransferGB),
      note: "Serverless → Edge CDN",
    },
    {
      metric: "Bandwidth (Data Transfer)",
      used: formatBytes(metrics.clientBandwidthBytes),
      limit: `${VERCEL_LIMITS.bandwidthGB} GB`,
      pct: formatPercent(bandwidthGB, VERCEL_LIMITS.bandwidthGB),
      note: "Edge → Client Browser",
    },
    {
      metric: "Serverless Execution",
      used: gbHours.toExponential(3) + " GB-Hrs",
      limit: `${VERCEL_LIMITS.serverlessGbHrs} GB-Hrs`,
      pct: formatPercent(gbHours, VERCEL_LIMITS.serverlessGbHrs),
      note: `512MB × ${(metrics.functionDurationMs/1000).toFixed(1)}s`,
    },
    {
      metric: "Serverless Invocations",
      used: `${metrics.serverlessInvocations} call`,
      limit: `${VERCEL_LIMITS.serverlessInvocations.toLocaleString()} calls`,
      pct: formatPercent(metrics.serverlessInvocations, VERCEL_LIMITS.serverlessInvocations),
      note: "1 API route hit",
    },
    {
      metric: "Edge Requests",
      used: `${metrics.edgeRequests} req`,
      limit: `${VERCEL_LIMITS.edgeRequests.toLocaleString()} reqs`,
      pct: formatPercent(metrics.edgeRequests, VERCEL_LIMITS.edgeRequests),
      note: "CDN routing",
    },
    {
      metric: "Edge Middleware",
      used: `${metrics.edgeMiddlewareInvocations} invoc`,
      limit: `${VERCEL_LIMITS.edgeMiddlewareInvocations.toLocaleString()} invocs`,
      pct: formatPercent(metrics.edgeMiddlewareInvocations, VERCEL_LIMITS.edgeMiddlewareInvocations),
      note: "Auth check",
    },
  ];

  console.log("║                                                                   ║");
  console.log("║  Metric                     │ Used            │ % of Limit         ║");
  console.log("║  ────────────────────────────┼─────────────────┼────────────────    ║");

  for (const row of usageRows) {
    const metricCol = row.metric.padEnd(28);
    const usedCol = row.used.padEnd(17);
    const pctCol = row.pct.padEnd(16);
    console.log(`║  ${metricCol}│ ${usedCol}│ ${pctCol}   ║`);
  }

  console.log("║                                                                   ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");

  // ── Section 6: Projections ──
  console.log();
  console.log("┌─── MONTHLY PROJECTION (Hobby Plan) ──────────────────────────────┐");
  
  const scenarios = [
    { label: "10 checks/day (light use)", daily: 10 },
    { label: "50 checks/day (moderate)",  daily: 50 },
    { label: "100 checks/day (heavy)",    daily: 100 },
    { label: "500 checks/day (extreme)",  daily: 500 },
  ];

  console.log("│                                                                   │");
  console.log("│  Scenario                  │ Origin   │ Bandwidth │ Invoc. │ Exec  │");
  console.log("│  ──────────────────────────┼──────────┼───────────┼────────┼───────│");

  for (const s of scenarios) {
    const monthly = s.daily * 30;
    const originGB = (originTransferGB * monthly);
    const bwGB = (bandwidthGB * monthly);
    const invocPct = (monthly / VERCEL_LIMITS.serverlessInvocations * 100);
    const execPct = (gbHours * monthly / VERCEL_LIMITS.serverlessGbHrs * 100);

    const labelCol = s.label.padEnd(27);
    const originCol = (originGB < 0.01 ? originGB.toExponential(1) : originGB.toFixed(2) + " GB").padEnd(9);
    const bwCol = (bwGB < 0.01 ? bwGB.toExponential(1) : bwGB.toFixed(2) + " GB").padEnd(10);
    const invocCol = (invocPct.toFixed(1) + "%").padEnd(7);
    const execCol = (execPct.toFixed(3) + "%").padEnd(6);

    console.log(`│  ${labelCol}│ ${originCol}│ ${bwCol}│ ${invocCol}│ ${execCol}│`);
  }

  console.log("│                                                                   │");
  
  // Calculate max OSD checks before hitting limits
  const maxByOrigin = Math.floor(VERCEL_LIMITS.fastOriginTransferGB / (originTransferGB || 1e-10));
  const maxByBandwidth = Math.floor(VERCEL_LIMITS.bandwidthGB / (bandwidthGB || 1e-10));
  const maxByInvocations = VERCEL_LIMITS.serverlessInvocations;
  const maxByExec = Math.floor(VERCEL_LIMITS.serverlessGbHrs / (gbHours || 1e-10));
  const bottleneck = Math.min(maxByOrigin, maxByBandwidth, maxByInvocations, maxByExec);
  
  let bottleneckMetric = "Unknown";
  if (bottleneck === maxByOrigin) bottleneckMetric = "Fast Origin Transfer (10 GB)";
  else if (bottleneck === maxByBandwidth) bottleneckMetric = "Bandwidth (100 GB)";
  else if (bottleneck === maxByInvocations) bottleneckMetric = "Invocations (100K)";
  else if (bottleneck === maxByExec) bottleneckMetric = "Execution (100 GB-Hrs)";

  console.log(`│  ⚡ Max OSD Checks/month:  ${bottleneck.toLocaleString().padEnd(39)}│`);
  console.log(`│  🔴 Bottleneck Resource:   ${bottleneckMetric.padEnd(39)}│`);
  console.log(`│  📊 Daily Safe Rate:       ${(Math.floor(bottleneck / 30).toLocaleString() + " checks/day").padEnd(39)}│`);
  console.log("└───────────────────────────────────────────────────────────────────┘");

  // ── Section 7: Key Findings & Recommendations ──
  console.log();
  console.log("┌─── KEY FINDINGS & RECOMMENDATIONS ────────────────────────────────┐");
  console.log("│                                                                   │");
  
  // Identify the most expensive metric
  if (metrics.pdfBase64SizeBytes > 0) {
    const overhead = ((metrics.pdfBase64SizeBytes - metrics.pdfSizeBytes) / metrics.pdfSizeBytes * 100).toFixed(0);
    console.log(`│  ⚠  Base64 PDF encoding adds ~${overhead}% overhead to response size     │`);
    console.log("│     → Consider: serve PDF via signed URL instead of inline base64 │");
    console.log("│                                                                   │");
  }

  if (metrics.externalRequestCount > 1) {
    console.log("│  ⚠  OSD check makes " + metrics.externalRequestCount + " external HTTP requests to WBSEDCL        │");
    console.log("│     → SAP WebDynpro redirect pattern requires 2-step fetch        │");
    console.log("│     → Each request adds latency + compute time                    │");
    console.log("│                                                                   │");
  }

  if (metrics.functionDurationMs > 5000) {
    console.log("│  ⚠  Function execution is slow (" + (metrics.functionDurationMs/1000).toFixed(1) + "s)                        │");
    console.log("│     → WBSEDCL portal response time dominates cost                │");
    console.log("│     → Consider caching results for repeated lookups               │");
    console.log("│                                                                   │");
  }

  console.log("│  ✅ OSD check is I/O-bound (waiting on WBSEDCL), not CPU-bound    │");
  console.log("│  ✅ Serverless invocation cost is minimal (1 call per check)        │");
  console.log("│  ✅ Edge middleware cost is negligible                              │");
  
  if (metrics.apiResponseSizeBytes > 100 * 1024) {
    console.log("│                                                                   │");
    console.log("│  💡 OPTIMIZATION: The API response is large because it embeds     │");
    console.log("│     the full PDF as base64. For Vercel Hobby plan:                │");
    console.log("│     - Store PDFs in Vercel Blob storage instead                   │");
    console.log("│     - Return a download URL instead of inline base64              │");
    console.log("│     - This would reduce Origin Transfer by ~99%                   │");
  }

  console.log("│                                                                   │");
  console.log("└───────────────────────────────────────────────────────────────────┘");
  console.log();
}

// ─── RUN ───
runOsdCheck(CONSUMER_ID).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
