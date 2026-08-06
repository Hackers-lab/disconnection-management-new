import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"

export const dynamic = "force-dynamic"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const FEEDBACK_TAB = "Feedbacks"
const HEADERS = ["CCC Code", "Username", "Rating", "Category", "Feedback Text", "Submitted At", "Updated At"]

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
      range: `${FEEDBACK_TAB}!A1:G1`,
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
      range: `${FEEDBACK_TAB}!A2:G1000`,
    })

    const rows = res.data.values || []
    // Find matching feedback for the logged-in user and CCC Code
    const userFeedback = rows.find(
      (r: string[]) =>
        String(r[0] || "").trim().toUpperCase() === String(session.cccCode || "").trim().toUpperCase() &&
        String(r[1] || "").trim().toLowerCase() === String(session.username || "").trim().toLowerCase()
    )

    if (!userFeedback) {
      return NextResponse.json({ feedback: null })
    }

    return NextResponse.json({
      feedback: {
        cccCode: userFeedback[0],
        username: userFeedback[1],
        rating: Number(userFeedback[2] || 5),
        category: userFeedback[3] || "General",
        feedbackText: userFeedback[4] || "",
        submittedAt: userFeedback[5] || "",
        updatedAt: userFeedback[6] || userFeedback[5] || "",
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
    const category = String(body.category || "General").trim()
    const feedbackText = String(body.feedbackText || "").trim()

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
      range: `${FEEDBACK_TAB}!A2:G1000`,
    })

    const rows = res.data.values || []
    const now = new Date().toISOString()
    const cccCode = String(session.cccCode || "SYSTEM").trim()
    const username = String(session.username).trim()

    // Check if user already submitted feedback -> Update existing row
    const rowIndex = rows.findIndex(
      (r: string[]) =>
        String(r[0] || "").trim().toUpperCase() === cccCode.toUpperCase() &&
        String(r[1] || "").trim().toLowerCase() === username.toLowerCase()
    )

    if (rowIndex >= 0) {
      const sheetRowNumber = rowIndex + 2
      const originalSubmittedAt = rows[rowIndex][5] || now
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${FEEDBACK_TAB}!A${sheetRowNumber}:G${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[cccCode, username, rating, category, feedbackText, originalSubmittedAt, now]],
        },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${FEEDBACK_TAB}!A:G`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[cccCode, username, rating, category, feedbackText, now, now]],
        },
      })
    }

    return NextResponse.json({ success: true, message: "Feedback saved to Master Registry" })
  } catch (e: any) {
    console.error("POST Feedback Error:", e)
    return NextResponse.json({ error: e.message || "Failed to save feedback" }, { status: 500 })
  }
}
