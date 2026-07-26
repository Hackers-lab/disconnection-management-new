import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { issueMeter } from "@/lib/meter-service"
import { updateNSCMeterIssued } from "@/lib/nsc-service"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export interface BulkNscRow {
  applicationNo: string
  applicantName: string
  address?: string
  mobile?: string
  agency: string
  workOrderNo: string
  serialNo: string
  remarks?: string
}

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { rows }: { rows: BulkNscRow[] } = await request.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No valid rows provided" }, { status: 400 })
    }

    const results = []
    const errors = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNum = i + 1

      if (!r.serialNo || !r.serialNo.trim()) {
        errors.push(`Row ${rowNum}: Serial number is required`)
        continue
      }
      if (!r.agency || !r.agency.trim()) {
        errors.push(`Row ${rowNum}: Agency is required`)
        continue
      }
      if (!r.workOrderNo || !r.workOrderNo.trim()) {
        errors.push(`Row ${rowNum}: Work Order Number is required`)
        continue
      }

      const appNo = (r.applicationNo || "").trim()
      const name = (r.applicantName || "").trim()

      try {
        const issueId = await issueMeter({
          serialNo:     r.serialNo.trim(),
          purpose:      "nsc",
          consumerId:   appNo,
          nscReceiveNo: appNo,
          consumerName: name,
          agency:       r.agency.trim(),
          workOrderNo:   r.workOrderNo.trim(),
          address:      r.address || "",
          mobile:       r.mobile || "",
          remarks:      r.remarks || "Bulk NSC Excel Upload",
        })

        if (appNo) {
          await updateNSCMeterIssued(appNo, r.serialNo.trim(), r.agency.trim())
        }

        results.push({ rowNum, issueId, appNo, serialNo: r.serialNo })
      } catch (err: any) {
        errors.push(`Row ${rowNum} (${r.serialNo}): ${err.message || "Failed to issue"}`)
      }
    }

    return NextResponse.json({
      success: true,
      issuedCount: results.length,
      results,
      errors,
    })
  } catch (e: any) {
    console.error("Bulk NSC issue error:", e)
    return NextResponse.json({ error: e.message || "Failed to process bulk upload" }, { status: 500 })
  }
})
