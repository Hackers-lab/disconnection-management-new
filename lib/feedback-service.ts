import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { getTenantRegistry } from "./tenant-resolver"
import { db } from "./db"

export interface FeedbackItem {
  id: string
  username: string
  name: string
  supplyOffice: string
  cccCode: string
  rating: number // 1 to 5
  comment: string
  createdAt: string
  status: "approved" | "pending" | "hidden"
}

const sheets = googleSheets({ version: "v4", auth })

let memoryFeedbacksCache: FeedbackItem[] | null = null
let lastFetchTime = 0
const CACHE_TTL_MS = 60_000 // 1 minute memory cache

export function getFeedbackMasterSheetId(): string {
  return process.env.MASTER_CONFIG_SHEET?.trim() || getSpreadsheetId()
}

export function formatCccDisplay(name: string): string {
  if (!name) return ""
  const trimmed = name.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  return trimmed
}

export async function fetchApprovedFeedbacks(spreadsheetId?: string): Promise<FeedbackItem[]> {
  const now = Date.now()
  if (memoryFeedbacksCache && now - lastFetchTime < CACHE_TTL_MS) {
    return memoryFeedbacksCache
  }

  // 1. Try querying Turso user_feedbacks table first
  try {
    const res = await db.execute("SELECT f.feedback_id, f.username, f.full_name, f.supply_office, f.rating, f.comment, f.status, f.created_at, c.ccc_code FROM user_feedbacks f LEFT JOIN ccc_registry c ON f.ccc_id = c.id WHERE LOWER(f.status) = 'approved'")
    if (res.rows && res.rows.length > 0) {
      const parsedItems: FeedbackItem[] = res.rows.map((row: any) => ({
        id: String(row.feedback_id || ""),
        username: String(row.username || ""),
        name: String(row.full_name || row.username || "Officer"),
        supplyOffice: String(row.supply_office || ""),
        cccCode: String(row.ccc_code || ""),
        rating: Number(row.rating || 5),
        comment: String(row.comment || ""),
        createdAt: String(row.created_at || ""),
        status: "approved",
      }))
      memoryFeedbacksCache = parsedItems
      lastFetchTime = now
      console.log(`⚡ [Turso SQL] Loaded ${parsedItems.length} approved feedbacks from user_feedbacks table`)
      return parsedItems
    }
  } catch (err) {
    console.warn("Turso user_feedbacks query failed, falling back to Sheets:", err)
  }

  try {
    const targetSheetId = getFeedbackMasterSheetId()

    let registry: Record<string, any> = {}
    try {
      registry = await getTenantRegistry()
    } catch (err) {
      console.warn("Tenant registry lookup warning in feedback service:", err)
    }

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
      const comment = commentIdx >= 0 ? String(r[commentIdx] || "").trim() : String(r[6] || r[4] || "").trim()
      if (!comment) continue

      const status = statusIdx >= 0 ? String(r[statusIdx] || "").trim().toLowerCase() : "approved"
      if (status !== "approved") continue

      const username = userIdx >= 0 ? String(r[userIdx] || "").trim() : String(r[1] || "").trim()
      const cccCode = cccIdx >= 0 ? String(r[cccIdx] || "").trim() : String(r[4] || r[0] || "").trim()
      
      const officialCccName = registry[cccCode]?.cccName || registry[username]?.cccName || ""
      
      let rawOffice = officeIdx >= 0 && r[officeIdx] ? String(r[officeIdx]).trim() : ""
      if (!rawOffice || /^\d+\s*ccc$/i.test(rawOffice) || /^\d+$/.test(rawOffice)) {
        rawOffice = officialCccName || (cccCode ? `${cccCode} CCC` : "CCC Office")
      }

      let rawName = nameIdx >= 0 && r[nameIdx] ? String(r[nameIdx]).trim() : ""
      if (!rawName) {
        if (username && !/^\d+$/.test(username)) {
          rawName = username
        } else if (officialCccName) {
          rawName = officialCccName
        } else {
          rawName = "Officer"
        }
      }

      parsedItems.push({
        id: idIdx >= 0 ? String(r[idIdx] || `fb-${i}`) : `fb-${i}`,
        username: username || "user",
        name: rawName,
        supplyOffice: rawOffice,
        cccCode,
        rating: ratingIdx >= 0 ? Math.min(5, Math.max(1, parseInt(String(r[ratingIdx] || "5"), 10))) : Number(r[5] || 5),
        comment,
        createdAt: dateIdx >= 0 ? String(r[dateIdx] || new Date().toISOString()) : String(r[8] || new Date().toISOString()),
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

export async function getUserFeedback(username: string): Promise<FeedbackItem | null> {
  const all = await fetchApprovedFeedbacks()
  return (
    all.find(
      (f) =>
        f.username.toLowerCase() === username.toLowerCase() ||
        f.cccCode.toLowerCase() === username.toLowerCase()
    ) || null
  )
}

export async function addFeedback(
  feedback: Omit<FeedbackItem, "id" | "createdAt" | "status">
): Promise<FeedbackItem> {
  const targetSheetId = getFeedbackMasterSheetId()

  let officialCccName = ""
  try {
    const registry = await getTenantRegistry()
    officialCccName = registry[feedback.cccCode]?.cccName || registry[feedback.username]?.cccName || ""
  } catch (e) {}

  let supplyOffice = feedback.supplyOffice?.trim() || ""
  if (!supplyOffice || /^\d+\s*ccc$/i.test(supplyOffice) || /^\d+$/.test(supplyOffice)) {
    supplyOffice = officialCccName || (feedback.cccCode ? `${feedback.cccCode} CCC` : "CCC Office")
  }

  const existingList = await fetchApprovedFeedbacks()
  const existingIdx = existingList.findIndex(
    (f) =>
      f.username.toLowerCase() === feedback.username.toLowerCase() ||
      (feedback.cccCode && f.cccCode.toUpperCase() === feedback.cccCode.toUpperCase())
  )

  const newItem: FeedbackItem = {
    ...feedback,
    supplyOffice,
    id: existingIdx >= 0 ? existingList[existingIdx].id : `fb-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "approved",
  }

  // Update memory cache immediately
  if (existingIdx >= 0) {
    existingList[existingIdx] = newItem
    memoryFeedbacksCache = [...existingList]
  } else {
    memoryFeedbacksCache = [newItem, ...(memoryFeedbacksCache || [])]
  }
  lastFetchTime = Date.now()

  // Sync to Master Config Google Sheet
  try {
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
    }).catch(() => {})

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: targetSheetId,
      range: "'Feedbacks'!A1:Z500",
    }).catch(() => null)

    const rows = (res?.data?.values || []) as string[][]
    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: targetSheetId,
        range: "'Feedbacks'!A1:I1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["ID", "Username", "Name", "Supply Office", "CCC Code", "Rating", "Comment", "Status", "CreatedAt"]],
        },
      })
    }

    let foundRowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || []
      const u = String(r[1] || "").trim().toLowerCase()
      const c = String(r[4] || "").trim().toUpperCase()
      if (u === feedback.username.toLowerCase() || (feedback.cccCode && c === feedback.cccCode.toUpperCase())) {
        foundRowIndex = i + 1
        break
      }
    }

    const rowValues = [
      newItem.id,
      newItem.username,
      newItem.name,
      newItem.supplyOffice,
      newItem.cccCode,
      newItem.rating,
      newItem.comment,
      newItem.status,
      newItem.createdAt,
    ]

    if (foundRowIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: targetSheetId,
        range: `'Feedbacks'!A${foundRowIndex}:I${foundRowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [rowValues],
        },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: targetSheetId,
        range: "'Feedbacks'!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [rowValues],
        },
      })
    }
  } catch (e: any) {
    console.warn("Feedback saved to memory cache, Master Sheet sync warning:", e?.message || e)
  }

  return newItem
}
