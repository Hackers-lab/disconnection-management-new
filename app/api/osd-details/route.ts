import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission } from "@/lib/permissions"
import { PDFParse } from "pdf-parse"

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const permCheck = await checkApiPermission("osd", "read")
    if (!permCheck.authorized) {
      return NextResponse.json({ error: permCheck.error || "Forbidden" }, { status: permCheck.status || 403 })
    }

    const { searchParams } = new URL(request.url)
    const consumerId = searchParams.get("consumerId")?.trim()

    // Must be exactly 9 digits
    if (!consumerId || !/^\d{9}$/.test(consumerId)) {
      return NextResponse.json(
        { error: "Invalid Consumer ID. Consumer ID must be a 9-digit number." },
        { status: 400 }
      )
    }

    const wbsedclUrl = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${consumerId}`
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    let pdfBuffer: Buffer | null = null

    // Step 1: Initial WebDynpro request with gzip accept-encoding
    const firstRes = await fetch(wbsedclUrl, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    })

    if (!firstRes.ok) {
      return NextResponse.json(
        { error: `WBSEDCL Portal returned HTTP status ${firstRes.status}` },
        { status: 502 }
      )
    }

    const firstArrayBuffer = await firstRes.arrayBuffer()
    const firstBuffer = Buffer.from(firstArrayBuffer)

    // Check if initial response is directly a PDF
    if (firstBuffer.length >= 5 && firstBuffer.toString("utf-8", 0, 5) === "%PDF-") {
      pdfBuffer = firstBuffer
    } else {
      // Step 2: Extract cookies & parse openExternalWindow URL from SAP WebDynpro HTML
      const setCookies = typeof firstRes.headers.getSetCookie === "function"
        ? firstRes.headers.getSetCookie()
        : [firstRes.headers.get("set-cookie")].filter(Boolean) as string[]

      const cookieHeader = setCookies
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ")

      const html = firstBuffer.toString("utf-8")

      // Match SAP WebDynpro openExternalWindow JS call in CDATA script
      const windowMatch =
        html.match(/openExternalWindow\([^,]+,\s*'([^']+)'\)/i) ||
        html.match(/openExternalWindow\([^,]+,\s*['"]([^'"]+)['"]/i) ||
        html.match(/window\.open\(['"]([^'"]+)['"]/i) ||
        html.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
        html.match(/href=['"]([^'"]+\.pdf[^'"]*)['"]/i)

      let redirectUrl: string | null = null

      if (windowMatch && windowMatch[1]) {
        const rawRelUrl = windowMatch[1]
        // Decode hex sequences (e.g. \x2f -> /, \x3f -> ?, \x26 -> &)
        const decodedRelUrl = rawRelUrl.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        )

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
        })

        if (secondRes.ok) {
          const secondArrayBuffer = await secondRes.arrayBuffer()
          const secondBuffer = Buffer.from(secondArrayBuffer)
          if (secondBuffer.length >= 5 && secondBuffer.toString("utf-8", 0, 5) === "%PDF-") {
            pdfBuffer = secondBuffer
          }
        }
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json(
        { error: "Returned document is not a valid PDF file. WBSEDCL server may be down or Consumer ID may be invalid." },
        { status: 422 }
      )
    }

    // Parse PDF text using PDFParse class from pdf-parse v2
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) })
    const textResult = await parser.getText()
    const text = textResult.text || ""
    await parser.destroy()

    // Extract fields via Regex (porting logic from extract_pdf.py)
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
    const pdfBase64 = pdfBuffer.toString("base64")

    return NextResponse.json({
      success: true,
      data: {
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
        pdfBase64,
        fileSizeKb: Math.round((pdfBuffer.length / 1024) * 10) / 10,
      },
    })
  } catch (error: any) {
    console.error("Error fetching OSD details:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process OSD details request" },
      { status: 500 }
    )
  }
}
