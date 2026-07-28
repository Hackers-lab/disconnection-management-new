"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Camera, Upload, MapPin, Check, Loader2, Image as ImageIcon,
  ShieldAlert, FileText
} from "lucide-react"
import { compressAndWatermarkImage } from "@/lib/image-processor"
import type { SafetyTicket } from "@/lib/safety-service"

export const HAZARD_TYPES = [
  { id: "Low Sag", label: "Low Sag", icon: "⚡" },
  { id: "Long Span", label: "Long Span", icon: "📏" },
  { id: "Tilted Pole", label: "Tilted Pole", icon: "🪵" },
  { id: "Broken Pole", label: "Broken Pole", icon: "⚠️" },
  { id: "Missing Earth", label: "Missing Earth", icon: "🔌" },
  { id: "Damaged Conductor", label: "Damaged Conductor", icon: "✂️" },
  { id: "Tree Trimming", label: "Tree Trimming", icon: "🌳" },
  { id: "Kiosk Required", label: "Kiosk Required", icon: "📦" },
  { id: "Box Bracket Required", label: "Box Bracket Required", icon: "🧱" },
  { id: "Stay Required", label: "Stay Required", icon: "⚓" },
  { id: "Neutral Earthing Required", label: "Neutral Earthing Required", icon: "⚡" },
  { id: "LA Required", label: "LA Required", icon: "🌩️" },
  { id: "Others", label: "Others", icon: "✏️" },
]

interface SafetyFormProps {
  onSave: (data: Partial<SafetyTicket>) => void
  onCancel: () => void
  userRole: string
  userAgencies: string[]
  availableAgencies?: string[]
}

export function SafetyForm({ onSave, onCancel, userRole, userAgencies, availableAgencies = [] }: SafetyFormProps) {
  const [selectedHazards, setSelectedHazards] = useState<string[]>([])
  const [otherHazardText, setOtherHazardText] = useState<string>("")
  const [severity, setSeverity] = useState<"Critical" | "High" | "Medium" | "Low">("Medium")
  const [priority, setPriority] = useState<"urgent" | "normal">("normal")
  const [latitude, setLatitude] = useState<string>("")
  const [longitude, setLongitude] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [dtrCode, setDtrCode] = useState<string>("")
  const [agency, setAgency] = useState<string>(userRole === "agency" ? userAgencies[0] || "" : "")
  const [beforeImageUrl, setBeforeImageUrl] = useState<string>("")
  const [drawingUrl, setDrawingUrl] = useState<string>("")
  const [remarks, setRemarks] = useState<string>("")

  const [agenciesList, setAgenciesList] = useState<string[]>(availableAgencies)

  useEffect(() => {
    async function loadAgencies() {
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            const names = data.map((a: any) => typeof a === "string" ? a : a.name).filter(Boolean)
            if (names.length > 0) setAgenciesList(prev => Array.from(new Set([...prev, ...names])))
          }
        }
      } catch (e) {
        console.warn("Failed to fetch agencies", e)
      }
    }
    loadAgencies()
  }, [availableAgencies])

  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingDrawing, setUploadingDrawing] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [drawingCameraActive, setDrawingCameraActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const drawingVideoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const drawingInputRef = useRef<HTMLInputElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const drawingMediaStreamRef = useRef<MediaStream | null>(null)

  // Fetch location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(6))
          setLongitude(pos.coords.longitude.toFixed(6))
        },
        (err) => console.warn("GPS location unavailable", err),
        { enableHighAccuracy: true }
      )
    }
  }, [])

  const toggleHazard = (hazardId: string) => {
    setSelectedHazards(prev =>
      prev.includes(hazardId) ? prev.filter(h => h !== hazardId) : [...prev, hazardId]
    )
  }

  const processImage = async (imageFile: File, title: string): Promise<File> => {
    const dateStr = new Date().toLocaleString("en-IN", {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    })
    const latNum = parseFloat(latitude) || 0
    const lngNum = parseFloat(longitude) || 0
    const locStr = latNum && lngNum ? `Lat: ${latNum.toFixed(6)}, Long: ${lngNum.toFixed(6)}` : "GPS: Captured"

    return compressAndWatermarkImage(imageFile, {
      maxDim: 800,
      watermarkLines: [`${title} - Date: ${dateStr}`, locStr],
      targetKb: 95
    })
  }

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true)
    try {
      const processedFile = await processImage(file, "Before Safety Inspection Photo")
      const uploadData = new FormData()
      uploadData.append("file", processedFile)
      uploadData.append("consumerId", "SAFETY_BEFORE")
      uploadData.append("module", "safety")

      const res = await fetch("/api/upload-image", { method: "POST", body: uploadData })
      const result = await res.json()
      if (res.ok && result.success) {
        setBeforeImageUrl(result.url)
      } else {
        alert(result.error || "Before photo upload failed. Please try again.")
      }
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "Before photo upload failed. Please try again.")
    } finally {
      setUploadingImage(false)
    }
  }

  const handleDrawingUpload = async (file: File) => {
    setUploadingDrawing(true)
    try {
      const processedFile = await processImage(file, "Safety Work Drawing Sketch")
      const uploadData = new FormData()
      uploadData.append("file", processedFile)
      uploadData.append("consumerId", "SAFETY_DRAWING")
      uploadData.append("module", "safety")

      const res = await fetch("/api/upload-image", { method: "POST", body: uploadData })
      const result = await res.json()
      if (res.ok && result.success) {
        setDrawingUrl(result.url)
      } else {
        alert(result.error || "Drawing image upload failed.")
      }
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "Drawing image upload failed.")
    } finally {
      setUploadingDrawing(false)
    }
  }

  // Camera logic for Before Photo
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      mediaStreamRef.current = stream
      setCameraActive(true)
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch (err) {
      alert("Unable to access camera.")
    }
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "safety_capture.jpg", { type: "image/jpeg" })
          stopCamera()
          handleImageUpload(file)
        }
      }, "image/jpeg")
    }
  }

  const stopCamera = () => {
    const stream = mediaStreamRef.current || (videoRef.current && (videoRef.current.srcObject as MediaStream))
    if (stream) stream.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    mediaStreamRef.current = null
    setCameraActive(false)
  }

  // Camera logic for Drawing Image
  const startDrawingCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      drawingMediaStreamRef.current = stream
      setDrawingCameraActive(true)
      requestAnimationFrame(() => {
        if (drawingVideoRef.current) drawingVideoRef.current.srcObject = stream
      })
    } catch (err) {
      alert("Unable to access camera.")
    }
  }

  const captureDrawingPhoto = () => {
    const video = drawingVideoRef.current
    if (!video) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "drawing_capture.jpg", { type: "image/jpeg" })
          stopDrawingCamera()
          handleDrawingUpload(file)
        }
      }, "image/jpeg")
    }
  }

  const stopDrawingCamera = () => {
    const stream = drawingMediaStreamRef.current || (drawingVideoRef.current && (drawingVideoRef.current.srcObject as MediaStream))
    if (stream) stream.getTracks().forEach((track) => track.stop())
    if (drawingVideoRef.current) drawingVideoRef.current.srcObject = null
    drawingMediaStreamRef.current = null
    setDrawingCameraActive(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedHazards.length === 0) {
      alert("Please select at least one hazard type.")
      return
    }
    if (selectedHazards.includes("Others") && !otherHazardText.trim()) {
      alert("Please specify details for 'Others' hazard.")
      return
    }
    if (!latitude || !longitude || isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
      alert("GPS Coordinates (Latitude & Longitude) are MANDATORY.")
      return
    }
    if (!address.trim()) {
      alert("Site address / landmark is required.")
      return
    }

    const finalCategories = selectedHazards.map(h => {
      if (h === "Others" && otherHazardText.trim()) return `Others: ${otherHazardText.trim()}`
      return h
    })

    onSave({
      hazardCategories: finalCategories,
      severity,
      priority,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address.trim(),
      dtrCode: dtrCode.trim(),
      agency,
      beforeImageUrl,
      drawingUrl,
      remarks: remarks.trim(),
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Report Site Safety Hazard</h1>
      </div>

      <Card className="border shadow-sm bg-white rounded-2xl">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg flex items-center text-slate-900">
            <ShieldAlert className="h-5 w-5 text-amber-600 mr-2" />
            Safety Hazard Form
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {/* Fast Tap Hazard Chips */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
              <span>Select Hazard Types *</span>
              <span className="text-amber-600 font-bold text-[11px]">Tap to multi-select</span>
            </Label>

            {/* Quick Chips Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {HAZARD_TYPES.map(item => {
                const active = selectedHazards.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleHazard(item.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 border text-left flex items-center justify-between gap-1.5 ${
                      active
                        ? "bg-amber-600 text-white border-amber-600 shadow-md scale-[1.02]"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Specify text when "Others" is selected */}
            {selectedHazards.includes("Others") && (
              <div className="pt-2">
                <Label className="text-xs font-bold text-amber-700">Specify Other Hazard Details *</Label>
                <Input
                  value={otherHazardText}
                  onChange={e => setOtherHazardText(e.target.value)}
                  placeholder="Type specific hazard details here..."
                  className="h-10 mt-1 border-amber-300 rounded-xl"
                  required
                />
              </div>
            )}
          </div>

          {/* Severity & Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Severity Level</Label>
              <Select value={severity} onValueChange={(val: any) => setSeverity(val)}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Critical">🔴 Critical (Emergency Hazard)</SelectItem>
                  <SelectItem value="High">🟠 High Severity</SelectItem>
                  <SelectItem value="Medium">🔵 Medium Severity</SelectItem>
                  <SelectItem value="Low">⚪ Low Severity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Priority Status</Label>
              <Button
                type="button"
                variant={priority === "urgent" ? "destructive" : "outline"}
                className={`w-full h-10 rounded-xl font-bold text-xs ${
                  priority === "urgent" ? "bg-red-600 text-white" : "border-slate-200 text-slate-700 hover:border-red-400"
                }`}
                onClick={() => setPriority(p => p === "urgent" ? "normal" : "urgent")}
              >
                {priority === "urgent" ? "🔴 URGENT — High Priority" : "Mark as URGENT"}
              </Button>
            </div>
          </div>

          {/* Mandatory GPS Coordinates */}
          <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                <span>GPS Coordinates *</span>
              </span>
              <span className="text-red-500 font-bold text-[10px]">MANDATORY (Editable)</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Latitude</span>
                <Input
                  value={latitude}
                  onChange={e => setLatitude(e.target.value)}
                  placeholder="e.g. 22.5726"
                  className="h-9 font-mono text-xs font-bold"
                  required
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Longitude</span>
                <Input
                  value={longitude}
                  onChange={e => setLongitude(e.target.value)}
                  placeholder="e.g. 88.3639"
                  className="h-9 font-mono text-xs font-bold"
                  required
                />
              </div>
            </div>
          </div>

          {/* Address & DTR Code */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Address / Landmark *</Label>
              <Input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Near Pole No 14, Substation Road..."
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">DTR Code (Optional)</Label>
              <Input
                value={dtrCode}
                onChange={e => setDtrCode(e.target.value)}
                placeholder="e.g. DTR-500KVA-09"
                className="h-10 rounded-xl font-mono text-xs"
              />
            </div>
          </div>

          {/* Assigned Agency */}
          {(userRole === "admin" || userRole === "executive" || userRole === "superuser") && (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Assign Agency</Label>
              <select
                value={agency}
                onChange={e => setAgency(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
              >
                <option value="">Unassigned (Select Agency)</option>
                {agenciesList.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}

          {/* Site Before Photo */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Site Before Photo (Watermarked)</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />

            {!cameraActive ? (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={startCamera} disabled={uploadingImage}>
                  <Camera className="h-4 w-4 mr-2 text-blue-600" /> Camera
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                  <Upload className="h-4 w-4 mr-2 text-blue-600" /> Gallery
                </Button>
              </div>
            ) : (
              <div className="space-y-3 bg-black p-2 rounded-lg">
                <div className="relative w-full h-64 bg-black rounded overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <div className="flex gap-3">
                  <Button className="flex-1 bg-white text-black" onClick={capturePhoto}>Capture</Button>
                  <Button variant="destructive" onClick={stopCamera}>Cancel</Button>
                </div>
              </div>
            )}

            {beforeImageUrl && !cameraActive && (
              <div className="relative mt-2 rounded-xl overflow-hidden border">
                <img src={beforeImageUrl} alt="Before" className="w-full h-44 object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold py-1 text-center">
                  Before Photo Attached ✓
                </div>
              </div>
            )}
          </div>

          {/* Work Drawing Image (Camera / Gallery Upload) */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Work Drawing Image (Camera / Gallery)</Label>
            <input ref={drawingInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleDrawingUpload(e.target.files[0])} />

            {!drawingCameraActive ? (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" className="h-11 rounded-xl border-dashed border-purple-300 bg-purple-50/40 text-purple-800" onClick={startDrawingCamera} disabled={uploadingDrawing}>
                  <Camera className="h-4 w-4 mr-2 text-purple-600" /> Camera
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-xl border-dashed border-purple-300 bg-purple-50/40 text-purple-800" onClick={() => drawingInputRef.current?.click()} disabled={uploadingDrawing}>
                  <Upload className="h-4 w-4 mr-2 text-purple-600" /> Gallery
                </Button>
              </div>
            ) : (
              <div className="space-y-3 bg-black p-2 rounded-lg">
                <div className="relative w-full h-64 bg-black rounded overflow-hidden">
                  <video ref={drawingVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <div className="flex gap-3">
                  <Button className="flex-1 bg-white text-black" onClick={captureDrawingPhoto}>Capture Drawing</Button>
                  <Button variant="destructive" onClick={stopDrawingCamera}>Cancel</Button>
                </div>
              </div>
            )}

            {drawingUrl && !drawingCameraActive && (
              <div className="relative mt-2 rounded-xl overflow-hidden border border-purple-200">
                <img src={drawingUrl} alt="Drawing" className="w-full h-44 object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-purple-900/80 text-white text-[10px] font-bold py-1 text-center">
                  Drawing Image Attached ✓
                </div>
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Remarks & Description</Label>
            <Textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Any additional notes..."
              className="min-h-20 rounded-xl text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] max-w-3xl mx-auto">
        <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold" onClick={handleSubmit} disabled={uploadingImage || uploadingDrawing}>
          {uploadingImage || uploadingDrawing ? "Uploading..." : "Submit Safety Ticket"}
        </Button>
      </div>
    </div>
  )
}
