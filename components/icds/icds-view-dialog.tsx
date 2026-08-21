"use client"

import type { IcdsRecord } from "@/lib/icds-types"
import { generateIcdsServiceCertificatePDF } from "@/lib/icds-pdf"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import {
  Building2,
  MapPin,
  Phone,
  User,
  Zap,
  Gauge,
  Layers,
  Award,
  Download,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  RadioTower,
} from "lucide-react"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
}

export function IcdsViewDialog({ record, open, onClose }: Props) {
  if (!record) return null

  const handleDownloadPDF = () => {
    try {
      const doc = generateIcdsServiceCertificatePDF(record)
      doc.save(`WBSEDCL_Service_Certificate_${record.awcCode || record.id}.pdf`)
      toast.success("Official WBSEDCL Service Certificate PDF generated!")
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message)
    }
  }

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case "COMPLETED":
        return <Badge className="bg-emerald-600 text-white font-semibold text-xs">Completed & Certified</Badge>
      case "EQUIPMENT_INSTALLED":
        return <Badge className="bg-purple-600 text-white font-semibold text-xs">Wiring & Equipment Done</Badge>
      case "METER_INSTALLED":
        return <Badge className="bg-indigo-600 text-white font-semibold text-xs">Smart Meter Installed</Badge>
      case "WO_ISSUED":
        return <Badge className="bg-blue-600 text-white font-semibold text-xs">Work Order Issued</Badge>
      case "APPLICATION_PENDING":
        return <Badge className="bg-sky-600 text-white font-semibold text-xs">Application Received</Badge>
      case "INSPECTED":
        return <Badge className="bg-amber-600 text-white font-semibold text-xs">Inspected</Badge>
      default:
        return <Badge variant="outline" className="text-slate-600 text-xs">Pending Inspection</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="border-b pb-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-200 shrink-0">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                  {record.awcName}
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    {record.awcCode}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-medium mt-0.5">
                  {record.blockName} • {record.gpName} • {record.awcAddress || "No address specified"}
                </DialogDescription>
              </div>
            </div>
            <div>{getStageBadge(record.stage)}</div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Section 1: Basic & Contact Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Property Status</span>
              <p className="font-bold text-slate-800 mt-0.5">{record.propertyStatus?.replace("_", " ") || "Own Building"}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Anganwadi Worker</span>
              <p className="font-bold text-slate-800 mt-0.5">{record.awwName || "N/A"}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Worker Mobile</span>
              <p className="font-mono font-bold text-blue-600 mt-0.5">{record.awwMobile || "N/A"}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Contractor</span>
              <p className="font-bold text-slate-800 mt-0.5">{record.assignedAgency || "Unassigned"}</p>
            </div>
          </div>

          {/* Section 2: Inspection & Infrastructure */}
          <div className="border rounded-lg p-3 space-y-2 bg-white">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 border-b pb-1">
              <MapPin className="h-4 w-4 text-amber-600" />
              Stage 1: Primary Inspection & Site Feasibility
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div>
                <span className="text-slate-400">Jurisdiction:</span>
                <p className="font-semibold text-slate-700">
                  {record.jurisdictionStatus === "UNDER_OFFICE" ? "Under This Office" : `Other: ${record.jurisdictionOffice || "Adjacent CCC"}`}
                </p>
              </div>
              <div>
                <span className="text-slate-400">GPS Coordinates:</span>
                <p className="font-mono font-semibold text-slate-700 flex items-center gap-1">
                  {record.inspectGeoCoordinates ? (
                    <a
                      href={`https://www.google.com/maps?q=${record.inspectGeoCoordinates}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-0.5"
                    >
                      {record.inspectGeoCoordinates} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "Not Captured"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Meter Exists:</span>
                <p className="font-semibold text-slate-700">
                  {record.meterExists ? `Yes (${record.existingMeterNo || "Metered"})` : "No (Un-electrified)"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Infra Required:</span>
                <p className="font-semibold text-slate-700">
                  {record.infraRequired ? `${record.polesRequired || 0} Poles, ${record.cableLengthM || 0}m Cable` : "Direct Line"}
                </p>
              </div>
            </div>
            {record.inspectionRemarks && (
              <div className="text-[11px] bg-slate-50 p-2 rounded text-slate-600 mt-1">
                <strong>Field Remarks:</strong> {record.inspectionRemarks}
              </div>
            )}
          </div>

          {/* Section 3: Connection & Smart Metering */}
          <div className="border rounded-lg p-3 space-y-2 bg-white">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 border-b pb-1">
              <Gauge className="h-4 w-4 text-indigo-600" />
              Stage 2: Official Connection & Smart Meter (Admin CRM)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div>
                <span className="text-slate-400">Booklet Received:</span>
                <p className="font-semibold text-slate-700 flex items-center gap-1">
                  {record.bookletReceived ? `Yes (${record.bookletReceivedDate || "Logged"})` : "Pending"}
                  {record.bookletScanUrl && (
                    <a href={record.bookletScanUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline text-[10px]" title="View Scan">
                      [Scan]
                    </a>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">10-Digit CRM App No:</span>
                <p className="font-mono font-bold text-indigo-700">{record.officialApplicationNo || "Pending"}</p>
              </div>
              <div>
                <span className="text-slate-400">Quotation No / Amount:</span>
                <p className="font-semibold text-slate-700">
                  {record.quotationNo ? `${record.quotationNo} (₹${record.quotationAmount || 6611})` : "Pending"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Work Order No:</span>
                <p className="font-semibold text-slate-700">{record.workOrderNo || "Pending"}</p>
              </div>
            </div>
          </div>

          {/* Section 4: CSR Standard Package Checklist */}
          {record.equipmentChecklist && (
            <div className="border rounded-lg p-3 space-y-2 bg-white">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 border-b pb-1">
                <Layers className="h-4 w-4 text-purple-600" />
                Stage 3: Standard CSR Electrification Package (EDD/49)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <span className="text-slate-400">16A-DP Main Switch:</span>
                  <p className="font-semibold text-slate-700">{record.equipmentChecklist.mainSwitch16ADp ? "Installed" : "No"}</p>
                </div>
                <div>
                  <span className="text-slate-400">5-Switch Board & Regulator:</span>
                  <p className="font-semibold text-slate-700">{record.equipmentChecklist.switchBoard5S1R1P ? "Installed (Step Type)" : "No"}</p>
                </div>
                <div>
                  <span className="text-slate-400">FRLS Wiring & Conduit:</span>
                  <p className="font-semibold text-slate-700">{record.equipmentChecklist.frlsWiringConduit ? "2.5+1.5 sq mm Done" : "No"}</p>
                </div>
                <div>
                  <span className="text-slate-400">LED Bulbs & 80W Fan:</span>
                  <p className="font-semibold text-slate-700">
                    {record.equipmentChecklist.ledBulbsCount || 3} Bulbs, {record.equipmentChecklist.fan80WCount || 1} Fan ({record.equipmentChecklist.fanBrand || "CGL"})
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Photo Gallery (Before, After, Meter, Certificate) */}
          <div className="border rounded-lg p-3 space-y-2 bg-white">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 border-b pb-1">
              <Award className="h-4 w-4 text-emerald-600" />
              Stage 4: Visual Audit & Service Certificate Photos
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {/* Before Photo */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-600">1. Before Photo (Raw)</span>
                {record.beforePhotoUrl ? (
                  <a href={record.beforePhotoUrl} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden h-24 hover:opacity-90">
                    <img src={record.beforePhotoUrl} alt="Before" className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="h-24 border border-dashed rounded bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                    No Photo
                  </div>
                )}
              </div>

              {/* After Photo */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-600">2. After Photo (Illuminated)</span>
                {record.afterPhotoUrl ? (
                  <a href={record.afterPhotoUrl} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden h-24 hover:opacity-90">
                    <img src={record.afterPhotoUrl} alt="After" className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="h-24 border border-dashed rounded bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                    No Photo
                  </div>
                )}
              </div>

              {/* Smart Meter Photo */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-600">3. Smart Meter Photo</span>
                {record.meterPhotoUrl ? (
                  <a href={record.meterPhotoUrl} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden h-24 hover:opacity-90">
                    <img src={record.meterPhotoUrl} alt="Meter" className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="h-24 border border-dashed rounded bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                    No Photo
                  </div>
                )}
              </div>

              {/* Certificate Photo */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-600">4. Service Certificate</span>
                {record.certificatePhotoUrl ? (
                  <a href={record.certificatePhotoUrl} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden h-24 hover:opacity-90">
                    <img src={record.certificatePhotoUrl} alt="Certificate" className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="h-24 border border-dashed rounded bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                    No Photo
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t pt-3 flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            onClick={handleDownloadPDF}
            className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download Service Certificate PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClose}
            className="text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
