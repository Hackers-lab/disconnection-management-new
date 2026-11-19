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

  // Track persistent last updated timestamp and cumulative updates count
  const lastUpdatedKey = getTenantKey(tenantId, `${moduleKey}:last_updated_at`)
  const lifetimeUpdatesKey = getTenantKey(tenantId, `${moduleKey}:lifetime_updates`)
  await setKV(lastUpdatedKey, patchItem.timestamp)
  await incrKV(lifetimeUpdatesKey)

  // Asynchronously record live user activity in presence service
  try {
    import("@/lib/session")
      .then(async ({ verifySession }) => {
        const session = await verifySession()
        if (session?.userId) {
          const { updateUserAction } = await import("@/lib/presence-service")
          const actionLabel =
            payload.action === "DELETE"
              ? `Deleted ${moduleKey.toUpperCase()} #${payload.recordId}`
              : `Updated ${moduleKey.toUpperCase()} #${payload.recordId}`
          updateUserAction(session.userId, actionLabel, moduleKey).catch(() => {})
        }
      })
      .catch(() => {})
  } catch {}

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
 * Preserves lastUpdated timestamp, bumps cumulative metrics, and logs last bump time.
 */
export async function compactBaseVersion(tenantId: string, moduleKey: string): Promise<ModuleVersions> {
  const baseKey = getTenantKey(tenantId, `${moduleKey}:base_version`)
  const patchKey = getTenantKey(tenantId, `${moduleKey}:patch_version`)
  const logKey = getTenantKey(tenantId, `${moduleKey}:patch_log`)
  const lastBumpKey = getTenantKey(tenantId, `${moduleKey}:last_base_bump`)
  const lastUpdatedKey = getTenantKey(tenantId, `${moduleKey}:last_updated_at`)

  const currentBase = (await getKV<number>(baseKey)) || 1
  const currentPatch = (await getKV<number>(patchKey)) || 0
  const nextBase = currentBase + 1
  const now = Date.now()

  // Preserve existing patches AND record this base compaction event in lifetime_updates
  const lifetimeUpdatesKey = getTenantKey(tenantId, `${moduleKey}:lifetime_updates`)
  const existingLifetime = Number((await getKV<number>(lifetimeUpdatesKey)) || 0)
  const nextLifetime = Math.max(existingLifetime, currentPatch) + 1
  await setKV(lifetimeUpdatesKey, nextLifetime)

  await setKV(baseKey, nextBase)
  await setKV(patchKey, 0)
  await setKV(logKey, [])
  await setKV(lastBumpKey, now)
  // Always bump last_updated_at when base version is compacted/rebuilt
  await setKV(lastUpdatedKey, now)

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

export interface SystemModuleMeta {
  key: string
  label: string
  shortLabel: string
  aliases: string[]
  description: string
  category: "operations" | "metering" | "infrastructure" | "safety"
}

export const SYSTEM_MODULE_REGISTRY: SystemModuleMeta[] = [
  {
    key: "consumer",
    label: "Disconnection (DC)",
    shortLabel: "DC",
    aliases: ["disconnection", "consumers", "consumer"],
    description: "Consumer master list, disconnection status, and live field updates",
    category: "operations",
  },
  {
    key: "reconnection",
    label: "Reconnection (RC)",
    shortLabel: "RC",
    aliases: ["reconnection"],
    description: "Reconnection requests, payment verification, and service restoration",
    category: "operations",
  },
  {
    key: "dd",
    label: "Deemed / DD Desk",
    shortLabel: "DD",
    aliases: ["dd", "deemed"],
    description: "Deemed disconnected visits, notice logs, and site verifications",
    category: "operations",
  },
  {
    key: "safety",
    label: "Safety Tickets",
    shortLabel: "Safety",
    aliases: ["safety"],
    description: "Hazard reporting, safety tickets, repairs, and preventive actions",
    category: "safety",
  },
  {
    key: "nsc",
    label: "New Connection (NSC)",
    shortLabel: "NSC",
    aliases: ["nsc"],
    description: "New service connection workflow, quotation, inspection, and release",
    category: "operations",
  },
  {
    key: "icds",
    label: "ICDS Electrification",
    shortLabel: "ICDS",
    aliases: ["icds", "icds-electrification", "icds_electrification"],
    description: "Anganwadi electrification workflow, feasibility survey, estimate, execution, and certification",
    category: "operations",
  },
  {
    key: "meter-replacement",
    label: "Meter Replacement",
    shortLabel: "Meter Repl.",
    aliases: ["meter-replacement", "meter_replacement"],
    description: "Defective meter replacement pipeline and field installation",
    category: "metering",
  },
  {
    key: "meter",
    label: "Meter Stock",
    shortLabel: "Meter Stock",
    aliases: ["meter", "meters", "meter-stock"],
    description: "Meter inventory tracking, stock movements, and assignment",
    category: "metering",
  },
  {
    key: "misc-inspection",
    label: "Misc Inspection",
    shortLabel: "Misc Insp.",
    aliases: ["misc-inspection", "misc_inspection"],
    description: "Ad-hoc consumer and equipment site inspections and audit logs",
    category: "operations",
  },
  {
    key: "dtr",
    label: "DTR Management",
    shortLabel: "DTR",
    aliases: ["dtr"],
    description: "Distribution transformer health, painting, and maintenance audits",
    category: "infrastructure",
  },
  {
    key: "material",
    label: "Material Store",
    shortLabel: "Material",
    aliases: ["material"],
    description: "Store materials inventory, field issues, and receiving records",
    category: "infrastructure",
  },
  {
    key: "permanent-disconnection",
    label: "Permanent Disconnection (PD)",
    shortLabel: "PD",
    aliases: ["permanent-disconnection", "permanent_disconnection", "pd"],
    description: "Permanent meter dismantling, live OSD tracking, store returns & note sheet finalization",
    category: "operations",
  },
  {
    key: "zone-map",
    label: "Zone Mapping",
    shortLabel: "Zone Map",
    aliases: ["zone-map", "zone_map"],
    description: "Agency-to-zone allocation rules, MRU mapping, and team territory configuration",
    category: "infrastructure",
  },
  {
    key: "gis",
    label: "GIS Captures",
    shortLabel: "GIS",
    aliases: ["gis"],
    description: "Geo-tagged field assets, transformer & pole coordinates, and GIS survey submissions",
    category: "infrastructure",
  },
]

export interface SupplyModuleVersionDetail {
  moduleKey: string
  moduleLabel: string
  shortLabel: string
  category: string
  baseVersion: number
  patchVersion: number
  versionString: string
  totalUpdates: number
  lifetimeUpdates: number
  updatesToday: number
  lastUpdated: number | null
  lastCompactedAt: number | null
  lastAction: "UPDATE" | "DELETE" | null
  lastRecordId: string | null
  recentPatches: PatchPayload[]
  isActive: boolean
}

export interface SupplyVersionReportItem {
  cccCode: string
  cccName: string
  spreadsheetId?: string
  totalUpdates: number
  lifetimeUpdates: number
  updatesToday: number
  activeModulesCount: number
  totalModulesCount: number
  lastActiveTimestamp: number | null
  activityTier: "high" | "moderate" | "dormant"
  modules: Record<string, SupplyModuleVersionDetail>
}

export interface GlobalVersionSummary {
  totalUpdatesAllSupplies: number
  totalLifetimeUpdatesAllSupplies: number
  totalUpdatesTodayAllSupplies: number
  totalSuppliesCount: number
  activeSuppliesCount: number
  activeTodaySuppliesCount: number
  topSupply: { cccCode: string; cccName: string; totalUpdates: number; lifetimeUpdates: number; updatesToday: number } | null
  topModule: { moduleKey: string; moduleLabel: string; totalUpdates: number; lifetimeUpdates: number; updatesToday: number } | null
  moduleTotals: Record<string, { moduleKey: string; moduleLabel: string; totalUpdates: number; lifetimeUpdates: number; updatesToday: number; activeSuppliesCount: number }>
}

/**
 * Aggregates live module versions and update metrics for all supplies from KV store.
 */
export async function getSupplyModuleVersionsReport(
  tenants: Record<string, { cccCode: string; cccName: string; spreadsheetId?: string }>
): Promise<{
  supplies: SupplyVersionReportItem[]
  globalSummary: GlobalVersionSummary
  modulesList: SystemModuleMeta[]
}> {
  const { getAllTenantKV } = await import("./kv-store")
  const allKV = await getAllTenantKV()

  // Calculate start of today (midnight IST - UTC+5:30)
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istTime = new Date(now.getTime() + istOffset)
  istTime.setUTCHours(0, 0, 0, 0)
  const startOfTodayMs = istTime.getTime() - istOffset

  const supplies: SupplyVersionReportItem[] = []
  let totalUpdatesAllSupplies = 0
  let totalLifetimeUpdatesAllSupplies = 0
  let totalUpdatesTodayAllSupplies = 0
  let activeSuppliesCount = 0
  let activeTodaySuppliesCount = 0

  const moduleTotals: Record<string, { moduleKey: string; moduleLabel: string; totalUpdates: number; lifetimeUpdates: number; updatesToday: number; activeSuppliesCount: number }> = {}
  SYSTEM_MODULE_REGISTRY.forEach(mod => {
    moduleTotals[mod.key] = {
      moduleKey: mod.key,
      moduleLabel: mod.label,
      totalUpdates: 0,
      lifetimeUpdates: 0,
      updatesToday: 0,
      activeSuppliesCount: 0,
    }
  })

  const tenantEntries = Object.entries(tenants)

  for (const [cccCodeRaw, tenant] of tenantEntries) {
    const cccCode = (tenant.cccCode || cccCodeRaw).trim().toUpperCase()
    const cleanTenant = (tenant.cccCode || cccCodeRaw).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
    const modules: Record<string, SupplyModuleVersionDetail> = {}

    let supplyTotalUpdates = 0
    let supplyLifetimeUpdates = 0
    let supplyUpdatesToday = 0
    let activeModulesCount = 0
    let lastActiveTimestamp: number | null = null

    for (const mod of SYSTEM_MODULE_REGISTRY) {
      // Check canonical key and all aliases, merging patch logs rather than overwriting
      let baseVersion = 1
      let patchVersion = 0
      const mergedPatchLog: PatchPayload[] = []
      const seenPatchKeys = new Set<string>()
      let lastCompactedAt: number | null = null
      let storedLastUpdated: number | null = null
      let storedLifetime = 0

      for (const alias of mod.aliases) {
        const baseKey = `tenant_${cleanTenant}:${alias}:base_version`
        const patchKey = `tenant_${cleanTenant}:${alias}:patch_version`
        const logKey = `tenant_${cleanTenant}:${alias}:patch_log`
        const bumpKey = `tenant_${cleanTenant}:${alias}:last_base_bump`
        const lastUpdatedKey = `tenant_${cleanTenant}:${alias}:last_updated_at`
        const lifetimeKey = `tenant_${cleanTenant}:${alias}:lifetime_updates`

        const bVal = allKV[baseKey]
        const pVal = allKV[patchKey]
        const lVal = allKV[logKey]
        const bumpVal = allKV[bumpKey]
        const luVal = allKV[lastUpdatedKey]
        const ltVal = allKV[lifetimeKey]

        if (bVal !== undefined && Number(bVal) > baseVersion) {
          baseVersion = Number(bVal)
        }
        if (pVal !== undefined && Number(pVal) > patchVersion) {
          patchVersion = Number(pVal)
        }
        if (Array.isArray(lVal) && lVal.length > 0) {
          for (const item of lVal) {
            if (!item || typeof item !== "object") continue
            const dedupeKey = `${item.patchVersion ?? ""}|${item.timestamp ?? ""}|${item.recordId ?? ""}|${item.action ?? ""}`
            if (!seenPatchKeys.has(dedupeKey)) {
              seenPatchKeys.add(dedupeKey)
              mergedPatchLog.push(item as PatchPayload)
            }
          }
        }
        if (bumpVal !== undefined && Number(bumpVal) > (lastCompactedAt || 0)) {
          lastCompactedAt = Number(bumpVal)
        }
        if (luVal !== undefined && Number(luVal) > (storedLastUpdated || 0)) {
          storedLastUpdated = Number(luVal)
        }
        if (ltVal !== undefined && Number(ltVal) > storedLifetime) {
          storedLifetime = Number(ltVal)
        }
      }

      const baseCompactions = Math.max(0, baseVersion - 1)
      const totalUpdates = Math.max(patchVersion, mergedPatchLog.length)
      const lifetimeUpdates = Math.max(storedLifetime, totalUpdates + baseCompactions)
      supplyTotalUpdates += totalUpdates
      supplyLifetimeUpdates += lifetimeUpdates

      let lastUpdated: number | null = storedLastUpdated || null
      let lastAction: "UPDATE" | "DELETE" | null = null
      let lastRecordId: string | null = null
      let recentPatches: PatchPayload[] = []
      let modUpdatesToday = 0

      if (mergedPatchLog.length > 0) {
        // Sort descending by timestamp / patchVersion
        const sortedLog = [...mergedPatchLog].sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0) || (b.patchVersion || 0) - (a.patchVersion || 0)
        )
        const latest = sortedLog[0]
        if (latest) {
          lastUpdated = Math.max(latest.timestamp || 0, lastUpdated || 0) || null
          lastAction = latest.action || null
          lastRecordId = latest.recordId || null
        }
        recentPatches = sortedLog.slice(0, 15)

        // Count updates made today (from patch log)
        for (const p of mergedPatchLog) {
          if (p.timestamp && p.timestamp >= startOfTodayMs) {
            modUpdatesToday++
          }
        }
      }

      // If lastUpdated was not in patch log (e.g. compacted), fallback to lastCompactedAt if newer
      if (lastCompactedAt && (!lastUpdated || lastCompactedAt > lastUpdated)) {
        lastUpdated = lastCompactedAt
      }

      // Count today's bulk compaction/sync events even after patchLog was cleared
      if (modUpdatesToday === 0 && lastUpdated && lastUpdated >= startOfTodayMs && (baseCompactions > 0 || lifetimeUpdates > 0)) {
        modUpdatesToday = 1
      }

      if (lastUpdated && (!lastActiveTimestamp || lastUpdated > lastActiveTimestamp)) {
        lastActiveTimestamp = lastUpdated
      }

      supplyUpdatesToday += modUpdatesToday

      const isActive = totalUpdates > 0 || baseVersion > 1 || lifetimeUpdates > 0

      if (isActive) {
        activeModulesCount++
        moduleTotals[mod.key].activeSuppliesCount++
      }
      moduleTotals[mod.key].totalUpdates += totalUpdates
      moduleTotals[mod.key].lifetimeUpdates += lifetimeUpdates
      moduleTotals[mod.key].updatesToday += modUpdatesToday

      modules[mod.key] = {
        moduleKey: mod.key,
        moduleLabel: mod.label,
        shortLabel: mod.shortLabel,
        category: mod.category,
        baseVersion,
        patchVersion,
        versionString: `v${baseVersion}.${patchVersion}`,
        totalUpdates,
        lifetimeUpdates,
        updatesToday: modUpdatesToday,
        lastUpdated,
        lastCompactedAt,
        lastAction,
        lastRecordId,
        recentPatches,
        isActive,
      }
    }

    if (supplyTotalUpdates > 0 || activeModulesCount > 0 || supplyLifetimeUpdates > 0) {
      activeSuppliesCount++
    }
    if (supplyUpdatesToday > 0) {
      activeTodaySuppliesCount++
    }
    totalUpdatesAllSupplies += supplyTotalUpdates
    totalLifetimeUpdatesAllSupplies += supplyLifetimeUpdates
    totalUpdatesTodayAllSupplies += supplyUpdatesToday

    // Calculate Activity Tier
    let activityTier: "high" | "moderate" | "dormant" = "dormant"
    if (supplyUpdatesToday > 0 || (lastActiveTimestamp && Date.now() - lastActiveTimestamp < 24 * 60 * 60 * 1000)) {
      activityTier = "high"
    } else if (lastActiveTimestamp && Date.now() - lastActiveTimestamp < 7 * 24 * 60 * 60 * 1000) {
      activityTier = "moderate"
    }

    supplies.push({
      cccCode,
      cccName: tenant.cccName || `Care Center ${cccCode}`,
      spreadsheetId: tenant.spreadsheetId,
      totalUpdates: supplyTotalUpdates,
      lifetimeUpdates: supplyLifetimeUpdates,
      updatesToday: supplyUpdatesToday,
      activeModulesCount,
      totalModulesCount: SYSTEM_MODULE_REGISTRY.length,
      lastActiveTimestamp,
      activityTier,
      modules,
    })
  }

  // Sort supplies: highest updatesToday first, then lifetimeUpdates, then totalUpdates, then cccCode
  supplies.sort(
    (a, b) =>
      b.updatesToday - a.updatesToday ||
      b.lifetimeUpdates - a.lifetimeUpdates ||
      b.totalUpdates - a.totalUpdates ||
      a.cccCode.localeCompare(b.cccCode)
  )

  // Find top supply and top module (account for lifetimeUpdates after base compactions)
  const topSupply =
    supplies.length > 0 &&
    (supplies[0].totalUpdates > 0 || supplies[0].updatesToday > 0 || supplies[0].lifetimeUpdates > 0)
      ? {
          cccCode: supplies[0].cccCode,
          cccName: supplies[0].cccName,
          totalUpdates: supplies[0].totalUpdates,
          lifetimeUpdates: supplies[0].lifetimeUpdates,
          updatesToday: supplies[0].updatesToday,
        }
      : null

  let topModule: {
    moduleKey: string
    moduleLabel: string
    totalUpdates: number
    lifetimeUpdates: number
    updatesToday: number
  } | null = null
  let maxModScore = -1
  for (const mod of SYSTEM_MODULE_REGISTRY) {
    const entry = moduleTotals[mod.key]
    const score = Math.max(entry?.lifetimeUpdates || 0, entry?.totalUpdates || 0)
    if (score > maxModScore && score > 0) {
      maxModScore = score
      topModule = {
        moduleKey: mod.key,
        moduleLabel: mod.label,
        totalUpdates: entry?.totalUpdates || 0,
        lifetimeUpdates: entry?.lifetimeUpdates || 0,
        updatesToday: entry?.updatesToday || 0,
      }
    }
  }

  return {
    supplies,
    globalSummary: {
      totalUpdatesAllSupplies,
      totalLifetimeUpdatesAllSupplies,
      totalUpdatesTodayAllSupplies,
      totalSuppliesCount: supplies.length,
      activeSuppliesCount,
      activeTodaySuppliesCount,
      topSupply,
      topModule,
      moduleTotals,
    },
    modulesList: SYSTEM_MODULE_REGISTRY,
  }
}
