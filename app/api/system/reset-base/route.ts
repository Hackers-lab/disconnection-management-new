import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { checkApiPermission } from "@/lib/permissions"
import { compactBaseVersion } from "@/lib/version-engine"

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
