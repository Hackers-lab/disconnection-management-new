export type IcdsStage =
  | "PENDING_INSPECTION"
  | "INSPECTED"
  | "APPLICATION_PENDING"
  | "WO_ISSUED"
  | "METER_INSTALLED"
  | "EQUIPMENT_INSTALLED"
  | "COMPLETED"

export type PropertyStatus =
  | "OWN_BUILDING"
  | "SCHOOL"
  | "RENTED"
  | "PRIVATE"
  | "COMMUNITY_HALL"
  | "OTHER"

export type JurisdictionStatus =
  | "UNDER_OFFICE"
  | "OTHER_OFFICE"

export interface CsrEquipmentChecklist {
  mainSwitch16ADp: boolean // 16A-DP Main Switch
  switchBoard5S1R1P: boolean // Switch board with 5 switches, 1 regulator, 1 indicator, 1 plug
  stepRegulatorUsed?: boolean // Step type fan regulator (not dimmer)
  frlsWiringConduit: boolean // 2.5 + 1.5 sq mm FRLS with 20mm PVC conduit
  earthingArrangement: boolean // Earth spike & 8 SWG GI wire
  ledBulbsCount: number // Default 3 (20W x 2 + 9W x 1)
  fan80WCount: number // Default 1
  fanBrand?: string // CGL / Phillips / Orient / equivalent
  labourGangEngaged?: boolean // 1 skilled + 1 unskilled gang
  packageRateRs?: number // EDD/49 Standard Rate: 6611
}

export interface IcdsRecord {
  id: string // e.g. ICDS-2026-0001
  awcCode: string // 11-digit Unique Anganwadi Center Code
  awcName: string // Center Name
  blockName: string // Block Name
  gpName: string // Gram Panchayat Name
  awcAddress: string // Locality / Village address
  propertyStatus: string
  awwName: string // Anganwadi Worker Name
  awwMobile: string // Worker Phone Number
  cdpoName?: string // Child Development Project Officer Name
  assignedAgency?: string // Contractor / Agency assigned
  
  // Jurisdiction & Workflow Stage
  jurisdictionStatus: JurisdictionStatus
  jurisdictionOffice?: string // If under another CCC / subdivision
  stage: IcdsStage
  
  // Stage 1: Inspection & Feasibility
  meterExists: boolean
  existingMeterNo?: string
  existingEquipmentCondition?: string // Notes on existing fans/bulbs/wiring
  existingWiringStatus?: "NO_WIRING" | "EXISTS_DAMAGED" | "EXISTS_WORKING"
  existingLedBulbsCount?: number
  existingFanCount?: number
  newWiringRequired?: boolean
  infraRequired: boolean
  polesRequired?: number
  cableLengthM?: number
  serviceLineLengthM?: number
  proposedDtr?: string
  routeDrawingUrl?: string
  inspectGeoCoordinates?: string // Lat, Long
  inspectDateTime?: string
  inspectedBy?: string
  beforePhotoUrl?: string // Captured during Inspection
  inspectionRemarks?: string

  // Stage 2: Official Connection & Smart Metering (Admin CRM)
  bookletReceived: boolean
  bookletReceivedDate?: string
  bookletScanUrl?: string // Scanned copy of physical application booklet
  officialApplicationNo?: string // 10-digit official WBSEDCL CRM App No
  quotationNo?: string
  quotationDate?: string
  quotationAmount?: number
  workOrderNo?: string
  workOrderDate?: string
  meterIssuedNo?: string
  meterIssuedDate?: string
  smartMeterNo?: string
  meterInstallDate?: string
  meterInitialReading?: string
  meterInstalledBy?: string
  meterPhotoUrl?: string

  // Stage 3: Internal Wiring & CSR Equipment Package
  equipmentPackageInstalled: boolean
  equipmentChecklist?: CsrEquipmentChecklist
  equipmentInstallDate?: string
  equipmentAgency?: string

  // Stage 4: Service Certification & Handover
  afterPhotoUrl?: string // Captured on completion
  certificatePhotoUrl?: string // Scanned signed Service Certificate
  certificateSignatory?: string // Name of AWW / ICDS staff
  certificateSignatoryDesignation?: string
  certificateDate?: string
  finalRemarks?: string

  createdAt: string
  updatedAt: string
}

export interface CreateIcdsInput {
  awcCode: string
  awcName: string
  blockName: string
  gpName: string
  awcAddress?: string
  propertyStatus?: string
  awwName?: string
  awwMobile?: string
  cdpoName?: string
  assignedAgency?: string
  jurisdictionStatus?: JurisdictionStatus
  jurisdictionOffice?: string
  stage?: IcdsStage
}

export interface IcdsInspectionInput {
  jurisdictionStatus: JurisdictionStatus
  jurisdictionOffice?: string
  meterExists: boolean
  existingMeterNo?: string
  existingEquipmentCondition?: string
  infraRequired: boolean
  polesRequired?: number
  cableLengthM?: number
  serviceLineLengthM?: number
  proposedDtr?: string
  routeDrawingUrl?: string
  inspectGeoCoordinates?: string
  inspectDateTime?: string
  inspectedBy?: string
  beforePhotoUrl?: string
  inspectionRemarks?: string
}

export interface IcdsConnectionInput {
  bookletReceived: boolean
  bookletReceivedDate?: string
  officialApplicationNo?: string
  quotationNo?: string
  quotationDate?: string
  workOrderNo?: string
  workOrderDate?: string
  smartMeterNo?: string
  meterInstallDate?: string
  meterInitialReading?: string
  meterInstalledBy?: string
  meterPhotoUrl?: string
  assignedAgency?: string
  inspectionRemarks?: string
}

export interface IcdsEquipmentInput {
  equipmentPackageInstalled: boolean
  equipmentChecklist: CsrEquipmentChecklist
  equipmentInstallDate: string
  equipmentAgency?: string
  inspectionRemarks?: string
}

export interface IcdsCertificateInput {
  afterPhotoUrl: string
  certificatePhotoUrl: string
  certificateSignatory: string
  certificateSignatoryDesignation?: string
  certificateDate: string
  finalRemarks?: string
}

export interface IcdsEditInput {
  blockName?: string
  gpName?: string
  awcName?: string
  awcCode?: string
  awcAddress?: string
  propertyStatus?: string
  awwName?: string
  awwMobile?: string
  cdpoName?: string
  assignedAgency?: string
  jurisdictionStatus?: JurisdictionStatus
  jurisdictionOffice?: string
}

export interface IcdsAgencyMetrics {
  agency: string
  totalAllocated: number
  inspected: number
  bookletsReceived: number
  workOrdersIssued: number
  metersInstalled: number
  equipmentInstalled: number
  completed: number
  completionRate: number
}
