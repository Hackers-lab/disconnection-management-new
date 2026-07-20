import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

const sheets = googleSheets({ version: "v4", auth })

export const TEMPLATES_TAB = "ReportTemplates"

// Schema: UserId | Name | ConfigJSON | UpdatedAt
export const TEMPLATES_HEADERS = ["UserId", "Name", "ConfigJSON", "UpdatedAt"]

export interface SavedTemplate {
  name: string
  config: unknown // opaque to the server; built/consumed client-side
  updatedAt?: string
}

const MEMO_TTL_MS = 60_000
let memo: { at: number; rows: string[][] } | null = null

export function invalidateTemplatesCache() {
  memo = null
}

async function ensureTab(spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  if (meta.data.sheets?.some(s => s.properties?.title === TEMPLATES_TAB)) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TEMPLATES_TAB } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${TEMPLATES_TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [TEMPLATES_HEADERS] },
  })
}

async function readAllRows(): Promise<string[][]> {
  const now = Date.now()
  if (memo && now - memo.at < MEMO_TTL_MS) return memo.rows
  const id = getSpreadsheetId()
  await ensureTab(id)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${TEMPLATES_TAB}!A:D`,
  })
  const rows = (resp.data.values || []).slice(1) as string[][]
  memo = { at: now, rows }
  return rows
}

function safeParse(json: string): unknown {
  try { return JSON.parse(json) } catch { return {} }
}

export async function getTemplatesForUser(userId: string): Promise<SavedTemplate[]> {
  const rows = await readAllRows()
  return rows
    .filter(r => String(r[0] || "") === userId && String(r[1] || "").trim())
    .map(r => ({ name: String(r[1] || ""), config: safeParse(String(r[2] || "{}")), updatedAt: String(r[3] || "") }))
}

export async function saveTemplate(userId: string, name: string, config: unknown): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${TEMPLATES_TAB}!A:D`,
  })
  const all = (resp.data.values || []) as string[][]
  const newRow = [userId, name, JSON.stringify(config ?? {}), new Date().toISOString()]

  let foundRow = -1
  for (let i = 1; i < all.length; i++) {
    if (String(all[i]?.[0] || "") === userId && String(all[i]?.[1] || "") === name) {
      foundRow = i + 1
      break
    }
  }
  if (foundRow !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${TEMPLATES_TAB}!A${foundRow}:D${foundRow}`,
      valueInputOption: "RAW", requestBody: { values: [newRow] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${TEMPLATES_TAB}!A:D`,
      valueInputOption: "RAW", requestBody: { values: [newRow] },
    })
  }
  memo = null
}

export async function deleteTemplate(userId: string, name: string): Promise<boolean> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const tabId = meta.data.sheets?.find(s => s.properties?.title === TEMPLATES_TAB)?.properties?.sheetId
  if (tabId === undefined || tabId === null) return false

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${TEMPLATES_TAB}!A:D`,
  })
  const all = (resp.data.values || []) as string[][]
  let foundIdx = -1
  for (let i = 1; i < all.length; i++) {
    if (String(all[i]?.[0] || "") === userId && String(all[i]?.[1] || "") === name) { foundIdx = i; break }
  }
  if (foundIdx === -1) return false

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [{
        deleteDimension: { range: { sheetId: tabId, dimension: "ROWS", startIndex: foundIdx, endIndex: foundIdx + 1 } },
      }],
    },
  })
  memo = null
  return true
}
