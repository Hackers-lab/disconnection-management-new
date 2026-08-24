"use client"

import { useState, useRef, useEffect } from "react"
import type { IcdsRecord, JurisdictionStatus } from "@/lib/icds-types"
import { compressAndWatermarkImage } from "@/lib/image-processor"
import { getGoogleDriveDirectLink, handleImageError } from "@/lib/image-utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  Zap,
  Check,
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
  const [polesRequired, setPolesRequired] = useState<number | "">("")
  const [cableLengthM, setCableLengthM] = useState<number | "">("")
  const [serviceLineLengthM, setServiceLineLengthM] = useState<number | "">("")
  const [proposedDtr, setProposedDtr] = useState("")
  const [routeDrawingUrl, setRouteDrawingUrl] = useState("")

  const [inspectGeoCoordinates, setInspectGeoCoordinates] = useState("")
  const [beforePhotoUrl, setBeforePhotoUrl] = useState("")
  const [inspectionRemarks, setInspectionRemarks] = useState("")

  const beforePhotoInputRef = useRef<HTMLInputElement>(null)
  const drawingInputRef = useRef<HTMLInputElement>(null)

  // Initialize fields when opened
  const handleOpen = () => {
    if (!record) return
    setJurisdictionStatus(record.jurisdictionStatus || "UNDER_OFFICE")
    setJurisdictionOffice(record.jurisdictionOffice || "")
    setPropertyStatus(record.propertyStatus || "OWN_BUILDING")
    setMeterExists(record.meterExists || false)
    setExistingMeterNo(record.existingMeterNo || "")
    setExistingEquipmentCondition(record.existingEquipmentCondition || "")
    setExistingWiringStatus(record.existingWiringStatus || "NO_WIRING")
    setExistingLedBulbsCount(record.existingLedBulbsCount ?? 0)
    setExistingFanCount(record.existingFanCount ?? 0)
    setNewWiringRequired(record.newWiringRequired !== undefined ? record.newWiringRequired : true)

    setInfraRequired(record.infraRequired || false)
    setPolesRequired(record.polesRequired ?? "")
    setCableLengthM(record.cableLengthM ?? "")
    setServiceLineLengthM(record.serviceLineLengthM ?? "")
    setProposedDtr(record.proposedDtr || "")
    setRouteDrawingUrl(record.routeDrawingUrl || "")

    setInspectGeoCoordinates(record.inspectGeoCoordinates || "")
    setBeforePhotoUrl(record.beforePhotoUrl || "")
    setInspectionRemarks(record.inspectionRemarks || "")

    // If GPS coordinates don't exist yet, attempt auto-detect on opening
    if (!record.inspectGeoCoordinates && typeof navigator !== "undefined" && navigator.geolocation) {
      handleDetectLocation(true)
    }
  }

  const handleDetectLocation = (silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) toast.error("Geolocation is not supported by your device / browser")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
        setInspectGeoCoordinates(coords)
        setLocating(false)
        if (!silent) toast.success(`Device Location Captured: ${coords}`)
      },
      (err) => {
        setLocating(false)
        if (!silent) toast.error("Location error: " + err.message)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  const handleBeforePhotoUpload = async (file: File) => {
    if (!record) return
    setUploadingBefore(true)
    try {
      const dateStr = new Date().toLocaleString("en-IN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
      })
      const gpsStr = inspectGeoCoordinates || "GPS: Not Available"
      const watermarkLines = [
        `ICDS: ${record.awcName} (${record.awcCode})`,
        `INSPECTION PHOTO • ${dateStr}`,
        `LOC: ${gpsStr} • ${record.blockName}, ${record.gpName}`,
      ]

      const processed = await compressAndWatermarkImage(file, {
        maxDim: 900,
        watermarkLines,
        targetKb: 90, // Strict compression under 95KB
      })

      const form = new FormData()
      form.append("file", processed)
      form.append("moduleName", "icds-electrification")
      form.append("consumerId", record.awcCode || record.id)
      form.append("recordId", record.id)
      form.append("photoType", "before")

      const res = await fetch("/api/upload-image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")

      setBeforePhotoUrl(data.url)
      toast.success("Inspection Photo with GPS stamp uploaded successfully!")
    } catch (e: any) {
      toast.error("Image upload failed: " + e.message)
    } finally {
      setUploadingBefore(false)
    }
  }

  const handleDrawingUpload = async (file: File) => {
    if (!record) return
    setUploadingDrawing(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("moduleName", "icds-electrification")
      form.append("consumerId", record.awcCode || record.id)
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
    if (!record) return

    const isUnderOffice = jurisdictionStatus === "UNDER_OFFICE"

    // STRICT VALIDATION
    if (!isUnderOffice) {
      if (!jurisdictionOffice.trim()) {
        toast.error("Please specify the Other CCC / Division name")
        return
      }
      if (!inspectionRemarks.trim()) {
        toast.error("Please enter inspection remarks")
        return
      }
    } else {
      // Under Kushida Validation
      if (!propertyStatus) {
        toast.error("Please select Property Status")
        return
      }

      if (meterExists) {
        if (!existingMeterNo.trim()) {
          toast.error("Please enter the Existing Meter Number")
          return
        }
        if (!existingEquipmentCondition.trim()) {
          toast.error("Please enter the Condition of Existing Connection")
          return
        }
      }

      if (!existingWiringStatus) {
        toast.error("Please select Internal Wiring Status")
        return
      }

      if (existingLedBulbsCount === undefined || existingLedBulbsCount === null || Number(existingLedBulbsCount) < 0) {
        toast.error("Please specify Working Bulbs count (0 or more)")
        return
      }

      if (existingFanCount === undefined || existingFanCount === null || Number(existingFanCount) < 0) {
        toast.error("Please specify Working Fans count (0 or more)")
        return
      }

      // Infrastructure check: only applicable if meter does not exist
      if (!meterExists && infraRequired) {
        if (!polesRequired || Number(polesRequired) <= 0) {
          toast.error("Please enter number of Poles Required (minimum 1)")
          return
        }
        if (!cableLengthM || Number(cableLengthM) <= 0) {
          toast.error("Please enter LT Conductor / Cable length in meters")
          return
        }
        if (!proposedDtr.trim()) {
          toast.error("Please enter Proposed Feeding DTR")
          return
        }
      }

      if (!serviceLineLengthM || Number(serviceLineLengthM) <= 0) {
        toast.error("Please enter Service Line Length in meters")
        return
      }

      if (!inspectGeoCoordinates.trim()) {
        toast.error("GPS Coordinates are required! Click Auto-Detect GPS Location.")
        return
      }

      if (!beforePhotoUrl) {
        toast.error("Inspection Photo is mandatory. Please capture or upload a site photo.")
        return
      }

      if (!inspectionRemarks.trim()) {
        toast.error("Inspection Remarks are required.")
        return
      }
    }

    setSubmitting(true)

    try {
      const payload: Partial<IcdsRecord> = {
        jurisdictionStatus,
        jurisdictionOffice: !isUnderOffice ? jurisdictionOffice.trim() || undefined : undefined,
        propertyStatus: isUnderOffice ? propertyStatus : record.propertyStatus,
        meterExists: isUnderOffice ? meterExists : false,
        existingMeterNo: isUnderOffice && meterExists ? existingMeterNo.trim() || undefined : undefined,
        existingEquipmentCondition: isUnderOffice && meterExists ? existingEquipmentCondition.trim() || undefined : undefined,
        existingWiringStatus: isUnderOffice ? existingWiringStatus : undefined,
        existingLedBulbsCount: isUnderOffice ? Number(existingLedBulbsCount) : undefined,
        existingFanCount: isUnderOffice ? Number(existingFanCount) : undefined,
        newWiringRequired: isUnderOffice ? newWiringRequired : undefined,
        infraRequired: isUnderOffice && !meterExists ? infraRequired : false,
        polesRequired: isUnderOffice && !meterExists && infraRequired ? Number(polesRequired) : undefined,
        cableLengthM: isUnderOffice && !meterExists && infraRequired ? Number(cableLengthM) : undefined,
        serviceLineLengthM: isUnderOffice ? Number(serviceLineLengthM) || undefined : undefined,
        proposedDtr: isUnderOffice && !meterExists && infraRequired ? proposedDtr.trim() || undefined : undefined,
        routeDrawingUrl: isUnderOffice && !meterExists && infraRequired ? routeDrawingUrl || undefined : undefined,
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

      toast.success("Inspection submitted successfully!")
      onSuccess(data)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to submit inspection")
    } finally {
      setSubmitting(false)
    }
  }

  if (!record) return null

  const propertyOptions = [
    { value: "OWN_BUILDING", label: "Own Building" },
    { value: "SCHOOL", label: "School" },
    { value: "RENTED", label: "Rented" },
    { value: "PRIVATE", label: "Private" },
    { value: "COMMUNITY_HALL", label: "Community Hall" },
    { value: "OTHER", label: "Other" },
  ]

  const wiringOptions: { value: "NO_WIRING" | "EXISTS_DAMAGED" | "EXISTS_WORKING"; label: string }[] = [
    { value: "NO_WIRING", label: "No Wiring" },
    { value: "EXISTS_DAMAGED", label: "Wiring Exists (Damaged)" },
    { value: "EXISTS_WORKING", label: "Wiring Exists (Working)" },
  ]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl p-0 gap-0" onOpenAutoFocus={handleOpen}>
        {/* Clean Header */}
        <div className="px-5 py-4 bg-slate-900 text-white rounded-t-2xl flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Camera className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black tracking-tight text-white m-0">
                Inspection
              </DialogTitle>
              <p className="text-[11px] text-slate-300 font-medium">
                Field verification & feasibility form
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-200 text-[10px] font-bold tracking-wider uppercase border border-white/10">
            {record.awcCode}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Header Summary Card */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between shadow-xs">
            <div>
              <p className="font-extrabold text-slate-900 text-sm">{record.awcName}</p>
              <p className="text-slate-500 font-medium text-[11px] mt-0.5">
                Block: <span className="font-semibold text-slate-700">{record.blockName}</span> • GP: <span className="font-semibold text-slate-700">{record.gpName}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Agency</span>
              <p className="font-bold text-slate-800 text-[11px]">{record.assignedAgency || "Unassigned"}</p>
            </div>
          </div>

          {/* 1. Office Jurisdiction: Kushida vs Others */}
          <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 space-y-2.5">
            <Label className="font-bold text-xs text-blue-950 block">
              Office Jurisdiction <span className="text-red-500">*</span>
            </Label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJurisdictionStatus("UNDER_OFFICE")}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                  jurisdictionStatus === "UNDER_OFFICE"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {jurisdictionStatus === "UNDER_OFFICE" && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                Kushida
              </button>

              <button
                type="button"
                onClick={() => setJurisdictionStatus("OTHER_OFFICE")}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                  jurisdictionStatus === "OTHER_OFFICE"
                    ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {jurisdictionStatus === "OTHER_OFFICE" && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                Others
              </button>
            </div>

            {jurisdictionStatus === "OTHER_OFFICE" && (
              <div className="pt-2">
                <Label className="text-[11px] font-bold text-slate-700 mb-1 block">
                  Specify Other CCC / Division Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={jurisdictionOffice}
                  onChange={(e) => setJurisdictionOffice(e.target.value)}
                  placeholder="e.g. Harishchandrapur CCC / Chanchal Division"
                  className="h-9 text-xs bg-white rounded-xl border-amber-300 font-medium focus:ring-amber-500"
                  required
                />
              </div>
            )}
          </div>

          {/* Conditional: If Others is selected */}
          {jurisdictionStatus === "OTHER_OFFICE" ? (
            <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                Outside Kushida CCC Jurisdiction
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Technical feasibility, GPS, and site photo are not required for other CCC centers. Enter remarks below and submit.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 2. Property Status */}
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-2">
                <Label className="font-bold text-xs text-slate-900 block">
                  Property Status <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {propertyOptions.map((opt) => {
                    const isSelected = propertyStatus === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPropertyStatus(opt.value)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. Existing Meter */}
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-3">
                <Label className="font-bold text-xs text-slate-900 block">
                  Existing Meter <span className="text-red-500">*</span>
                </Label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMeterExists(false)
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-2 ${
                      !meterExists
                        ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {!meterExists && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    No Meter
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMeterExists(true)
                      setInfraRequired(false) // Meter already exists, no infra needed
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-2 ${
                      meterExists
                        ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {meterExists && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    Meter Exists
                  </button>
                </div>

                {meterExists && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-700">
                        Existing Meter / Consumer No <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={existingMeterNo}
                        onChange={(e) => setExistingMeterNo(e.target.value)}
                        placeholder="e.g. 1048293 / 20054819"
                        className="h-8.5 text-xs bg-slate-50 font-mono rounded-lg border-slate-200 font-semibold"
                        required={meterExists}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-700">
                        Condition of Connection <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={existingEquipmentCondition}
                        onChange={(e) => setExistingEquipmentCondition(e.target.value)}
                        placeholder="e.g. Defunct / Burned / Disconnected"
                        className="h-8.5 text-xs bg-slate-50 rounded-lg border-slate-200"
                        required={meterExists}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Internal Wiring */}
              <div className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/30 space-y-3">
                <Label className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-purple-600" />
                  Internal Wiring <span className="text-red-500">*</span>
                </Label>

                {/* Status Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {wiringOptions.map((opt) => {
                    const isSelected = existingWiringStatus === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setExistingWiringStatus(opt.value)
                          if (opt.value === "NO_WIRING" || opt.value === "EXISTS_DAMAGED") {
                            setNewWiringRequired(true)
                          } else {
                            setNewWiringRequired(false)
                          }
                        }}
                        className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-purple-700 text-white border-purple-700 shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-purple-50/50"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Wiring Requirement Toggle Button */}
                <div className="pt-2 border-t border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-purple-950">
                    Wiring Requirement <span className="text-red-500">*</span>
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewWiringRequired(true)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                        newWiringRequired
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      Wiring Required
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewWiringRequired(false)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                        !newWiringRequired
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      Wiring Exists / Not Required
                    </button>
                  </div>
                </div>

                {/* Working Bulbs & Fans */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-purple-100">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-purple-950">
                      Working Bulbs (Nos) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      value={existingLedBulbsCount}
                      onChange={(e) => setExistingLedBulbsCount(e.target.value === "" ? 0 : Number(e.target.value))}
                      min={0}
                      className="h-8 text-xs bg-white rounded-lg border-slate-200"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-purple-950">
                      Working Fans (Nos) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      value={existingFanCount}
                      onChange={(e) => setExistingFanCount(e.target.value === "" ? 0 : Number(e.target.value))}
                      min={0}
                      className="h-8 text-xs bg-white rounded-lg border-slate-200"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* 5. Infrastructure Requirement: ONLY ASKED IF METER NOT EXIST */}
              {!meterExists && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
                  <Label className="font-bold text-xs text-amber-950 block">
                    Line Extension / Poles Required? <span className="text-red-500">*</span>
                  </Label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInfraRequired(false)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1.5 ${
                        !infraRequired
                          ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {!infraRequired && <Check className="h-3 w-3 stroke-[3]" />}
                      Not Required (Direct Line)
                    </button>

                    <button
                      type="button"
                      onClick={() => setInfraRequired(true)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1.5 ${
                        infraRequired
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {infraRequired && <Check className="h-3 w-3 stroke-[3]" />}
                      Infra / Poles Required
                    </button>
                  </div>

                  {infraRequired && (
                    <div className="space-y-3 pt-2 border-t border-amber-200">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-amber-950">
                            Poles Required (Nos) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="number"
                            value={polesRequired}
                            onChange={(e) => setPolesRequired(e.target.value === "" ? "" : Number(e.target.value))}
                            min={1}
                            placeholder="e.g. 2"
                            className="h-8 text-xs bg-white rounded-lg border-amber-300"
                            required={infraRequired}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-amber-950">
                            LT Conductor / Cable (Meters) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="number"
                            value={cableLengthM}
                            onChange={(e) => setCableLengthM(e.target.value === "" ? "" : Number(e.target.value))}
                            min={1}
                            placeholder="e.g. 50"
                            className="h-8 text-xs bg-white rounded-lg border-amber-300"
                            required={infraRequired}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-amber-950">
                            Proposed Feeding DTR <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            value={proposedDtr}
                            onChange={(e) => setProposedDtr(e.target.value)}
                            placeholder="e.g. DTR-KUS-02"
                            className="h-8 text-xs bg-white rounded-lg border-amber-300"
                            required={infraRequired}
                          />
                        </div>
                      </div>

                      {/* Route Drawing Upload */}
                      <div className="pt-2 border-t border-amber-200">
                        <div className="flex items-center justify-between mb-1.5">
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
                            <p className="text-xs font-semibold text-amber-800">Click to upload route sketch / line diagram</p>
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
              )}

              {/* 6. GPS Location & Service Line */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* GPS Coordinates */}
                <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-900">
                      GPS Coordinates <span className="text-red-500">*</span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => handleDetectLocation(false)}
                      disabled={locating}
                      className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[11px] font-bold flex items-center gap-1 border border-blue-200 transition-colors"
                    >
                      {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3 text-blue-600" />}
                      {locating ? "Capturing..." : "Auto-Detect GPS"}
                    </button>
                  </div>
                  <Input
                    value={inspectGeoCoordinates}
                    onChange={(e) => setInspectGeoCoordinates(e.target.value)}
                    placeholder="e.g. 25.321456, 87.981234"
                    className={`h-9 text-xs font-mono rounded-lg ${
                      inspectGeoCoordinates ? "bg-emerald-50/60 border-emerald-300 font-bold text-emerald-900" : "bg-slate-50"
                    }`}
                    required
                  />
                  {inspectGeoCoordinates && (
                    <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Device location captured
                    </p>
                  )}
                </div>

                {/* Service Line Length */}
                <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-2">
                  <Label className="text-xs font-bold text-slate-900 block">
                    Service Line Length (Meters) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={serviceLineLengthM}
                    onChange={(e) => setServiceLineLengthM(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 15"
                    min={1}
                    className="h-9 text-xs bg-slate-50 rounded-lg border-slate-200 font-semibold"
                    required
                  />
                  <p className="text-[10px] text-slate-400">Distance from nearest pole to meter position</p>
                </div>
              </div>

              {/* 7. Inspection Site Photo */}
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-900">
                    Inspection Photo (Site / Center) <span className="text-red-500">*</span>
                  </Label>
                  {uploadingBefore && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                </div>

                {beforePhotoUrl ? (
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <div className="h-16 w-24 rounded-lg border overflow-hidden bg-black/10 shrink-0">
                      <img
                      src={getGoogleDriveDirectLink(beforePhotoUrl, 800)}
                      onError={(e) => handleImageError(e, beforePhotoUrl)}
                      alt="Inspection site"
                      className="h-full w-full object-cover"
                    />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Photo Uploaded
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => beforePhotoInputRef.current?.click()}
                        className="text-xs h-7 rounded-lg border-slate-300"
                      >
                        Change Photo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => beforePhotoInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all bg-slate-50"
                  >
                    <Camera className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                    <p className="text-xs font-bold text-slate-800">Tap to Capture / Upload Inspection Photo</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Auto-watermarked with Anganwadi code & timestamp</p>
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

          {/* Remarks - Always Required */}
          <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-1.5">
            <Label className="text-xs font-bold text-slate-900">
              Inspection Remarks <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={inspectionRemarks}
              onChange={(e) => setInspectionRemarks(e.target.value)}
              placeholder="Enter site inspection findings, accessibility, nearest landmark, etc..."
              className="h-18 text-xs rounded-xl bg-slate-50 border-slate-200"
              required
            />
          </div>

          <DialogFooter className="gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || uploadingBefore || uploadingDrawing}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm px-4"
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
