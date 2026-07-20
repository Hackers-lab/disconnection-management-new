import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import {
  fetchStock, fetchIssues, getStockSummary,
  addMeterStock, METER_TYPES,
} from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const id = getSpreadsheetId()
  const [summary, stock, issues] = await Promise.all([
    getStockSummary(id),
    fetchStock(id),
    fetchIssues(id),
  ])
  return NextResponse.json({ summary, stock, issues }, {
    headers: { "Cache-Control": "no-store" },
  })
})
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    const { meters } = body
    if (!Array.isArray(meters) || meters.length === 0) {
      return NextResponse.json({ error: "No meters provided" }, { status: 400 })
    }
    // Validate type labels
    const validLabels = new Set(METER_TYPES.map(t => t.label))
    for (const m of meters) {
      if (!m.serialNo?.trim()) return NextResponse.json({ error: `Missing serial number` }, { status: 400 })
      if (!validLabels.has(m.typeLabel)) return NextResponse.json({ error: `Invalid type: ${m.typeLabel}` }, { status: 400 })
    }
    const added = await addMeterStock(meters)
    return NextResponse.json({ success: true, added })
  } catch (e: any) {
    console.error("Add stock error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
