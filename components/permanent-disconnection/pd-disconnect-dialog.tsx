"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Camera, MapPin, CheckCircle2, AlertCircle, PowerOff, UploadCloud, Eye } from "lucide-react"
import { PermanentDisconnection, PDMeterCondition } from "@/lib/permanent-disconnection-types"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  record: PermanentDisconnection | null
}

export function PDDisconnectDialog({ isOpen, onClose, onSuccess, record }: Props) {
  const { toast } = useToast()
  const [finalReading, setFinalReading] = useState("")
  const [removedMeterNo, setRemovedMeterNo] = useState("")
  const [meterCondition, setMeterCondition] = useState<PDMeterCondition>("working")
  const [agencyRemarks, setAgencyRemarks] = useState("")
  
  // GPS
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [gettingLocation, setGettingLocation] = useState(false)

  // Photos
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen && record) {
      setFinalReading(record.finalReading || "")
      setRemovedMeterNo(record.removedMeterNo || "")
      setMeterCondition(record.meterCondition || "working")
      setAgencyRemarks(record.agencyRemarks || "")
      setLatitude(record.latitude || "")
      setLongitude(record.longitude || "")
      if (record.evidencePhotos) {
        setPhotoUrls(record.evidencePhotos.split(",").map(s => s.trim()).filter(Boolean))
      } else {
        setPhotoUrls([])
      }
      // Auto fetch GPS if not already present
      if (!record.latitude) {
        fetchLocation()
      }
    }
  }, [isOpen, record])

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported on this device", variant: "destructive" })
      return
    }
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLatitude(pos.coords.latitude.toFixed(6))
        setLongitude(pos.coords.longitude.toFixed(6))
        setGettingLocation(false)
      },
      err => {
        console.warn("GPS error:", err)
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      const now = new Date()
      const dateStr = now.toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      })
      const gpsLine = latitude && longitude ? `GPS: ${latitude}, ${longitude}` : ""

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const processed = await compressAndWatermarkImage(file, {
          maxDim: 800,
          watermarkLines: [
            `PD: ${record?.pdId || ""} | Con ID: ${record?.consumerId || ""}`,
            `Date: ${dateStr}`,
            gpsLine
          ].filter(Boolean),
          targetKb: 90
        })

        const fd = new FormData()
        fd.append("file", processed)
        fd.append("consumerId", record?.consumerId || "PD")

        const res = await fetch("/api/upload-image", { method: "POST", body: fd })
        const json = await res.json()
        if (json.success && json.url) {
          setPhotoUrls(prev => [...prev, json.url])
        } else {
          toast({ title: "Image upload failed: " + (json.error || "Unknown"), variant: "destructive" })
        }
      }
    } catch (e: any) {
      toast({ title: "Error capturing image", variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = (index: number) => {
    setPhotoUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!record) return
    if (!finalReading.trim()) {
      toast({ title: "Please enter Final Meter Reading", variant: "destructive" })
      return
    }
    if (!removedMeterNo.trim()) {
      toast({ title: "Please enter Removed Meter Serial No", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/permanent-disconnection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnect",
          pdId: record.pdId,
          finalReading: finalReading.trim(),
          removedMeterNo: removedMeterNo.trim(),
          meterCondition,
          evidencePhotos: photoUrls.join(","),
          latitude,
          longitude,
          disconnectionDateTime: new Date().toISOString(),
          agencyRemarks: agencyRemarks.trim()
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to mark permanent disconnection")
      }

      toast({
        title: "Disconnection Executed Successfully",
        description: `Meter removed for Consumer #${record.consumerId}.`
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({ title: e.message || "Failed to submit execution", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <PowerOff className="h-5 w-5 text-rose-600" />
            <span>Mark Permanent Disconnection (Site Execution)</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-1 text-xs">
          {/* Summary Card */}
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg space-y-1">
            <div className="flex justify-between font-semibold text-slate-800">
              <span>{record.consumerName}</span>
              <span className="font-mono text-rose-700 font-bold">#{record.consumerId}</span>
            </div>
            <p className="text-slate-500">{record.address}</p>
            {record.liveOsdAmount > 0 && (
              <div className="text-[11px] text-rose-600 font-medium pt-1 border-t border-slate-200">
                Live OSD Dues: ₹{record.liveOsdAmount.toLocaleString("en-IN")}
              </div>
            )}
          </div>

          {/* Readings & Removed Meter Serial */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pd-final-read" className="text-xs font-semibold text-slate-700">
                Final Reading (kWh / Dial) *
              </Label>
              <Input
                id="pd-final-read"
                value={finalReading}
                onChange={e => setFinalReading(e.target.value)}
                placeholder="e.g. 14208"
                className="font-mono text-xs"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pd-removed-mno" className="text-xs font-semibold text-slate-700">
                Removed Meter Serial No *
              </Label>
              <Input
                id="pd-removed-mno"
                value={removedMeterNo}
                onChange={e => setRemovedMeterNo(e.target.value)}
                placeholder="e.g. L098231"
                className="font-mono text-xs uppercase"
              />
            </div>
          </div>

          {/* Meter Condition */}
          <div className="space-y-1.5">
            <Label htmlFor="pd-cond" className="text-xs font-semibold text-slate-700">
              Removed Meter Condition *
            </Label>
            <Select value={meterCondition} onValueChange={(v: PDMeterCondition) => setMeterCondition(v)}>
              <SelectTrigger id="pd-cond" className="text-xs">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="working">Working / Normal</SelectItem>
                <SelectItem value="faulty">Faulty / Defective</SelectItem>
                <SelectItem value="burnt">Burnt / Melted</SelectItem>
                <SelectItem value="damaged">Damaged / Tampered</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* GPS Location Box */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                GPS Coordinates
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={fetchLocation}
                disabled={gettingLocation}
                className="h-6 text-[11px] px-2 text-blue-600 hover:text-blue-800"
              >
                {gettingLocation ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {latitude ? "Refresh GPS" : "Get Current GPS"}
              </Button>
            </div>
            {latitude && longitude ? (
              <div className="font-mono text-[11px] text-slate-600 bg-white p-1.5 rounded border">
                Lat: {latitude}, Lng: {longitude}
              </div>
            ) : (
              <p className="text-[11px] text-amber-600 italic">No GPS coordinates captured yet.</p>
            )}
          </div>

          {/* Evidence Photos (Dial + Site) */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-700 flex justify-between items-center">
              <span>GIS Photo Proofs (Dial & Premises)</span>
              {uploading && (
                <span className="text-blue-600 text-[11px] flex items-center font-normal">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" /> Watermarking & Uploading...
                </span>
              )}
            </Label>

            <div className="flex flex-wrap gap-2 items-center">
              {photoUrls.map((url, idx) => (
                <div key={idx} className="relative group w-16 h-16 rounded border overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(idx)}
                    className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <label className="flex flex-col items-center justify-center w-16 h-16 rounded border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 cursor-pointer transition-colors">
                <Camera className="h-5 w-5 text-slate-500" />
                <span className="text-[9px] text-slate-500 mt-1 font-medium">+ Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleImageCapture}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Agency Remarks */}
          <div className="space-y-1.5">
            <Label htmlFor="pd-remarks" className="text-xs font-semibold text-slate-700">
              Agency Execution Remarks
            </Label>
            <Textarea
              id="pd-remarks"
              value={agencyRemarks}
              onChange={e => setAgencyRemarks(e.target.value)}
              placeholder="e.g. Meter dismantled cleanly, service cable disconnected at pole."
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || uploading || !finalReading.trim() || !removedMeterNo.trim()}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Complete Disconnection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
