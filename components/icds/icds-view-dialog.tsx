"use client"

import { useState } from "react"
import type { IcdsRecord } from "@/lib/icds-types"
import { generateIcdsServiceCertificatePDF } from "@/lib/icds-pdf"
import { getGoogleDriveDirectLink, handleImageError } from "@/lib/image-utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Image as ImageIcon,
  DownloadCloud,
  X,
  Sparkles,
  Maximize2
} from "lucide-react"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  officeName?: string
}

interface PreviewImage {
  url: string
  title: string
  centerCode: string
  type: string
}

export function IcdsViewDialog({ record, open, onClose, officeName }: Props) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)

  if (!record) return null

  const displayOfficeName =
    officeName?.trim() ||
    (typeof window !== "undefined"
      ? localStorage.getItem("user_ccc_name") ||
        sessionStorage.getItem("user_ccc_name") ||
        localStorage.getItem("user_ccc_code") ||
        sessionStorage.getItem("user_ccc_code")
      : "") ||
    "This Office"

  const handleDownloadPDF = () => {
    try {
      const doc = generateIcdsServiceCertificatePDF(record)
      doc.save(`WBSEDCL_Service_Certificate_${record.awcCode || record.id}.pdf`)
      toast.success("Official WBSEDCL Service Certificate PDF generated!")
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message)
    }
  }

  const handleDownloadPreviewImage = async (img: PreviewImage) => {
    try {
      const directUrl = getGoogleDriveDirectLink(img.url, 1600)
      const res = await fetch(directUrl)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${img.centerCode}_${img.type}_Photo.jpg`.replace(/\s+/g, "_")
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success("Photo downloaded successfully")
    } catch (e) {
      window.open(img.url, "_blank")
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

  const formatWiringStatus = (status?: string) => {
    switch (status) {
      case "NO_WIRING":
        return "No Internal Wiring"
      case "EXISTS_DAMAGED":
        return "Wiring Exists (Damaged / Defunct)"
      case "EXISTS_WORKING":
        return "Wiring Exists (Functional)"
      default:
        return record.newWiringRequired ? "Wiring Required" : "Wiring Exists"
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6 font-sans">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 shadow-sm">
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
                <p className="font-mono font-bold text-blue-600 mt-0.5">
                  {record.awwMobile ? (
                    <a href={`tel:${record.awwMobile}`} className="hover:underline">{record.awwMobile}</a>
                  ) : "N/A"}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Contractor</span>
                <p className="font-bold text-slate-800 mt-0.5">{record.assignedAgency || "Unassigned"}</p>
              </div>
            </div>

            {/* Section 2: Stage 1 Primary Inspection & Comprehensive Feasibility Details */}
            <div className="border border-slate-200/80 rounded-xl p-3.5 space-y-3 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b pb-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <MapPin className="h-4 w-4 text-amber-600" />
                  Stage 1: Primary Inspection & Electrical Feasibility
                </h4>
                {record.inspectedBy && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    By: <strong className="text-slate-700">{record.inspectedBy}</strong> {record.inspectDateTime ? `(${record.inspectDateTime})` : ""}
                  </span>
                )}
              </div>

              {/* Row 1: Jurisdiction, Location & Line Infra */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <span className="text-slate-400 block text-[11px]">Jurisdiction:</span>
                  <p className="font-semibold text-slate-700">
                    {record.jurisdictionStatus === "UNDER_OFFICE" ? `Under ${displayOfficeName}` : `Other: ${record.jurisdictionOffice || "Adjacent CCC"}`}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">GPS Coordinates:</span>
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
                  <span className="text-slate-400 block text-[11px]">Existing Meter:</span>
                  <p className="font-semibold text-slate-700">
                    {record.meterExists ? `Yes (${record.existingMeterNo || "Metered"})` : "No (Un-electrified)"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Infra Required:</span>
                  <p className="font-semibold text-slate-700">
                    {record.infraRequired ? `${record.polesRequired || 0} Poles, ${record.cableLengthM || 0}m Cable` : "Direct Service Line"}
                  </p>
                </div>
              </div>

              {/* Row 2: Comprehensive Wiring & Existing Equipment Audit */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 bg-slate-50/60 p-2.5 rounded-lg">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Wiring Requirement</span>
                  <p className={`font-bold mt-0.5 ${record.newWiringRequired ? "text-purple-700" : "text-emerald-700"}`}>
                    {record.newWiringRequired ? "Wiring Required" : "Wiring Exists / Not Req"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Existing Wiring Status</span>
                  <p className="font-semibold text-slate-700 mt-0.5">
                    {formatWiringStatus(record.existingWiringStatus)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Working Bulbs & Fans</span>
                  <p className="font-semibold text-slate-700 mt-0.5">
                    Bulbs: <strong>{record.existingLedBulbsCount ?? 0}</strong> • Fans: <strong>{record.existingFanCount ?? 0}</strong>
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Equipment Condition</span>
                  <p className="font-semibold text-slate-700 mt-0.5 truncate" title={record.existingEquipmentCondition || "Good / Defunct"}>
                    {record.existingEquipmentCondition || (record.meterExists ? "Functional" : "None")}
                  </p>
                </div>
              </div>

              {/* Proposed DTR & Route Drawing if any */}
              {(record.proposedDtr || record.routeDrawingUrl) && (
                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-600">
                  {record.proposedDtr && <span>Proposed DTR: <strong className="text-slate-800">{record.proposedDtr}</strong></span>}
                  {record.routeDrawingUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage({
                        url: record.routeDrawingUrl || "",
                        title: "Route Sketch Drawing",
                        centerCode: record.awcCode,
                        type: "Drawing"
                      })}
                      className="text-blue-600 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> View Route Sketch Drawing ↗
                    </button>
                  )}
                </div>
              )}

              {record.inspectionRemarks && (
                <div className="text-[11px] bg-amber-50/50 p-2 rounded-lg text-amber-900 border border-amber-100/80">
                  <strong>Field Inspection Remarks:</strong> {record.inspectionRemarks}
                </div>
              )}
            </div>

            {/* Section 3: Connection & Smart Metering */}
            <div className="border border-slate-200/80 rounded-xl p-3.5 space-y-2 bg-white shadow-sm">
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
                      <button
                        onClick={() => setPreviewImage({
                          url: record.bookletScanUrl || "",
                          title: "Booklet Scan",
                          centerCode: record.awcCode,
                          type: "Booklet"
                        })}
                        className="text-blue-600 underline text-[10px] font-bold cursor-pointer"
                        title="View Booklet Scan"
                      >
                        [Scan]
                      </button>
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
              <div className="border border-slate-200/80 rounded-xl p-3.5 space-y-2 bg-white shadow-sm">
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

            {/* Section 5: Photo Gallery (Direct Inline View with Google CDN + Error Fallback) */}
            <div className="border border-slate-200/80 rounded-xl p-3.5 space-y-2 bg-white shadow-sm">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 border-b pb-1">
                <Award className="h-4 w-4 text-emerald-600" />
                Stage 4: Visual Audit & Service Certificate Photos
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {/* 1. Before Photo */}
                <div className="space-y-1">
                  <span className="font-semibold text-slate-600 block text-[11px]">1. Before Photo (Raw)</span>
                  {record.beforePhotoUrl ? (
                    <div 
                      onClick={() => setPreviewImage({
                        url: record.beforePhotoUrl || "",
                        title: "Primary Site Inspection (Before)",
                        centerCode: record.awcCode,
                        type: "Before"
                      })}
                      className="relative rounded-lg overflow-hidden border border-slate-300 shadow-2xs bg-slate-100 h-24 flex items-center justify-center group/img cursor-pointer"
                    >
                      <img 
                        src={getGoogleDriveDirectLink(record.beforePhotoUrl, 400)} 
                        onError={(e) => handleImageError(e, record.beforePhotoUrl)}
                        alt="Before Inspection" 
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200" 
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="h-4 w-4 text-white drop-shadow" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 border border-dashed rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                      No Photo
                    </div>
                  )}
                </div>

                {/* 2. After Photo */}
                <div className="space-y-1">
                  <span className="font-semibold text-slate-600 block text-[11px]">2. After Photo (Illuminated)</span>
                  {record.afterPhotoUrl ? (
                    <div 
                      onClick={() => setPreviewImage({
                        url: record.afterPhotoUrl || "",
                        title: "Electrified & Illuminated (After)",
                        centerCode: record.awcCode,
                        type: "After"
                      })}
                      className="relative rounded-lg overflow-hidden border border-slate-300 shadow-2xs bg-slate-100 h-24 flex items-center justify-center group/img cursor-pointer"
                    >
                      <img 
                        src={getGoogleDriveDirectLink(record.afterPhotoUrl, 400)} 
                        onError={(e) => handleImageError(e, record.afterPhotoUrl)}
                        alt="After Electrification" 
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200" 
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="h-4 w-4 text-white drop-shadow" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 border border-dashed rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                      No Photo
                    </div>
                  )}
                </div>

                {/* 3. Smart Meter Photo */}
                <div className="space-y-1">
                  <span className="font-semibold text-slate-600 block text-[11px]">3. Smart Meter Photo</span>
                  {record.meterPhotoUrl ? (
                    <div 
                      onClick={() => setPreviewImage({
                        url: record.meterPhotoUrl || "",
                        title: "Smart Meter Installation",
                        centerCode: record.awcCode,
                        type: "Meter"
                      })}
                      className="relative rounded-lg overflow-hidden border border-slate-300 shadow-2xs bg-slate-100 h-24 flex items-center justify-center group/img cursor-pointer"
                    >
                      <img 
                        src={getGoogleDriveDirectLink(record.meterPhotoUrl, 400)} 
                        onError={(e) => handleImageError(e, record.meterPhotoUrl)}
                        alt="Smart Meter" 
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200" 
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="h-4 w-4 text-white drop-shadow" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 border border-dashed rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
                      No Photo
                    </div>
                  )}
                </div>

                {/* 4. Certificate Photo */}
                <div className="space-y-1">
                  <span className="font-semibold text-slate-600 block text-[11px]">4. Service Certificate</span>
                  {record.certificatePhotoUrl ? (
                    <div 
                      onClick={() => setPreviewImage({
                        url: record.certificatePhotoUrl || "",
                        title: "Signed Service Certificate",
                        centerCode: record.awcCode,
                        type: "Certificate"
                      })}
                      className="relative rounded-lg overflow-hidden border border-slate-300 shadow-2xs bg-slate-100 h-24 flex items-center justify-center group/img cursor-pointer"
                    >
                      <img 
                        src={getGoogleDriveDirectLink(record.certificatePhotoUrl, 400)} 
                        onError={(e) => handleImageError(e, record.certificatePhotoUrl)}
                        alt="Certificate" 
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200" 
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="h-4 w-4 text-white drop-shadow" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 border border-dashed rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 text-[10px]">
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
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm"
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

      {/* FULLSCREEN IMAGE LIGHTBOX / PREVIEW MODAL (MATCHING SAFETY MODULE) */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-amber-400" />
                  <span>{previewImage.title}</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Center Code: {previewImage.centerCode}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 h-7 w-7 rounded-full cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Image Container with Google Drive CDN */}
            <div className="p-3 bg-black flex items-center justify-center max-h-[65vh] overflow-hidden">
              <img
                src={getGoogleDriveDirectLink(previewImage.url, 1600)}
                onError={(e) => handleImageError(e, previewImage.url)}
                alt={previewImage.title}
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md border border-slate-700"
              />
            </div>

            {/* Footer Controls with Download Button */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-400 truncate">
                {previewImage.centerCode}_{previewImage.type}_Photo.jpg
              </span>

              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleDownloadPreviewImage(previewImage)}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8 px-3 rounded-lg flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                  <span>Download</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewImage(null)}
                  className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs h-8 rounded-lg cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
