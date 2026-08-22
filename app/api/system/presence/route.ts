import { NextRequest, NextResponse } from "next/server"
import { getKV, incrKV, setKV } from "@/lib/kv-store"
import { verifySession } from "@/lib/session"
import { trackUserPresence, removeUserPresence } from "@/lib/presence-service"

export const dynamic = "force-dynamic"
export const maxDuration = 10

// In-memory cache for ultra-fast, non-blocking response (sub-5ms)
const localPresenceMap = new Map<string, number>()
const PRESENCE_TIMEOUT_MS = 120_000 // 2 minutes window for live users
let memoryVisitorCounter = 14352
let isCounterLoaded = false

function cleanClientId(id: string): string {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
}

function pruneLocalPresence(now: number) {
  for (const [id, lastSeen] of localPresenceMap.entries()) {
    if (now - lastSeen > PRESENCE_TIMEOUT_MS) {
      localPresenceMap.delete(id)
    }
  }
}

// Background sync for persistent visitor counter
if (!isCounterLoaded) {
  isCounterLoaded = true
  getKV<number>("system:total_visitors")
    .then((val) => {
      if (val && typeof val === "number" && val > memoryVisitorCounter) {
        memoryVisitorCounter = val
      }
    })
    .catch(() => {})
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const rawCid = url.searchParams.get("cid") || ""
    const isNewVisit = url.searchParams.get("init") === "1"
    const activeModule = url.searchParams.get("module") || req.headers.get("x-active-module") || undefined
    const lastAction = url.searchParams.get("action") || undefined
    const cid = cleanClientId(rawCid)
    const now = Date.now()

    // 1. Manage Total Visitor Count (Instant in-memory, async background persist)
    if (isNewVisit) {
      memoryVisitorCounter += 1
      incrKV("system:total_visitors").catch(() => {})
    }

    // 2. Track Real-time Client Presence (Instant in-memory)
    if (cid) {
      localPresenceMap.set(cid, now)
      setKV(`presence:client:${cid}`, now, 120).catch(() => {})
    }

    pruneLocalPresence(now)

    // 3. Track Authenticated User Presence (Non-blocking background)
    verifySession()
      .then((session) => {
        if (session && session.userId) {
          const userAgent = req.headers.get("user-agent") || ""
          const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            ""

          trackUserPresence({
            userId: session.userId,
            username: session.username,
            name: session.name || session.username,
            role: session.role,
            cccCode: session.cccCode,
            agencies: session.agencies || [],
            activeModule,
            lastAction: lastAction || (activeModule ? `Viewing ${activeModule.toUpperCase()}` : "Active on Dashboard"),
            userAgent,
            ip,
            lastSeen: now,
          }).catch(() => {})
        }
      })
      .catch(() => {})

    // Calculate live active users
    let liveCount = localPresenceMap.size
    if (liveCount < 1 && cid) {
      liveCount = 1
    }

    return NextResponse.json(
      {
        totalVisitors: memoryVisitorCounter,
        liveUsers: Math.max(1, liveCount),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        totalVisitors: memoryVisitorCounter,
        liveUsers: Math.max(1, localPresenceMap.size || 1),
      },
      { status: 200 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    let cid = ""
    let userId = ""
    try {
      const body = JSON.parse(text)
      cid = cleanClientId(body.cid)
      userId = body.userId || ""
    } catch {
      cid = cleanClientId(text)
    }

    if (cid) {
      localPresenceMap.delete(cid)
    }

    if (userId) {
      removeUserPresence(userId).catch(() => {})
    } else {
      verifySession()
        .then((session) => {
          if (session?.userId) {
            removeUserPresence(session.userId).catch(() => {})
          }
        })
        .catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
