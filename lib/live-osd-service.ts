// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js"

export interface LiveOsdData {
  consumerId: string
  name: string
  address: string
  office: string
  connectionStatus: string
  connDate: string
  docType: string
  osd: number
  lpsc: number
  totalDues: number
  pdfBase64?: string
  fileSizeKb?: number
  isLive: boolean
  isDeemed: boolean
  isDisconnected: boolean
  rawText?: string
}

export interface FetchLiveOsdResult {
  success: boolean
  data?: LiveOsdData
  error?: string
  portalOffline?: boolean
}

/**
 * Fetches the official WBSEDCL WebDynpro Outstanding / No Dues PDF report,
 * parses its textual content, and evaluates connection status & dues.
 */
export async function fetchLiveOsdData(
  consumerId: string,
  options: { includePdfBase64?: boolean; includeRawText?: boolean; timeoutMs?: number } = {}
): Promise<FetchLiveOsdResult> {
  const cleanId = String(consumerId || "").trim()
  if (!cleanId || !/^\d{9}$/.test(cleanId)) {
    return {
      success: false,
      error: "Invalid Consumer ID. Consumer ID must be a 9-digit number."
    }
  }

  const { includePdfBase64 = false, includeRawText = false, timeoutMs = 25000 } = options

  const wbsedclUrl = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${cleanId}`
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let pdfBuffer: Buffer | null = null

    // Step 1: Initial WebDynpro request
    let firstRes = await fetch(wbsedclUrl, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    if (!firstRes.ok) {
      return {
        success: false,
        error: `WBSEDCL Portal server is temporarily unreachable (HTTP ${firstRes.status}). The portal server may be under maintenance.`,
        portalOffline: true,
      }
    }

    let firstArrayBuffer = await firstRes.arrayBuffer()
    let firstBuffer = Buffer.from(firstArrayBuffer)

    // Handle case where portal returns empty 0-byte response on initial handshake to set cookies
    if (firstBuffer.length === 0) {
      const headersAny = firstRes.headers as any
      const handshakeCookies: string[] = typeof headersAny.getSetCookie === "function"
        ? headersAny.getSetCookie()
        : [firstRes.headers.get("set-cookie")].filter(Boolean) as string[]

      const cookieHeader = handshakeCookies
        .map((c: string) => c.split(";")[0])
        .filter(Boolean)
        .join("; ")

      firstRes = await fetch(wbsedclUrl, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      })

      if (firstRes.ok) {
        firstArrayBuffer = await firstRes.arrayBuffer()
        firstBuffer = Buffer.from(firstArrayBuffer)
      }
    }

    // Check if initial response is directly a PDF
    if (firstBuffer.length >= 5 && firstBuffer.toString("utf-8", 0, 5) === "%PDF-") {
      pdfBuffer = firstBuffer
    } else {
      // Step 2: Extract cookies & parse openExternalWindow URL from SAP WebDynpro HTML
      const headersAny = firstRes.headers as any
      const setCookies: string[] = typeof headersAny.getSetCookie === "function"
        ? headersAny.getSetCookie()
        : [firstRes.headers.get("set-cookie")].filter(Boolean) as string[]

      const cookieHeader = setCookies
        .map((c: string) => c.split(";")[0])
        .filter(Boolean)
        .join("; ")

      const html = firstBuffer.toString("utf-8")

      // Match SAP WebDynpro openExternalWindow JS call in CDATA script or direct PDF links
      // Note: SAP WebDynpro openExternalWindow has 10 arguments:
      // openExternalWindow('ctrlId', 'relative_url', 0, 0, 0, 0, true, true, true, true)
      // Therefore, the regex must NOT expect ')' immediately after the URL parameter.
      const windowMatch =
        html.match(/openExternalWindow\([^,]+,\s*['"]([^'"]+?)['"]/i) ||
        html.match(/openExternalWindow\([^)]*?['"]([^'"]*?\.pdf[^'"]*?)['"]/i) ||
        html.match(/['"]([^'"]*?\.pdf(?:\?[^'"]*)?)['"]/i) ||
        html.match(/href=['"]([^'"]+\.pdf[^'"]*)['"]/i) ||
        html.match(/window\.open\(['"]([^'"]+?)['"]/i) ||
        html.match(/location\.href\s*=\s*['"]([^'"]+?)['"]/i)

      let redirectUrl: string | null = null

      if (windowMatch && windowMatch[1]) {
        const rawRelUrl = windowMatch[1]
        // Decode hex sequences (e.g. \x2f -> /, \x3f -> ?, \x26 -> &) and HTML entities
        const decodedRelUrl = rawRelUrl
          .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
          )
          .replace(/&amp;/g, "&")

        try {
          redirectUrl = new URL(decodedRelUrl, wbsedclUrl).toString()
        } catch (e) {
          console.warn("Failed to resolve PDF URI:", e)
          redirectUrl = null
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
          cache: "no-store",
          signal: controller.signal,
        })

        if (secondRes.ok) {
          const secondArrayBuffer = await secondRes.arrayBuffer()
          const secondBuffer = Buffer.from(secondArrayBuffer)
          if (secondBuffer.length >= 5 && secondBuffer.toString("utf-8", 0, 5) === "%PDF-") {
            pdfBuffer = secondBuffer
          } else {
            console.warn("Second response was not a valid PDF buffer. Length:", secondBuffer.length)
          }
        } else {
          console.warn("Second response HTTP error:", secondRes.status)
        }
      } else {
        console.warn("Could not find PDF redirect URL in WebDynpro HTML response.")
      }
    }

    if (!pdfBuffer) {
      return {
        success: false,
        error: "WBSEDCL portal did not return a valid PDF report. The portal may be busy or the Consumer ID is not found.",
        portalOffline: true,
      }
    }

    // Parse PDF text using pdf-parse safely across CJS/ESM modules
    const pdfParser: any = typeof pdf === "function" ? pdf : (pdf as any)?.default || pdf
    const pdfData = await pdfParser(pdfBuffer)
    const text = pdfData.text || ""

    // Extract fields via Regex
    let docType = "UNKNOWN"
    const upperText = text.toUpperCase()
    if (upperText.includes("NO DUES CERTIFICATE")) {
      docType = "NO DUES CERTIFICATE"
    } else if (upperText.includes("OUTSTANDING REPORT")) {
      docType = "OUTSTANDING REPORT"
    }

    const nameMatch = text.match(/Name\s*:\s*(.+)/)
    const name = nameMatch ? nameMatch[1].trim() : "N/A"

    const addrMatch = text.match(/Service Location Address\s*:\s*([\s\S]*?)(?=Office Name\s*:)/)
    const address = addrMatch ? addrMatch[1].replace(/\s+/g, " ").trim() : "N/A"

    const officeMatch = text.match(/Office Name\s*:\s*(.+)/)
    const office = officeMatch ? officeMatch[1].trim() : "N/A"

    const statusMatch = text.match(/Connection Status\s*:\s*(.+)/)
    const connectionStatus = statusMatch ? statusMatch[1].trim() : "N/A"

    const connDateMatch = text.match(/Date of Service Connection\s*:\s*(.+)/)
    const connDate = connDateMatch ? connDateMatch[1].trim() : "N/A"

    // Outstanding Dues (OSD)
    let osd = 0.0
    const osdMatch = text.match(/total unpaid bill amount is Rs\.\s*([\d\.]+)/i)
    if (osdMatch) {
      osd = parseFloat(osdMatch[1])
    } else if (docType === "NO DUES CERTIFICATE" || text.toLowerCase().includes("no unpaid bill")) {
      osd = 0.0
    }

    // Late Payment Surcharge (LPSC)
    let lpsc = 0.0
    const lpscMatch = text.match(/Late Payment Surcharge \(LPSC\) amount of Rs\.\s*([\d\.]+)/i)
    if (lpscMatch) {
      lpsc = parseFloat(lpscMatch[1])
    }

    const totalDues = Math.round((osd + lpsc) * 100) / 100

    // Evaluate connection flags
    const normalizedStatus = connectionStatus.toUpperCase()
    const isDeemed = normalizedStatus.includes("DEEMED")
    const isDisconnected = !isDeemed && normalizedStatus.includes("DISCONNECT")
    const isLive = !isDeemed && !isDisconnected && (normalizedStatus.includes("LIVE") || /\bCONNECTED\b/.test(normalizedStatus))

    const resultData: LiveOsdData = {
      consumerId: cleanId,
      name,
      address,
      office,
      connectionStatus,
      connDate,
      docType,
      osd,
      lpsc,
      totalDues,
      isLive,
      isDeemed,
      isDisconnected,
    }

    if (includePdfBase64) {
      resultData.pdfBase64 = pdfBuffer.toString("base64")
      resultData.fileSizeKb = Math.round((pdfBuffer.length / 1024) * 10) / 10
    }

    if (includeRawText) {
      resultData.rawText = text
    }

    return {
      success: true,
      data: resultData,
    }
  } catch (error: any) {
    const isAbort = error.name === "AbortError"
    return {
      success: false,
      error: isAbort ? "Request to WBSEDCL portal timed out." : (error.message || "Failed to fetch live OSD details"),
      portalOffline: isAbort,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
