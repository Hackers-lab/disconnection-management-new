import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import fs from "fs"
import path from "path"

// Automatically load .env.local if present
try {
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
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
} catch (e) {
  // ignore env reading errors
}

async function runMigration() {
  console.log("🚀 Starting Feedback Migration to Master Config Sheet...")

  const masterSheetId = process.env.MASTER_CONFIG_SHEET?.trim()
  if (!masterSheetId) {
    console.error("❌ MASTER_CONFIG_SHEET environment variable is not defined.")
    process.exit(1)
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const sheets = googleSheets({ version: "v4", auth })

  // 1. Gather all candidate spreadsheet IDs (Master Config registry + default DISCONNECTION_SHEET + USERS_SHEET)
  const candidateSheetIds = new Set<string>()

  if (process.env.DISCONNECTION_SHEET) candidateSheetIds.add(process.env.DISCONNECTION_SHEET.trim())
  if (process.env.USERS_SHEET) candidateSheetIds.add(process.env.USERS_SHEET.trim())

  try {
    const regRes = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: "CCC_Registry!C2:C100",
    }).catch(() => null)

    const registryRows = regRes?.data?.values || []
    for (const row of registryRows) {
      const sheetId = String(row[0] || "").trim()
      if (sheetId && sheetId !== masterSheetId) {
        candidateSheetIds.add(sheetId)
      }
    }
  } catch (e: any) {
    console.warn("Could not fetch CCC_Registry list:", e.message || e)
  }

  console.log(`🔍 Found ${candidateSheetIds.size} potential tenant/source spreadsheets to check...`)

  // Ensure 'Feedbacks' tab exists in Master Sheet
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: masterSheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: "Feedbacks" } } }],
    },
  }).catch(() => {})

  // Get existing feedback IDs in Master Sheet
  const masterRes = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: "'Feedbacks'!A1:Z500",
  }).catch(() => null)

  const masterRows = masterRes?.data?.values || []
  const existingMasterUsernames = new Set<string>()

  if (masterRows.length === 0) {
    // Write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSheetId,
      range: "'Feedbacks'!A1:I1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["ID", "Username", "Name", "Supply Office", "CCC Code", "Rating", "Comment", "Status", "CreatedAt"]],
      },
    })
  } else {
    for (let i = 1; i < masterRows.length; i++) {
      const u = String(masterRows[i]?.[1] || "").trim().toLowerCase()
      if (u) existingMasterUsernames.add(u)
    }
  }

  let totalMigrated = 0

  for (const sheetId of Array.from(candidateSheetIds)) {
    if (sheetId === masterSheetId) continue
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "'Feedbacks'!A1:Z500",
      }).catch(() => null)

      const rows = res?.data?.values || []
      if (rows.length === 0) continue

      console.log(`📋 Found ${rows.length} feedback rows in spreadsheet ${sheetId}`)

      const newRowsToAppend: string[][] = []

      // Check if row 0 is a header or data
      const firstRowCol1 = String(rows[0]?.[1] || "").trim().toLowerCase()
      const isHeader = firstRowCol1 === "username" || firstRowCol1 === "user" || String(rows[0]?.[0] || "").toLowerCase() === "id"
      const startIdx = isHeader ? 1 : 0

      for (let i = startIdx; i < rows.length; i++) {
        const r = rows[i] || []
        const u = String(r[1] || "").trim()
        const uLower = u.toLowerCase()
        const comment = String(r[6] || r[5] || "").trim()

        if (!comment || comment.toLowerCase() === "comment") continue
        if (uLower && existingMasterUsernames.has(uLower)) {
          console.log(` Skipping duplicate feedback for username "${u}"`)
          continue
        }

        newRowsToAppend.push([
          String(r[0] || `fb-migrated-${Date.now()}-${i}`),
          String(r[1] || "user"),
          String(r[2] || "Officer"),
          String(r[3] || "Supply Office"),
          String(r[4] || ""),
          String(r[5] || "5"),
          comment,
          String(r[7] || "approved"),
          String(r[8] || new Date().toISOString()),
        ])

        if (uLower) existingMasterUsernames.add(uLower)
      }

      if (newRowsToAppend.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: masterSheetId,
          range: "'Feedbacks'!A1",
          valueInputOption: "USER_ENTERED",
          requestBody: { values: newRowsToAppend },
        })
        totalMigrated += newRowsToAppend.length
        console.log(`✅ Migrated ${newRowsToAppend.length} items from ${sheetId}`)
      }
    } catch (err: any) {
      console.warn(`Could not read spreadsheet ${sheetId}:`, err.message || err)
    }
  }

  console.log(`🎉 Migration finished! Total feedbacks migrated to Master Config Sheet: ${totalMigrated}`)
}

runMigration().catch((e) => {
  console.error("Migration error:", e)
})
