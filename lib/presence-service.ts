import { createClient, type Client } from "@libsql/client"
import { getTenantRegistry } from "./tenant-resolver"

export interface ActiveUserInfo {
  userId: string
  username: string
  name: string
  role: string
  cccCode: string
  cccName?: string
  agencies: string[]
  activeModule?: string
  lastAction?: string
  lastSeen: number
  ip?: string
  userAgent?: string
  deviceType?: "Desktop" | "Mobile" | "Tablet"
  browserName?: string
  isLive: boolean
}

export interface OfficeOnlineSummary {
  cccCode: string
  cccName: string
  onlineCount: number
  users: Array<{
    userId: string
    username: string
    name: string
    role: string
    agencies: string[]
    activeModule?: string
    lastAction?: string
    lastSeen: number
    isLive: boolean
  }>
}

export interface OnlineUsersReport {
  onlineUsers: ActiveUserInfo[]
  totalOnline: number
  activeNowCount: number
  idleCount: number
  totalOfficesActive: number
  officeStats: Record<string, OfficeOnlineSummary>
  roleStats: Record<string, number>
  moduleStats: Record<string, number>
  serverTime: number
}

// In-Memory Fast Cache for instantaneous UI reads
const inMemoryPresence = new Map<string, ActiveUserInfo>()
const PRESENCE_TIMEOUT_MS = 180_000 // 3 minutes

let tursoClient: Client | null = null
let presenceTableInitialized = false

function getTursoClient(): Client | null {
  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    process.env.LIBSQL_URL ||
    process.env.STORAGE_DATABASE_URL ||
    process.env.STORAGE_URL ||
    process.env.TURSO_DATABASE_URL_URL
  const authToken =
    process.env.TURSO_AUTH_TOKEN ||
    process.env.LIBSQL_AUTH_TOKEN ||
    process.env.STORAGE_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN_TOKEN
  if (!url) return null
  if (!tursoClient) {
    tursoClient = createClient({ url, authToken })
  }
  return tursoClient
}

async function ensurePresenceTable(client: Client) {
  if (presenceTableInitialized) return
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS user_presence (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        name TEXT,
        role TEXT,
        ccc_code TEXT,
        agencies TEXT,
        active_module TEXT,
        last_action TEXT,
        device_type TEXT,
        browser_name TEXT,
        ip TEXT,
        last_seen INTEGER,
        expires_at INTEGER
      );
    `)
    presenceTableInitialized = true
  } catch (err) {
    console.warn("[presence-service] Error creating user_presence table:", err)
  }
}

export function parseDeviceFromUserAgent(ua = ""): {
  deviceType: "Desktop" | "Mobile" | "Tablet"
  browserName: string
} {
  let deviceType: "Desktop" | "Mobile" | "Tablet" = "Desktop"
  if (/ipad|tablet|playbook|silk/i.test(ua)) {
    deviceType = "Tablet"
  } else if (/mobi|iphone|android|touch/i.test(ua)) {
    deviceType = "Mobile"
  }

  let browserName = "Browser"
  if (/edg\//i.test(ua)) browserName = "Edge"
  else if (/opr\/|opera/i.test(ua)) browserName = "Opera"
  else if (/chrome|crios/i.test(ua)) browserName = "Chrome"
  else if (/firefox|fxios/i.test(ua)) browserName = "Firefox"
  else if (/safari/i.test(ua)) browserName = "Safari"

  return { deviceType, browserName }
}

/**
 * Clean & prune expired user presence rows from the dedicated table
 */
export async function pruneExpiredPresence(): Promise<number> {
  const now = Date.now()
  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      const res = await turso.execute({
        sql: "DELETE FROM user_presence WHERE expires_at IS NOT NULL AND expires_at < ?",
        args: [now],
      })
      return Number(res.rowsAffected || 0)
    } catch (e) {
      console.warn("[presence-service] Error pruning expired presence:", e)
    }
  }
  return 0
}

/**
 * Track an authenticated user in dedicated user_presence table (exactly 1 row per user)
 */
export async function trackUserPresence(
  user: Omit<ActiveUserInfo, "isLive">
): Promise<void> {
  const now = Date.now()
  const device = parseDeviceFromUserAgent(user.userAgent || "")

  const record: ActiveUserInfo = {
    ...user,
    cccCode: String(user.cccCode || "").trim().toUpperCase(),
    deviceType: user.deviceType || device.deviceType,
    browserName: user.browserName || device.browserName,
    lastSeen: now,
    isLive: true,
  }

  inMemoryPresence.set(user.userId, record)

  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      const expiresAt = now + PRESENCE_TIMEOUT_MS
      const agenciesJson = JSON.stringify(record.agencies || [])

      await turso.execute({
        sql: `INSERT INTO user_presence (
          user_id, username, name, role, ccc_code, agencies, active_module,
          last_action, device_type, browser_name, ip, last_seen, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          username = excluded.username,
          name = excluded.name,
          role = excluded.role,
          ccc_code = excluded.ccc_code,
          agencies = excluded.agencies,
          active_module = excluded.active_module,
          last_action = excluded.last_action,
          device_type = excluded.device_type,
          browser_name = excluded.browser_name,
          ip = excluded.ip,
          last_seen = excluded.last_seen,
          expires_at = excluded.expires_at`,
        args: [
          record.userId,
          record.username,
          record.name,
          record.role,
          record.cccCode,
          agenciesJson,
          record.activeModule || "",
          record.lastAction || "",
          record.deviceType || "Desktop",
          record.browserName || "Browser",
          record.ip || "",
          now,
          expiresAt,
        ],
      })
    } catch (e) {
      console.warn("[presence-service] Error updating user_presence row:", e)
    }
  }
}

export async function removeUserPresence(userId: string): Promise<void> {
  inMemoryPresence.delete(userId)
  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      await turso.execute({
        sql: "DELETE FROM user_presence WHERE user_id = ?",
        args: [userId],
      })
    } catch (e) {}
  }
}

export async function updateUserAction(
  userId: string,
  action: string,
  moduleKey?: string
): Promise<void> {
  const existing = inMemoryPresence.get(userId)
  if (existing) {
    existing.lastAction = action
    if (moduleKey) existing.activeModule = moduleKey
    existing.lastSeen = Date.now()
    existing.isLive = true
    inMemoryPresence.set(userId, existing)
    
    const turso = getTursoClient()
    if (turso) {
      const expiresAt = existing.lastSeen + PRESENCE_TIMEOUT_MS
      turso.execute({
        sql: `UPDATE user_presence 
              SET last_action = ?, active_module = coalesce(?, active_module), last_seen = ?, expires_at = ?
              WHERE user_id = ?`,
        args: [action, moduleKey || null, existing.lastSeen, expiresAt, userId]
      }).catch(() => {})
    }
  }
}

export async function getOnlineUsersReport(): Promise<OnlineUsersReport> {
  const now = Date.now()
  const activeUsersMap = new Map<string, ActiveUserInfo>()

  // 1. Read in-memory fast map
  for (const [userId, user] of inMemoryPresence.entries()) {
    if (now - user.lastSeen <= PRESENCE_TIMEOUT_MS) {
      activeUsersMap.set(userId, {
        ...user,
        isLive: now - user.lastSeen < 60_000,
      })
    } else {
      inMemoryPresence.delete(userId)
    }
  }

  // 2. Read dedicated user_presence table for multi-instance sync
  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      const res = await turso.execute({
        sql: "SELECT * FROM user_presence WHERE expires_at > ?",
        args: [now],
      })

      for (const row of res.rows) {
        const uId = String(row.user_id)
        if (!activeUsersMap.has(uId)) {
          let agencies: string[] = []
          try {
            agencies = JSON.parse(String(row.agencies || "[]"))
          } catch {}

          const lastSeen = Number(row.last_seen || 0)
          const info: ActiveUserInfo = {
            userId: uId,
            username: String(row.username || ""),
            name: String(row.name || row.username || ""),
            role: String(row.role || ""),
            cccCode: String(row.ccc_code || ""),
            agencies,
            activeModule: row.active_module ? String(row.active_module) : undefined,
            lastAction: row.last_action ? String(row.last_action) : undefined,
            deviceType: (row.device_type as any) || "Desktop",
            browserName: String(row.browser_name || "Browser"),
            ip: String(row.ip || ""),
            lastSeen,
            isLive: now - lastSeen < 60_000,
          }
          activeUsersMap.set(uId, info)
        }
      }
    } catch (e) {
      console.warn("[presence-service] Error reading online users from Turso:", e)
    }
  }

  // 3. Enrich CCC names from Registry
  let tenantRegistry: Record<string, any> = {}
  try {
    tenantRegistry = await getTenantRegistry()
  } catch {}

  const onlineUsers = Array.from(activeUsersMap.values()).map((user) => {
    const cccName = tenantRegistry[user.cccCode]?.cccName || user.cccCode
    return { ...user, cccName }
  })

  // 4. Calculate Aggregate Stats
  const officeStats: Record<string, OfficeOnlineSummary> = {}
  const roleStats: Record<string, number> = {}
  const moduleStats: Record<string, number> = {}

  let activeNowCount = 0
  let idleCount = 0

  onlineUsers.forEach((user) => {
    if (user.isLive) activeNowCount++
    else idleCount++

    // Role Stats
    const r = user.role || "unknown"
    roleStats[r] = (roleStats[r] || 0) + 1

    // Module Stats
    const m = user.activeModule || "Home"
    moduleStats[m] = (moduleStats[m] || 0) + 1

    // Office Stats
    const cCode = user.cccCode || "HQ"
    const cName = user.cccName || cCode

    if (!officeStats[cCode]) {
      officeStats[cCode] = {
        cccCode: cCode,
        cccName: cName,
        onlineCount: 0,
        users: [],
      }
    }

    officeStats[cCode].onlineCount++
    officeStats[cCode].users.push({
      userId: user.userId,
      username: user.username,
      name: user.name,
      role: user.role,
      agencies: user.agencies,
      activeModule: user.activeModule,
      lastAction: user.lastAction,
      lastSeen: user.lastSeen,
      isLive: user.isLive,
    })
  })

  return {
    onlineUsers,
    totalOnline: onlineUsers.length,
    activeNowCount,
    idleCount,
    totalOfficesActive: Object.keys(officeStats).length,
    officeStats,
    roleStats,
    moduleStats,
    serverTime: now,
  }
}
