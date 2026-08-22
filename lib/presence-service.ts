import { getKV, setKV } from "./kv-store"
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

const inMemoryPresence = new Map<string, ActiveUserInfo>()
const PRESENCE_TIMEOUT_MS = 180_000 // 3 minutes

export function parseDeviceFromUserAgent(ua = ""): {
  deviceType: "Desktop" | "Mobile" | "Tablet"
  browserName: string
} {
  let deviceType: "Desktop" | "Mobile" | "Tablet" = "Desktop"
  if (/ipad|tablet|playbook|silk/i.test(ua)) {
    deviceType = "Tablet"
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua)) {
    deviceType = "Mobile"
  }

  let browserName = "Web Browser"
  if (/edg\//i.test(ua)) browserName = "Edge"
  else if (/chrome|crios/i.test(ua)) browserName = "Chrome"
  else if (/firefox|fxios/i.test(ua)) browserName = "Firefox"
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browserName = "Safari"
  else if (/opera|opr\//i.test(ua)) browserName = "Opera"

  if (/windows/i.test(ua)) browserName += " (Windows)"
  else if (/android/i.test(ua)) browserName += " (Android)"
  else if (/iphone|ipad|ios/i.test(ua)) browserName += " (iOS)"
  else if (/macintosh|mac os/i.test(ua)) browserName += " (macOS)"
  else if (/linux/i.test(ua)) browserName += " (Linux)"

  return { deviceType, browserName }
}

export async function trackUserPresence(
  user: Omit<ActiveUserInfo, "isLive">
): Promise<void> {
  const now = Date.now()
  const key = `presence:user:${user.userId}`
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

  try {
    setKV(key, record, 180).catch(() => {})
    const indexKey = "presence:active_user_index"
    getKV<string[]>(indexKey)
      .then((existingIds) => {
        const idSet = new Set(existingIds || [])
        idSet.add(user.userId)
        setKV(indexKey, Array.from(idSet).slice(-200), 300).catch(() => {})
      })
      .catch(() => {})
  } catch (e) {}
}

export async function removeUserPresence(userId: string): Promise<void> {
  inMemoryPresence.delete(userId)
  try {
    setKV(`presence:user:${userId}`, null, 1).catch(() => {})
  } catch (er2) {}
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
    setKV(`presence:user:${userId}`, existing, 180).catch(() => {})
  }
}

export async function getOnlineUsersReport(): Promise<OnlineUsersReport> {
  const now = Date.now()
  const activeUsersMap = new Map<string, ActiveUserInfo>()

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

  try {
    const indexKey = "presence:active_user_index"
    const userIds = await getKV<string[]>(indexKey)
    if (Array.isArray(userIds) && userIds.length > 0) {
      const missingIds = userIds.filter(id => !activeUsersMap.has(id))
      const kvPromises = missingIds.map(async id => {
        try {
          const u = await getKV<ActiveUserInfo>(`presence:user:${id}`)
          if (u && typeof u === "object" && u.userId && now - u.lastSeen <= PRESENCE_TIMEOUT_MS) {
            return {
              ...u,
              isLive: now - user.lastSeen < 60_000,
            }
          }
        } catch (err) {}
        return null
      })

      const fetchedUsers = await Promise.allSettled(kvPromises)
      fetchedUsers.forEach(res => {
        if (res.status === "i�lfilled" && res.value) {
          activeUsersMap.set(res.value.userId, res.value)
          inMemoryPresence.set(res.value.userId, res.value)
        }
      })
    }
  } catch (er2) {}


  let tenantsRegistry: Record<string, { cccCode: string; cccName: string }> = {}
  try {
    tenantsRegistry = await getTenantRegistry()
  } catch (err) {}

  const onlineUsersList = Array.from(activeUsersMap.values()).map((user) => {
    const tenant = tenantsRegistry[user.cccCode] || tenantsRegistry[user.cccCode.toLowerCase()]
    const cccName = user.cccName || tenant?.cccName || `Care Center ${user.cccCode}`
    return {
      ...user,
      cccName,
      isLive: now - user.lastSeen < 60_000,
    }
  })

  // Sort: isLive first, then by lastSeen descending
  onlineUsersList.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
    return b.lastSeen - a.lastSeen
  })

  let activeNowCount = 0
  let idleCount = 0
  const roleStats: Record<string, number> = {}
  const moduleStats: Record<string, number> = {}
  const officeStats: Record<string, OfficeOnlineSummary> = {}

  Object.values(tenantsRegistry).forEach((t) => {
    const code = t.cccCode.trim().toUpperCase()
    officeStats[code] = {
      cccCode: code,
      cccName: t.cccName || `Care Center ${code}`,
      onlineCount: 0,
      users: [],
    }
  })


  for (const user of onlineUsersList) {
    if (user.isLive) activeNowCount++
    else idleCount++
    const roleKey = (user.role || "user").toLowerCase()
    roleStats[roleKey] = (roleStats[roleKey] || 0) + 1

    if (user.activeModule) {
      moduleStats[user.activeModule] = (moduleStats[user.activeModule] || 0) + 1
    }

    const cccKey = (user.cccCode || "UNKNOWN").trim().toUpperCase()
    if (!officeStats[cccKey]) {
      officeStats[cccKey] = {
        cccCode: cccKey,
        cccName: user.cccName || `Care Center ${cccKey}`,
        onlineCount: 0,
        users: [],
      }
    }
    officeStats[cccKey].onlineCount++
    officeStats[cccKey].users.push({
      userId: user.userId,
      username: user.username,
      name: user.name,
      role: user.role,
      agencies: user.agencies || [],
      activeModule: user.activeModule,
      lastAction: user.lastAction,
      lastSeen: user.lastSeen,
      isLive: user.isLive,
    })
  }

  const totalOfficesActive = Object.values(officeStats).filter((o) => o.onlineCount > 0).length

  return {
    onlineUsers: onlineUsersList,
    totalOnline: onlineUsersList.length,
    activeNowCount,
    idleCount,
    totalOfficesActive,
    officeStats,
    roleStats,
    moduleStats,
    serverTime: now,
  }
}
