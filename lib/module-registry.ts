export interface PlatformModuleManifest {
  id: string
  title: string
  sheetTab: string
  primaryKey: string
  idPrefix?: string
  cacheKey: string
  permissions: string[]
  badgeRule?: {
    targetStatus: string[]
    agencyScoped: boolean
  }
}

export const MODULE_REGISTRY: Record<string, PlatformModuleManifest> = {
  disconnection: {
    id: "disconnection",
    title: "Disconnection",
    sheetTab: "Sheet1",
    primaryKey: "consumerId",
    cacheKey: "consumers_data_cache",
    permissions: ["read", "update"],
    badgeRule: { targetStatus: ["connected"], agencyScoped: true },
  },
  reconnection: {
    id: "reconnection",
    title: "Reconnection",
    sheetTab: "Reconnection",
    primaryKey: "reconnectionId",
    idPrefix: "REC-",
    cacheKey: "reconnection_data_cache",
    permissions: ["read", "create", "update"],
  },
  deemed: {
    id: "deemed",
    title: "Deemed Disconnection",
    sheetTab: "DD",
    primaryKey: "consumerId",
    cacheKey: "dd_data_cache",
    permissions: ["read", "update"],
    badgeRule: { targetStatus: ["deemed disconnected"], agencyScoped: true },
  },
  dtr: {
    id: "dtr",
    title: "DTR Inspection",
    sheetTab: "DTR",
    primaryKey: "dtrCode",
    cacheKey: "dtr_data_cache",
    permissions: ["read", "update"],
  },
  "dtr-painting": {
    id: "dtr-painting",
    title: "DTR Painting",
    sheetTab: "DTR",
    primaryKey: "dtrCode",
    cacheKey: "dtr_data_cache",
    permissions: ["read", "update"],
    badgeRule: { targetStatus: ["pending"], agencyScoped: true },
  },
  safety: {
    id: "safety",
    title: "Safety Inspection",
    sheetTab: "Safety_Module",
    primaryKey: "safetyId",
    idPrefix: "SAF-",
    cacheKey: "safety_data_cache",
    permissions: ["read", "create", "update"],
    badgeRule: { targetStatus: ["pending"], agencyScoped: true },
  },
  "misc-inspection": {
    id: "misc-inspection",
    title: "Misc Inspection",
    sheetTab: "Misc_Inspections",
    primaryKey: "id",
    idPrefix: "MISC-",
    cacheKey: "misc_inspection_cache",
    permissions: ["read", "create", "update"],
    badgeRule: { targetStatus: ["PENDING_AGENCY", "IN_PROGRESS"], agencyScoped: true },
  },
  nsc: {
    id: "nsc",
    title: "NSC Management",
    sheetTab: "NSC_Applications",
    primaryKey: "receiveNo",
    idPrefix: "NSC/",
    cacheKey: "nsc_data_cache",
    permissions: ["read", "create", "update"],
  },
  meter: {
    id: "meter",
    title: "Meter Management",
    sheetTab: "Meter_Issues",
    primaryKey: "issueId",
    idPrefix: "MI-",
    cacheKey: "meter_issues_cache",
    permissions: ["read", "create", "update"],
  },
  "meter-replacement": {
    id: "meter-replacement",
    title: "Meter Replacement",
    sheetTab: "Meter_Replacement",
    primaryKey: "replacementId",
    idPrefix: "MR-",
    cacheKey: "meter_replacement_data_cache",
    permissions: ["read", "create", "update"],
    badgeRule: { targetStatus: ["proposed"], agencyScoped: true },
  },
  "consumer-master": {
    id: "consumer-master",
    title: "Consumer Master",
    sheetTab: "Consumer_Master",
    primaryKey: "consumerId",
    cacheKey: "consumer_master_cache",
    permissions: ["read"],
  },
  material: {
    id: "material",
    title: "Material Management",
    sheetTab: "Mat_Catalogue",
    primaryKey: "materialId",
    idPrefix: "MAT-",
    cacheKey: "material_stock_cache",
    permissions: ["read", "create", "update"],
  },
}
