import { NextRequest, NextResponse } from "next/server"
import { withTenant } from "@/lib/tenant-context"
import { getTenantContext } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

// Lightweight in-memory revision counter store per CCC tenant
const tenantRevisions = new Map<string, Record<string, number>>()

export function bumpModuleRevision(cccCode: string, moduleKey: string) {
  if (!cccCode || !moduleKey) return
  const current = tenantRevisions.get(cccCode) || {
    disconnection: 1,
    reconnection: 1,
    dd: 1,
    dtr: 1,
    safety: 1,
    misc_inspection: 1,
    nsc: 1,
    meter: 1,
    meter_replacement: 1,
    material: 1,
  }
  current[moduleKey] = (current[moduleKey] || 1) + 1
  tenantRevisions.set(cccCode, current)
}

export const GET = withTenant(async function GET(req: NextRequest) {
  const context = getTenantContext()
  const cccCode = context?.cccCode || "DEFAULT"

  const revisions = tenantRevisions.get(cccCode) || {
    disconnection: 1,
    reconnection: 1,
    dd: 1,
    dtr: 1,
    safety: 1,
    misc_inspection: 1,
    nsc: 1,
    meter: 1,
    meter_replacement: 1,
    material: 1,
  }

  return NextResponse.json(
    {
      cccCode,
      serverTime: Date.now(),
      revisions,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=60",
      },
    }
  )
})
