import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get("url")
  if (!urlParam) {
    return new NextResponse("Missing url parameter", { status: 400 })
  }

  try {
    let targetUrl = urlParam

    // Extract first clean http/https URL if wrapped in markdown, brackets, or newline
    const httpMatch = targetUrl.match(/https?:\/\/[^\s\]\),]+/)
    if (httpMatch) {
      targetUrl = httpMatch[0]
    }

    // Handle Google Drive file URLs
    if (targetUrl.includes("drive.google.com") || targetUrl.includes("docs.google.com")) {
      const match = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || targetUrl.match(/id=([a-zA-Z0-9_-]+)/)
      if (match && match[1]) {
        const fileId = match[1]
        targetUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
      }
    }

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    })

    if (!res.ok) {
      return new NextResponse(`Failed to fetch remote image: ${res.statusText}`, { status: res.status })
    }

    const contentType = res.headers.get("content-type") || "image/jpeg"
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (error: any) {
    console.error("Image Proxy error:", error)
    return new NextResponse(`Image Proxy error: ${error.message}`, { status: 500 })
  }
}
