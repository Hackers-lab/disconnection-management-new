import { getKV, setKV, incrKV, getTenantKey } from "./kv-store"

export interface PatchPayload {
  action: "UPDATE" | "DELETE"
  recordId: string
  moduleKey: string
  changes?: Record<string, any>
  timestamp: number
  patchVersion: number
}

export interface ModuleVersions {
  baseVersion: number
  patchVersion: number
}

export interface BadgeCountsMap {
  badgeVersion: number
  adminCounts: Record<string, number>
  agencyCounts: Record<string, Record<string, number>>
}

/**
 * Fetch current base and patch versions for a specific module and tenant.
 */
export async function getModuleVersions(tenantId: string, moduleKey: string): Promise<ModuleVersions> {
  const baseKey = getTenantKey(tenantId, `${moduleKey}:base_version`)
  const patchKey = getTenantKey(tenantId, `${moduleKey}:patch_version`)

  const baseVersion = (await getKV<number>(baseKey)) || 1
  const patchVersion = (await getKV<number>(patchKey)) || 0

  return { baseVersion, patchVersion }
}

/**
 * Append a delta modification or tombstone ("DELETE") event to the KV patch log.
 */
export async function appendDeltaPatch(
  tenantId: string,
  moduleKey: string,
  payload: { action: "UPDATE" | "DELETE"; recordId: string; changes?: Record<string, any> }
): Promise<PatchPayload> {
  const patchKey = getTenantKey(tenantId, `${moduleKey}:patch_version`)
  const logKey = getTenantKey(tenantId, `${moduleKey}:patch_log`)

  const nextVersion = await incrKV(patchKey)
  const patchItem: PatchPayload = {
    action: payload.action,
    recordId: payload.recordId,
    moduleKey,
    changes: payload.changes || {},
    timestamp: Date.now(),
    patchVersion: nextVersion,
  }

  const existingLog = (await getKV<PatchPayload[]>(logKey)) || []
  const updatedLog = [...existingLog, patchItem].slice(-200) // Keep last 200 patches for compaction threshold
  await setKV(logKey, updatedLog)

  return patchItem
}

/**
 * Fetch delta patches created since a given client patch version.
 */
export async function getDeltaPatchesSince(
  tenantId: string,
  moduleKey: string,
  sincePatchVersion: number
): Promise<PatchPayload[]> {
  const logKey = getTenantKey(tenantId, `${moduleKey}:patch_log`)
  const log = (await getKV<PatchPayload[]>(logKey)) || []
  return log.filter(item => item.patchVersion > sincePatchVersion)
}

/**
 * Compact / Reset base version for a module, forcing all clients to re-sync full Base dataset.
 */
export async function compactBaseVersion(tenantId: string, moduleKey: string): Promise<ModuleVersions> {
  const baseKey = getTenantKey(tenantId, `${moduleKey}:base_version`)
  const patchKey = getTenantKey(tenantId, `${moduleKey}:patch_version`)
  const logKey = getTenantKey(tenantId, `${moduleKey}:patch_log`)

  const currentBase = (await getKV<number>(baseKey)) || 1
  const nextBase = currentBase + 1

  await setKV(baseKey, nextBase)
  await setKV(patchKey, 0)
  await setKV(logKey, [])

  return { baseVersion: nextBase, patchVersion: 0 }
}

/**
 * Atomically update tenant badge counts (admin and agency-scoped).
 */
export async function updateBadgeCounts(
  tenantId: string,
  moduleKey: string,
  agency?: string,
  delta = 0
): Promise<BadgeCountsMap> {
  const badgeKey = getTenantKey(tenantId, "badge_counts")
  const currentMap = (await getKV<BadgeCountsMap>(badgeKey)) || {
    badgeVersion: 1,
    adminCounts: {},
    agencyCounts: {},
  }

  const currentAdmin = currentMap.adminCounts[moduleKey] || 0
  const nextAdmin = Math.max(0, currentAdmin + delta)
  currentMap.adminCounts[moduleKey] = nextAdmin

  if (agency && agency.trim()) {
    const cleanAgency = agency.trim().toUpperCase()
    currentMap.agencyCounts[cleanAgency] = currentMap.agencyCounts[cleanAgency] || {}
    const currentAgencyCount = currentMap.agencyCounts[cleanAgency][moduleKey] || 0
    currentMap.agencyCounts[cleanAgency][moduleKey] = Math.max(0, currentAgencyCount + delta)
  }

  currentMap.badgeVersion = (currentMap.badgeVersion || 1) + 1
  await setKV(badgeKey, currentMap)

  return currentMap
}

/**
 * Get scoped badge counts for a given user role and agency.
 */
export async function getScopedBadgeCounts(
  tenantId: string,
  role?: string,
  agency?: string
): Promise<{ badgeVersion: number; counts: Record<string, number> }> {
  const badgeKey = getTenantKey(tenantId, "badge_counts")
  const map = (await getKV<BadgeCountsMap>(badgeKey)) || {
    badgeVersion: 1,
    adminCounts: {},
    agencyCounts: {},
  }

  const isAdmin = role?.toLowerCase() === "admin" || role?.toLowerCase() === "executive"
  if (isAdmin || !agency) {
    return { badgeVersion: map.badgeVersion, counts: map.adminCounts }
  }

  const cleanAgency = agency.trim().toUpperCase()
  const scopedCounts = map.agencyCounts[cleanAgency] || {}
  return { badgeVersion: map.badgeVersion, counts: scopedCounts }
}
