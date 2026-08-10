// Pure types — no Node.js deps, safe to import in "use client" components

export type NSCAppliedClass = "domestic" | "commercial" | "stw" | "industrial"
export type NSCPhase        = "1P" | "3P"
export type NSCStatus       = "pending" | "inspected" | "quotation_issued" | "dispute_issued" | "project_required" | "project_ongoing" | "project_done" | "meter_issued" | "meter_returned" | "connection_effected"
export type NSCDecision     = "accepted" | "rejected" | ""

export function normalizeNSCStatus(rawStatus?: string): string {
  if (!rawStatus) return "pending"
  const s = rawStatus.trim().toLowerCase()
  if (s === "pending" || s === "pending inspection" || s === "pending_inspection") return "pending"
  if (s === "inspected" || s === "inspection completed" || s === "inspection_completed" || s === "inspected completed") return "inspected"
  if (s === "quotation_issued" || s === "quotation issued" || s === "quotation") return "quotation_issued"
  if (s === "dispute_issued" || s === "dispute letter" || s === "dispute issued" || s === "dispute") return "dispute_issued"
  if (s === "project_required" || s === "erection pending" || s === "project required") return "project_required"
  if (s === "project_ongoing" || s === "erection done" || s === "project ongoing") return "project_ongoing"
  if (s === "project_done" || s === "project approved" || s === "project done") return "project_done"
  if (s === "meter_issued" || s === "meter issued") return "meter_issued"
  if (s === "meter_returned" || s === "meter returned") return "meter_returned"
  if (s === "connection_effected" || s === "connection effected" || s === "connection done") return "connection_effected"
  return s
}

export const NSC_CLASSES: { value: NSCAppliedClass; label: string }[] = [
  { value: "domestic",   label: "LT Domestic" },
  { value: "commercial", label: "LT Commercial" },
  { value: "stw",        label: "STW" },
  { value: "industrial", label: "LT Industrial" },
]

export const NSC_PHASES: { value: NSCPhase; label: string }[] = [
  { value: "1P", label: "Single Phase (1P)" },
  { value: "3P", label: "Three Phase (3P)" },
]

export const NSC_STATUS_LABELS: Record<string, string> = {
  pending:             "Pending Inspection",
  inspected:           "Inspection Completed",
  quotation_issued:    "Quotation Issued",
  dispute_issued:      "Dispute Issued",
  project_required:    "Erection Pending",
  project_ongoing:     "Erection Done",
  project_done:        "Project Approved",
  meter_issued:        "Meter Issued",
  meter_returned:      "Meter Returned",
  connection_effected: "Connection Effected",
}

export const NSC_STATUS_COLORS: Record<string, string> = {
  pending:             "bg-yellow-100 text-yellow-800",
  inspected:           "bg-blue-100 text-blue-800",
  quotation_issued:    "bg-green-100 text-green-800",
  dispute_issued:      "bg-red-100 text-red-800",
  project_required:    "bg-orange-100 text-orange-800",
  project_ongoing:     "bg-amber-100 text-amber-800",
  project_done:        "bg-lime-100 text-lime-800",
  meter_issued:        "bg-purple-100 text-purple-800",
  meter_returned:      "bg-orange-100 text-orange-800",
  connection_effected: "bg-teal-100 text-teal-800",
}

export interface NSCApplication {
  // Core application details
  receiveNo:         string
  receivedDate:      string
  applicantName:     string
  careOf:            string
  address:           string
  mobile:            string
  appliedClass:      string
  phase:             string
  agency:            string
  status:            string
  createdBy:         string
  createdAt:         string
  // Inspection — verification of submitted details
  verifyName:        string   // "ok" | corrected value
  verifyCO:          string   // "ok" | corrected value
  verifyAddress:     string   // "ok" | corrected value
  verifyClass:       string   // "ok" | corrected value
  // Inspection — site conditions
  existingMeter:     string   // "yes" | "no"
  existingMeterNo:   string
  existingMeterImg:  string
  validPartition:    string   // "yes" | "no"
  partitionImg:      string
  dispute:           string
  // Inspection — technical
  load:              string   // kW
  serviceLength:     string   // metres
  poleRequired:      string   // "yes" | "no"
  poleDrawingImg:    string
  dtrCapacity:       string
  dtrLoad:           string
  siteImg:           string
  inspectionFormImg: string
  // Inspection — agency decision
  agencyDecision:    string   // "accepted" | "rejected"
  agencyRemarks:     string
  inspectedAt:       string
  inspectedBy:       string
  // Admin processing
  adminDecision:     string   // "accepted" | "rejected"
  adminRemarks:      string
  finalAction:       string   // "quotation" | "dispute_letter" | "reassign"
  memoNo:            string
  applicationNo:     string   // 10-digit for quotation
  finalizedAt:          string
  finalizedBy:          string
  meterIssuedAt:        string
  connectionEffectedAt: string
  meterSerialNo:        string
  // Office reference number — manually assigned by office, always editable
  officeRefNo:          string
  // Link to an NSC project (for infrastructure work before meter issue)
  projectId:            string
  // Legacy import flag
  isLegacy:             string   // "true" | ""
  // Existing consumer ID — entered by admin at processing stage (searchable)
  existingConsumerId:   string
  // Application Form PDF URL
  applicationFormUrl?:  string
  quotationDate?:       string
  appliedDate?:         string
  remarks?:             string
  // GPS Location Coordinates
  latitude?:            string
  longitude?:           string
  // Multi-round inspection history audit log
  inspectionHistory?:   NSCInspectionRound[]
}

export interface NSCInspectionRound {
  round:             number
  agency:            string
  decision:          string
  remarks:           string
  verifyName?:       string
  verifyCO?:         string
  verifyAddress?:    string
  verifyClass?:      string
  existingMeter?:    string
  existingMeterNo?:  string
  existingMeterImg?: string
  validPartition?:   string
  partitionImg?:     string
  dispute?:          string
  load?:             string
  serviceLength?:    string
  poleRequired?:     string
  poleDrawingImg?:   string
  dtrCapacity?:      string
  dtrLoad?:          string
  siteImg?:          string
  inspectionFormImg?: string
  inspectedBy?:      string
  inspectedAt?:      string
  latitude?:         string
  longitude?:        string
}

// ── NSC Project ───────────────────────────────────────────────────────────────
export type NSCProjectStatus = "ongoing" | "done" | "approved"
export type NSCWorkType      = "pole" | "line" | "dtr"

export interface NSCProject {
  projectId:       string   // user-provided, e.g. "NPC/6612107/04/25/001"
  createdAt:       string
  createdBy:       string
  workTypes:       string   // comma-separated: "pole,line" | "dtr" etc.
  poNumber:        string   // 10-digit PO from finance
  agency:          string
  linkedApps:      string   // comma-separated receiveNos
  status:          NSCProjectStatus
  agencyRemarks:   string
  sitePhotoUrl:    string
  completedAt:     string
  completedBy:     string
  adminRemarks:    string
  approvedAt:      string
  approvedBy:      string
}
