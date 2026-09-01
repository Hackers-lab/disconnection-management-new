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
  lastUpdated: number | null
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
  activeModulesCount: number
  totalModulesCount: number
  lastActiveTimestamp: number | null
  modules: Record<string, SupplyModuleVersionDetail>
}

export interface GlobalVersionSummary {
  totalUpdatesAllSupplies: number
  totalSuppliesCount: number
  activeSuppliesCount: number
  topSupply: { cccCode: string; cccName: string; totalUpdates: number } | null
  topModule: { moduleKey: string; moduleLabel: string; totalUpdates: number } | null
  moduleTotals: Record<string, { moduleKey: string; moduleLabel: string; totalUpdates: number; activeSuppliesCount: number }>
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

  const supplies: SupplyVersionReportItem[] = []
  let totalUpdatesAllSupplies = 0
  let activeSuppliesCount = 0

  const moduleTotals: Record<string, { moduleKey: string; moduleLabel: string; totalUpdates: number; activeSuppliesCount: number }> = {}
  SYSTEM_MODULE_REGISTRY.forEach(mod => {
    moduleTotals[mod.key] = {
      moduleKey: mod.key,
      moduleLabel: mod.label,
      totalUpdates: 0,
      activeSuppliesCount: 0,
    }
  })

  const tenantEntries = Object.entries(tenants)

  for (const [cccCodeRaw, tenant] of tenantEntries) {
    const cccCode = (tenant.cccCode || cccCodeRaw).trim().toUpperCase()
    const cleanTenant = (tenant.cccCode || cccCodeRaw).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
    const modules: Record<string, SupplyModuleVersionDetail> = {}

    let supplyTotalUpdates = 0
    let activeModulesCount = 0
    let lastActiveTimestamp: number | null = null

    for (const mod of SYSTEM_MODULE_REGISTRY) {
      // Check canonical key first, then aliases
      let baseVersion = 1
      let patchVersion = 0
      let patchLog: PatchPayload[] = []

      for (const alias of mod.aliases) {
        const baseKey = `tenant_${cleanTenant}:${alias}:base_version`
        const patchKey = `tenant_${cleanTenant}:${alias}:patch_version`
        const logKey = `tenant_${cleanTenant}:${alias}:patch_log`

        const bVal = allKV[baseKey]
        const pVal = allKV[patchKey]
        const lVal = allKV[logKey]

        if (bVal !== undefined && Number(bVal) > baseVersion) {
          baseVersion = Number(bVal)
        }
        if (pVal !== undefined && Number(pVal) > patchVersion) {
          patchVersion = Number(pVal)
        }
        if (Array.isArray(lVal) && lVal.length > 0) {
          patchLog = lVal
        }
      }

      const totalUpdates = patchVersion
      supplyTotalUpdates += totalUpdates

      let lastUpdated: number | null = null
      let lastAction: "UPDATE" | "DELETE" | null = null
      let lastRecordId: string | null = null
      let recentPatches: PatchPayload[] = []

      if (patchLog && patchLog.length > 0) {
        // Sort descending by timestamp / patchVersion
        const sortedLog = [...patchLog].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        const latest = sortedLog[0]
        if (latest) {
          lastUpdated = latest.timestamp || null
          lastAction = latest.action || null
          lastRecordId = latest.recordId || null
        }
        recentPatches = sortedLog.slice(0, 10)

        if (lastUpdated && (!lastActiveTimestamp || lastUpdated > lastActiveTimestamp)) {
          lastActiveTimestamp = lastUpdated
        }
      }

      const isActive = totalUpdates > 0 || baseVersion > 1

      if (isActive) {
        activeModulesCount++
        moduleTotals[mod.key].activeSuppliesCount++
      }
      moduleTotals[mod.key].totalUpdates += totalUpdates

      modules[mod.key] = {
        moduleKey: mod.key,
        moduleLabel: mod.label,
        shortLabel: mod.shortLabel,
        category: mod.category,
        baseVersion,
        patchVersion,
        versionString: `v${baseVersion}.${patchVersion}`,
        totalUpdates,
        lastUpdated,
        lastAction,
        lastRecordId,
        recentPatches,
        isActive,
      }
    }

    if (supplyTotalUpdates > 0 || activeModulesCount > 0) {
      activeSuppliesCount++
    }
    totalUpdatesAllSupplies += supplyTotalUpdates

    supplies.push({
      cccCode,
      cccName: tenant.cccName || `Care Center ${cccCode}`,
      spreadsheetId: tenant.spreadsheetId,
      totalUpdates: supplyTotalUpdates,
      activeModulesCount,
      totalModulesCount: SYSTEM_MODULE_REGISTRY.length,
      lastActiveTimestamp,
      modules,
    })
  }

  // Sort supplies descending by totalUpdates, then cccCode
  supplies.sort((a, b) => b.totalUpdates - a.totalUpdates || a.cccCode.localeCompare(b.cccCode))

  // Find top supply and top module
  const topSupply = supplies.length > 0 && supplies[0].totalUpdates > 0
    ? { cccCode: supplies[0].cccCode, cccName: supplies[0].cccName, totalUpdates: supplies[0].totalUpdates }
    : null

  let topModule: { moduleKey: string; moduleLabel: string; totalUpdates: number } | null = null
  let maxModUpdates = -1
  for (const mod of SYSTEM_MODULE_REGISTRY) {
    const tot = moduleTotals[mod.key]?.totalUpdates || 0
    if (tot > maxModUpdates && tot > 0) {
      maxModUpdates = tot
      topModule = { moduleKey: mod.key, moduleLabel: mod.label, totalUpdates: tot }
    }
  }

  return {
    supplies,
    globalSummary: {
      totalUpdatesAllSupplies,
      totalSuppliesCount: supplies.length,
      activeSuppliesCount,
      topSupply,
      topModule,
      moduleTotals,
    },
    modulesList: SYSTEM_MODULE_REGISTRY,
  }
}
