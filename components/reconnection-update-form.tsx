"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Camera, Upload, Loader2, MapPin, Phone, IndianRupee, Monitor } from "lucide-react"
import type { ReconnectionRequest } from "@/lib/reconnection-service"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface Props {
  request: ReconnectionRequest
  userRole: string
  username: string
  onSave: () => void
  onCancel: () => void
}

export function ReconnectionUpdateForm({ request, userRole, username, onSave, onCancel }: Props) {
  const [status, setStatus] = useState<"reconnected" | "door_locked">("reconnected")
  const [imageUrl, setImageUrl] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [reading, setReading] = useState("")
  const [remarks, setRemarks] = useState("")
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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

  // ── Image compression (resize to 1024px + watermark date/GPS) ───────────
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
      watermarkLines: [`Date: ${dateStr}`, `Reconnection — ID: ${request.consumerId}`],
      targetKb: 95
    })
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadImage = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const compressed = await processImage(file)
      const fd = new FormData()
      fd.append("file", compressed)
      fd.append("consumerId", request.consumerId)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setImageUrl(data.url)
    } catch { alert("Upload failed.") }
    finally { setUploading(false) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!imageUrl) { alert("Please upload evidence image."); return }
    if (status === "reconnected" && !reading.trim()) { alert("Meter reading is required for reconnection."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/reconnection/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.requestId,
          status,
          imageUrl,
          reading: reading.trim(),
          remarks: remarks.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      window.dispatchEvent(new Event("notif-refresh"))
      onSave()
    } catch (e: any) {
      alert(e.message || "Failed to update")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Update Reconnection</h1>
          <p className="text-sm text-gray-500">Request {request.requestId}</p>
        </div>
      </div>

      {/* Consumer details card */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-bold text-gray-900">{request.name}</p>
              <p className="text-xs font-mono text-gray-500">{request.consumerId}</p>
            </div>
            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full font-medium">
              {request.agency}
            </span>
          </div>
          {request.device && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Monitor className="h-4 w-4 text-gray-400" />
              <span>Meter: <span className="font-mono font-medium">{request.device}</span></span>
            </div>
          )}
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
            <span>{request.address}</span>
          </div>
          {request.mobile && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <a href={`tel:${request.mobile}`} className="text-blue-600 underline">{request.mobile}</a>
            </div>
          )}
          {request.requestImageUrl && (
            <a href={request.requestImageUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 underline">View consumer details image</a>
          )}
        </CardContent>
      </Card>

      {/* Status selection */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Outcome</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStatus("reconnected")}
              className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${
                status === "reconnected"
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              ✅ Reconnected
            </button>
            <button
              onClick={() => setStatus("door_locked")}
              className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${
                status === "door_locked"
                  ? "border-orange-500 bg-orange-50 text-orange-800"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              🔒 Door Locked
            </button>
          </div>

          {/* Reading — required for reconnected */}
          {status === "reconnected" && (
            <div className="space-y-2">
              <Label>Meter Reading at Reconnection *</Label>
              <Input value={reading} onChange={e => setReading(e.target.value)} placeholder="Enter reading..." />
            </div>
          )}

          {/* Evidence image */}
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs font-bold text-gray-500 uppercase">
              Evidence Image * {status === "door_locked" ? "(door lock photo)" : "(reconnection photo)"}
            </Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])} />

            {!cameraOn ? (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" className="h-12" onClick={startCamera} disabled={uploading}>
                  <Camera className="h-4 w-4 mr-2" /> Camera
                </Button>
                <Button type="button" variant="outline" className="h-12"
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="h-4 w-4 mr-2" /> Gallery
                </Button>
              </div>
            ) : (
              <div className="space-y-2 bg-black p-2 rounded-lg">
                <div className="relative w-full h-52 bg-black rounded overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-white text-black" onClick={capturePhoto}>Capture</Button>
                  <Button variant="destructive" onClick={stopCamera}>Cancel</Button>
                </div>
              </div>
            )}

            {previewUrl && !cameraOn && (
              <div className="relative rounded-lg overflow-hidden border">
                <img src={previewUrl} alt="Evidence" className={`w-full h-44 object-cover ${uploading ? "opacity-50" : ""}`} />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white"
          onClick={handleSubmit} disabled={submitting || uploading}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Saving..." : "Save Update"}
        </Button>
      </div>
    </div>
  )
}
