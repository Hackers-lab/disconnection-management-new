import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { fetchApplications } from "@/lib/nsc-service"
import { _fetchSafetyTicketsRaw } from "@/lib/safety-service"
import { fetchDTRData } from "@/lib/dtr-service"
import { fetchAllMiscInspectionsRaw } from "@/lib/misc-inspection-service"
import { fetchReconnectionData } from "@/lib/reconnection-service"
import { fetchDDData } from "@/lib/dd-service"
import { fetchReplacements } from "@/lib/meter-replacement-service"
import { parseTs } from "@/lib/date-utils"

export const dynamic = "force-dynamic"

export interface BatchSyncSubscription {
  since_ts?: number
}

export interface BatchSyncRequest {
  subscriptions: Record<string, BatchSyncSubscription>
}

export const POST = withTenant(async function POST(req: NextRequest) {
  try {
    const body: BatchSyncRequest = await req.json().catch(() => ({ subscriptions: {} }))
    const subscriptions = body.subscriptions || {}
    const spreadsheetId = getSpreadsheetId()
    const serverTimestamp = Date.now()

    const results: Record<string, any> = {}

    // Process all module subscriptions in parallel
    await Promise.all(
      Object.entries(subscriptions).map(async ([moduleKey, sub]) => {
        const sinceTs = sub.since_ts || 0

        try {
          if (moduleKey === "nsc") {
            const authRes = await checkApiPermission("nsc", "read")
            if (authRes.authorized) {
              const all = await fetchApplications(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.agency)) return false
                if (!sinceTs) return true
                const recTs = Math.max(
                  parseTs(rec.createdAt || ""),
                  parseTs(rec.inspectedAt || ""),
                  parseTs(rec.finalizedAt || ""),
                  parseTs(rec.meterIssuedAt || ""),
                  parseTs(rec.connectionEffectedAt || ""),
                  parseTs(rec.receivedDate || "")
                )
                return recTs >= sinceTs
              })
              results.nsc = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          } else if (moduleKey === "safety") {
            const authRes = await checkApiPermission("safety", "read")
            if (authRes.authorized) {
              const all = await _fetchSafetyTicketsRaw(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.agency)) return false
                if (!sinceTs) return true
                const recTs = parseTs(rec.completionDate || rec.lastUpdated || rec.reportedDate || "")
                return recTs >= sinceTs
              })
              results.safety = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          } else if (moduleKey === "dtr") {
            const authRes = await checkApiPermission("dtr", "read")
            if (authRes.authorized) {
              const all = await fetchDTRData(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.auditAgency) && isAgencyScopeRestricted(session, rec.paintingAgency)) return false
                if (!sinceTs) return true
                const recTs = parseTs(rec.verifiedAt || rec.createdAt || "")
                return recTs >= sinceTs
              })
              results.dtr = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          } else if (moduleKey === "misc-inspection") {
            const authRes = await checkApiPermission("misc_inspection", "read")
            if (authRes.authorized) {
              const all = await fetchAllMiscInspectionsRaw(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.agency)) return false
                if (!sinceTs) return true
                const recTs = parseTs(rec.createdAt || rec.inspectedAt || "")
                return recTs >= sinceTs
              })
              results["misc-inspection"] = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          } else if (moduleKey === "reconnection") {
            const authRes = await checkApiPermission("reconnection", "read")
            if (authRes.authorized) {
              const all = await fetchReconnectionData(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.agency)) return false
                if (!sinceTs) return true
                const recTs = parseTs(rec.updatedAt || rec.createdAt || "")
                return recTs >= sinceTs
              })
              results.reconnection = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          } else if (moduleKey === "dd") {
            const authRes = await checkApiPermission("deemed", "read")
            if (authRes.authorized) {
              const all = await fetchDDData(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.agency)) return false
                if (!sinceTs) return true
                const recTs = parseTs(rec.disconDate || rec.createdAt || "")
                return recTs >= sinceTs
              })
              results.dd = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          } else if (moduleKey === "meter-replacement") {
            const authRes = await checkApiPermission("meter_replacement", "read")
            if (authRes.authorized) {
              const all = await fetchReplacements(spreadsheetId)
              const session = authRes.session
              const modified = all.filter((rec: any) => {
                if (isAgencyScopeRestricted(session, rec.agency)) return false
                if (!sinceTs) return true
                const recTs = parseTs(rec.proposedDate || "")
                return recTs >= sinceTs
              })
              results["meter-replacement"] = { patchCount: modified.length, patchData: modified, tombstones: [] }
            }
          }
        } catch (e) {
          console.error(`Batch sync error for ${moduleKey}:`, e)
        }
      })
    )

    return NextResponse.json(
      {
        serverTimestamp,
        results,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Batch sync failed" }, { status: 500 })
  }
})
