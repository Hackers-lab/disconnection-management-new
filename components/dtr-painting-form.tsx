"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  ArrowLeft,
  Camera,
  Upload,
  Loader2,
  Brush,
  AlertTriangle,
  RadioTower,
  Info
} from "lucide-react"
import type { DTRRecord } from "@/lib/dtr-service"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface Props {
  dtr: DTRRecord
  username: string
  userRole: string
  onSave: () => void
  onCancel: () => void
}

function getGoogleDriveDirectLink(url: string): string {
  if (!url) return ""
  if (url.includes("drive.google.com")) {
    let fileId = ""
    if (url.includes("/file/d/")) {
      const parts = url.split("/file/d/")
      if (parts[1]) fileId = parts[1].split("/")[0]
    } else if (url.includes("id=")) {
      const match = url.match(/[?&]id=([^&]+)/)
      if (match && match[1]) fileId = match[1]
    }
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
  }
  return url
}

export function DTRPaintingForm({ dtr, username, userRole, onSave, onCancel }: Props) {
  const [painting, setPainting] = useState<string>("Done")
  const [imageUrl, setImageUrl] = useState(dtr.paintingImage || "")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [remarks, setRemarks] = useState("")
  
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Camera helpers ────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = s
      setCameraOn(true)
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = s })
    } catch { alert("Camera unavailable.") }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  const capturePhoto = () => {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement("canvas")
    canvas.width = v.videoWidth; canvas.height = v.videoHeight
    canvas.getContext("2d")?.drawImage(v, 0, 0)
    canvas.toBlob(blob => {
      if (blob) { stopCamera(); uploadImage(new File([blob], "capture.jpg", { type: "image/jpeg" })) }
    }, "image/jpeg")
  }

  // ── Image compression (watermark with DTR Code) ───────────────────
  const processImage = async (file: File): Promise<File> => {
    const dateStr = new Date().toLocaleString("en-IN", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric", 
      hour: "2-digit", 
      minute: "2-digit", 
      hour12: true 
    })
    return compressAndWatermarkImage(file, {
      maxDim: 800,
      watermarkLines: [`Date: ${dateStr}`, `DTR Code — PAINTING: ${dtr.dtrCode}`],
      targetKb: 95
    })
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadImage = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    setFormError(null)
    try {
      const compressed = await processImage(file)
      const fd = new FormData()
      fd.append("file", compressed)
      fd.append("consumerId", dtr.dtrCode)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setImageUrl(data.url)
    } catch { setFormError("Failed to upload image. Please try again.") }
    finally { setUploading(false) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError(null)

    if (painting !== "Done") {
      setFormError("Painting status must be marked as Completed (Done) to submit.")
      return
    }
    if (!imageUrl) {
      setFormError("DTR painting photo is mandatory. Please capture or upload evidence.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/dtr/painting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dtrCode: dtr.dtrCode,
          painting: painting,
          image: imageUrl,
          remarks: remarks.trim()
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit painting registration")
      onSave()
    } catch (e: any) {
      setFormError(e.message || "Failed to save updates.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
            <Brush className="h-5 w-5 text-orange-600" /> DTR Painting Work Order
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">Asset Code Reference: {dtr.dtrCode}</p>
        </div>
      </div>

      {/* Asset Info Card */}
      <Card className="border border-slate-200 bg-slate-50 shadow-sm rounded-2xl">
        <CardContent className="p-4 space-y-3 text-xs text-slate-700">
          <div className="flex items-center gap-2 text-slate-950 font-bold border-b pb-2 mb-2">
            <RadioTower className="h-4 w-4 text-blue-600" />
            <span>Assigned DTR details</span>
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <div>
              <span className="text-slate-400 block">Feeder Name</span>
              <strong className="text-sm text-slate-900 font-semibold">{dtr.feederName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Capacity Rating</span>
              <strong className="text-sm text-slate-900 font-semibold">{dtr.kvCapacity ? `${dtr.kvCapacity} kVA` : "—"}</strong>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block">Assigned Location</span>
              <strong className="text-sm text-slate-900 block leading-tight">{dtr.locationName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Painting Agency</span>
              <strong className="text-sm text-indigo-700 block font-bold">{dtr.paintingAgency || "—"}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form Error Message */}
      {formError && (
        <Alert variant="destructive" className="border-red-200 bg-red-50/50 rounded-2xl">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-bold text-red-800">Form Error</AlertTitle>
          <AlertDescription className="text-red-700 font-medium">{formError}</AlertDescription>
        </Alert>
      )}

      {/* Inputs Columns */}
      <div className="space-y-5">
        {/* Painting Status Selector */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-650">Painting Work Status</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPainting("Pending")}
                  className={`h-12 rounded-xl text-xs font-bold transition-all duration-300 border flex items-center justify-center gap-1.5 ${
                    painting === "Pending"
                      ? "bg-orange-50 text-orange-700 border-orange-300 ring-2 ring-orange-500/10 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                  disabled={submitting}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${painting === "Pending" ? "bg-orange-500 animate-pulse" : "bg-slate-350"}`} />
                  Pending (Not Painted)
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPainting("Done")}
                  className={`h-12 rounded-xl text-xs font-bold transition-all duration-300 border flex items-center justify-center gap-1.5 ${
                    painting === "Done"
                      ? "bg-green-50 text-green-700 border-green-300 ring-2 ring-green-500/10 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                  disabled={submitting}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${painting === "Done" ? "bg-green-500 animate-ping absolute" : ""}`} />
                  <span className={`h-2.5 w-2.5 rounded-full relative ${painting === "Done" ? "bg-green-600" : "bg-slate-350"}`} />
                  Done (Completed)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Painting Evidence Image Card */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
            <Camera className="h-4.5 w-4.5 text-indigo-650" />
            <h3 className="text-sm font-bold text-slate-800">Mandatory Painting Photo</h3>
          </div>
          <CardContent className="p-5 space-y-4">
            <input 
              ref={fileRef} 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} 
            />
            
            {cameraOn ? (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                  <Button type="button" onClick={capturePhoto} className="bg-red-600 hover:bg-red-700 text-white rounded-full h-12 px-6">
                    Capture
                  </Button>
                  <Button type="button" variant="secondary" onClick={stopCamera} className="rounded-full h-12 px-6">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-14 rounded-2xl border-dashed border-slate-300 hover:bg-slate-50 flex items-center justify-center font-semibold text-xs"
                  onClick={startCamera} 
                  disabled={uploading || submitting}
                >
                  <Camera className="h-4.5 w-4.5 mr-2 text-indigo-600 animate-pulse" />
                  Capture Photo
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-14 rounded-2xl border-dashed border-slate-300 hover:bg-slate-50 flex items-center justify-center font-semibold text-xs"
                  onClick={() => fileRef.current?.click()} 
                  disabled={uploading || submitting}
                >
                  <Upload className="h-4.5 w-4.5 mr-2 text-blue-600" />
                  Upload Photo
                </Button>
              </div>
            )}

            {/* Preview image */}
            {(previewUrl || imageUrl) && !cameraOn && (
              <div className="relative rounded-2xl overflow-hidden border mt-3 max-h-64 bg-slate-100 flex items-center justify-center">
                <img 
                  src={previewUrl || getGoogleDriveDirectLink(imageUrl)} 
                  alt="DTR painting" 
                  className={`max-h-64 object-contain ${uploading ? 'opacity-40' : ''}`} 
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/20">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remarks Card */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl">
            <Label htmlFor="remarks" className="text-sm font-bold text-slate-800">Remarks / Painting Notes</Label>
          </div>
          <CardContent className="p-5">
            <Textarea
              id="remarks"
              placeholder="Enter additional remarks or observations regarding painting work..."
              rows={3}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="rounded-xl resize-none font-medium text-xs"
              disabled={submitting}
            />
          </CardContent>
        </Card>
      </div>

      {/* Buttons Row */}
      <div className="flex gap-4 pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 rounded-xl text-slate-700 border-slate-200"
          onClick={onCancel}
          disabled={submitting || uploading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-[2] h-12 rounded-xl bg-slate-950 hover:bg-slate-900 text-white shadow-lg font-bold"
          onClick={handleSubmit}
          disabled={submitting || uploading}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Saving painting details...
            </>
          ) : (
            "Save Painting Completion"
          )}
        </Button>
      </div>
    </div>
  )
}
