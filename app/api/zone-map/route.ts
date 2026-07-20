import { NextRequest, NextResponse } from "next/server"
import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"

const TAB = "AgencyZoneMap"
const HISTORY_TAB = "ZoneMapHistory"
const sheets = googleSheets({ version: "v4", auth })

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`
}

async function ensureTab(spreadsheetId: string, title: string, headers: string[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === title)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    })
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
    // Header uses "MRU" — full MRU stored, no truncation.
    await ensureTab(id, TAB, ["MRU", "Agency", "Address", "Updated On"])
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${TAB}!A:D` })
    const rows = (resp.data.values || []).slice(1)
    const data: ZoneRow[] = rows
      .map(r => ({
        zone:      normMru(String(r[0] || "")),
        agency:    normMru(String(r[1] || "")),
        address:   String(r[2] || "").trim(),
        updatedOn: String(r[3] || "").trim(),
      }))
      .filter(r => r.zone && r.agency)
    return NextResponse.json(data)
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
    const { rows } = await request.json() as { rows: ZoneRow[] }
    const id = getSpreadsheetId()

    await Promise.all([
      ensureTab(id, TAB, ["MRU", "Agency", "Address", "Updated On"]),
      ensureTab(id, HISTORY_TAB, ["Date", "MRU", "Previous Agency", "New Agency", "Changed By"]),
    ])

    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${TAB}!A:D` })
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

    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `${TAB}!A2:D` })
    if (rows && rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${TAB}!A2:D`,
        valueInputOption: "RAW",
        requestBody: {
          values: rows.map(r => [
            normMru(r.zone    || ""),
            normMru(r.agency  || ""),
            (r.address || "").trim(),
            date,
          ]),
        },
      })
    }

    if (historyEntries.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: id, range: `${HISTORY_TAB}!A:E`,
        valueInputOption: "RAW",
        requestBody: { values: historyEntries },
      })
    }

    return NextResponse.json({ success: true, historyEntries: historyEntries.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
})
