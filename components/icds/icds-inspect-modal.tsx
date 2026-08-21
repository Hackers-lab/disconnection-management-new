"use client"

import { useState, useRef } from "react"
import type { IcdsRecord, IcdsInspectionInput, JurisdictionStatus } from "@/lib/icds-types"
import { compressAndWatermarkImage } from "@/lib/image-processor"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Camera,
  MapPin,
  Upload,
  Loader2,
  CheckCircle2,
  FileImage,
  Layers,
  AlertCircle,
  Building2,
  Navigation,
} from "lucide-react"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  onSuccess: (updated: IcdsRecord) => void
  username: string
}

export function IcdsInspectModal({ record, open, onClose, onSuccess, username }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [uploadingBefore, setUploadingBefore] = useState(false)
  const [uploadingDrawing, setUploadingDrawing] = useState(false)
  const [locating, setLocating] = useState(false)

  // Fields
  const [jurisdictionStatus, setJurisdictionStatus] = useState<JurisdictionStatus>("UNDER_OFFICE")
  const [jurisdictionOffice, setJurisdictionOffice] = useState("")
  const [propertyStatus, setPropertyStatus] = useState("OWN_BUILDING")
  const [meterExists, setMeterExists] = useState(false)
  const [existingMeterNo, setExistingMeterNo] = useState("")
  const [existingEquipmentCondition, setExistingEquipmentCondition] = useState("")
  const [existingWiringStatus, setExistingWiringStatus] = useState<"NO_WIRING" | "EXISTS_DAMAGED" | "EXISTS_WORKING">("NO_WIRING")
  const [existingLedBulbsCount, setExistingLedBulbsCount] = useState<number>(0)
  const [existingFanCount, setExistingFanCount] = useState<number>(0)
  const [newWiringRequired, setNewWiringRequired] = useState(true)

  const [infraRequired, setInfraRequired] = useState(false)
  const [polesRequired, setPolesRequired] = useState<number>(0)
  const [cableLengthM, setCableLengthM] = useState<number>(0)
  const [serviceLineLengthM, setServiceLineLengthM] = useState<number>(0)
  const [proposedDtr, setProposedDtr] = useState("")
  const [routeDrawingUrl, setRouteDrawingUrl] = useState("")

  const [inspectGeoCoordinates, setInspectGeoCoordinates] = useState("")
  const [beforePhotoUrl, setBeforePhotoUrl] = useState("")
  const [inspectionRemarks, setInspectionRemarks] = useState("")

  const beforePhotoInputRef = useRef<HTMLInputElement>(null)
  const drawingInputRef = useRef<HTMLInputElement>(null)

  if (!record) return null

  // Initialize fields when opened
  const handleOpen = () => {
    setJurisdictionStatus(record.jurisdictionStatus || "UNDER_OFFICE")
    setJurisdictionOffice(record.jurisdictionOffice || "")
    setPropertyStatus(record.propertyStatus || "OWN_BUILDING")
    setMeterExists(record.meterExists || false)
    setExistingMeterNo(record.existingMeterNo || "")
    setExistingEquipmentCondition(record.existingEquipmentCondition || "")
    setExistingWiringStatus(record.existingWiringStatus || "NO_WIRING")
    setExistingLedBulbsCount(record.existingLedBulbsCount || 0)
    setExistingFanCount(record.existingFanCount || 0)
    setNewWiringRequired(record.newWiringRequired !== undefined ? record.newWiringRequired : true)

    setInfraRequired(record.infraRequired || false)
    setPolesRequired(record.polesRequired || 0)
    setCableLengthM(record.cableLengthM || 0)
    setServiceLineLengthM(record.serviceLineLengthM || 0)
    setProposedDtr(record.proposedDtr || "")
    setRouteDrawingUrl(record.routeDrawingUrl || "")

    setInspectGeoCoordinates(record.inspectGeoCoordinates || "")
    setBeforePhotoUrl(record.beforePhotoUrl || "")
    setInspectionRemarks(record.inspectionRemarks || "")
  }

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
        setInspectGeoCoordinates(coords)
        setLocating(false)
        toast.success(`GPS Location Captured: ${coords}`)
      },
      (err) => {
        setLocating(false)
        toast.error("Location error: " + err.message)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleBeforePhotoUpload = async (file: File) => {
    setUploadingBefore(true)
    try {
      const watermark = `${record.awcCode} | BEFORE INSPECTION | ${new Date().toLocaleString("en-IN")}`
      const processed = await compressAndWatermarkImage(file, { watermarkLines: [watermark] })

      const form = new FormData()
      form.append("file", processed)
      form.append("moduleName", "icds-electrification")
      form.append("recordId", record.id)
      form.append("photoType", "before")

      const res = await fetch("/api/upload-image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")

      setBeforePhotoUrl(data.url)
      toast.success("Before Photo compressed & uploaded successfully!")
    } catch (e: any) {
      toast.error("Image upload failed: " + e.message)
    } finally {
      setUploadingBefore(false)
    }
  }

  const handleDrawingUpload = async (file: File) => {
    setUploadingDrawing(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("moduleName", "icds-electrification")
      form.append("recordId", record.id)
      form.append("photoType", "drawing")

      const res = await fetch("/api/upload-image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Drawing upload failed")

      setRouteDrawingUrl(data.url)
      toast.success("Route sketch drawing uploaded successfully!")
    } catch (e: any) {
      toast.error("Drawing upload failed: " + e.message)
    } finally {
      setUploadingDrawing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const isUnderOffice = jurisdictionStatus === "UNDER_OFFICE"
      const payload: Partial<IcdsRecord> = {
        jurisdictionStatus,
        jurisdictionOffice: !isUnderOffice ? jurisdictionOffice.trim() || undefined : undefined,
        propertyStatus: isUnderOffice ? propertyStatus : record.propertyStatus,
        meterExists: isUnderOffice ? meterExists : false,
        existingMeterNo: isUnderOffice && meterExists ? existingMeterNo.trim() || undefined : undefined,
        existingEquipmentCondition: isUnderOffice ? existingEquipmentCondition.trim() || undefined : undefined,
        existingWiringStatus: isUnderOffice ? existingWiringStatus : undefined,
        existingLedBulbsCount: isUnderOffice ? existingLedBulbsCount : undefined,
        existingFanCount: isUnderOffice ? existingFanCount : undefined,
        newWiringRequired: isUnderOffice ? newWiringRequired : undefined,
        infraRequired: isUnderOffice ? infraRequired : false,
        polesRequired: isUnderOffice && infraRequired ? Number(polesRequired) : undefined,
        cableLengthM: isUnderOffice && infraRequired ? Number(cableLengthM) : undefined,
        serviceLineLengthM: isUnderOffice ? Number(serviceLineLengthM) || undefined : undefined,
        proposedDtr: isUnderOffice ? proposedDtr.trim() || undefined : undefined,
        routeDrawingUrl: isUnderOffice ? routeDrawingUrl || undefined : undefined,
        inspectGeoCoordinates: isUnderOffice ? inspectGeoCoordinates.trim() || undefined : undefined,
        inspectedBy: username,
        beforePhotoUrl: isUnderOffice ? beforePhotoUrl || undefined : undefined,
        inspectionRemarks: inspectionRemarks.trim() || undefined,
        stage: "INSPECTED",
      }

      const res = await fetch(`/api/icds/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit inspection")

      toast.success("Stage 1 Primary Inspection submitted successfully!")
      onSuccess(data)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to submit inspection")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Camera className="h-5 w-5 text-amber-600" />
            Stage 1: Primary Inspection & Feasibility
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Verify CCC jurisdiction, existing electricity meter, infrastructure poles, equipment condition, and raw site photo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* Header Summary */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-extrabold text-slate-900 text-sm">{record.awcName}</p>
              <p className="text-slate-500 font-mono text-[11px]">Code: {record.awcCode} • {record.blockName} • {record.gpName}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Agency</span>
              <p className="font-bold text-slate-800">{record.assignedAgency || "Unassigned"}</p>
            </div>
          </div>

          {/* 1. Jurisdiction Check */}
          <div className="border border-blue-100 rounded-xl p-3.5 space-y-2.5 bg-blue-50/40">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-bold text-xs text-blue-950">1. Office Jurisdiction Check</Label>
                <p className="text-[11px] text-blue-800">Does this Anganwadi center fall under our Customer Care Center (CCC)?</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <Select value={jurisdictionStatus} onValueChange={(v: JurisdictionStatus) => setJurisdictionStatus(v)}>
                <SelectTrigger className="h-9 text-xs bg-white rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="UNDER_OFFICE">Under This Office (Our CCC Jurisdiction)</SelectItem>
                  <SelectItem value="OTHER_OFFICE">Falls Under Another CCC / Office</SelectItem>
                </SelectContent>
              </Select>

              {jurisdictionStatus === "OTHER_OFFICE" && (
                <Input
                  value={jurisdictionOffice}
                  onChange={(e) => setJurisdictionOffice(e.target.value)}
                  placeholder="Specify Other CCC / Division Name *"
                  className="h-9 text-xs bg-white rounded-xl border-slate-200 font-medium"
                  required
                />
              )}
            </div>
          </div>

          {/* Conditional Inspection Details: Only required if UNDER_OFFICE */}
          {jurisdictionStatus === "OTHER_OFFICE" ? (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                Center falls outside CCC jurisdiction
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Since this Anganwadi center belongs to another Customer Care Center, technical electrical feasibility, GPS capture, and photo uploads are not required. Please record any forwarding remarks below and submit.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 2. Building / Property Type */}
              <div className="space-y-1.5">
                <Label className="font-bold text-xs text-slate-800">2. Building / Property Status</Label>
                <Select value={propertyStatus} onValueChange={setPropertyStatus}>
                  <SelectTrigger className="h-9 text-xs bg-white rounded-xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="OWN_BUILDING">Own Building (Dedicated ICDS Center)</SelectItem>
                    <SelectItem value="SCHOOL">School Premises</SelectItem>
                    <SelectItem value="RENTED">Rented House</SelectItem>
                    <SelectItem value="PRIVATE">Private House</SelectItem>
                    <SelectItem value="COMMUNITY_HALL">Community Hall</SelectItem>
                    <SelectItem value="OTHER">Other Premises</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 3. Existing Meter Check */}
              <div className="border border-slate-200/80 rounded-xl p-3.5 space-y-3 bg-slate-50/60">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-bold text-xs text-slate-800">3. Existing Electric Meter Check</Label>
                    <p className="text-[11px] text-slate-500">Does this Anganwadi center already have an active or defunct meter?</p>
                  </div>
                  <Switch checked={meterExists} onCheckedChange={setMeterExists} />
                </div>

                {meterExists && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold">Existing Meter Serial / Consumer No</Label>
                      <Input
                        value={existingMeterNo}
                        onChange={(e) => setExistingMeterNo(e.target.value)}
                        placeholder="e.g. 1048293 / 20054819"
                        className="h-8 text-xs bg-white font-mono rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold">Condition of Existing Connection</Label>
                      <Input
                        value={existingEquipmentCondition}
                        onChange={(e) => setExistingEquipmentCondition(e.target.value)}
                        placeholder="e.g. Live but meter burned, or Disconnected"
                        className="h-8 text-xs bg-white rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Internal Wiring & Equipment Status */}
              <div className="border border-purple-100 rounded-xl p-3.5 space-y-3 bg-purple-50/30">
                <Label className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-purple-600" />
                  4. Existing Internal Equipment & Wiring Feasibility
                </Label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Internal Wiring Status</Label>
                    <Select value={existingWiringStatus} onValueChange={(v: any) => setExistingWiringStatus(v)}>
                      <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="NO_WIRING">No Internal Wiring (Fresh Required)</SelectItem>
                        <SelectItem value="EXISTS_DAMAGED">Wiring Exists (Damaged/Upgrade Req)</SelectItem>
                        <SelectItem value="EXISTS_WORKING">Wiring Exists & Functional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Existing Working Bulbs</Label>
                    <Input
                      type="number"
                      value={existingLedBulbsCount}
                      onChange={(e) => setExistingLedBulbsCount(Number(e.target.value))}
                      min={0}
                      className="h-8 text-xs bg-white rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Existing Working Fans</Label>
                    <Input
                      type="number"
                      value={existingFanCount}
                      onChange={(e) => setExistingFanCount(Number(e.target.value))}
                      min={0}
                      className="h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-purple-200/60">
                  <span className="text-[11px] font-semibold text-purple-900">Standard CSR Package Wiring Required (₹6,611 + GST)?</span>
                  <Switch checked={newWiringRequired} onCheckedChange={setNewWiringRequired} />
                </div>
              </div>

              {/* 5. Infrastructure Requirement Section */}
              <div className="border rounded-xl p-3.5 space-y-3 bg-amber-50/40 border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-bold text-xs text-amber-950">5. Line Extension / Pole Infrastructure Required?</Label>
                    <p className="text-[11px] text-amber-800">Are new poles or LT line extensions required to reach the premises?</p>
                  </div>
                  <Switch checked={infraRequired} onCheckedChange={setInfraRequired} />
                </div>

                {infraRequired && (
                  <div className="space-y-3 pt-1 border-t border-amber-200">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Poles Required (Nos)</Label>
                        <Input
                          type="number"
                          value={polesRequired}
                          onChange={(e) => setPolesRequired(Number(e.target.value))}
                          min={0}
                          className="h-8 text-xs bg-white rounded-lg"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">LT Conductor / Cable (Meters)</Label>
                        <Input
                          type="number"
                          value={cableLengthM}
                          onChange={(e) => setCableLengthM(Number(e.target.value))}
                          min={0}
                          className="h-8 text-xs bg-white rounded-lg"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Proposed Feeding DTR</Label>
                        <Input
                          value={proposedDtr}
                          onChange={(e) => setProposedDtr(e.target.value)}
                          placeholder="e.g. DTR-JOY-04"
                          className="h-8 text-xs bg-white rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Route Drawing Upload */}
                    <div className="pt-2 border-t border-amber-200">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[11px] font-semibold text-amber-950">Route Sketch Drawing (Hand-drawn / Map)</Label>
                        {uploadingDrawing && <Loader2 className="h-3 w-3 animate-spin text-amber-600" />}
                      </div>
                      {routeDrawingUrl ? (
                        <div className="flex items-center gap-3">
                          <a href={routeDrawingUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline font-semibold">
                            View Uploaded Route Drawing
                          </a>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => drawingInputRef.current?.click()}
                            className="text-xs h-7 rounded-lg"
                          >
                            Change Drawing
                          </Button>
                        </div>
                      ) : (
                        <div
                          onClick={() => drawingInputRef.current?.click()}
                          className="border-2 border-dashed border-amber-300 rounded-xl p-3 text-center cursor-pointer hover:border-amber-400 bg-white"
                        >
                          <FileImage className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                          <p className="text-xs font-medium text-amber-800">Click to upload route sketch / line diagram</p>
                        </div>
                      )}
                      <input
                        type="file"
                        ref={drawingInputRef}
                        accept="image/*,.pdf"
                        onChange={(e) => e.target.files?.[0] && handleDrawingUpload(e.target.files[0])}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 6. GPS Coordinates & Service Line */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* GPS Detection */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold">GPS Coordinates (Lat, Long)</Label>
                    <button
                      type="button"
                      onClick={handleDetectLocation}
                      disabled={locating}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-0.5"
                    >
                      <Navigation className="h-3 w-3" />
                      {locating ? "Detecting..." : "Auto-Detect GPS"}
                    </button>
                  </div>
                  <Input
                    value={inspectGeoCoordinates}
                    onChange={(e) => setInspectGeoCoordinates(e.target.value)}
                    placeholder="22.254120, 88.523410"
                    className="h-8 text-xs font-mono rounded-lg"
                  />
                </div>

                {/* Service Line Length */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Service Line Length (Meters)</Label>
                  <Input
                    type="number"
                    value={serviceLineLengthM}
                    onChange={(e) => setServiceLineLengthM(Number(e.target.value))}
                    placeholder="e.g. 15"
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
              </div>

              {/* 7. Before Site Photo Upload */}
              <div className="space-y-1.5 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Primary Inspection Site Photo (Raw / Before)</Label>
                  {uploadingBefore && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                </div>
                {beforePhotoUrl ? (
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-24 rounded-lg border overflow-hidden bg-black/10">
                      <img src={beforePhotoUrl} alt="Before site" className="h-full w-full object-cover" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => beforePhotoInputRef.current?.click()}
                      className="text-xs h-7 rounded-lg"
                    >
                      Change Before Photo
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => beforePhotoInputRef.current?.click()}
                    className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer hover:border-slate-400 bg-slate-50"
                  >
                    <Camera className="h-5 w-5 mx-auto text-slate-400 mb-1" />
                    <p className="text-xs font-medium text-slate-700">Click to capture / upload Before Site Photo</p>
                    <p className="text-[10px] text-slate-400">Image will be auto-compressed and watermarked with center code & timestamp</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={beforePhotoInputRef}
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleBeforePhotoUpload(e.target.files[0])}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Remarks */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">Inspection Remarks / Observations</Label>
            <Textarea
              value={inspectionRemarks}
              onChange={(e) => setInspectionRemarks(e.target.value)}
              placeholder="Site inspected, un-electrified child center, nearest LT pole 15m away..."
              className="h-16 text-xs rounded-xl"
            />
          </div>

          <DialogFooter className="gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || uploadingBefore || uploadingDrawing}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Save Inspection Details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
