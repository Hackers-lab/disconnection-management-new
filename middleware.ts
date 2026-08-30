import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Edge Middleware — runs at CDN edge, does NOT count as a Function Invocation.
 *
 * Purpose:
 * 1. Block bots/crawlers from invoking serverless API functions
 * 2. Reject unauthenticated requests to protected API routes at the edge
 *
 * This prevents the massive usage spike from bot traffic hitting /api/icds
 * (37K requests in 12 hours, 2.8K burst in 5 minutes).
 */

// Routes that must be accessible without a session cookie
const PUBLIC_API_PREFIXES = [
  "/api/auth/",           // Login, register, OTP, forgot-password
  "/api/feedback/public", // Public feedback endpoint
  "/api/consumer-details/", // Public consumer lookup
  "/api/system/presence", // Presence tracking (uses cid param, not session)
  "/api/dd-sheet-redirect", // Public redirect
]

// Bot / crawler user-agent patterns
const BOT_PATTERNS = [
  "bot", "crawl", "spider", "slurp", "wget", "curl",
  "python-requests", "python-urllib", "java/", "go-http-client",
  "node-fetch", "axios/", "scrapy", "httpclient", "okhttp",
  "postmanruntime", "insomnia", "apache-httpclient", "libwww",
  "headlesschrome", "phantomjs", "semrush", "ahrefs", "mj12bot",
  "dotbot", "petalbot", "bytespider", "yandexbot", "baiduspider",
  "sogou", "megaindex", "blexbot", "serpstatbot", "dataforseo",
]

function isBot(ua: string): boolean {
  const lower = ua.toLowerCase()
  return BOT_PATTERNS.some(pattern => lower.includes(pattern))
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only intercept API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  // Allow public API routes without any checks
  if (isPublicApiRoute(pathname)) {
    return NextResponse.next()
  }

  // Block bots and crawlers at the edge (zero function invocations)
  const userAgent = request.headers.get("user-agent") || ""
  if (!userAgent || isBot(userAgent)) {
    return NextResponse.json(
      { error: "Forbidden" },
      {
        status: 403,
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      }
    )
  }

  // Reject unauthenticated requests to protected API routes
  const hasSession = request.cookies.has("session")
  if (!hasSession) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
