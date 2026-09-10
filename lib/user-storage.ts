import { db } from "./db"
import { randomUUID } from "crypto"

export interface MasterUser {
  id: string
  username: string
  password: string
  role: string
  cccCode: string
  name: string
  mobileNumber?: string
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

  async getUserById(id: string): Promise<MasterUser | null> {
    const cleanId = String(id || "").trim()
    if (!cleanId) return null

    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.mobile_number as mobileNumber, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub,
                     u.ccc_id as cccId,
                     a.subscription_status as agencySubStatus,
                     a.subscription_expires_at as agencySubExpiresAt
              FROM users u
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              LEFT JOIN agencies a ON a.ccc_id = u.ccc_id AND (
                a.name = u.full_name COLLATE NOCASE
                OR a.vendor_code = u.full_name COLLATE NOCASE
                OR a.name = u.username COLLATE NOCASE
                OR a.vendor_code = u.username COLLATE NOCASE
                OR INSTR(',' || u.agencies || ',', ',' || a.name || ',') > 0
                OR INSTR(',' || u.agencies || ',', ',' || a.vendor_code || ',') > 0
              )
              WHERE u.id = ?
              LIMIT 1`,
        args: [cleanId]
      })
      if (res.rows && res.rows.length > 0) {
        const r: any = res.rows[0]
        const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
        const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
        
        let finalSubStatus = String(r.subStatus || "active")
        let finalSubExpiresAt = String(r.subExpiresAt || "")

        // For agency users, check agency-level subscription
        const roleLower = String(r.role || "viewer").toLowerCase()
        if (roleLower === "agency" && r.cccId && fallbackAgencies.length > 0) {
          if (r.agencySubStatus) {
            finalSubStatus = String(r.agencySubStatus)
            if (r.agencySubExpiresAt) finalSubExpiresAt = String(r.agencySubExpiresAt)
          } else {
            try {
              const agencyRes = await db.execute({
                sql: `SELECT subscription_status, subscription_expires_at FROM agencies
                      WHERE ccc_id = ? AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE) LIMIT 1`,
                args: [r.cccId, fallbackAgencies[0], fallbackAgencies[0]]
              })
              if (agencyRes.rows && agencyRes.rows.length > 0) {
                const ag: any = agencyRes.rows[0]
                if (ag.subscription_status) finalSubStatus = String(ag.subscription_status)
                if (ag.subscription_expires_at) finalSubExpiresAt = String(ag.subscription_expires_at)
              }
            } catch {}
          }
        }

        return {
          id: String(r.id || ""),
          username: String(r.username || ""),
          password: String(r.password || ""),
          role: String(r.role || ""),
          cccCode: String(r.cccCode || ""),
          name: String(r.name || ""),
          mobileNumber: String(r.mobileNumber || ""),
          agencies: fallbackAgencies,
          subscriptionStatus: finalSubStatus,
          subscriptionExpiresAt: finalSubExpiresAt,
          bypassSubscription: Boolean(r.bypassSub),
        }
      }
    } catch (err) {
      console.warn("Turso getUserById error:", err)
    }

    return null
  }

  async getUserByUsername(username: string): Promise<MasterUser | null> {
    const cleanUser = String(username || "").trim()
    if (!cleanUser) return null

    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.mobile_number as mobileNumber, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub,
                     u.ccc_id as cccId,
                     a.subscription_status as agencySubStatus,
                     a.subscription_expires_at as agencySubExpiresAt
              FROM users u
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              LEFT JOIN agencies a ON a.ccc_id = u.ccc_id AND (
                a.name = u.full_name COLLATE NOCASE
                OR a.vendor_code = u.full_name COLLATE NOCASE
                OR a.name = u.username COLLATE NOCASE
                OR a.vendor_code = u.username COLLATE NOCASE
                OR INSTR(',' || u.agencies || ',', ',' || a.name || ',') > 0
                OR INSTR(',' || u.agencies || ',', ',' || a.vendor_code || ',') > 0
              )
              WHERE u.username = ? COLLATE NOCASE
              LIMIT 1`,
        args: [cleanUser]
      })
      if (res.rows && res.rows.length > 0) {
        const r: any = res.rows[0]
        const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
        const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
        
        let finalSubStatus = String(r.subStatus || "active")
        let finalSubExpiresAt = String(r.subExpiresAt || "")

        // For agency users, check agency-level subscription
        const roleLower = String(r.role || "viewer").toLowerCase()
        if (roleLower === "agency" && r.cccId && fallbackAgencies.length > 0) {
          if (r.agencySubStatus) {
            finalSubStatus = String(r.agencySubStatus)
            if (r.agencySubExpiresAt) finalSubExpiresAt = String(r.agencySubExpiresAt)
          } else {
            try {
              const agencyRes = await db.execute({
                sql: `SELECT subscription_status, subscription_expires_at FROM agencies
                      WHERE ccc_id = ? AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE) LIMIT 1`,
                args: [r.cccId, fallbackAgencies[0], fallbackAgencies[0]]
              })
              if (agencyRes.rows && agencyRes.rows.length > 0) {
                const ag: any = agencyRes.rows[0]
                if (ag.subscription_status) finalSubStatus = String(ag.subscription_status)
                if (ag.subscription_expires_at) finalSubExpiresAt = String(ag.subscription_expires_at)
              }
            } catch {}
          }
        }

        return {
          id: String(r.id || ""),
          username: String(r.username || ""),
          password: String(r.password || ""),
          role: String(r.role || ""),
          cccCode: String(r.cccCode || ""),
          name: String(r.name || ""),
          mobileNumber: String(r.mobileNumber || ""),
          agencies: fallbackAgencies,
          subscriptionStatus: finalSubStatus,
          subscriptionExpiresAt: finalSubExpiresAt,
          bypassSubscription: Boolean(r.bypassSub),
        }
      }
    } catch (err) {
      console.warn("Turso getUserByUsername error:", err)
    }

    return null
  }

  async getUserByMobile(mobileNumber: string): Promise<MasterUser | null> {
    const cleanMobile = String(mobileNumber || "").replace(/\D/g, "").slice(-10)
    if (!cleanMobile || cleanMobile.length !== 10) return null

    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.mobile_number as mobileNumber, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub,
                     u.ccc_id as cccId
              FROM users u LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE u.mobile_number = ?
              LIMIT 1`,
        args: [cleanMobile]
      })
      if (res.rows && res.rows.length > 0) {
        const r: any = res.rows[0]
        const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
        const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
        return {
          id: String(r.id || ""),
          username: String(r.username || ""),
          password: String(r.password || ""),
          role: String(r.role || ""),
          cccCode: String(r.cccCode || ""),
          name: String(r.name || ""),
          mobileNumber: String(r.mobileNumber || ""),
          agencies: fallbackAgencies,
          subscriptionStatus: String(r.subStatus || "active"),
          subscriptionExpiresAt: String(r.subExpiresAt || ""),
          bypassSubscription: Boolean(r.bypassSub),
        }
      }
    } catch (err) {
      console.warn("Turso getUserByMobile error:", err)
    }

    return null
  }

  async getUsersByCcc(cccCode: string): Promise<MasterUser[]> {
    const cleanCcc = String(cccCode || "").trim()
    if (!cleanCcc || cleanCcc === "SYSTEM") {
      return this.getUsers()
    }

    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.mobile_number as mobileNumber, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub 
              FROM users u 
              JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE c.ccc_code = ? COLLATE NOCASE`,
        args: [cleanCcc]
      })
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => {
          const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
          const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
          return {
            id: String(r.id || ""),
            username: String(r.username || ""),
            password: String(r.password || ""),
            role: String(r.role || ""),
            cccCode: String(r.cccCode || cleanCcc),
            name: String(r.name || ""),
            mobileNumber: String(r.mobileNumber || ""),
            agencies: fallbackAgencies,
            subscriptionStatus: String(r.subStatus || "active"),
            subscriptionExpiresAt: String(r.subExpiresAt || ""),
            bypassSubscription: Boolean(r.bypassSub),
          }
        })
      }
    } catch (err) {
      console.warn("Turso getUsersByCcc error:", err)
    }

    return []
  }

  async getAdminUserByCccCode(cccCode: string): Promise<MasterUser | null> {
    const cleanCcc = String(cccCode || "").trim()
    if (!cleanCcc) return null

    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub 
              FROM users u 
              JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE c.ccc_code = ? COLLATE NOCASE AND u.role = 'admin'
              LIMIT 1`,
        args: [cleanCcc]
      })
      if (res.rows && res.rows.length > 0) {
        const r: any = res.rows[0]
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
      }
    } catch (err) {
      console.warn("Turso getAdminUserByCccCode error:", err)
    }

    return null
  }

  async getUsers(): Promise<MasterUser[]> {
    const now = Date.now()
    if (this._cache && (now - this._cacheTimestamp < this.CACHE_TTL_MS)) {
      return this._cache
    }

    try {
      const res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.mobile_number as mobileNumber, u.agencies, u.subscription_status as subStatus, 
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
            mobileNumber: String(r.mobileNumber || ""),
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
      return []
    } catch (err) {
      console.error("Turso users fetch error:", err)
      return this._cache || []
    }
  }

  async findUserByCredentials(username: string, password: string): Promise<MasterUser | null> {
    const t0 = performance.now()
    const rawInput = username.trim()
    const cleanPassword = password.trim()
    let user: MasterUser | null = null

    // Extract 10-digit mobile number if applicable (handles +91, 0, spaces, dashes)
    const digitsOnly = rawInput.replace(/\D/g, "")
    const normalizedMobile = digitsOnly.length === 10 
      ? digitsOnly 
      : digitsOnly.length > 10 && digitsOnly.startsWith("91") && digitsOnly.length === 12 
        ? digitsOnly.slice(2) 
        : rawInput

    try {
      const qStart = performance.now()
      const isMobile = Boolean(normalizedMobile && /^\d{10}$/.test(normalizedMobile))

      // Direct indexed query by username OR mobile number with agency join to avoid secondary round-trips
      let res = await db.execute({
        sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                     u.full_name as name, u.agencies, u.subscription_status as subStatus, 
                     u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub,
                     u.ccc_id as cccId,
                     a.subscription_status as agencySubStatus,
                     a.subscription_expires_at as agencySubExpiresAt
              FROM users u 
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              LEFT JOIN agencies a ON a.ccc_id = u.ccc_id AND u.role = 'agency' AND (
                a.name = u.full_name COLLATE NOCASE
                OR a.vendor_code = u.full_name COLLATE NOCASE
                OR a.name = u.username COLLATE NOCASE
                OR a.vendor_code = u.username COLLATE NOCASE
              )
              WHERE ${isMobile ? "u.mobile_number = ?" : "u.username = ? COLLATE NOCASE"}
              LIMIT 1`,
        args: [isMobile ? normalizedMobile : rawInput]
      })

      // Fallback 1: If input was alphanumeric username and not found, check if it matches mobile_number
      if ((!res.rows || res.rows.length === 0) && !isMobile && digitsOnly.length === 10) {
        res = await db.execute({
          sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                       u.full_name as name, u.agencies, u.subscription_status as subStatus, 
                       u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub,
                       u.ccc_id as cccId,
                       a.subscription_status as agencySubStatus,
                       a.subscription_expires_at as agencySubExpiresAt
                FROM users u 
                LEFT JOIN ccc_registry c ON u.ccc_id = c.id
                LEFT JOIN agencies a ON a.ccc_id = u.ccc_id AND u.role = 'agency' AND (
                  a.name = u.full_name COLLATE NOCASE
                  OR a.vendor_code = u.full_name COLLATE NOCASE
                )
                WHERE u.mobile_number = ?
                LIMIT 1`,
          args: [digitsOnly]
        })
      }

      // Fallback 2: If not found, check if logging in via CCC code directly for admin
      if ((!res.rows || res.rows.length === 0) && !isMobile) {
        res = await db.execute({
          sql: `SELECT u.id, u.username, u.password_hash as password, u.role, c.ccc_code as cccCode, 
                       u.full_name as name, u.agencies, u.subscription_status as subStatus, 
                       u.subscription_expires_at as subExpiresAt, u.bypass_subscription as bypassSub,
                       u.ccc_id as cccId,
                       NULL as agencySubStatus,
                       NULL as agencySubExpiresAt
                FROM ccc_registry c
                JOIN users u ON u.ccc_id = c.id AND u.role = 'admin'
                WHERE c.ccc_code = ? COLLATE NOCASE
                LIMIT 1`,
          args: [rawInput]
        })
      }
      const qDuration = (performance.now() - qStart).toFixed(1)

      if (res.rows && res.rows.length > 0) {
        const matchingRow = res.rows.find((r: any) => 
          String(r.password || "").trim() === cleanPassword
        )

        if (matchingRow) {
          const r: any = matchingRow
          const dbPassword = String(r.password || "").trim()
          const totalMs = (performance.now() - t0).toFixed(1)
          const rawAgencies = r.agencies ? String(r.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
          const fallbackAgencies = rawAgencies.length > 0 ? rawAgencies : (String(r.role).toLowerCase() === "agency" && r.name ? [String(r.name).trim()] : [])
          
          let finalSubStatus = String(r.agencySubStatus || r.subStatus || "active")
          let finalSubExpiresAt = String(r.agencySubExpiresAt || r.subExpiresAt || "")

          console.log(`⚡ [AUTH SUCCESS - Turso DB] User '${rawInput}' authenticated in ${qDuration}ms (Total: ${totalMs}ms) via Turso DB.`)
          user = {
            id: String(r.id || ""),
            username: String(r.username || rawInput),
            password: dbPassword,
            role: String(r.role || "viewer"),
            cccCode: String(r.cccCode || ""),
            name: String(r.name || rawInput),
            agencies: fallbackAgencies,
            subscriptionStatus: finalSubStatus,
            subscriptionExpiresAt: finalSubExpiresAt,
            bypassSubscription: Boolean(r.bypassSub),
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ [AUTH NOTICE] Direct Turso point query failed: ${err.message}`)
    }

    if (!user && /^\d{4}000$/.test(rawInput) && cleanPassword === rawInput) {
      const divPrefix = rawInput.slice(0, 4)
      user = {
        id: `div-${rawInput}`,
        username: rawInput,
        password: cleanPassword,
        role: "division_viewer",
        cccCode: rawInput,
        name: `Division ${divPrefix} View Account`,
        agencies: [],
        subscriptionStatus: "active",
        subscriptionExpiresAt: "",
        bypassSubscription: true,
      }
    }

    if (!user) {
      const totalMs = (performance.now() - t0).toFixed(1)
      console.log(`❌ [AUTH FAILED] User '${rawInput}' not found in DB (Total: ${totalMs}ms).`)
    }

    return user
  }

  async addUser(user: Omit<MasterUser, "id">): Promise<MasterUser> {
    const newId = randomUUID()
    
    await db.execute({
      sql: `INSERT INTO users (id, username, password_hash, full_name, role, ccc_id, mobile_number, agencies, subscription_status, subscription_expires_at, bypass_subscription)
            VALUES (?, ?, ?, ?, ?, (SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1), ?, ?, ?, ?, ?)`,
      args: [
        newId,
        user.username,
        user.password,
        user.name,
        user.role,
        user.cccCode,
        user.mobileNumber || null,
        user.agencies.join(","),
        user.subscriptionStatus || "active",
        user.subscriptionExpiresAt || "",
        user.bypassSubscription ? 1 : 0
      ]
    })
    
    this.invalidateCache()
    return { id: newId, ...user }
  }

  async updateUser(id: string, updates: Partial<Omit<MasterUser, "id">>): Promise<MasterUser | null> {
    const currentUser = await this.getUserById(id)
    if (!currentUser) return null
    
    const updated = { ...currentUser, ...updates }
    
    await db.execute({
      sql: `UPDATE users SET username=?, password_hash=?, full_name=?, role=?, mobile_number=?, agencies=?, subscription_status=?, subscription_expires_at=?, bypass_subscription=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      args: [
        updated.username,
        updated.password,
        updated.name,
        updated.role,
        updated.mobileNumber || null,
        updated.agencies.join(","),
        updated.subscriptionStatus || "active",
        updated.subscriptionExpiresAt || "",
        updated.bypassSubscription ? 1 : 0,
        id
      ]
    })
    
    this.invalidateCache()
    return updated
  }

  async deleteUser(id: string): Promise<MasterUser | null> {
    const currentUser = await this.getUserById(id)
    if (!currentUser) return null

    await db.execute({
      sql: `DELETE FROM users WHERE id = ?`,
      args: [id]
    })

    this.invalidateCache()
    return currentUser
  }
}

export const userStorage = UserStorage.getInstance()