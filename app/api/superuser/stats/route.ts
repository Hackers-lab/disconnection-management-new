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
    const result: Record<string, { dcCount: number; zoneCount: number }> = statsCache?.data
      ? { ...statsCache.data }
      : {}

    // Initialize all registered tenants with 0 if not present
    Object.keys(tenants).forEach((code) => {
      if (!result[code]) {
        result[code] = { dcCount: 0, zoneCount: 0 }
      }
    })

    const targetCodes = cccCodeParam ? [cccCodeParam] : Object.keys(tenants)

    try {
      const sheets = getSheetsClient()
      const chunkSize = 12

      for (let i = 0; i < targetCodes.length; i += chunkSize) {
        const chunk = targetCodes.slice(i, i + chunkSize)
        await Promise.allSettled(
          chunk.map(async (code) => {
            const tenant = tenants[code]
            if (!tenant || !tenant.spreadsheetId) return

            try {
              // Lightweight fetch: ONLY tab titles and rowCount metadata, NO cell data
              const meta = await sheets.spreadsheets.get({
                spreadsheetId: tenant.spreadsheetId,
                fields: "sheets(properties(title,gridProperties(rowCount)))",
              })

              const sheetTabs = meta.data.sheets || []

              const dcSheet = sheetTabs.find((s) =>
                /^(sheet\s*1|disconnection|dc|consumers?|consumer_master|data)$/i.test(
                  s.properties?.title || ""
                )
              )

              const zoneSheet = sheetTabs.find((s) =>
                /^(agencyzonemap|agency_zone_map|zonemap|zone_map|agencyzone|agency_zone|zones?)$/i.test(
                  s.properties?.title || ""
                )
              )

              let dcCount = 0
              let zoneCount = 0

              if (dcSheet) {
                const rawRows = dcSheet.properties?.gridProperties?.rowCount || 0
                dcCount = Math.max(0, rawRows > 1 ? rawRows - 1 : rawRows)
              }

              if (zoneSheet) {
                const rawRows = zoneSheet.properties?.gridProperties?.rowCount || 0
                zoneCount = Math.max(0, rawRows > 1 ? rawRows - 1 : rawRows)
              }

              result[code] = { dcCount, zoneCount }
            } catch (err: any) {
              // If single tenant sheet lacks permission or is unreachable, keep default
              if (!result[code]) {
                result[code] = { dcCount: 0, zoneCount: 0 }
              }
            }
          })
        )
      }
    } catch (e: any) {
      console.error("Superuser stats fetch error:", e?.message)
    }

    if (!cccCodeParam) {
      statsCache = { timestamp: Date.now(), data: result }
    } else if (statsCache) {
      statsCache.data[cccCodeParam] = result[cccCodeParam]
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
