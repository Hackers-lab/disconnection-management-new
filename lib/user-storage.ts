import { sheets as googleSheets } from "@googleapis/sheets"
import { GoogleAuth } from "google-auth-library"
import { db } from "./db"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const SHEET_NAME = "Master_Credentials"

function getPrivateKey() {
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY
  if (!key) return undefined
  return key.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim()
}

async function getSheetsClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: getPrivateKey(),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return googleSheets({ version: "v4", auth: auth as any })
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
    const now = Date.now()
    if (this._cache && (now - this._cacheTimestamp < this.CACHE_TTL_MS)) {
      return this._cache
    }

    // Try Turso SQL Database primary read
    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub 
              FROM users u LEFT JOIN ccc_registry c ON u.ccc_id = c.id`,
        args: []
      })
      if (res.rows && res.rows.length > 0) {
        const users: MasterUser[] = res.rows.map((r: any) => {
          const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
          const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
          return {
            id: String(r.id || ""),
            username: String(r.username || ""),
            password: String(r.password || ""),
            role: String(r.role || ""),
            cccCode: String(r.cccCode || ""),
            name: String(r.name || ""),
            agencies: fallbackAgencies,
            subscriptionStatus: String(r.subStatus || "active"),
            subscriptionExpiresAt: String(r.subExpiresAt || ""),
            bypassSubscription: Boolean(r.bypassSub),
          }
        })
        this._cache = users
        this._cacheTimestamp = now
        return users
      }
    } catch (err) {
      console.error("Turso users fetch error, falling back to Google Sheets:", err)
    }

    if (!SHEET_ID) {
      throw new Error("MASTER_CONFIG_SHEET environment variable is not defined")
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
    const t0 = performance.now()
    const cleanUsername = username.trim()
    const cleanPassword = password.trim()

    // 1. Direct fast indexed point-query on Turso DB (supports username OR CCC code)
    try {
      const qStart = performance.now()
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub 
              FROM users u 
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE LOWER(u.username) = LOWER(?) OR (LOWER(c.ccc_code) = LOWER(?) AND u.role = 'admin')`,
        args: [cleanUsername, cleanUsername]
      })
      const qDuration = (performance.now() - qStart).toFixed(1)

      if (res.rows && res.rows.length > 0) {
        // Find matching row by password, preferring exact username match if multiple exist
        const matchingRow = res.rows.find((r: any) => 
          String(r.password || "").trim() === cleanPassword && String(r.username || "").trim() === cleanUsername
        ) || res.rows.find((r: any) => 
          String(r.password || "").trim() === cleanPassword
        )

        if (matchingRow) {
          const r: any = matchingRow
          const dbPassword = String(r.password || "").trim()
          const totalMs = (performance.now() - t0).toFixed(1)
          const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
          const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
          console.log(`⚡ [AUTH SUCCESS - Turso DB] User '${cleanUsername}' (Account: ${r.username}, CCC: ${r.cccCode || "N/A"}, Agencies: ${fallbackAgencies.join(", ") || "None"}) authenticated in ${qDuration}ms (Total: ${totalMs}ms) via Turso DB.`)
          return {
            id: String(r.id || ""),
            username: String(r.username || cleanUsername),
            password: dbPassword,
            role: String(r.role || "viewer"),
            cccCode: String(r.cccCode || ""),
            name: String(r.name || cleanUsername),
            agencies: fallbackAgencies,
            subscriptionStatus: String(r.subStatus || "active"),
            subscriptionExpiresAt: String(r.subExpiresAt || ""),
            bypassSubscription: Boolean(r.bypassSub),
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ [AUTH NOTICE] Direct Turso point query failed, checking fallbacks: ${err.message}`)
    }

    // 2. Fallback: Check memory cache or Google Sheets
    const s0 = performance.now()
    const users = await this.getUsers()
    let user = users.find(u => (u.username.toLowerCase() === cleanUsername.toLowerCase() || (u.cccCode.toLowerCase() === cleanUsername.toLowerCase() && u.role === 'admin')) && u.password === cleanPassword) || null

    if (!user) {
      this.invalidateCache()
      const freshUsers = await this.getUsers()
      user = freshUsers.find(u => (u.username.toLowerCase() === cleanUsername.toLowerCase() || (u.cccCode.toLowerCase() === cleanUsername.toLowerCase() && u.role === 'admin')) && u.password === cleanPassword) || null
    }
    const sDuration = (performance.now() - s0).toFixed(1)

    // Dynamic fallback for divisional credentials (e.g., 6612000 / 6612000 or 6634000 / 6634000)
    if (!user && /^\d{4}000$/.test(cleanUsername) && cleanPassword === cleanUsername) {
      const divPrefix = cleanUsername.slice(0, 4)
      user = {
        id: `div-${cleanUsername}`,
        username: cleanUsername,
        password: cleanPassword,
        role: "division_viewer",
        cccCode: cleanUsername,
        name: `Division ${divPrefix} View Account`,
        agencies: [],
        subscriptionStatus: "active",
        subscriptionExpiresAt: "",
        bypassSubscription: true,
      }
    }

    if (user) {
      console.log(`📄 [AUTH SUCCESS - Google Sheets Fallback] User '${cleanUsername}' authenticated in ${sDuration}ms via Sheets fallback.`)
    } else {
      console.log(`❌ [AUTH FAILED] User '${cleanUsername}' not found in any database (Duration: ${sDuration}ms).`)
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