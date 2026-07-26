import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import {
  getMiscInspections,
  createMiscInspection,
} from "@/lib/misc-inspection-service"
import type { CreateMiscInspectionInput } from "@/lib/misc-inspection-types"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = withTenant(async function GET(req: NextRequest) {
  const authRes = await checkApiPermission("misc_inspection", "read")
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const allRecords = await getMiscInspections()
    const session = authRes.session

    // Filter by agency scope if restricted
    const filtered = allRecords.filter(rec => {
      if (isAgencyScopeRestricted(session, rec.agency)) {
        return false
      }
      return true
    })

    return NextResponse.json(filtered)
  } catch (error: any) {
    console.error("GET /api/misc-inspection error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch misc inspections" },
      { status: 500 }
    )
  }
})

export const POST = withTenant(async function POST(req: NextRequest) {
  const authRes = await checkApiPermission("misc_inspection", ["create", "update"])
  if (!authRes.authorized) {
    return NextResponse.json({ error: authRes.error }, { status: authRes.status || 403 })
  }

  try {
    const body: CreateMiscInspectionInput = await req.json()
    
    if (!body.title || !body.category || !body.agency) {
      return NextResponse.json(
        { error: "Title, Category, and Agency are required" },
        { status: 400 }
      )
    }

    const createdBy = authRes.session.userId || authRes.session.username || authRes.session.role || "Admin"
    const newRecord = await createMiscInspection(body, createdBy)

    return NextResponse.json(newRecord, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/misc-inspection error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create misc inspection" },
      { status: 500 }
    )
  }
})
