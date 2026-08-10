import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth, OAuth2Client } from "google-auth-library"

export const dynamic = "force-dynamic"

const getMasterOAuthClient = () => {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return googleSheets({ version: "v4", auth: oauth })
  }
  return null
}

const getServiceAccountSheetsClient = () => {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  return googleSheets({ version: "v4", auth })
}

const getTenantSheetsClient = (refreshToken?: string) => {
  if (refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    oauth.setCredentials({ refresh_token: refreshToken })
    return googleSheets({ version: "v4", auth: oauth })
  }
  return null
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
      const masterSheets = getMasterOAuthClient()
      const serviceSheets = getServiceAccountSheetsClient()
      const chunkSize = 12

      for (let i = 0; i < targetCodes.length; i += chunkSize) {
        const chunk = targetCodes.slice(i, i + chunkSize)
        await Promise.allSettled(
          chunk.map(async (code) => {
            const tenant = tenants[code]
            if (!tenant || !tenant.spreadsheetId) return

            try {
              let client: any = getTenantSheetsClient(tenant.googleDriveRefreshToken) || masterSheets || serviceSheets
              let meta: any = null

              // 1. Try tenant's own decrypted OAuth token
              const tenantSheets = getTenantSheetsClient(tenant.googleDriveRefreshToken)
              if (tenantSheets) {
                try {
                  meta = await tenantSheets.spreadsheets.get({
                    spreadsheetId: tenant.spreadsheetId,
                    fields: "sheets(properties(title))",
                  })
                  client = tenantSheets
                } catch {
                  // Fall through to master OAuth
                }
              }

              // 2. Try master global OAuth token
              if (!meta && masterSheets) {
                try {
                  meta = await masterSheets.spreadsheets.get({
                    spreadsheetId: tenant.spreadsheetId,
                    fields: "sheets(properties(title))",
                  })
                  client = masterSheets
                } catch {
                  // Fall through to service account
                }
              }

              // 3. Try service account credentials
              if (!meta && serviceSheets) {
                try {
                  meta = await serviceSheets.spreadsheets.get({
                    spreadsheetId: tenant.spreadsheetId,
                    fields: "sheets(properties(title))",
                  })
                  client = serviceSheets
                } catch {
                  // Ignore
                }
              }

              if (!meta) {
                if (!result[code]) result[code] = { dcCount: 0, zoneCount: 0 }
                return
              }

              const sheetTabs = meta.data.sheets || []

              const dcSheet = sheetTabs.find((s: any) =>
                /^(sheet\s*1|disconnection|dc|consumers?|consumer_master|data)$/i.test(
                  s.properties?.title || ""
                )
              )

              const zoneSheet = sheetTabs.find((s: any) =>
                /^(agencyzonemap|agency_zone_map|zonemap|zone_map|agencyzone|agency_zone|zones?)$/i.test(
                  s.properties?.title || ""
                )
              )

              const rangesToQuery: string[] = []
              if (dcSheet) rangesToQuery.push(`'${dcSheet.properties?.title}'!A:A`)
              if (zoneSheet) rangesToQuery.push(`'${zoneSheet.properties?.title}'!A:A`)

              let dcCount = 0
              let zoneCount = 0

              if (rangesToQuery.length > 0) {
                try {
                  const batchRes = await client.spreadsheets.values.batchGet({
                    spreadsheetId: tenant.spreadsheetId,
                    ranges: rangesToQuery,
                    majorDimension: "ROWS",
                  })

                  const valueRanges = batchRes.data.valueRanges || []
                  valueRanges.forEach((vr: any) => {
                    const rangeName = vr.range || ""
                    const filledRows = (vr.values || []).filter(
                      (r: any) => r && r[0] && String(r[0]).trim() !== ""
                    )
                    // Subtract header row if length > 1
                    const count = Math.max(0, filledRows.length > 1 ? filledRows.length - 1 : 0)

                    if (dcSheet && rangeName.includes(dcSheet.properties?.title)) {
                      dcCount = count
                    } else if (zoneSheet && rangeName.includes(zoneSheet.properties?.title)) {
                      zoneCount = count
                    }
                  })
                } catch (batchErr: any) {
                  console.error(`Batch query error for ${code}:`, batchErr?.message)
                }
              }

              result[code] = { dcCount, zoneCount }
            } catch (err: any) {
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
