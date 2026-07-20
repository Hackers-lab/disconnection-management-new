import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const SHEET_NAME = "Master_Credentials"

async function getSheetsClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return googleSheets({ version: "v4", auth })
}

export interface MasterUser {
  id: string
  username: string
  password: string
  role: string
  cccCode: string
  name: string
  agencies: string[]
  subscriptionStatus: string
  subscriptionExpiresAt: string
  bypassSubscription: boolean
}

export class UserStorage {
  static instance: UserStorage
  // In-memory cache with TTL (5 minutes) to pick up direct sheet edits
  private _cache: MasterUser[] | null = null
  private _cacheTimestamp: number = 0
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache TTL

  static getInstance() {
    if (!UserStorage.instance) UserStorage.instance = new UserStorage()
    return UserStorage.instance
  }

  _parseRows(rows: any[][]): MasterUser[] {
    return rows
      .filter(row => row && row.length > 0 && row[1])
      .map(([id, username, password, role, cccCode, name, agencies, subStatus, subExpiresAt, bypassSub]) => ({
        id: String(id || ""),
        username: String(username || ""),
        password: String(password || ""),
        role: String(role || ""),
        cccCode: String(cccCode || ""),
        name: String(name || ""),
        agencies: agencies ? String(agencies).split(",") : [] as string[],
        subscriptionStatus: subStatus ? String(subStatus).trim() : "active",
        subscriptionExpiresAt: subExpiresAt ? String(subExpiresAt).trim() : "",
        bypassSubscription: bypassSub ? String(bypassSub).trim().toUpperCase() === "TRUE" : false,
      }))
  }

  invalidateCache() {
    this._cache = null
    this._cacheTimestamp = 0
  }

  async getUsers(): Promise<MasterUser[]> {
    if (!SHEET_ID) {
      throw new Error("MASTER_CONFIG_SHEET environment variable is not defined")
    }
    
    const now = Date.now()
    if (this._cache && (now - this._cacheTimestamp < this.CACHE_TTL_MS)) {
      return this._cache
    }

    try {
      const sheets = await getSheetsClient()
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A2:J`,
      })
      const rows = res.data.values || []
      const users = this._parseRows(rows)
      this._cache = users
      this._cacheTimestamp = now
      return users
    } catch (error) {
      console.error("Error fetching users from Master_Credentials sheet:", error)
      // Fallback to cache if available
      if (this._cache) {
        return this._cache
      }
      throw error
    }
  }

  async findUserByCredentials(username: string, password: string): Promise<MasterUser | null> {
    const users = await this.getUsers()
    let user = users.find(u => u.username === username && u.password === password) || null

    // If not found in cache, invalidate cache and fetch fresh users once
    if (!user) {
      this.invalidateCache()
      const freshUsers = await this.getUsers()
      user = freshUsers.find(u => u.username === username && u.password === password) || null
    }
    return user
  }

  async addUser(user: Omit<MasterUser, "id">): Promise<MasterUser> {
    const users = await this.getUsers()
    const newId = (Math.max(0, ...users.map(u => Number(u.id) || 0)) + 1).toString()
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:J`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          newId,
          user.username,
          user.password,
          user.role,
          user.cccCode,
          user.name,
          user.agencies.join(","),
          user.subscriptionStatus || "active",
          user.subscriptionExpiresAt || "",
          user.bypassSubscription ? "TRUE" : "FALSE"
        ]],
      },
    })
    this.invalidateCache()
    return { id: newId, ...user }
  }

  async updateUser(id: string, updates: Partial<Omit<MasterUser, "id">>): Promise<MasterUser | null> {
    const sheets = await getSheetsClient()
    const users = await this.getUsers()
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return null
    const updated = { ...users[idx], ...updates }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${idx + 2}:J${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          updated.id,
          updated.username,
          updated.password,
          updated.role,
          updated.cccCode,
          updated.name,
          updated.agencies.join(","),
          updated.subscriptionStatus || "active",
          updated.subscriptionExpiresAt || "",
          updated.bypassSubscription ? "TRUE" : "FALSE"
        ]],
      },
    })
    this.invalidateCache()
    return updated
  }

  async deleteUser(id: string): Promise<MasterUser | null> {
    const sheets = await getSheetsClient()
    const users = await this.getUsers()
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return null

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    })
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
    const targetSheetId = sheet?.properties?.sheetId

    if (targetSheetId === undefined || targetSheetId === null) {
      throw new Error(`Sheet tab "${SHEET_NAME}" not found`)
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: targetSheetId,
              dimension: "ROWS",
              startIndex: idx + 1,
              endIndex: idx + 2
            }
          }
        }]
      }
    })

    this.invalidateCache()
    return users[idx]
  }
}

export const userStorage = UserStorage.getInstance()