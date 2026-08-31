import { NextRequest, NextResponse } from "next/server"
import { getKV, incrKV, setKV } from "@/lib/kv-store"
import { verifySession } from "@/lib/session"
import { trackUserPresence, removeUserPresence } from "@/lib/presence-service"

export const dynamic = "force-dynamic"
export const maxDuration = 10

// In-memory cache for ultra-fast, non-blocking response (sub-5ms)
const localPresenceMap = new Map<string, number>()
const PRESENCE_TIMEOUT_MS = 120_000 // 2 minutes window for live users

const BASELINE_VISITORS = 19900
let memoryVisitorCounter = BASELINE_VISITORS
let lastSyncedTime = 0
const SYNC_INTERVAL_MS = 10_000 // Sync from central store every 10 seconds

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

async function getSynchronizedVisitorCount(isNewVisit: boolean): Promise<number> {
  const now = Date.now()

  // 1. Periodically synchronize from KV store without overwriting backwards
  if (now - lastSyncedTime > SYNC_INTERVAL_MS || memoryVisitorCounter < BASELINE_VISITORS) {
    try {
      const stored = await getKV<number>("system:total_visitors")
      if (typeof stored === "number" && stored > memoryVisitorCounter) {
        memoryVisitorCounter = stored
      }
      lastSyncedTime = now
    } catch {
      // Keep highest in-memory counter
    }
  }

  // 2. Monotonically increment on new visits
  if (isNewVisit) {
    const nextCount = Math.max(memoryVisitorCounter, BASELINE_VISITORS) + 1
    memoryVisitorCounter = nextCount
    setKV("system:total_visitors", nextCount).catch(() => {})
    lastSyncedTime = now
    return nextCount
  }

  return Math.max(memoryVisitorCounter, BASELINE_VISITORS)
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

    // 1. Manage Authoritative Total Visitor Count (Synchronized across all instances)
    const totalVisitors = await getSynchronizedVisitorCount(isNewVisit)

    // 2. Track Real-time Client Presence (Instant in-memory, 0 DB writes)
    if (cid) {
      localPresenceMap.set(cid, now)
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
        totalVisitors,
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
