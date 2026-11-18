import { NextRequest, NextResponse } from "next/server"
import { sheets, getSpreadsheetId } from "@/lib/google-sheets-api"
import { verifySession } from "@/lib/session"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { compactBaseVersion } from "@/lib/version-engine"
import { syncConsumersWithZoneMap } from "@/lib/zone-map-sync"

export const maxDuration = 60

const TAB = "AgencyZoneMap"
const HISTORY_TAB = "ZoneMapHistory"

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`
}

async function ensureTabsExist(spreadsheetId: string, tabs: { title: string; headers: string[] }[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existingTitles = new Set(meta.data.sheets?.map(s => s.properties?.title) || [])
  const missingTabs = tabs.filter(t => !existingTitles.has(t.title))

  if (missingTabs.length > 0) {
    // 1. Create missing sheets in 1 batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missingTabs.map(t => ({
          addSheet: { properties: { title: t.title } }
        }))
      },
    })
    // 2. Set headers in parallel
    await Promise.all(
      missingTabs.map(t =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${t.title}'!A1`,
          valueInputOption: "RAW",
          requestBody: { values: [t.headers] },
        })
      )
    )
  }
}

// Normalise an MRU/zone value: trim + uppercase. No truncation — store full MRU.
const normMru = (s: string) => (s || "").trim().toUpperCase()

type ZoneRow = { zone: string; agency: string; address?: string; updatedOn?: string }

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const id = getSpreadsheetId()
    await ensureTabsExist(id, [{ title: TAB, headers: ["MRU", "Agency", "Address", "Updated On"] }])
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${TAB}'!A:D` })
    const rows = (resp.data.values || []).slice(1)
    const data: ZoneRow[] = rows
      .map(r => ({
        zone:      normMru(String(r[0] || "")),
        agency:    normMru(String(r[1] || "")),
        address:   String(r[2] || "").trim(),
        updatedOn: String(r[3] || "").trim(),
      }))
      .filter(r => r.zone && r.agency)
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, s-maxage=120, stale-while-revalidate=600",
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
})

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { rows, clearHistory } = await request.json() as { rows: ZoneRow[]; clearHistory?: boolean }
    
    // Safety guard: Limit to 500 zones per CCC to prevent accidental consumer ID list uploads
    if (rows && rows.length > 500) {
      return NextResponse.json({
        error: `Zone map limit exceeded: Received ${rows.length} entries (Maximum limit: 500). Please ensure you are uploading MRU/Zone codes, not Consumer IDs.`,
      }, { status: 400 })
    }

    const id = getSpreadsheetId()

    await ensureTabsExist(id, [
      { title: TAB, headers: ["MRU", "Agency", "Address", "Updated On"] },
      { title: HISTORY_TAB, headers: ["Date", "MRU", "Previous Agency", "New Agency", "Changed By"] },
    ])

    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${TAB}'!A:D` })
    const existingRows = (existing.data.values || []).slice(1)
    const existingMap = new Map<string, { agency: string; address: string }>()
    existingRows.forEach(r => {
      const mru = normMru(String(r[0] || ""))
      const a   = normMru(String(r[1] || ""))
      if (mru) existingMap.set(mru, { agency: a, address: String(r[2] || "").trim() })
    })

    const historyEntries: string[][] = []
    const date = todayStr()
    const changedBy = session.userId || "admin"

    ;(rows || []).forEach(r => {
      const mru    = normMru(r.zone   || "")
      const agency = normMru(r.agency || "")
      const prev = existingMap.get(mru)
      if (prev && prev.agency !== agency) {
        historyEntries.push([date, mru, prev.agency, agency, changedBy])
      } else if (!prev && agency) {
        historyEntries.push([date, mru, "", agency, changedBy])
      }
    })

    // Prepare batch update
    const batchUpdates: any[] = []

    // 1. Clear existing rows
    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `'${TAB}'!A2:D` })

    // 2. Write new mappings
    if (rows && rows.length > 0) {
      batchUpdates.push({
        range: `'${TAB}'!A2:D`,
        values: rows.map(r => [
          normMru(r.zone    || ""),
          normMru(r.agency  || ""),
          (r.address || "").trim(),
          date,
        ]),
      })
    }

    if (batchUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          valueInputOption: "RAW",
          data: batchUpdates,
        },
      })
    }

    // 3. Clear or append history
    if (clearHistory) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `'${HISTORY_TAB}'!A2:E` })
    } else if (historyEntries.length > 0) {
      sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: `'${HISTORY_TAB}'!A:E`,
        valueInputOption: "RAW",
        requestBody: { values: historyEntries },
      }).catch(err => console.warn("ZoneMapHistory append error:", err))
    }

    // 4. Invalidate and bump base version for zone-map across all clients
    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || session.cccCode || "default"
    compactBaseVersion(tenantId, "zone-map").catch(err =>
      console.warn("compactBaseVersion error for zone-map:", err)
    )

    // 5. Automatically re-sync existing consumers in the main Google Sheet
    // and bump consumer version if any consumers were reassigned
    let resyncSummary = null
    try {
      const zoneAgencyMap = new Map<string, string>()
      ;(rows || []).forEach(r => {
        const z = normMru(r.zone || "")
        const a = normMru(r.agency || "")
        if (z && a) zoneAgencyMap.set(z, a)
      })

      resyncSummary = await syncConsumersWithZoneMap({
        spreadsheetId: id,
        changedBy: session.userId || "admin",
        tenantId,
        zoneAgencyMap,
      })
    } catch (syncErr) {
      console.warn("Auto-sync consumers with zone map error:", syncErr)
    }

    return NextResponse.json({
      success: true,
      count: rows.length,
      historyEntries: historyEntries.length,
      summary: resyncSummary,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
})
