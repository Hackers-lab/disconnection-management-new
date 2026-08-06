import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

export interface FeedbackItem {
  id: string
  username: string
  name: string
  supplyOffice: string
  cccCode: string
  rating: number // 1 to 5
  comment: string
  createdAt: string
  status: 'approved' | 'pending' | 'hidden'
}

const sheets = googleSheets({ version: "v4", auth })

let memoryFeedbacksCache: FeedbackItem[] | null = null
let lastFetchTime = 0
const CACHE_TTL_MS = 60_000 // 1 minute memory cache

export async function fetchApprovedFeedbacks(spreadsheetId?: string): Promise<FeedbackItem[]> {
  const now = Date.now()
  if (memoryFeedbacksCache && now - lastFetchTime < CACHE_TTL_MS) {
    return memoryFeedbacksCache
  }

  try {
    const targetSheetId = process.env.MASTER_CONFIG_SHEET || spreadsheetId || getSpreadsheetId()

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: targetSheetId,
      range: "'Feedbacks'!A1:Z500",
    }).catch(() => null)

    const rows = (res?.data?.values || []) as string[][]
    if (rows.length < 2) {
      memoryFeedbacksCache = memoryFeedbacksCache || []
      lastFetchTime = now
      return memoryFeedbacksCache
    }

    const headers = rows[0].map((h: string) => String(h || "").trim().toLowerCase())
    const idIdx = headers.findIndex((h: string) => h.includes("id"))
    const userIdx = headers.findIndex((h: string) => h.includes("user"))
    const nameIdx = headers.findIndex((h: string) => h.includes("name"))
    const officeIdx = headers.findIndex((h: string) => h.includes("office") || h.includes("supply"))
    const cccIdx = headers.findIndex((h: string) => h.includes("ccc"))
    const ratingIdx = headers.findIndex((h: string) => h.includes("rating"))
    const commentIdx = headers.findIndex((h: string) => h.includes("comment") || h.includes("feedback") || h.includes("text"))
    const statusIdx = headers.findIndex((h: string) => h.includes("status"))
    const dateIdx = headers.findIndex((h: string) => h.includes("date") || h.includes("created") || h.includes("submitted"))

    const parsedItems: FeedbackItem[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || []
      const comment = commentIdx >= 0 ? String(r[commentIdx] || "").trim() : String(r[4] || "").trim()
      if (!comment) continue

      const status = statusIdx >= 0 ? String(r[statusIdx] || "").trim().toLowerCase() : "approved"
      if (status !== "approved") continue

      const username = userIdx >= 0 ? String(r[userIdx] || "").trim() : String(r[1] || "").trim()
      const cccCode = cccIdx >= 0 ? String(r[cccIdx] || "").trim() : String(r[0] || "").trim()
      const name = nameIdx >= 0 && r[nameIdx] ? String(r[nameIdx]) : username || cccCode || "Officer"
      const office = officeIdx >= 0 && r[officeIdx] ? String(r[officeIdx]) : cccCode || "CCC Office"

      parsedItems.push({
        id: idIdx >= 0 ? String(r[idIdx] || `fb-${i}`) : `fb-${i}`,
        username: username || "user",
        name,
        supplyOffice: office,
        cccCode,
        rating: ratingIdx >= 0 ? Math.min(5, Math.max(1, parseInt(String(r[ratingIdx] || "5"), 10))) : Number(r[2] || 5),
        comment,
        createdAt: dateIdx >= 0 ? String(r[dateIdx] || new Date().toISOString()) : String(r[5] || new Date().toISOString()),
        status: "approved",
      })
    }

    memoryFeedbacksCache = parsedItems
    lastFetchTime = now
    return parsedItems
  } catch (err) {
    console.warn("Feedback read warning:", err)
    memoryFeedbacksCache = memoryFeedbacksCache || []
    lastFetchTime = now
    return memoryFeedbacksCache
  }

}

export async function addFeedback(
  feedback: Omit<FeedbackItem, "id" | "createdAt" | "status">,
  spreadsheetId?: string
): Promise<FeedbackItem> {
  const newItem: FeedbackItem = {
    ...feedback,
    id: `fb-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "approved",
  }

  // Update memory cache immediately
  if (!memoryFeedbacksCache) {
    memoryFeedbacksCache = [newItem]
  } else {
    memoryFeedbacksCache = [newItem, ...memoryFeedbacksCache]
  }
  lastFetchTime = Date.now()

  // Background append to Google Sheet if tab exists
  try {
    const targetSheetId = spreadsheetId || getSpreadsheetId()

    // Ensure 'Feedbacks' tab exists
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: targetSheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: "Feedbacks" },
            },
          },
        ],
      },
    }).catch(() => {}) // Ignore if sheet tab already exists

    // Append row
    await sheets.spreadsheets.values.append({
      spreadsheetId: targetSheetId,
      range: "'Feedbacks'!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            newItem.id,
            newItem.username,
            newItem.name,
            newItem.supplyOffice,
            newItem.cccCode,
            newItem.rating,
            newItem.comment,
            newItem.status,
            newItem.createdAt,
          ],
        ],
      },
    }).catch((e: any) => console.warn("Failed to append feedback row to Google Sheet:", e.message))
  } catch (e: any) {
    console.warn("Feedback added to local memory cache, Google Sheet sync skipped:", e)
  }

  return newItem
}
