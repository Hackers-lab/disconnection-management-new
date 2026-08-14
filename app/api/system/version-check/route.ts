import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { checkApiPermission } from "@/lib/permissions"
import { getModuleVersions, getDeltaPatchesSince } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const moduleKey = searchParams.get("moduleKey")
    const clientPatchVersion = Number(searchParams.get("clientPatchVersion") || 0)
    const clientBaseVersion = Number(searchParams.get("clientBaseVersion") || 1)
    const context = getTenantContext()
    const tenantId = context?.cccCode || req.headers.get("x-tenant-id") || "default"

    if (!moduleKey) {
      return NextResponse.json({ error: "moduleKey is required" }, { status: 400 })
    }

    const versions = await getModuleVersions(tenantId, moduleKey)

    if (clientBaseVersion < versions.baseVersion) {
      return NextResponse.json({
        upToDate: false,
        syncMode: "BASE",
        serverBaseVersion: versions.baseVersion,
        serverPatchVersion: versions.patchVersion,
        patches: [],
      })
    }

    if (clientPatchVersion >= versions.patchVersion) {
      return NextResponse.json({
        upToDate: true,
        syncMode: "NONE",
        serverBaseVersion: versions.baseVersion,
        serverPatchVersion: versions.patchVersion,
        patches: [],
      })
    }

    const patches = await getDeltaPatchesSince(tenantId, moduleKey, clientPatchVersion)

    if (patches.length > 0 && patches.length <= 100) {
      return NextResponse.json({
        upToDate: false,
        syncMode: "PATCH",
        serverBaseVersion: versions.baseVersion,
        serverPatchVersion: versions.patchVersion,
        patches,
      })
    }

    return NextResponse.json({
      upToDate: false,
      syncMode: "BASE",
      serverBaseVersion: versions.baseVersion,
      serverPatchVersion: versions.patchVersion,
      patches: [],
    })
  } catch (error: any) {
    console.error("GET /api/system/version-check error:", error)
    return NextResponse.json({ error: error.message || "Version check failed" }, { status: 500 })
  }
})
