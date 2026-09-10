import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { checkApiPermission } from "@/lib/permissions"
import { compactBaseVersion } from "@/lib/version-engine"
import { invalidateConsumerCache } from "@/lib/google-sheets"
import { invalidateDDCache } from "@/lib/dd-service"

export const dynamic = "force-dynamic"

const TAG_MAP: Record<string, string> = {
  consumer: "consumers_data_cache",
  disconnection: "consumers_data_cache",
  dd: "dd_data_cache",
  reconnection: "reconnection",
  safety: "safety_data_cache",
  nsc: "nsc",
  dtr: "dtr",
  material: "material",
  "misc-inspection": "misc_inspections",
  misc_inspection: "misc_inspections",
  "meter-replacement": "meter_replacement",
}

export const POST = withTenant(async function POST(req: NextRequest) {
  const authRes = await checkApiPermission("admin", "update")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error || "Admin access required to reset base" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const moduleKey = searchParams.get("moduleKey") || "all"
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"

    // 1-hour rate limiting lock: Admin can refresh/clear CDN cache only once per hour
    const { getKV, setKV, getTenantKey } = await import("@/lib/kv-store")
    const lockKey = getTenantKey(tenantId, "cdn_cache_reset_last_time")
    const lastResetTime = await getKV<number>(lockKey)
    const ONE_HOUR_MS = 60 * 60 * 1000

    if (lastResetTime && Date.now() - lastResetTime < ONE_HOUR_MS) {
      const remainingMs = ONE_HOUR_MS - (Date.now() - lastResetTime)
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
      return NextResponse.json(
        {
          error: `Manual CDN cache refresh is locked for 1 hour. Please wait ${remainingMinutes} more minute${remainingMinutes > 1 ? "s" : ""} before resetting again.`,
          locked: true,
          remainingMinutes,
        },
        { status: 429 }
      )
    }

    // Set 1-hour lock (3600 seconds TTL in KV store)
    await setKV(lockKey, Date.now(), 3600)

    // Clear server in-memory sheet cache so next base read pulls fresh Google Sheet
    invalidateConsumerCache()
    invalidateDDCache()

    if (moduleKey === "all") {
      const keys = Object.keys(TAG_MAP)
      for (const k of keys) {
        await compactBaseVersion(tenantId, k)
        const tag = TAG_MAP[k]
        if (tag) revalidateTag(tag)
      }
      return NextResponse.json({ success: true, message: "All module bases reset to next base version" })
    }

    const newVersions = await compactBaseVersion(tenantId, moduleKey)
    const tag = TAG_MAP[moduleKey]
    if (tag) {
      revalidateTag(tag)
    }

    return NextResponse.json({
      success: true,
      moduleKey,
      baseVersion: newVersions.baseVersion,
      patchVersion: newVersions.patchVersion,
      message: `Base reset to v${newVersions.baseVersion}.0 for "${moduleKey}"`,
    })
  } catch (err: any) {
    console.error("POST /api/system/reset-base error:", err)
    return NextResponse.json({ error: err.message || "Failed to reset base" }, { status: 500 })
  }
})
