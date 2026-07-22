import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"

export const dynamic = "force-dynamic"

const getSheetsClient = () => {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  return googleSheets({ version: "v4", auth })
}

// Server memory cache for per-tenant stats (60s TTL)
let statsCache: { timestamp: number; data: Record<string, { dcCount: number; zoneCount: number }> } | null = null
const TTL_MS = 60 * 1000

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const cccCodeParam = searchParams.get("cccCode")

    if (statsCache && Date.now() - statsCache.timestamp < TTL_MS && !cccCodeParam) {
      return NextResponse.json(statsCache.data)
    }

    const tenants = await getTenantRegistry()
    const result: Record<string, { dcCount: number; zoneCount: number }> = {}

    // Initialize all registered tenants with 0
    Object.keys(tenants).forEach(code => {
      result[code] = { dcCount: 0, zoneCount: 0 }
    })

    const targetCodes = cccCodeParam ? [cccCodeParam] : Object.keys(tenants)

    // Best-effort stats fetch for linked spreadsheets
    try {
      const sheets = getSheetsClient()
      for (const code of targetCodes) {
        const tenant = tenants[code]
        if (!tenant || !tenant.spreadsheetId) continue

        try {
          const meta = await sheets.spreadsheets.get({ spreadsheetId: tenant.spreadsheetId })
          const sheetTabs = meta.data.sheets || []

          const dcSheet = sheetTabs.find(s => s.properties?.title === "Sheet1" || s.properties?.title === "Disconnection")
          const zoneSheet = sheetTabs.find(s => s.properties?.title === "AgencyZoneMap")

          let dcCount = 0
          let zoneCount = 0

          if (dcSheet) {
            const resp = await sheets.spreadsheets.values.get({
              spreadsheetId: tenant.spreadsheetId,
              range: `'${dcSheet.properties?.title}'!C2:C`,
            })
            dcCount = (resp.data.values || []).filter(r => r && r[0] && String(r[0]).trim()).length
          }

          if (zoneSheet) {
            const resp = await sheets.spreadsheets.values.get({
              spreadsheetId: tenant.spreadsheetId,
              range: `'${zoneSheet.properties?.title}'!A2:A`,
            })
            zoneCount = (resp.data.values || []).filter(r => r && r[0] && String(r[0]).trim()).length
          }

          result[code] = { dcCount, zoneCount }
        } catch {
          // If sheet fails or lacks permission, retain 0
        }
      }
    } catch (e: any) {
      console.error("Superuser stats fetch error:", e?.message)
    }

    if (!cccCodeParam) {
      statsCache = { timestamp: Date.now(), data: result }
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
