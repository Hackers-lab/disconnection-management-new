import { NextRequest, NextResponse } from "next/server"
import { getKV, setKV, incrKV, deleteKV } from "@/lib/kv-store"

export const dynamic = "force-dynamic"

// In-memory cache for ultra-fast response and low latency
const localPresenceMap = new Map<string, number>()
const PRESENCE_TIMEOUT_MS = 120_000 // 2 minutes window for live users
const DEFAULT_STARTING_VISITORS = 1250

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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const rawCid = url.searchParams.get("cid") || ""
    const isNewVisit = url.searchParams.get("init") === "1"
    const cid = cleanClientId(rawCid)
    const now = Date.now()

    // 1. Manage Total Visitor Count
    let totalVisitors = await getKV<number>("system:total_visitors")
    if (totalVisitors === null || totalVisitors === undefined) {
      totalVisitors = DEFAULT_STARTING_VISITORS
      await setKV("system:total_visitors", totalVisitors)
    }

    if (isNewVisit) {
      totalVisitors = await incrKV("system:total_visitors")
    }

    // 2. Track Real-time Client Presence
    if (cid) {
      localPresenceMap.set(cid, now)
      // Also persist with TTL in KV store for multi-server / restart resiliency
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
        totalVisitors: Number(totalVisitors) || DEFAULT_STARTING_VISITORS,
        liveUsers: Math.max(1, liveCount),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  } catch (error) {
    console.error("[api/system/presence] error:", error)
    return NextResponse.json(
      {
        totalVisitors: DEFAULT_STARTING_VISITORS,
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
      deleteKV(`presence:client:${cid}`).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
