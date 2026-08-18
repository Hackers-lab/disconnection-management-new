import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { getSupplyModuleVersionsReport, compactBaseVersion } from "@/lib/version-engine"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized: Superuser role required" }, { status: 401 })
    }

    const tenants = await getTenantRegistry()
    const reportData = await getSupplyModuleVersionsReport(tenants)

    return NextResponse.json({
      success: true,
      ...reportData,
      serverTime: Date.now(),
    })
  } catch (error: any) {
    console.error("GET /api/superuser/module-versions error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch module versions report" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized: Superuser role required" }, { status: 401 })
    }

    const body = await request.json()
    const { action, cccCode, moduleKey } = body

    if (action === "reset-base") {
      if (!cccCode || !moduleKey) {
        return NextResponse.json({ error: "cccCode and moduleKey are required to reset base" }, { status: 400 })
      }

      const newVersions = await compactBaseVersion(cccCode, moduleKey)
      return NextResponse.json({
        success: true,
        cccCode,
        moduleKey,
        baseVersion: newVersions.baseVersion,
        patchVersion: newVersions.patchVersion,
        message: `Reset base version to v${newVersions.baseVersion}.0 for Supply "${cccCode}" (${moduleKey})`,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("POST /api/superuser/module-versions error:", error)
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 })
  }
}
