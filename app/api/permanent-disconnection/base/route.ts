import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { fetchPermanentDisconnections } from "@/lib/permanent-disconnection-service"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("permanent_disconnection", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 401 })
  }

  const { searchParams } = new URL(req.url)
  const bypassCache = searchParams.get("bypassCache") === "true"

  try {
    const all = await fetchPermanentDisconnections(bypassCache)
    const session = authRes.session

    const scoped = all.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.agency)) return false
      return true
    }).map(r => {
      const clean: Record<string, any> = {}
      for (const k in r) {
        const val = (r as any)[k]
        if (val !== "" && val !== null && val !== undefined) {
          clean[k] = val
        }
      }
      return clean
    })

    return NextResponse.json(scoped, {
      headers: {
        "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300, max-age=0, must-revalidate",
        "Vary": "Cookie, Authorization",
      }
    })
  } catch (error: any) {
    console.error("GET /api/permanent-disconnection/base error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch PD base" }, { status: 500 })
  }
})
