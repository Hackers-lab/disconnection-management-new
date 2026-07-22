"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft, Upload, Camera, MapPin, Power, Clock, CircleX, Check, RotateCcw,
  Smartphone, IndianRupee, Box, Monitor, AlertCircle, Calendar, Loader2, History,
  PlusCircle, PowerOff, Wallet, Footprints, Trash2, Image as ImageIcon
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { ConsumerData } from "@/lib/google-sheets"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { compressAndWatermarkImage } from "@/lib/image-processor"

import { Lock } from "lucide-react"

interface ConsumerFormProps {
  consumer: ConsumerData
  onSave: (consumer: ConsumerData) => void
  onCancel: () => void
  userRole: string
  availableAgencies: string[]
  permissions?: Record<string, string[]>
}

export function ConsumerForm({ consumer, onSave, onCancel, userRole, availableAgencies, permissions }: ConsumerFormProps) {
  const isReadOnly = permissions
    ? !(permissions.disconnection?.includes("update") || permissions.consumer_master?.includes("update"))
    : (userRole === "viewer" || userRole === "reader")

  const [formData, setFormData] = useState({
    ...consumer,
    notes: consumer.notes || "",
    agency: consumer.agency || "",
    image: null as File | null,
    reading: consumer.reading || "",
    imageUrl: consumer.imageUrl,
  })
  
  const [uploading, setUploading] = useState(false)
  const [statusChanged, setStatusChanged] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // History — loaded lazily when user opens the dialog
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<{
    timestamp: string; action: string; oldStatus: string; newStatus: string;
    oldOsd: string; oldNotes: string; oldImageUrl: string; changedBy: string;
    amount?: string; eventDate?: string;
  }[]>([])

  const loadHistory = async () => {
    const cacheKey = `consumer_history_${consumer.consumerId}`
    const cached = await getFromCache<any[]>(cacheKey)
    if (cached) {
      setHistoryEntries(cached)
    }

    if (historyEntries.length > 0 || cached) {
      setHistoryOpen(true)
    } else {
      setHistoryLoading(true)
      setHistoryOpen(true)
    }

    try {
      const resp = await fetch(`/api/consumers/history?id=${encodeURIComponent(consumer.consumerId)}`)
      if (resp.ok) {
        const data = await resp.json()
        setHistoryEntries(data)
        await saveToCache(cacheKey, data)
      }
    } catch { /* silent */ }
    finally { setHistoryLoading(false) }
  }

  // Normalize a stored image link the same way the consumer list does, so the
  // "View Uploaded Image" link opens the Drive/share URL in a new tab.
  const getValidUrl = (url: string | undefined) => {
    if (!url) return "#"
    const clean = url.trim()
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean
    return `https://${clean}`
  }

  // Map a history action to a friendly label, icon and accent colour.
  const eventMeta = (h: { action: string; newStatus: string }) => {
    const a = (h.action || "").toLowerCase()
    const ns = (h.newStatus || "").toLowerCase()
    if (a === "paid" || ns === "paid") return { label: "Paid", Icon: Wallet, color: "text-green-600", ring: "bg-green-100" }
    if (a === "removed_from_upload") return { label: "Removed from list", Icon: Trash2, color: "text-red-600", ring: "bg-red-100" }
    if (a.startsWith("in_new_list")) return { label: "Listed in cycle", Icon: PlusCircle, color: "text-blue-600", ring: "bg-blue-100" }
    if (ns === "disconnected" || ns.includes("disconnect")) return { label: "Disconnected", Icon: PowerOff, color: "text-red-600", ring: "bg-red-100" }
    if (ns === "visited" || ns === "not found") return { label: ns === "visited" ? "Visited" : "Not found", Icon: Footprints, color: "text-amber-600", ring: "bg-amber-100" }
    return { label: (h.action || "Updated").replace(/_/g, " "), Icon: Clock, color: "text-gray-500", ring: "bg-gray-100" }
  }
  
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

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

  // Cleanup preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // --- 1. WATERMARK & COMPRESSION HELPER ---
  const processImage = async (imageFile: File): Promise<File> => {
    const dateStr = new Date().toLocaleString("en-IN", { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', hour12: true 
    })
    let locStr = "GPS: Waiting for signal..."
    if (location) {
      locStr = `Lat: ${location.lat.toFixed(6)}, Long: ${location.lng.toFixed(6)}`
    } else if (navigator.geolocation) {
       try {
         const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout: 2000}))
         locStr = `Lat: ${pos.coords.latitude.toFixed(6)}, Long: ${pos.coords.longitude.toFixed(6)}`
       } catch (e) {
         locStr = "GPS: Location Disabled/Unavailable"
       }
    }
    return compressAndWatermarkImage(imageFile, {
      maxDim: 800,
      watermarkLines: [`Date: ${dateStr}`, locStr],
      targetKb: 95
    })
  }

  // --- 2. UPLOAD TO SERVER ---
  const handleUpload = async (file: File) => {
    if (isReadOnly) return
    // Create immediate preview
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    setUploading(true)

    try {
      const processedFile = await processImage(file)
      setFormData(prev => ({ ...prev, image: processedFile }))

      const uploadData = new FormData()
      uploadData.append("file", processedFile)
      uploadData.append("consumerId", consumer.consumerId)

      const response = await fetch("/api/upload-image", { method: "POST", body: uploadData })
      const result = await response.json()

      if (result.success || result.url) {
        setFormData(prev => ({ ...prev, imageUrl: result.url }))
      } else {
        alert("Upload failed. Please try again.")
        setPreviewUrl(null)
      }
    } catch (error) {
      console.error("Upload failed", error)
      alert("Image upload failed. Please try again.")
      setPreviewUrl(null)
    } finally {
      setUploading(false)
    }
  }

  // --- 3. CAMERA LOGIC ---
  const startCamera = async () => {
    if (isReadOnly) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      mediaStreamRef.current = stream
      setCameraActive(true)

      // Wait for the video element to mount, then attach stream
      // use requestAnimationFrame to schedule attachment on next paint
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch (err) {
      console.error("Camera error", err)
      alert("Unable to access camera. Please allow permissions.")
    }
  }

  const capturePhoto = () => {
    if (isReadOnly) return
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    const stream = mediaStreamRef.current || (videoRef.current && (videoRef.current.srcObject as MediaStream))
    if (stream) {
      const tracks = stream.getTracks()
      tracks.forEach((track) => track.stop())
    }

    if (videoRef.current) videoRef.current.srcObject = null
    mediaStreamRef.current = null
    setCameraActive(false)
  }

  const handleStatusUpdate = (status: string) => {
    if (isReadOnly) return
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-GB").replace(/\//g, "-");
    setFormData((prev) => ({ ...prev, disconStatus: status, disconDate: formattedDate }));
    setStatusChanged(true);
  }
  
  const getStatusChipStyle = (status: string, isActive: boolean) => {
    const base = "h-11 rounded-xl text-xs font-bold transition-all duration-200 border-2 flex items-center justify-center gap-1.5 flex-1"
    if (!isActive) {
      return `${base} bg-white text-slate-650 border-slate-200 hover:border-slate-350 hover:bg-slate-50/50`
    }
    
    switch (status) {
      case "agency paid":
        return `${base} bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm`
      case "disconnected":
        return `${base} bg-red-50 text-red-700 border-red-500 shadow-sm`
      case "bill dispute":
        return `${base} bg-blue-50 text-blue-700 border-blue-500 shadow-sm`
      case "office team":
        return `${base} bg-sky-50 text-sky-700 border-sky-500 shadow-sm`
      case "not found":
        return `${base} bg-slate-100 text-slate-750 border-slate-500 shadow-sm`
      case "connected":
        return `${base} bg-purple-50 text-purple-700 border-purple-500 shadow-sm`
      default:
        return `${base} bg-blue-50 text-blue-700 border-blue-500 shadow-sm`
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    e.preventDefault();

    if (userRole !== "admin") {
      if (formData.disconStatus === "agency paid") {
        // Paid (Agency Paid): image and meter reading are optional.
      } else {
        if (!formData.imageUrl) {
          alert("Please upload the image first.")
          return
        }
        if ((formData.disconStatus === "disconnected" || formData.disconStatus === "bill dispute") && !formData.reading) {
          alert("Meter reading is required.")
          return
        }
        if ((formData.disconStatus === "bill dispute" || formData.disconStatus === "office team") && !formData.notes) {
          alert("Remarks are required for Bill Dispute or Office Team status.")
          return
        }
      }
    }

    const updatedConsumer: ConsumerData = {
      ...consumer,
      ...formData,
      lastUpdated: new Date().toISOString().split("T")[0],
    }
    onSave(updatedConsumer);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 md:px-6 space-y-5 pb-28 min-w-0 overflow-x-hidden bg-[#F8FAFC]">
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={() => {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
          onCancel()
        }} className="rounded-full hover:bg-slate-100 h-9 w-9">
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </Button>
        <h1 className="text-xl font-bold text-slate-900 flex-1">Update Consumer</h1>
        <Button type="button" variant="outline" size="sm" onClick={loadHistory}
          className="flex items-center gap-1.5 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50">
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </div>

      {/* --- HISTORY DIALOG --- */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Consumer History — {consumer.consumerId}</DialogTitle>
          </DialogHeader>
          {historyLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Loading history…
            </div>
          )}
          {!historyLoading && historyEntries.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No history recorded yet.</p>
          )}
          {!historyLoading && historyEntries.length > 0 && (
            <div className="mt-2 relative pl-5">
              {/* vertical timeline rail */}
              <span className="absolute left-[9px] top-1 bottom-1 w-px bg-gray-200" aria-hidden />
              <div className="space-y-3">
                {historyEntries.map((h, i) => {
                  const meta = eventMeta(h)
                  const Icon = meta.Icon
                  return (
                    <div key={i} className="relative border rounded-lg p-3 space-y-2 bg-gray-50 text-slate-800">
                      {/* timeline node */}
                      <span className={`absolute -left-[18px] top-3 h-5 w-5 rounded-full flex items-center justify-center ${meta.ring}`}>
                        <Icon className={`h-3 w-3 ${meta.color}`} />
                      </span>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                        <span className="text-[10px] font-mono text-slate-400">{h.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {h.oldStatus && (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{h.oldStatus}</span>
                        )}
                        {h.newStatus && h.newStatus !== h.oldStatus && (
                          <>
                            <span className="text-gray-400">→</span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{h.newStatus}</span>
                          </>
                        )}
                        {h.amount && Number(h.amount) > 0 && (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">₹{Number(h.amount).toLocaleString("en-IN")}</span>
                        )}
                        {h.oldOsd && (
                          <span className="text-slate-500 font-medium">OSD: ₹{Number(h.oldOsd).toLocaleString("en-IN")}</span>
                        )}
                        {h.eventDate && <span className="text-slate-455">on {h.eventDate}</span>}
                      </div>
                      {h.oldNotes && (
                        <p className="text-xs text-slate-600 italic">Remarks: {h.oldNotes}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        {h.oldImageUrl ? (
                          <a
                            href={getValidUrl(h.oldImageUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>View Uploaded Image</span>
                          </a>
                        ) : <span />}
                        <span className="text-[10px] text-slate-450 font-medium">by {h.changedBy}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* --- 1. DETAILS CARD --- */}
      <Card className="bg-white border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1 min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900 leading-tight truncate" title={consumer.name}>{consumer.name}</h2>
              <div className="flex items-start gap-1.5 text-xs text-slate-500 mt-1.5 max-w-md">
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
                <span className="leading-snug break-words">{consumer.address}</span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end">
              <span className="bg-red-50 text-red-700 border border-red-100 rounded-full px-3 py-1 font-extrabold text-sm flex items-center gap-0.5 shadow-sm">
                <IndianRupee className="h-4 w-4 shrink-0" />
                {Number(consumer.d2NetOS).toLocaleString("en-IN")}
              </span>
              <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-1 mr-1">Outstanding</span>
            </div>
          </div>

          <div className="h-px bg-slate-100 w-full" />

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Consumer ID</span>
              <span className="text-sm font-semibold text-slate-800 font-mono">{consumer.consumerId}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MRU Section</span>
              <span className="text-sm font-semibold text-slate-800 uppercase font-mono">{consumer.mru || "—"}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Base Class</span>
              <span className="text-sm font-semibold text-slate-800">{consumer.baseClass || "—"}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Device Type</span>
              <span className="text-sm font-semibold text-slate-800">{consumer.device || "—"}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mobile Number</span>
              {consumer.mobileNumber ? (
                <a href={`tel:${consumer.mobileNumber}`} className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                  {consumer.mobileNumber}
                </a>
              ) : (
                <span className="text-sm text-slate-400 font-semibold">N/A</span>
              )}
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Due Date Range</span>
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {consumer.osDuedateRange || "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- PAYMENT INFO --- */}
      {(consumer.paidAmount || consumer.paidDate || consumer.outstandingAfter || consumer.paymentSource) && (
        <Card className="border-emerald-150 bg-emerald-50/30 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
              <IndianRupee className="h-4 w-4" />
              Payment on Record
              {consumer.paidType && (
                <span className="ml-auto text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                  {consumer.paidType}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-emerald-900">
              {consumer.paidAmount && (
                <div><span className="text-emerald-700 font-semibold">Amount:</span> <strong>₹{Number(consumer.paidAmount).toLocaleString("en-IN")}</strong></div>
              )}
              {consumer.paidDate && (
                <div><span className="text-emerald-700 font-semibold">Paid on:</span> <strong>{consumer.paidDate}</strong></div>
              )}
              {consumer.outstandingAfter && Number(consumer.outstandingAfter) > 0 && (
                <div className="col-span-2"><span className="text-emerald-700 font-semibold">Outstanding after:</span> <strong className="text-red-750">₹{Number(consumer.outstandingAfter).toLocaleString("en-IN")}</strong></div>
              )}
              {consumer.paymentSource && (
                <div className="col-span-2"><span className="text-emerald-700 font-semibold">Source:</span> <strong>{consumer.paymentSource}</strong></div>
              )}
              {(userRole === "admin" || userRole === "viewer" || userRole === "executive") && (
                <div className="col-span-2 mt-2">
                  <Label className="text-[10px] uppercase tracking-wide text-emerald-700 font-bold">Next Payment Date</Label>
                  <Input
                    type="text"
                    placeholder="DD-MM-YYYY"
                    value={formData.nextPaymentDate || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, nextPaymentDate: e.target.value }))}
                    className="h-9 mt-1 bg-white rounded-xl border-slate-200 focus-visible:ring-emerald-500"
                    disabled={userRole === "viewer"}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* --- 2. UPDATE ACTION & EVIDENCE --- */}
      <Card className="bg-white border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-6">
            
            {/* Status Segmented Control/Selectable Toggle Chips */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Set Status</Label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  className={getStatusChipStyle("disconnected", formData.disconStatus === "disconnected")}
                  onClick={() => handleStatusUpdate("disconnected")}
                >
                  <Power className="h-4 w-4 shrink-0" />
                  <span>DISCONNECT</span>
                </button>

                <button
                  type="button"
                  className={getStatusChipStyle("bill dispute", formData.disconStatus === "bill dispute")}
                  onClick={() => handleStatusUpdate("bill dispute")}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>DISPUTE</span>
                </button>

                <button
                  type="button"
                  className={getStatusChipStyle("office team", formData.disconStatus === "office team")}
                  onClick={() => handleStatusUpdate("office team")}
                >
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>OFFICE TEAM</span>
                </button>

                <button
                  type="button"
                  className={getStatusChipStyle("agency paid", formData.disconStatus === "agency paid")}
                  onClick={() => handleStatusUpdate("agency paid")}
                >
                  <Check className="h-4 w-4 shrink-0" />
                  <span>PAID</span>
                </button>

                <button
                  type="button"
                  className={getStatusChipStyle("not found", formData.disconStatus === "not found")}
                  onClick={() => handleStatusUpdate("not found")}
                >
                  <CircleX className="h-4 w-4 shrink-0" />
                  <span>NOT FOUND</span>
                </button>

                {userRole === "admin" && (
                  <button
                    type="button"
                    className={getStatusChipStyle("connected", formData.disconStatus === "connected")}
                    onClick={() => handleStatusUpdate("connected")}
                  >
                    <RotateCcw className="h-4 w-4 shrink-0" />
                    <span>REISSUE</span>
                  </button>
                )}
              </div>
              
              {formData.disconDate && (
                <div className="text-[10px] text-slate-400 font-bold text-right pt-1 pr-1">
                  Status updated on: <span className="text-slate-600 font-semibold">{formData.disconDate}</span>
                </div>
              )}
            </div>

            {/* Admin Options */}
            {userRole === "admin" && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Assign Agency</Label>
                  <select
                    value={formData.agency}
                    onChange={(e) => setFormData({...formData, agency: e.target.value})}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                  >
                    <option value="">Select Agency</option>
                    {availableAgencies.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                {/* Urgent flag */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Priority</Label>
                  <Button
                    type="button"
                    variant={formData.priority === "urgent" ? "destructive" : "outline"}
                    className={`w-full h-11 border rounded-xl font-bold text-xs transition-all duration-200 ${
                      formData.priority === "urgent"
                        ? "bg-red-600 hover:bg-red-700 text-white border-red-650"
                        : "border-slate-200 text-slate-650 hover:border-red-400 hover:text-red-600"
                    }`}
                    onClick={() =>
                      setFormData(prev => ({
                        ...prev,
                        priority: prev.priority === "urgent" ? "" : "urgent",
                      }))
                    }
                  >
                    {formData.priority === "urgent" ? "🔴 URGENT — Click to remove" : "Mark as URGENT"}
                  </Button>
                </div>
              </div>
            )}

            {/* Image Evidence */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                  Evidence (Auto-Watermarked) {userRole !== "admin" && formData.disconStatus !== "agency paid" && <span className="text-red-500 font-bold">*</span>}
                  {userRole !== "admin" && formData.disconStatus === "agency paid" && <span className="text-slate-400 normal-case ml-1 font-semibold">(optional)</span>}
                </Label>
                
                {/* Hidden File Input */}
                <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                    }}
                />

                {!cameraActive ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Button 
                            type="button" 
                            variant="outline"
                            className="h-11 rounded-xl border border-slate-200 text-slate-650 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50/50 flex items-center justify-center gap-2 font-bold text-xs transition-all duration-200"
                            onClick={startCamera}
                            disabled={uploading}
                        >
                            <Camera className="h-4.5 w-4.5 text-slate-505" />
                            <span>Camera (Live)</span>
                        </Button>
                        <Button 
                            type="button" 
                            variant="outline"
                            className="h-11 rounded-xl border border-slate-200 text-slate-650 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50/50 flex items-center justify-center gap-2 font-bold text-xs transition-all duration-200"
                            onClick={() => {
                                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                                fileInputRef.current?.click()
                            }}
                            disabled={uploading}
                        >
                            <Upload className="h-4.5 w-4.5 text-slate-505" />
                            <span>Gallery</span>
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3 bg-black p-2 rounded-2xl overflow-hidden">
                        <div className="relative w-full h-64 bg-black rounded-xl overflow-hidden">
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        </div>
                        <div className="flex gap-3">
                            <Button className="flex-1 bg-white text-black hover:bg-gray-200 rounded-xl text-xs font-bold h-10" onClick={capturePhoto}>
                                Capture Photo
                            </Button>
                            <Button variant="destructive" className="rounded-xl text-xs font-bold h-10" onClick={stopCamera}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* Preview & Status */}
                {(previewUrl || formData.imageUrl) && !cameraActive && (
                    <div className="relative mt-2 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                        <img 
                            src={previewUrl || formData.imageUrl} 
                            alt="Evidence" 
                            className={`w-full h-48 object-cover ${uploading ? 'opacity-50' : ''}`} 
                        />
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                <div className="bg-white/95 px-4 py-2 rounded-full flex items-center shadow-md">
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin text-blue-600" />
                                    <span className="text-xs font-bold text-blue-600">Processing image...</span>
                                </div>
                            </div>
                        )}
                        {!uploading && formData.imageUrl && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-bold py-2 text-center uppercase tracking-wider">
                                Image Linked Successfully
                            </div>
                        )}
                    </div>
                )}
            </div>
        </CardContent>
      </Card>

      {/* --- 3. INPUT FIELDS CARD --- */}
      <Card className="bg-white border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Meter Reading {userRole !== "admin" && (formData.disconStatus === "disconnected" || formData.disconStatus === "bill dispute") && <span className="text-red-500 font-bold">*</span>}
                </Label>
                <Input 
                    placeholder="Enter reading..." 
                    value={formData.reading} 
                    onChange={e => setFormData({...formData, reading: e.target.value})}
                    className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-600 text-sm font-semibold"
                />
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Remarks {userRole !== "admin" && (formData.disconStatus === "bill dispute" || formData.disconStatus === "office team") && <span className="text-red-500 font-bold">*</span>}
                </Label>
                <Textarea 
                    placeholder="Any additional notes..." 
                    value={formData.notes} 
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    className="min-h-24 rounded-xl border-slate-200 focus-visible:ring-blue-600 text-sm font-medium"
                />
            </div>
        </CardContent>
      </Card>

      {/* --- 4. LOCATION INFO --- */}
      {consumer.latitude && consumer.longitude && (
        <Card className="bg-white border-slate-100 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="pb-2 p-5 border-b border-slate-50">
            <CardTitle className="text-sm font-bold flex items-center text-slate-800">
              <MapPin className="h-4 w-4 mr-1.5 text-blue-600" />
              Location Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">GIS Pole Reference</span>
                <span className="font-semibold text-slate-850 text-sm">{consumer.gisPole || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">GPS Coordinates</span>
                <span className="font-mono text-slate-800 font-semibold">{consumer.latitude}, {consumer.longitude}</span>
              </div>
            </div>
            <Button
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all duration-200"
              onClick={() => {
                const url = `https://www.google.com/maps?q=${consumer.latitude},${consumer.longitude}`
                window.open(url, "_blank")
              }}
            >
              <MapPin className="h-4 w-4" />
              <span>Open in Google Maps</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sticky footer is portaled to body so no ancestor transform/filter
          can break its viewport-fixed positioning. */}
      {typeof window !== "undefined" && createPortal(
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-[60] flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          {isReadOnly ? (
            <Button
              variant="outline"
              className="w-full h-12 border-gray-300 text-gray-700 font-bold text-base"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                onCancel()
              }}
            >
              Close (Read-Only Mode)
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="flex-1 h-12 border-gray-300 text-gray-700"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                  onCancel()
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-[2] h-12 text-lg shadow-sm bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSubmit}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Save Update"}
              </Button>
            </>
          )}
        </div>,
        document.body
      )}

    </div>
  )
}