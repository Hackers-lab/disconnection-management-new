import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"

export const dynamic = "force-dynamic"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const FEEDBACK_TAB = "Feedbacks"
const HEADERS = ["ID", "Username", "Name", "Supply Office", "CCC Code", "Rating", "Comment", "Status", "CreatedAt"]

async function getSheetsClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return googleSheets({ version: "v4", auth: auth as any })
}

async function ensureFeedbackTab(sheets: any) {
  if (!SHEET_ID) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = (meta.data.sheets || []).map((s: any) => s.properties?.title)
  if (!existing.includes(FEEDBACK_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: FEEDBACK_TAB } } }],
      },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${FEEDBACK_TAB}!A1:I1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!SHEET_ID) {
      return NextResponse.json({ feedback: null })
    }

    const sheets = await getSheetsClient()
    await ensureFeedbackTab(sheets)

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${FEEDBACK_TAB}!A1:I1000`,
    })

    const rows = res.data.values || []
    if (rows.length < 2) {
      return NextResponse.json({ feedback: null })
    }

    const headerRow = rows[0].map((h: string) => String(h || "").trim().toLowerCase())
    const idIdx = headerRow.findIndex((h) => h.includes("id")) >= 0 ? headerRow.findIndex((h) => h.includes("id")) : 0
    const userIdx = headerRow.findIndex((h) => h.includes("user")) >= 0 ? headerRow.findIndex((h) => h.includes("user")) : 1
    const nameIdx = headerRow.findIndex((h) => h.includes("name")) >= 0 ? headerRow.findIndex((h) => h.includes("name")) : 2
    const officeIdx = headerRow.findIndex((h) => h.includes("office") || h.includes("supply")) >= 0 ? headerRow.findIndex((h) => h.includes("office") || h.includes("supply")) : 3
    const cccIdx = headerRow.findIndex((h) => h.includes("ccc")) >= 0 ? headerRow.findIndex((h) => h.includes("ccc")) : 4
    const ratingIdx = headerRow.findIndex((h) => h.includes("rating")) >= 0 ? headerRow.findIndex((h) => h.includes("rating")) : 5
    const commentIdx = headerRow.findIndex((h) => h.includes("comment") || h.includes("text") || h.includes("feedback")) >= 0 ? headerRow.findIndex((h) => h.includes("comment") || h.includes("text") || h.includes("feedback")) : 6

    const dataRows = rows.slice(1)
    const userFeedback = dataRows.find(
      (r: string[]) =>
        String(r[userIdx] || "").trim().toLowerCase() === String(session.username || "").trim().toLowerCase() ||
        (session.cccCode && String(r[cccIdx] || "").trim().toUpperCase() === String(session.cccCode || "").trim().toUpperCase())
    )

    if (!userFeedback) {
      return NextResponse.json({ feedback: null })
    }

    return NextResponse.json({
      feedback: {
        id: userFeedback[idIdx] || "",
        cccCode: userFeedback[cccIdx] || session.cccCode,
        username: userFeedback[userIdx] || session.username,
        name: userFeedback[nameIdx] || session.username,
        supplyOffice: userFeedback[officeIdx] || session.cccCode,
        rating: Number(userFeedback[ratingIdx] || 5),
        category: "General",
        feedbackText: userFeedback[commentIdx] || "",
      },
    })
  } catch (e: any) {
    console.error("GET Feedback Error:", e)
    return NextResponse.json({ error: e.message || "Failed to fetch feedback" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const rating = Number(body.rating || 5)
    const feedbackText = String(body.feedbackText || body.comment || "").trim()

    if (!feedbackText) {
      return NextResponse.json({ error: "Feedback text is required" }, { status: 400 })
    }

    if (!SHEET_ID) {
      return NextResponse.json({ error: "MASTER_CONFIG_SHEET not configured" }, { status: 500 })
    }

    const sheets = await getSheetsClient()
    await ensureFeedbackTab(sheets)

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${FEEDBACK_TAB}!A1:I1000`,
    })

    const rows = res.data.values || []
    const now = new Date().toISOString()
    const cccCode = String(session.cccCode || "MAIN").trim()
    const username = String(session.username).trim()
    const name = String((session as any).name || (session as any).agencyName || username).trim()
    const supplyOffice = String((session as any).supplyOffice || `${cccCode} CCC`).trim()

    let headerRow: string[] = []
    let idIdx = 0, userIdx = 1, nameIdx = 2, officeIdx = 3, cccIdx = 4, ratingIdx = 5, commentIdx = 6, statusIdx = 7, dateIdx = 8

    if (rows.length > 0) {
      headerRow = rows[0].map((h: string) => String(h || "").trim().toLowerCase())
      if (headerRow.findIndex((h) => h.includes("id")) >= 0) idIdx = headerRow.findIndex((h) => h.includes("id"))
      if (headerRow.findIndex((h) => h.includes("user")) >= 0) userIdx = headerRow.findIndex((h) => h.includes("user"))
      if (headerRow.findIndex((h) => h.includes("name")) >= 0) nameIdx = headerRow.findIndex((h) => h.includes("name"))
      if (headerRow.findIndex((h) => h.includes("office") || h.includes("supply")) >= 0) officeIdx = headerRow.findIndex((h) => h.includes("office") || h.includes("supply"))
      if (headerRow.findIndex((h) => h.includes("ccc")) >= 0) cccIdx = headerRow.findIndex((h) => h.includes("ccc"))
      if (headerRow.findIndex((h) => h.includes("rating")) >= 0) ratingIdx = headerRow.findIndex((h) => h.includes("rating"))
      if (headerRow.findIndex((h) => h.includes("comment") || h.includes("text") || h.includes("feedback")) >= 0) commentIdx = headerRow.findIndex((h) => h.includes("comment") || h.includes("text") || h.includes("feedback"))
      if (headerRow.findIndex((h) => h.includes("status")) >= 0) statusIdx = headerRow.findIndex((h) => h.includes("status"))
      if (headerRow.findIndex((h) => h.includes("date") || h.includes("created") || h.includes("submitted")) >= 0) dateIdx = headerRow.findIndex((h) => h.includes("date") || h.includes("created") || h.includes("submitted"))
    }

    const dataRows = rows.slice(1)
    const rowIndex = dataRows.findIndex((r: string[]) => {
      const rUser = String(r[userIdx] || "").trim().toLowerCase()
      const rCcc = String(r[cccIdx] || "").trim().toUpperCase()
      return rUser === username.toLowerCase() || (cccCode && rCcc === cccCode.toUpperCase())
    })

    if (rowIndex >= 0) {
      const sheetRowNumber = rowIndex + 2
      const existingRow = dataRows[rowIndex] || []
      const id = existingRow[idIdx] || `fb-${Date.now()}`
      const createdDate = existingRow[dateIdx] || now

      // Construct aligned 9-column row
      const updatedRow = new Array(9).fill("")
      updatedRow[idIdx] = id
      updatedRow[userIdx] = username
      updatedRow[nameIdx] = name
      updatedRow[officeIdx] = supplyOffice
      updatedRow[cccIdx] = cccCode
      updatedRow[ratingIdx] = rating
      updatedRow[commentIdx] = feedbackText
      updatedRow[statusIdx] = "approved"
      updatedRow[dateIdx] = createdDate

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${FEEDBACK_TAB}!A${sheetRowNumber}:I${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [updatedRow],
        },
      })
    } else {
      const id = `fb-${Date.now()}`
      const newRow = new Array(9).fill("")
      newRow[idIdx] = id
      newRow[userIdx] = username
      newRow[nameIdx] = name
      newRow[officeIdx] = supplyOffice
      newRow[cccIdx] = cccCode
      newRow[ratingIdx] = rating
      newRow[commentIdx] = feedbackText
      newRow[statusIdx] = "approved"
      newRow[dateIdx] = now

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${FEEDBACK_TAB}!A:I`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [newRow],
        },
      })
    }

    return NextResponse.json({ success: true, message: "Feedback saved to Master Registry" })
  } catch (e: any) {
    console.error("POST Feedback Error:", e)
    return NextResponse.json({ error: e.message || "Failed to save feedback" }, { status: 500 })
  }
}
