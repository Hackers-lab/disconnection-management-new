import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

const sheets = googleSheets({ version: "v4", auth })

export const RULES_TAB = "UploadRules"

// Schema: UserId | Name | RulesJSON | UpdatedAt
export const RULES_HEADERS = ["UserId", "Name", "RulesJSON", "UpdatedAt"]

// A saved filter preset. `groups` is the DNF rule structure evaluated on the
// client; the server only stores/returns it verbatim as JSON.
export interface SavedRuleSet {
  name: string
  groups: unknown // Group[] — opaque to the server, validated/used client-side
  updatedAt?: string
}

// Reads are rare (only when the admin opens the upload screen). Short memo
// keeps repeated opens within a container cheap.
const MEMO_TTL_MS = 60_000
let memo: { at: number; rows: string[][] } | null = null

export function invalidateRulesCache() {
  memo = null
}

async function ensureRulesTab(spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  if (meta.data.sheets?.some(s => s.properties?.title === RULES_TAB)) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: RULES_TAB } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${RULES_TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [RULES_HEADERS] },
  })
}

async function readAllRows(): Promise<string[][]> {
  const now = Date.now()
  if (memo && now - memo.at < MEMO_TTL_MS) return memo.rows
  const id = getSpreadsheetId()
  await ensureRulesTab(id)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${RULES_TAB}!A:D`,
  })
  const rows = (resp.data.values || []).slice(1) as string[][] // skip header
  memo = { at: now, rows }
  return rows
}

function safeParse(json: string): unknown {
  try { return JSON.parse(json) } catch { return [] }
}

// List all rule sets belonging to a user.
export async function getRuleSetsForUser(userId: string): Promise<SavedRuleSet[]> {
  const rows = await readAllRows()
  return rows
    .filter(r => String(r[0] || "") === userId && String(r[1] || "").trim())
    .map(r => ({ name: String(r[1] || ""), groups: safeParse(String(r[2] || "[]")), updatedAt: String(r[3] || "") }))
}

// Insert or update a named rule set for a user (matched by userId + name).
export async function saveRuleSet(userId: string, name: string, groups: unknown): Promise<void> {
  const id = getSpreadsheetId()
  await ensureRulesTab(id)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${RULES_TAB}!A:D`,
  })
  const all = (resp.data.values || []) as string[][]
  const updatedAt = new Date().toISOString()
  const newRow = [userId, name, JSON.stringify(groups ?? []), updatedAt]

  // Find existing row (skip header at index 0).
  let foundRow = -1
  for (let i = 1; i < all.length; i++) {
    if (String(all[i]?.[0] || "") === userId && String(all[i]?.[1] || "") === name) {
      foundRow = i + 1 // 1-based sheet row
      break
    }
  }

  if (foundRow !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${RULES_TAB}!A${foundRow}:D${foundRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [newRow] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${RULES_TAB}!A:D`,
      valueInputOption: "RAW",
      requestBody: { values: [newRow] },
    })
  }
  memo = null
}

// Delete a named rule set for a user.
export async function deleteRuleSet(userId: string, name: string): Promise<boolean> {
  const id = getSpreadsheetId()
  await ensureRulesTab(id)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const tabId = meta.data.sheets?.find(s => s.properties?.title === RULES_TAB)?.properties?.sheetId
  if (tabId === undefined || tabId === null) return false

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${RULES_TAB}!A:D`,
  })
  const all = (resp.data.values || []) as string[][]
  let foundIdx = -1
  for (let i = 1; i < all.length; i++) {
    if (String(all[i]?.[0] || "") === userId && String(all[i]?.[1] || "") === name) {
      foundIdx = i // 0-based, row 1 = header
      break
    }
  }
  if (foundIdx === -1) return false

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: tabId, dimension: "ROWS", startIndex: foundIdx, endIndex: foundIdx + 1 },
        },
      }],
    },
  })
  memo = null
  return true
}
