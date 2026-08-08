import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import fs from "fs"
import path from "path"

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8")
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

async function debugKushida() {
  const masterSheetId = process.env.MASTER_CONFIG_SHEET?.trim()
  if (!masterSheetId) {
    console.error("No MASTER_CONFIG_SHEET")
    return
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const sheets = googleSheets({ version: "v4", auth })

  const regRes = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: "CCC_Registry!A1:E100",
  }).catch(() => null)

  const rows = regRes?.data?.values || []
  console.log("=== CCC REGISTRY TENANTS ===")
  for (const r of rows) {
    const cccCode = String(r[0] || "")
    const cccName = String(r[1] || "")
    const sheetId = String(r[2] || "")
    console.log(`CCC: ${cccCode} | Name: ${cccName} | SheetID: ${sheetId}`)

    if (sheetId && sheetId !== masterSheetId) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId }).catch(() => null)
        const sheetTabs = meta?.data?.sheets?.map((s) => s.properties?.title) || []
        console.log(`  Tabs in ${cccName} (${sheetId}):`, sheetTabs)

        for (const tab of sheetTabs) {
          if (tab.toLowerCase().includes("feed")) {
            const data = await sheets.spreadsheets.values.get({
              spreadsheetId: sheetId,
              range: `'${tab}'!A1:Z50`,
            }).catch(() => null)
            console.log(`  >>> FOUND FEEDBACK TAB "${tab}" in ${cccName}:`, data?.data?.values)
          }
        }
      } catch (err: any) {
        console.log(`  Error inspecting ${cccName}:`, err.message)
      }
    }
  }
}

debugKushida()
