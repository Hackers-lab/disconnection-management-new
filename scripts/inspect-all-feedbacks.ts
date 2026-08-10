import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import fs from "fs"
import path from "path"

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

async function inspectAllFeedbacks() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const sheets = googleSheets({ version: "v4", auth: auth as any })
  const masterSheetId = process.env.MASTER_CONFIG_SHEET!

  console.log("=== MASTER CONFIG SHEET FEEDBACKS TAB ===")
  const masterRes = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: "'Feedbacks'!A1:Z500",
  }).catch(() => null)
  console.log("Master Rows:", JSON.stringify(masterRes?.data?.values, null, 2))

  const regRes = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: "CCC_Registry!A1:E100",
  }).catch(() => null)

  const rows = regRes?.data?.values || []
  for (const r of rows) {
    const cccName = String(r[1] || "")
    const sheetId = String(r[2] || "")
    if (!sheetId || sheetId === masterSheetId) continue

    const fbData = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "'Feedbacks'!A1:Z500",
    }).catch(() => null)

    if (fbData?.data?.values && fbData.data.values.length > 0) {
      console.log(`=== TENANT ${cccName} (${sheetId}) FEEDBACKS ===`)
      console.log(JSON.stringify(fbData.data.values, null, 2))
    }
  }
}

inspectAllFeedbacks()
