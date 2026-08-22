import { NextRequest, NextResponse } from "next/server"
import { getKV, incrKV, setKV } from "@/lib/kv-store"

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
      // Asynchronous background TTL persistence
      setKV(`presence:client:${cid}`, now, 120).catch(() => {})
    }

    pruneLocalPresence(now)

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
    try {
      const body = JSON.parse(text)
      cid = cleanClientId(body.cid)
    } catch {
      cid = cleanClientId(text)
    }

    if (cid) {
      localPresenceMap.delete(cid)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
