"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ArrowLeft, Upload, Camera, MapPin, Smartphone, IndianRupee, Box, Monitor, Calendar, Loader2, ImageIcon
} from "lucide-react"
import type { DeemedVisitData } from "@/lib/dd-service"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface DDFormProps {
  consumer: DeemedVisitData
  onSave: (consumer: DeemedVisitData) => void
  onCancel: () => void
  userRole: string
}

export function DDForm({ consumer, onSave, onCancel, userRole }: DDFormProps) {
  const [formData, setFormData] = useState({
    ...consumer,
    remarks: consumer.remarks || "",
    image: null as File | null,
    reading: consumer.reading || "",
    imageUrl: consumer.imageUrl,
    disconStatus: consumer.disconStatus || "Deemed Disconnected"
  })
  
  const [uploading, setUploading] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Agency Locking Logic
  const isLocked = userRole === "agency" && consumer.disconStatus.toLowerCase() !== "deemed disconnected"

  // Fetch location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location access denied or unavailable", err),
        { enableHighAccuracy: true }
      )
    }
  }, [])

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // --- IMAGE PROCESSING (Watermark & Compression) ---
  const processImage = async (imageFile: File): Promise<File> => {
    const dateStr = new Date().toLocaleString("en-IN", { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', hour12: true 
    })
    let locStr = "GPS: Waiting for signal..."
    if (location) {
      locStr = `Lat: ${location.lat.toFixed(6)}, Long: ${location.lng.toFixed(6)}`
    }
    return compressAndWatermarkImage(imageFile, {
      maxDim: 800,
      watermarkLines: [`Date: ${dateStr}`, locStr],
      targetKb: 95
    })
  }

  const handleUpload = async (file: File) => {
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setUploading(true)
    try {
      const processedFile = await processImage(file)
      setFormData(prev => ({ ...prev, image: processedFile }))

      const uploadData = new FormData()
      uploadData.append("file", processedFile)
      uploadData.append("consumerId", consumer.consumerId)

      const response = await fetch("/api/upload-image", { method: "POST", body: uploadData })
      const result = await response.json()

      if (result.success) {
        setFormData(prev => ({ ...prev, imageUrl: result.url }))
      }
    } catch (error) {
      console.error("Upload failed", error)
      alert("Image upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  // --- CAMERA LOGIC ---
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
          const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" })
          stopCamera()
          handleUpload(file)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return

    if (userRole !== "admin" && !formData.imageUrl) {
      alert("Please upload evidence image.")
      return
    }

    const updatedConsumer: DeemedVisitData = {
      ...consumer,
      ...formData,
      lastUpdated: new Date().toISOString().split("T")[0],
      visitDate: new Date().toISOString().split("T")[0],
    }
    onSave(updatedConsumer)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Deemed Visit Verification</h1>
      </div>

      {/* Consumer Details */}
      <Card className="bg-slate-50 border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">{consumer.name}</h2>
                    <p className="text-xs text-gray-500 font-mono">ID: {consumer.consumerId}</p>
                </div>
                <div className="text-right">
                    <div className="text-xl font-bold text-red-600 flex items-center justify-end">
                        <IndianRupee className="h-5 w-5" />
                        {Number(consumer.totalArrears).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">Outstanding</span>
                </div>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                <span className="leading-snug">{consumer.address}</span>
            </div>
            {consumer.mru ? (
              <div className="text-sm text-gray-600 pt-1">
                <span className="font-medium text-gray-800">MRU:</span> {consumer.mru}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-gray-600 pt-1">
                <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${consumer.mobileNumber}`} className="font-medium text-blue-600 underline">
                        {consumer.mobileNumber || "N/A"}
                    </a>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span>Due: <strong>{consumer.osDuedateRange}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-gray-400" />
                    <span>Class: {consumer.baseClass}</span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <Monitor className="h-4 w-4 text-gray-400" />
                    <span>Device: {consumer.device}</span>
                </div>
            </div>
        </CardContent>
      </Card>

      {/* Update Form */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Verification Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            
            {/* Status Dropdown */}
            <div className="space-y-2">
              <Label>Current Status</Label>
              <Select 
                value={formData.disconStatus} 
                onValueChange={(val) => setFormData({...formData, disconStatus: val})}
                disabled={isLocked}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Deemed Disconnected">Deemed Disconnected (Default)</SelectItem>
                  <SelectItem value="Connected (Meter Running)">Connected (Meter Running)</SelectItem>
                  <SelectItem value="Disconnected">Disconnected</SelectItem>
                  <SelectItem value="Disconnected (Using Neighbor Source)">Disconnected (Using Neighbor Source)</SelectItem>
                  <SelectItem value="Consumer Not Found">Consumer Not Found</SelectItem>
                  <SelectItem value="Premises Locked">Premises Locked</SelectItem>
                  <SelectItem value="Permanently Disconnected">Permanently Disconnected</SelectItem>
                </SelectContent>
              </Select>
              {isLocked && <p className="text-xs text-red-500">Locked: Only Admin can edit this record.</p>}
            </div>

            {/* Evidence Upload */}
            <div className="space-y-3 pt-2 border-t">
                <Label className="text-xs font-bold text-gray-500 uppercase">Evidence (Auto-Watermarked) *</Label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />

                {!cameraActive ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Button type="button" variant="outline" className="h-12" onClick={startCamera} disabled={uploading || isLocked}>
                            <Camera className="h-5 w-5 mr-2" /> Camera
                        </Button>
                        <Button type="button" variant="outline" className="h-12" onClick={() => fileInputRef.current?.click()} disabled={uploading || isLocked}>
                            <Upload className="h-5 w-5 mr-2" /> Gallery
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

                {(previewUrl || formData.imageUrl) && !cameraActive && (
                    <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-200">
                        <img src={previewUrl || formData.imageUrl} alt="Evidence" className={`w-full h-48 object-cover ${uploading ? 'opacity-50' : ''}`} />
                        {uploading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>}
                    </div>
                )}
            </div>

            {/* Payment & Remarks */}
            <div className="space-y-4 pt-2 border-t">
                <div className="space-y-2">
                    <Label>Meter Reading</Label>
                    <Input 
                        type="text"
                        placeholder="Enter reading..." 
                        value={formData.reading} 
                        onChange={e => setFormData({...formData, reading: e.target.value})}
                        disabled={isLocked}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea 
                        placeholder="Any additional notes..." 
                        value={formData.remarks} 
                        onChange={e => setFormData({...formData, remarks: e.target.value})}
                        disabled={isLocked}
                    />
                </div>
            </div>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={uploading || isLocked}>
            {uploading ? "Uploading..." : "Save Update"}
        </Button>
      </div>
    </div>
  )
}