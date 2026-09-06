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
const PRESENCE_TIMEOUT_MS = 600_000 // 10 minutes
const LIVE_WINDOW_MS = 600_000 // 10 minutes window for live badge
const userLastTursoSync = new Map<string, { lastSync: number; action: string }>()

// Server memory micro-cache for aggregate report (prevents Turso row read spikes)
let cachedOnlineReport: { report: OnlineUsersReport; timestamp: number } | null = null
const REPORT_CACHE_TTL_MS = 60_000 // 60 seconds

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
        last_login INTEGER,
        is_online INTEGER DEFAULT 1
      );
    `)
    client.execute(`CREATE INDEX IF NOT EXISTS idx_user_presence_seen ON user_presence (last_seen, is_online);`).catch(() => {})
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
 * Track user login / active access (upserts exactly 1 persistent row per user in Turso, throttled to 45s)
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

  // Throttle Turso SQL writes to at most once every 3 minutes per user unless action changed
  const lastSync = userLastTursoSync.get(user.userId)
  const currentAction = record.lastAction || "Active"
  if (lastSync && now - lastSync.lastSync < 180_000 && lastSync.action === currentAction) {
    return
  }

  userLastTursoSync.set(user.userId, { lastSync: now, action: currentAction })

  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      const agenciesJson = JSON.stringify(record.agencies || [])

      await turso.execute({
        sql: `INSERT INTO user_presence (
          user_id, username, name, role, ccc_code, agencies, active_module,
          last_action, device_type, browser_name, ip, last_seen, last_login, is_online
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
          last_login = coalesce(excluded.last_login, user_presence.last_login),
          is_online = 1`,
        args: [
          record.userId,
          record.username,
          record.name,
          record.role,
          record.cccCode,
          agenciesJson,
          record.activeModule || "",
          currentAction,
          record.deviceType || "Desktop",
          record.browserName || "Browser",
          record.ip || "",
          now,
          now,
        ],
      })
    } catch (e) {
      console.warn("[presence-service] Error updating user_presence row:", e)
    }
  }
}

/**
 * Marks user offline on logout while retaining their historical last seen and last login trail
 */
export async function removeUserPresence(userId: string): Promise<void> {
  inMemoryPresence.delete(userId)
  userLastTursoSync.delete(userId)
  cachedOnlineReport = null
  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      await turso.execute({
        sql: "UPDATE user_presence SET is_online = 0, last_action = 'Logged Out', last_seen = ? WHERE user_id = ?",
        args: [Date.now(), userId],
      })
    } catch (e) {}
  }
}

export async function updateUserAction(
  userId: string,
  action: string,
  moduleKey?: string
): Promise<void> {
  const now = Date.now()
  const existing = inMemoryPresence.get(userId)
  if (existing) {
    existing.lastAction = action
    if (moduleKey) existing.activeModule = moduleKey
    existing.lastSeen = now
    existing.isLive = true
    inMemoryPresence.set(userId, existing)
  }

  // Throttle action updates if written within last 20s
  const lastSync = userLastTursoSync.get(userId)
  if (lastSync && now - lastSync.lastSync < 20_000 && lastSync.action === action) {
    return
  }
  userLastTursoSync.set(userId, { lastSync: now, action })
  
  const turso = getTursoClient()
  if (turso) {
    turso.execute({
      sql: `UPDATE user_presence 
            SET last_action = ?, active_module = coalesce(?, active_module), last_seen = ?, is_online = 1
            WHERE user_id = ?`,
      args: [action, moduleKey || null, now, userId]
    }).catch(() => {})
  }
}

export async function getOnlineUsersReport(forceRefresh = false): Promise<OnlineUsersReport> {
  const now = Date.now()

  // 0. Check in-memory micro-cache (15s TTL)
  if (!forceRefresh && cachedOnlineReport && now - cachedOnlineReport.timestamp < REPORT_CACHE_TTL_MS) {
    return {
      ...cachedOnlineReport.report,
      serverTime: now,
    }
  }

  const activeUsersMap = new Map<string, ActiveUserInfo>()

  // 1. Read in-memory fast map
  for (const [userId, user] of inMemoryPresence.entries()) {
    if (now - user.lastSeen <= PRESENCE_TIMEOUT_MS) {
      activeUsersMap.set(userId, {
        ...user,
        isLive: (now - user.lastSeen < LIVE_WINDOW_MS) && Number(user.isLive) !== 0,
      })
    } else {
      inMemoryPresence.delete(userId)
    }
  }

  // 2. Read dedicated user_presence table for Personnel Activity & Live Status (Full history, up to 500 records)
  const turso = getTursoClient()
  if (turso) {
    try {
      await ensurePresenceTable(turso)
      const res = await turso.execute({
        sql: "SELECT user_id, username, name, role, ccc_code, agencies, active_module, last_action, device_type, browser_name, ip, last_seen, is_online FROM user_presence ORDER BY last_seen DESC LIMIT 500",
        args: []
      })

      for (const row of res.rows) {
        const uId = String(row.user_id)
        let agencies: string[] = []
        try {
          agencies = JSON.parse(String(row.agencies || "[]"))
        } catch {}

        const lastSeen = Number(row.last_seen || 0)
        const isLive = (now - lastSeen < LIVE_WINDOW_MS) && Number(row.is_online || 0) === 1

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
          isLive,
        }
        activeUsersMap.set(uId, info)
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

  // Sort: isLive first, then by lastSeen descending
  onlineUsers.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
    return b.lastSeen - a.lastSeen
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
    const rKey = user.role || "unknown"
    roleStats[rKey] = (roleStats[rKey] || 0) + 1

    // Module Stats
    const mKey = user.activeModule || "home"
    moduleStats[mKey] = (moduleStats[mKey] || 0) + 1

    // Office Stats
    if (user.cccCode) {
      if (!officeStats[user.cccCode]) {
        officeStats[user.cccCode] = {
          cccCode: user.cccCode,
          cccName: user.cccName || user.cccCode,
          onlineCount: 0,
          users: [],
        }
      }
      officeStats[user.cccCode].onlineCount++
      officeStats[user.cccCode].users.push({
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
    }
  })

  const reportResult: OnlineUsersReport = {
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

  // Cache report
  cachedOnlineReport = { report: reportResult, timestamp: now }

  return reportResult
}
