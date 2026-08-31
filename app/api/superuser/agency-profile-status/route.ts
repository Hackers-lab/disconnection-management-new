import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { db } from "@/lib/db"
import { invalidateAgencyCache } from "@/lib/agency-storage"

export const dynamic = "force-dynamic"

export interface AgencyStatusItem {
  id: number | string
  name: string
  cccId?: number | null
  cccCode: string
  cccName: string
  vendorCode: string | null
  vendorCodeValid: boolean
  mobileNumber: string | null
  mobileNumberValid: boolean
  contactPerson: string | null
  email: string | null
  isActive: boolean
  updatedAt?: string | null
}

export interface CCCProfileSummary {
  cccCode: string
  cccName: string
  totalAgencies: number
  fullyCompleted: number
  pending: number
  vendorCodeCompleted: number
  mobileNumberCompleted: number
  completionRate: number
}

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const res = await db.execute({
      sql: `SELECT a.id, a.name, a.vendor_code, a.contact_person, a.mobile_number, a.email, a.is_active, a.updated_at, a.ccc_id, c.ccc_code, c.ccc_name
            FROM agencies a
            LEFT JOIN ccc_registry c ON a.ccc_id = c.id
            ORDER BY c.ccc_name ASC, a.name ASC`
    })

    const rows = res.rows || []
    let totalVendorValid = 0
    let totalMobileValid = 0
    let totalBothValid = 0
    let totalFullyPending = 0

    const cccMap: Record<string, CCCProfileSummary> = {}

    const agencies: AgencyStatusItem[] = rows.map((r: any) => {
      const vc = String(r.vendor_code || "").trim()
      const mob = String(r.mobile_number || "").trim()

      const isVcValid = vc.length > 0 && /^\d{6}$/.test(vc)
      const isMobValid = mob.length > 0 && /^\d{10}$/.test(mob)
      const isBothValid = isVcValid && isMobValid
      const isBothPending = !isVcValid && !isMobValid

      if (isVcValid) totalVendorValid++
      if (isMobValid) totalMobileValid++
      if (isBothValid) totalBothValid++
      if (isBothPending) totalFullyPending++

      const cccCode = String(r.ccc_code || "UNKNOWN")
      const cccName = String(r.ccc_name || "Unassigned CCC")

      if (!cccMap[cccCode]) {
        cccMap[cccCode] = {
          cccCode,
          cccName,
          totalAgencies: 0,
          fullyCompleted: 0,
          pending: 0,
          vendorCodeCompleted: 0,
          mobileNumberCompleted: 0,
          completionRate: 0
        }
      }

      cccMap[cccCode].totalAgencies++
      if (isVcValid) cccMap[cccCode].vendorCodeCompleted++
      if (isMobValid) cccMap[cccCode].mobileNumberCompleted++
      if (isBothValid) cccMap[cccCode].fullyCompleted++
      else cccMap[cccCode].pending++

      return {
        id: r.id,
        name: String(r.name || ""),
        cccId: r.ccc_id,
        cccCode,
        cccName,
        vendorCode: r.vendor_code ? String(r.vendor_code) : null,
        vendorCodeValid: isVcValid,
        mobileNumber: r.mobile_number ? String(r.mobile_number) : null,
        mobileNumberValid: isMobValid,
        contactPerson: r.contact_person ? String(r.contact_person) : null,
        email: r.email ? String(r.email) : null,
        isActive: r.is_active === 1 || r.is_active === true,
        updatedAt: r.updated_at ? String(r.updated_at) : null
      }
    })

    const totalAgencies = agencies.length
    const cccList = Object.values(cccMap).map(c => ({
      ...c,
      completionRate: c.totalAgencies > 0 ? Math.round((c.fullyCompleted / c.totalAgencies) * 100) : 0
    }))

    const summary = {
      totalAgencies,
      activeAgencies: agencies.filter(a => a.isActive).length,
      inactiveAgencies: agencies.filter(a => !a.isActive).length,
      fullyCompleted: totalBothValid,
      completionPercentage: totalAgencies > 0 ? Number(((totalBothValid / totalAgencies) * 100).toFixed(1)) : 0,
      totalPending: totalAgencies - totalBothValid,
      pendingPercentage: totalAgencies > 0 ? Number((((totalAgencies - totalBothValid) / totalAgencies) * 100).toFixed(1)) : 0,
      vendorCode: {
        completed: totalVendorValid,
        pending: totalAgencies - totalVendorValid,
        percentage: totalAgencies > 0 ? Number(((totalVendorValid / totalAgencies) * 100).toFixed(1)) : 0
      },
      mobileNumber: {
        completed: totalMobileValid,
        pending: totalAgencies - totalMobileValid,
        percentage: totalAgencies > 0 ? Number(((totalMobileValid / totalAgencies) * 100).toFixed(1)) : 0
      },
      partiallyCompleted: totalAgencies - totalBothValid - totalFullyPending,
      fullyPending: totalFullyPending,
      totalCCCs: cccList.length,
      completedCCCs: cccList.filter(c => c.pending === 0 && c.totalAgencies > 0).length,
      pendingCCCs: cccList.filter(c => c.pending > 0).length
    }

    return NextResponse.json({
      summary,
      cccList,
      agencies
    })
  } catch (error: any) {
    console.error("Superuser agency status fetch error:", error)
    return NextResponse.json({ error: error.message || "Failed to load agency status" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { agencyId, vendorCode, mobileNumber, contactPerson, email, isActive } = body

    if (!agencyId) {
      return NextResponse.json({ error: "Agency ID is required" }, { status: 400 })
    }

    // Update in database
    await db.execute({
      sql: `UPDATE agencies 
            SET vendor_code = COALESCE(?, vendor_code),
                mobile_number = COALESCE(?, mobile_number),
                contact_person = COALESCE(?, contact_person),
                email = COALESCE(?, email),
                is_active = COALESCE(?, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [
        vendorCode !== undefined ? (vendorCode || null) : null,
        mobileNumber !== undefined ? (mobileNumber || null) : null,
        contactPerson !== undefined ? (contactPerson || null) : null,
        email !== undefined ? (email || null) : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        agencyId
      ]
    })

    // Invalidate global caches
    try {
      invalidateAgencyCache()
    } catch {
      // Best effort
    }

    return NextResponse.json({
      success: true,
      message: "Agency details updated successfully"
    })
  } catch (error: any) {
    console.error("Superuser agency update error:", error)
    return NextResponse.json({ error: error.message || "Failed to update agency" }, { status: 500 })
  }
}
