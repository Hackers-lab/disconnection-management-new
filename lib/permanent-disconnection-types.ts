// Pure type/constant file — no Node.js dependencies, safe to import in client components.

export type PermanentDisconnectionStatus = "proposed" | "issued" | "disconnected" | "closed"
export type PDMeterCondition = "working" | "faulty" | "burnt" | "damaged"
export type PDMeterReturnStatus = "pending" | "returned"

export interface PermanentDisconnection {
  pdId: string                     // e.g. PD-2026-0001
  consumerId: string               // 9-digit Consumer ID
  consumerName: string
  address: string
  meterNumber?: string             // Meter Number (single source of truth)
  mobile: string
  liveOsdAmount: number            // Live OSD recorded during proposal
  status: PermanentDisconnectionStatus
  agency: string                   // Assigned Agency name
  proposedDate: string             // Date when proposed
  proposedBy: string               // User who proposed
  issuedDate?: string              // Date when issued to agency
  issuedBy?: string                // User who issued
  finalReading?: string            // Last reading on dial
  removedMeterNo?: string          // Dismantled meter serial number
  meterCondition?: PDMeterCondition
  disconnectionDateTime?: string   // Timestamp from GIS execution
  latitude?: string
  longitude?: string
  evidencePhotos?: string          // Comma-separated photo URLs (dial photo + site photo)
  agencyRemarks?: string
  meterReturnStatus?: PDMeterReturnStatus
  meterReturnDate?: string
  meterReturnCondition?: PDMeterCondition
  meterReturnRemarks?: string
  noteSheetNo?: string
  noteSheetDate?: string
  closedRemarks?: string
  createdAt?: string
  updatedAt?: string
}

export type PDTab = "all" | "proposed" | "issued" | "executed" | "return_pending" | "note_sheet_pending" | "completed" | "closed"
