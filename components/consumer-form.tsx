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
  PlusCircle, PowerOff, Wallet, Footprints, Trash2, Image as ImageIcon, Lock
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { ConsumerData } from "@/lib/google-sheets"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface ConsumerFormProps {
  consumer: ConsumerData
  onSave: (consumer: ConsumerData) => void
  onCancel: () => void
  userRole: string
  availableAgencies: string[]
}

export function ConsumerForm({ consumer, onSave, onCancel, userRole, availableAgencies }: ConsumerFormProps) {
  const isReadOnly = (userRole || "").toLowerCase() === "viewer" || (userRole || "").toLowerCase() === "reader"

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
      setHistoryOpen(true)
    } else {
      setHistoryLoading(true)
      setHistoryOpen(true)
      try {
        const res = await fetch(`/api/consumers/history?consumerId=${encodeURIComponent(consumer.consumerId)}`)
        if (res.ok) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : (data.history || [])
          setHistoryEntries(list)
          await saveToCache(cacheKey, list)
        }
      } catch {
        // ignore
      } finally {
        setHistoryLoading(false)
      }
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Track user location
  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.log("Geolocation error", err),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [])

  const handleUpload = async (file: File) => {
    if (isReadOnly) return
    setUploading(true)
    try {
      const compressed = await compressAndWatermarkImage(
        file,
        consumer.consumerId,
        formData.disconStatus,
        location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : undefined
      )
      
      const formDataUpload = new FormData()
      formDataUpload.append("file", compressed)
      formDataUpload.append("consumerId", consumer.consumerId)
      formDataUpload.append("module", "disconnection")

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formDataUpload,
      })

      if (res.ok) {
        const data = await res.json()
        setFormData((prev) => ({ ...prev, imageUrl: data.url }))
        setPreviewUrl(data.url)
      } else {
        alert("Image upload failed. Please try again.")
      }
    } catch (err) {
      console.error("Upload error", err)
      alert("Error processing image.")
    } finally {
      setUploading(false)
    }
  }

  const startCamera = async () => {
    if (isReadOnly) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      mediaStreamRef.current = stream
      setCameraActive(true)

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
    const now = new Date()
    const formattedDate = now.toLocaleDateString("en-GB").replace(/\//g, "-")
    setFormData((prev) => ({ ...prev, disconStatus: status, disconDate: formattedDate }))
    setStatusChanged(true)
  }

  const handleSubmit = () => {
    if (isReadOnly) return
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)

    const updatedConsumer: ConsumerData = {
      ...consumer,
      ...formData,
      lastUpdated: new Date().toISOString().split("T")[0],
    }
    onSave(updatedConsumer)
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
        <h1 className="text-xl font-bold text-slate-900 flex-1 flex items-center gap-2">
          Update Consumer
          {isReadOnly && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 gap-1 text-[11px]">
              <Lock className="h-3 w-3" /> Read Only Mode
            </Badge>
          )}
        </h1>
        <Button type="button" variant="outline" size="sm" onClick={loadHistory}
          className="flex items-center gap-1.5 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50">
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </div>

      {/* Consumer Card Summary */}
      <Card className="bg-white border-slate-100 shadow-sm rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider">{consumer.consumerId}</span>
            <h2 className="text-lg font-bold text-slate-900">{consumer.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{consumer.address}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 font-medium">Outstanding D2</span>
            <p className="text-lg font-bold text-red-600">₹{Number(consumer.d2NetOS || 0).toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* --- STATUS ACTION SECTION --- */}
      <Card className="bg-white border-slate-100 shadow-sm rounded-2xl">
        <CardHeader className="pb-2 p-5 border-b border-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            Disconnection Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {["Disconnected", "Connected", "Visited", "Not Found"].map((st) => (
              <button
                key={st}
                type="button"
                disabled={isReadOnly}
                onClick={() => handleStatusUpdate(st)}
                className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  formData.disconStatus?.toLowerCase() === st.toLowerCase()
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                } ${isReadOnly ? "opacity-75 cursor-not-allowed" : ""}`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Meter Reading</Label>
              <Input
                disabled={isReadOnly}
                value={formData.reading}
                onChange={(e) => setFormData({ ...formData, reading: e.target.value })}
                placeholder="Current meter reading"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Remarks / Field Notes</Label>
              <Input
                disabled={isReadOnly}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes or site details..."
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sticky footer is portaled to body */}
      {typeof window !== "undefined" && createPortal(
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-[60] flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button
            variant="outline"
            className="flex-1 h-12 border-gray-300 text-gray-700"
            onClick={onCancel}
          >
            {isReadOnly ? "Close" : "Cancel"}
          </Button>
          {!isReadOnly && (
            <Button
              className="flex-[2] h-12 text-lg shadow-sm bg-blue-600 hover:bg-blue-700 text-white font-bold"
              onClick={handleSubmit}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Save Update"}
            </Button>
          )}
        </div>,
        document.body
      )}

    </div>
  )
}