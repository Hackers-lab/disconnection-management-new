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

  try {
    const all = await fetchPermanentDisconnections(false)
    const session = authRes.session

    const scoped = all.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.agency)) return false
      return true
    })

    return NextResponse.json(
      {
        serverTimestamp: Date.now(),
        patchCount: scoped.length,
        patchData: scoped,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
          "Vary": "Cookie, Authorization",
        },
      }
    )
  } catch (error: any) {
    console.error("GET /api/permanent-disconnection/patch error:", error)
    return NextResponse.json({ patchCount: 0, patchData: [] }, { status: 500 })
  }
})
