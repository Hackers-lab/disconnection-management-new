"use client"

import { useState, useEffect } from "react"
import {
  MiscInspectionRecord,
  AgencyDecision,
  AgencyInspectionUpdateInput,
  DynamicCategoryFields,
} from "@/lib/misc-inspection-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, Camera, MapPin, CheckCircle2, AlertTriangle, FileText, Upload } from "lucide-react"

interface MiscInspectionUpdateFormProps {
  record: MiscInspectionRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function MiscInspectionUpdateForm({
  record,
  open,
  onOpenChange,
  onSuccess,
}: MiscInspectionUpdateFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploadingImage, setUploadingImage] = useState<string | null>(null)

  // Agency Inspection Inputs
  const [agencyDecision, setAgencyDecision] = useState<AgencyDecision>("SATISFACTORY")
  const [agencyRemarks, setAgencyRemarks] = useState("")
  const [sitePhotoUrl, setSitePhotoUrl] = useState("")
  const [meterReadingPhotoUrl, setMeterReadingPhotoUrl] = useState("")
  const [sketchDrawingUrl, setSketchDrawingUrl] = useState("")
  const [geoCoordinates, setGeoCoordinates] = useState("")

  // Quick field updates
  const [existingMeterNo, setExistingMeterNo] = useState("")
  const [meterReading, setMeterReading] = useState("")
  const [measuredLoadKw, setMeasuredLoadKw] = useState("")
  const [lineLengthMeters, setLineLengthMeters] = useState("")

  // Category specific fields
  const [rPhaseAmps, setRPhaseAmps] = useState("")
  const [yPhaseAmps, setYPhaseAmps] = useState("")
  const [bPhaseAmps, setBPhaseAmps] = useState("")
  const [oilLevelStatus, setOilLevelStatus] = useState<"NORMAL" | "LOW" | "LEAKAGE">("NORMAL")

  useEffect(() => {
    if (record) {
      setAgencyDecision(record.agencyDecision || "SATISFACTORY")
      setAgencyRemarks(record.agencyRemarks || "")
      setSitePhotoUrl(record.sitePhotoUrl || "")
      setMeterReadingPhotoUrl(record.meterReadingPhotoUrl || "")
      setSketchDrawingUrl(record.sketchDrawingUrl || "")
      setGeoCoordinates(record.geoCoordinates || "")
      setExistingMeterNo(record.existingMeterNo || record.categoryFields?.meterSerialNo || "")
      setMeterReading(record.meterReading || record.categoryFields?.currentReadingKwh || "")
      setMeasuredLoadKw(record.measuredLoadKw || "")
      setLineLengthMeters(record.lineLengthMeters || record.categoryFields?.serviceLineLengthMeters || "")
      setRPhaseAmps(record.categoryFields?.rPhaseAmps || "")
      setYPhaseAmps(record.categoryFields?.yPhaseAmps || "")
      setBPhaseAmps(record.categoryFields?.bPhaseAmps || "")
      setOilLevelStatus(record.categoryFields?.oilLevelStatus || "NORMAL")
    }
  }, [record])

  const handleGetLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
          setGeoCoordinates(coords)
          toast.success(`GPS Location acquired: ${coords}`)
        },
        (error) => {
          toast.error("Could not fetch GPS coordinates: " + error.message)
        }
      )
    } else {
      toast.error("Geolocation is not supported by your browser")
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetField: "site" | "meter" | "sketch") => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(targetField)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("Failed to upload image")
      }

      const data = await res.json()
      const url = data.url || data.fileUrl

      if (targetField === "site") setSitePhotoUrl(url)
      if (targetField === "meter") setMeterReadingPhotoUrl(url)
      if (targetField === "sketch") setSketchDrawingUrl(url)

      toast.success("Image uploaded successfully!")
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image")
    } finally {
      setUploadingImage(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!record) return

    setLoading(true)
    try {
      const categoryFields: DynamicCategoryFields = {
        ...record.categoryFields,
        meterSerialNo: existingMeterNo,
        currentReadingKwh: meterReading,
        rPhaseAmps,
        yPhaseAmps,
        bPhaseAmps,
        oilLevelStatus,
        serviceLineLengthMeters: lineLengthMeters,
      }

      const updateData: AgencyInspectionUpdateInput = {
        agencyDecision,
        agencyRemarks: agencyRemarks.trim(),
        sitePhotoUrl,
        meterReadingPhotoUrl,
        sketchDrawingUrl,
        geoCoordinates,
        existingMeterNo,
        meterReading,
        measuredLoadKw,
        lineLengthMeters,
        categoryFields,
      }

      const res = await fetch(`/api/misc-inspection/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to submit agency inspection")
      }

      toast.success("Site inspection findings submitted successfully!")
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Camera className="h-5 w-5 text-primary" /> Agency Site Inspection Update — [{record.id}]
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Summary Box */}
          <div className="bg-muted/40 p-3 rounded-lg border space-y-1 text-xs">
            <div className="flex justify-between font-semibold text-foreground">
              <span>Category: <strong className="text-primary">{record.category}</strong></span>
              <span>Priority: <strong>{record.priority}</strong></span>
            </div>
            <p className="font-medium text-sm text-foreground">{record.title}</p>
            {record.description && <p className="text-muted-foreground">{record.description}</p>}
            {record.address && <p className="text-muted-foreground">📍 Location: {record.address}</p>}
          </div>

          {/* Agency Decision */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Agency Site Decision *</Label>
              <Select value={agencyDecision} onValueChange={(v) => setAgencyDecision(v as AgencyDecision)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SATISFACTORY">Satisfactory / Feasible</SelectItem>
                  <SelectItem value="UNSATISFACTORY">Unsatisfactory / Issue Found</SelectItem>
                  <SelectItem value="ACTION_REQUIRED">Action Required by Office</SelectItem>
                  <SelectItem value="REJECTED">Rejected / Unfeasible</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold">GPS Coordinates</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Lat, Long"
                  value={geoCoordinates}
                  onChange={(e) => setGeoCoordinates(e.target.value)}
                  className="text-xs"
                />
                <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} title="Acquire GPS Location">
                  <MapPin className="h-4 w-4 text-primary" />
                </Button>
              </div>
            </div>
          </div>

          {/* Category Technical Findings */}
          <div className="border rounded-lg p-3.5 bg-muted/20 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Technical & Site Measurements
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(record.category === "METER_CHECK" || record.category === "SHIFTING") && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Meter Serial No</Label>
                    <Input className="h-9 text-xs" value={existingMeterNo} onChange={(e) => setExistingMeterNo(e.target.value)} placeholder="Meter No" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Current Reading (kWh)</Label>
                    <Input className="h-9 text-xs" value={meterReading} onChange={(e) => setMeterReading(e.target.value)} placeholder="kWh reading" />
                  </div>
                </>
              )}

              {(record.category === "SHIFTING" || record.category === "NSC_DRAWING" || record.category === "NETWORK_LINE") && (
                <div className="space-y-1">
                  <Label className="text-xs">Service Line Length (Meters)</Label>
                  <Input className="h-9 text-xs" value={lineLengthMeters} onChange={(e) => setLineLengthMeters(e.target.value)} placeholder="Distance in meters" />
                </div>
              )}

              {(record.category === "DTR_LOAD" || record.category === "NETWORK_LINE") && (
                <div className="space-y-1">
                  <Label className="text-xs">Measured Peak Load (kW)</Label>
                  <Input className="h-9 text-xs" value={measuredLoadKw} onChange={(e) => setMeasuredLoadKw(e.target.value)} placeholder="Load in kW" />
                </div>
              )}
            </div>

            {record.category === "DTR_LOAD" && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">R-Phase (Amps)</Label>
                  <Input className="h-8 text-xs" value={rPhaseAmps} onChange={(e) => setRPhaseAmps(e.target.value)} placeholder="R Amps" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Y-Phase (Amps)</Label>
                  <Input className="h-8 text-xs" value={yPhaseAmps} onChange={(e) => setYPhaseAmps(e.target.value)} placeholder="Y Amps" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">B-Phase (Amps)</Label>
                  <Input className="h-8 text-xs" value={bPhaseAmps} onChange={(e) => setBPhaseAmps(e.target.value)} placeholder="B Amps" />
                </div>
              </div>
            )}
          </div>

          {/* Media Attachments & Photos */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" /> Photo & Evidence Attachments
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Site Photo */}
              <div className="border rounded p-2 text-center space-y-2 bg-background">
                <Label className="text-xs font-semibold block">Site Inspection Photo</Label>
                {sitePhotoUrl ? (
                  <div className="relative group">
                    <img src={sitePhotoUrl} alt="Site" className="h-24 w-full object-cover rounded" />
                    <Button type="button" variant="destructive" size="sm" className="mt-1 text-[10px]" onClick={() => setSitePhotoUrl("")}>Remove</Button>
                  </div>
                ) : (
                  <label className="border border-dashed rounded p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition">
                    <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-[11px] text-muted-foreground">Upload Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "site")} />
                  </label>
                )}
                {uploadingImage === "site" && <p className="text-[10px] text-primary animate-pulse">Uploading...</p>}
              </div>

              {/* Meter / Technical Photo */}
              <div className="border rounded p-2 text-center space-y-2 bg-background">
                <Label className="text-xs font-semibold block">Meter / Close-up Photo</Label>
                {meterReadingPhotoUrl ? (
                  <div className="relative group">
                    <img src={meterReadingPhotoUrl} alt="Meter" className="h-24 w-full object-cover rounded" />
                    <Button type="button" variant="destructive" size="sm" className="mt-1 text-[10px]" onClick={() => setMeterReadingPhotoUrl("")}>Remove</Button>
                  </div>
                ) : (
                  <label className="border border-dashed rounded p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition">
                    <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-[11px] text-muted-foreground">Upload Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "meter")} />
                  </label>
                )}
                {uploadingImage === "meter" && <p className="text-[10px] text-primary animate-pulse">Uploading...</p>}
              </div>

              {/* Sketch / Drawing Photo */}
              <div className="border rounded p-2 text-center space-y-2 bg-background">
                <Label className="text-xs font-semibold block">Drawing / Sketch Document</Label>
                {sketchDrawingUrl ? (
                  <div className="relative group">
                    <img src={sketchDrawingUrl} alt="Sketch" className="h-24 w-full object-cover rounded" />
                    <Button type="button" variant="destructive" size="sm" className="mt-1 text-[10px]" onClick={() => setSketchDrawingUrl("")}>Remove</Button>
                  </div>
                ) : (
                  <label className="border border-dashed rounded p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition">
                    <FileText className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-[11px] text-muted-foreground">Upload Sketch/PDF</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileUpload(e, "sketch")} />
                  </label>
                )}
                {uploadingImage === "sketch" && <p className="text-[10px] text-primary animate-pulse">Uploading...</p>}
              </div>
            </div>
          </div>

          {/* Agency Remarks */}
          <div className="space-y-1.5">
            <Label className="font-semibold">Agency Remarks & Observations *</Label>
            <Textarea
              placeholder="Record detailed observations, feasibility notes, or issues encountered during site inspection..."
              rows={3}
              value={agencyRemarks}
              onChange={(e) => setAgencyRemarks(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Agency Findings
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
