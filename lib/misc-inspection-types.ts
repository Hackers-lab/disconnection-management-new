export type InspectionCategory =
  | "SHIFTING"
  | "METER_CHECK"
  | "NETWORK_LINE"
  | "DTR_LOAD"
  | "NSC_DRAWING"
  | "GENERAL"

export type InspectionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

export type InspectionStatus =
  | "PENDING_AGENCY"
  | "IN_PROGRESS"
  | "INSPECTED"
  | "FINALIZED"
  | "REJECTED"

export type AgencyDecision =
  | "SATISFACTORY"
  | "UNSATISFACTORY"
  | "ACTION_REQUIRED"
  | "REJECTED"

export type AdminDecision = "APPROVED" | "REJECTED" | "RE_INSPECT"

export interface DynamicCategoryFields {
  // Shifting fields
  proposedShiftAddress?: string
  shiftingType?: "METER_SHIFTING" | "LINE_SHIFTING" | "POLE_SHIFTING" | "OTHER"
  tariffClass?: string
  
  // Meter Check fields
  meterSerialNo?: string
  currentReadingKwh?: string
  meterDisplayCondition?: "NORMAL" | "BLANK" | "BURNT" | "FAULTY"
  sealsIntact?: "YES" | "NO" | "TAMPERED"

  // Network & Line fields
  feederName?: string
  poleNo?: string
  groundClearanceMeters?: string
  hazardLevel?: "LOW" | "MEDIUM" | "HIGH"
  proposedMaterialRequired?: string

  // DTR Load fields
  dtrName?: string
  dtrCapacityKva?: string
  rPhaseAmps?: string
  yPhaseAmps?: string
  bPhaseAmps?: string
  oilLevelStatus?: "NORMAL" | "LOW" | "LEAKAGE"
  neutralEarthResistanceOhms?: string

  // NSC Drawing fields
  nscApplicationNo?: string
  validPartition?: "YES" | "NO"
  distanceFromDtrMeters?: string
  poleRequiredCount?: string
  serviceLineLengthMeters?: string

  // General fields
  customCategoryTag?: string
  observationSummary?: string
}

export interface MiscInspectionRecord {
  id: string // Unique inspection ID e.g. MISC-2026-0001
  referenceNo: string // Consumer ID, File No, Application No, or Ref ID
  category: InspectionCategory
  categoryLabel?: string
  title: string
  description: string
  
  // Linked entities
  consumerId?: string
  dtrId?: string
  applicantName?: string
  address?: string
  mobile?: string

  // Priority & Assignment
  priority: InspectionPriority
  agency: string
  targetCompletionDate?: string
  status: InspectionStatus

  // Created Metadata
  createdBy: string
  createdAt: string

  // Category specific dynamic data
  categoryFields?: DynamicCategoryFields

  // Agency Inspection Findings
  inspectedBy?: string
  inspectedAt?: string
  agencyDecision?: AgencyDecision
  agencyRemarks?: string
  sitePhotoUrl?: string
  meterReadingPhotoUrl?: string
  sketchDrawingUrl?: string
  geoCoordinates?: string // "latitude, longitude"
  
  // Quick summary fields extracted from category fields for quick viewing
  existingMeterNo?: string
  meterReading?: string
  measuredLoadKw?: string
  lineLengthMeters?: string

  // Admin Finalization
  adminDecision?: AdminDecision
  adminRemarks?: string
  memoNo?: string
  finalizedBy?: string
  finalizedAt?: string
}

export interface CreateMiscInspectionInput {
  referenceNo: string
  category: InspectionCategory
  title: string
  description: string
  consumerId?: string
  dtrId?: string
  applicantName?: string
  address?: string
  mobile?: string
  priority: InspectionPriority
  agency: string
  targetCompletionDate?: string
  categoryFields?: DynamicCategoryFields
}

export interface AgencyInspectionUpdateInput {
  agencyDecision: AgencyDecision
  agencyRemarks?: string
  inspectedBy?: string
  sitePhotoUrl?: string
  meterReadingPhotoUrl?: string
  sketchDrawingUrl?: string
  geoCoordinates?: string
  existingMeterNo?: string
  meterReading?: string
  measuredLoadKw?: string
  lineLengthMeters?: string
  categoryFields?: DynamicCategoryFields
}

export interface AdminFinalizeInput {
  adminDecision: AdminDecision
  adminRemarks?: string
  memoNo?: string
}
