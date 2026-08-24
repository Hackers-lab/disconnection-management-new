"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  Camera,
  RotateCcw,
  Zap,
  ZapOff,
  Grid,
  MapPin,
  Share2,
  Download,
  Trash2,
  Image as ImageIcon,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Search,
  Maximize2,
  X,
  Tag,
  CheckSquare,
  Square,
  Check
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  getGisPhotos,
  saveGisPhoto,
  deleteGisPhoto,
  clearAllGisPhotos,
  GisPhotoRecord
} from "@/lib/indexed-db"
import {
  stampGisWatermark,
  shareGisPhotoRecord,
  getReverseGeocodedLocation,
  WatermarkDesignType
} from "@/lib/gis-watermark"

interface GisCameraProps {
  userRole?: string
  userAgencies?: string[]
  officeCode?: string
  onBack?: () => void
}

export function GisCamera({
  userRole = "user",
  userAgencies = [],
  officeCode = "CCC",
  onBack
}: GisCameraProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "gallery">("camera")
  const [selectedDesign, setSelectedDesign] = useState<WatermarkDesignType>("design1")

  // Camera stream states
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [capturedFlash, setCapturedFlash] = useState(false)

  // Geolocation states
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number
    lng: number
    accuracy?: number
    altitude?: number
    heading?: number
  } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "locked" | "denied">("acquiring")
  const [locationName, setLocationName] = useState<string>("")
  const [customTag, setCustomTag] = useState<string>("")

  // Gallery states
  const [photos, setPhotos] = useState<GisPhotoRecord[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<GisPhotoRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [lastSavedPhoto, setLastSavedPhoto] = useState<GisPhotoRecord | null>(null)

  // Multi-select batch mode states
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBatchSharing, setIsBatchSharing] = useState(false)

  // Office code resolution
  const effectiveOffice =
    officeCode && officeCode !== "CCC"
      ? officeCode
      : typeof window !== "undefined"
      ? localStorage.getItem("user_ccc_code") || "KUSHIDA"
      : "KUSHIDA"

  // Strict Body Scroll Lock for Camera Mode
  useEffect(() => {
    if (activeTab === "camera") {
      const origOverflow = document.body.style.overflow
      const origTouch = document.body.style.touchAction
      const origOverscroll = document.body.style.overscrollBehavior
      document.body.style.overflow = "hidden"
      document.body.style.touchAction = "none"
      document.body.style.overscrollBehavior = "none"

      return () => {
        document.body.style.overflow = origOverflow
        document.body.style.touchAction = origTouch
        document.body.style.overscrollBehavior = origOverscroll
      }
    }
  }, [activeTab])

  // Load photos from IndexedDB on mount
  const loadGalleryPhotos = useCallback(async () => {
    setGalleryLoading(true)
    try {
      const stored = await getGisPhotos()
      setPhotos(stored)
    } catch (err) {
      console.error("Failed to load gallery:", err)
    } finally {
      setGalleryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGalleryPhotos()
  }, [loadGalleryPhotos])

  // Watch GPS Geolocation with high satellite accuracy
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("denied")
      return
    }

    let lastGeocodeTs = 0
    let lastGeocodedLat = 0
    let lastGeocodedLng = 0

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, accuracy, altitude, heading } = pos.coords
        setGpsCoords({
          lat: latitude,
          lng: longitude,
          accuracy: accuracy || undefined,
          altitude: altitude || undefined,
          heading: heading || undefined
        })
        setGpsStatus("locked")

        const now = Date.now()
        const dist = Math.abs(latitude - lastGeocodedLat) + Math.abs(longitude - lastGeocodedLng)
        if (now - lastGeocodeTs > 8000 || dist > 0.0003) {
          lastGeocodeTs = now
          lastGeocodedLat = latitude
          lastGeocodedLng = longitude
          getReverseGeocodedLocation(latitude, longitude, effectiveOffice)
            .then(name => setLocationName(name))
            .catch(() => {})
        }
      },
      err => {
        console.warn("GPS location error:", err)
        if (!gpsCoords) {
          setGpsStatus("denied")
          setGpsCoords({ lat: 25.456156, lng: 87.908775, accuracy: 12 })
          setLocationName("Tulshihata, Malda, West Bengal")
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [effectiveOffice, gpsCoords])

  const isStartingCamera = useRef(false)

  // Initialize Camera Stream
  const startCamera = useCallback(async () => {
    if (isStartingCamera.current) return
    isStartingCamera.current = true

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1440 }
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch (playErr: any) {
          if (playErr?.name !== "AbortError") {
            console.warn("Video play error:", playErr)
          }
        }
      }

      setCameraActive(true)

      const track = stream.getVideoTracks()[0]
      const capabilities: any = track.getCapabilities ? track.getCapabilities() : {}
      setTorchSupported(Boolean(capabilities.torch))
    } catch (err) {
      console.error("Camera access error:", err)
      setCameraActive(false)
    } finally {
      isStartingCamera.current = false
    }
  }, [facingMode])

  useEffect(() => {
    if (activeTab === "camera") {
      startCamera()
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      setCameraActive(false)
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [activeTab, startCamera])

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (track) {
      try {
        const next = !torchOn
        await (track as any).applyConstraints({
          advanced: [{ torch: next }]
        })
        setTorchOn(next)
      } catch (err) {
        console.warn("Torch toggle failed:", err)
      }
    }
  }

  // Switch Camera
  const flipCamera = () => {
    setFacingMode(prev => (prev === "environment" ? "user" : "environment"))
  }

  // Capture and Auto-Save Watermark to Gallery (IndexedDB)
  const handleCapturePhoto = async () => {
    if (!videoRef.current || isProcessing) return

    setIsProcessing(true)
    setCapturedFlash(true)
    setTimeout(() => setCapturedFlash(false), 200)

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(25)
    }

    try {
      const lat = gpsCoords?.lat || 25.456156
      const lng = gpsCoords?.lng || 87.908775
      const accuracy = gpsCoords?.accuracy

      const { record } = await stampGisWatermark(videoRef.current, {
        lat,
        lng,
        accuracy,
        altitude: gpsCoords?.altitude,
        heading: gpsCoords?.heading,
        locationName: locationName || "Tulshihata, Malda, West Bengal",
        officeCode: effectiveOffice,
        note: customTag.trim(),
        design: selectedDesign
      })

      // Auto-save immediately to local IndexedDB Gallery
      const updatedList = await saveGisPhoto(record)
      setPhotos(updatedList)
      setLastSavedPhoto(record)

      // Auto-clear custom note after successful capture
      setCustomTag("")
    } catch (err) {
      console.error("Capture and stamping failed:", err)
    } finally {
      setIsProcessing(false)
    }
  }

  // Delete Single Photo
  const handleDeletePhoto = async (id: string) => {
    try {
      const updated = await deleteGisPhoto(id)
      setPhotos(updated)
      if (selectedPhoto?.id === id) setSelectedPhoto(null)
      if (lastSavedPhoto?.id === id) setLastSavedPhoto(null)
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      console.error("Delete failed:", err)
    }
  }

  // Multi-Select Handlers
  const toggleSelectPhoto = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredPhotos.map(p => p.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  // Share Multiple Photos via Web Share API
  const handleBatchShare = async () => {
    const selectedList = photos.filter(p => selectedIds.has(p.id))
    if (selectedList.length === 0) return

    setIsBatchSharing(true)
    try {
      const filePromises = selectedList.map(async (photo, idx) => {
        const res = await fetch(photo.dataUrl)
        const blob = await res.blob()
        const fileName = `GIS_${photo.dateFormatted.replace(/[\s-/]/g, "_")}_${idx + 1}.jpg`
        return new File([blob], fileName, { type: "image/jpeg" })
      })

      const files = await Promise.all(filePromises)

      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files })) {
        const shareText = `📸 *GIS Geotag Inspection Photos (${files.length} items)*\n📍 ${selectedList[0].locationName}`
        await navigator.share({
          files,
          title: "GIS Inspection Photos",
          text: shareText
        })
      } else {
        // Fallback: Download each sequentially
        for (const photo of selectedList) {
          const a = document.createElement("a")
          a.href = photo.dataUrl
          a.download = `GIS_${photo.dateFormatted}_${photo.id.slice(-4)}.jpg`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Batch share failed:", err)
      }
    } finally {
      setIsBatchSharing(false)
    }
  }

  // Batch Delete Selected Photos
  const handleBatchDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} selected photos?`)) return

    try {
      let currentPhotos = [...photos]
      for (const id of Array.from(selectedIds)) {
        currentPhotos = await deleteGisPhoto(id)
      }
      setPhotos(currentPhotos)
      setSelectedIds(new Set())
      setIsSelectMode(false)
    } catch (err) {
      console.error("Batch delete error:", err)
    }
  }

  // Batch Download Selected Photos
  const handleBatchDownload = () => {
    const selectedList = photos.filter(p => selectedIds.has(p.id))
    selectedList.forEach((photo, idx) => {
      setTimeout(() => {
        const a = document.createElement("a")
        a.href = photo.dataUrl
        a.download = `GIS_${photo.dateFormatted}_${photo.id.slice(-4)}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, idx * 200)
    })
  }

  // Filtered gallery photos
  const filteredPhotos = photos.filter(p => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      p.locationName.toLowerCase().includes(q) ||
      p.note.toLowerCase().includes(q) ||
      p.dateFormatted.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex flex-col h-full max-h-[calc(100dvh-4.2rem)] max-w-lg mx-auto w-full px-2 sm:px-3 pt-1 overflow-hidden">
      {/* 1. ULTRA-COMPACT MOBILE HEADER */}
      <div className="flex items-center justify-between py-1 border-b border-slate-200/80 mb-1.5 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-7 w-7 rounded-full hover:bg-slate-100 shrink-0"
            >
              <ArrowLeft className="h-4 w-4 text-slate-700" />
            </Button>
          )}
          <div className="h-6 w-6 rounded-md bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-2xs">
            <Camera className="h-3.5 w-3.5" />
          </div>
          <h1 className="font-bold text-slate-900 text-sm leading-none truncate">
            GIS Camera
          </h1>
        </div>

        {/* Segmented Switcher */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
          <button
            onClick={() => {
              setActiveTab("camera")
              setIsSelectMode(false)
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
              activeTab === "camera"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Camera className="h-3 w-3" />
            <span>Camera</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("gallery")
              loadGalleryPhotos()
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
              activeTab === "gallery"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ImageIcon className="h-3 w-3" />
            <span>Gallery</span>
            {photos.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] font-bold px-1 rounded-full leading-none py-0.5">
                {photos.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CAMERA TAB (LOCKED NO-SCROLL MOBILE VIEWPORT)                           */}
      {/* ========================================================================= */}
      {activeTab === "camera" && (
        <div className="flex flex-col flex-1 min-h-0 w-full justify-between space-y-1.5 overflow-hidden">
          {/* Responsive Viewfinder Filling Available Space */}
          <div className="relative flex-1 min-h-0 w-full bg-slate-950 rounded-2xl overflow-hidden shadow-lg border border-slate-800 flex items-center justify-center">
            {/* Live Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />

            {/* Flash Overlay */}
            {capturedFlash && (
              <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-200" />
            )}

            {/* Grid Overlay */}
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 z-10">
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div />
              </div>
            )}

            {/* Top Viewfinder Controls */}
            <div className="absolute top-2 inset-x-2 flex items-center justify-between z-20 pointer-events-auto">
              {/* GPS Telemetry Pill */}
              <div className="flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 text-white shadow-2xs">
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    gpsStatus === "locked"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400 animate-ping"
                  }`}
                />
                <span className="text-[10px] font-mono font-bold tracking-tight">
                  {gpsCoords
                    ? `${gpsCoords.lat.toFixed(6)}°, ${gpsCoords.lng.toFixed(6)}°`
                    : "Acquiring GPS..."}
                </span>
                {gpsCoords?.accuracy && (
                  <span className="text-[9px] text-slate-300">
                    (±{gpsCoords.accuracy.toFixed(0)}m)
                  </span>
                )}
              </div>

              {/* Viewfinder Action Buttons */}
              <div className="flex items-center space-x-1 bg-slate-900/85 backdrop-blur-md p-0.5 rounded-full border border-white/10 text-white">
                {torchSupported && (
                  <button
                    onClick={toggleTorch}
                    className={`p-1.5 rounded-full transition-colors ${
                      torchOn ? "bg-amber-400 text-slate-950" : "text-slate-300 hover:text-white"
                    }`}
                    title="Flash Toggle"
                  >
                    {torchOn ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
                  </button>
                )}
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`p-1.5 rounded-full transition-colors ${
                    showGrid ? "bg-white/20 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Grid Lines"
                >
                  <Grid className="h-3 w-3" />
                </button>
                <button
                  onClick={flipCamera}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white transition-colors"
                  title="Flip Camera"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Bottom Live Watermark Preview Pill */}
            <div className="absolute bottom-2 inset-x-2 z-20 pointer-events-auto">
              <div className="bg-slate-900/85 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/15 text-white flex items-center justify-between text-xs shadow-lg">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-sky-300">
                    <MapPin className="h-3 w-3 shrink-0 text-sky-400" />
                    <span className="truncate">{locationName || "Fetching address..."}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDesign(prev => prev === "design1" ? "design2" : "design1")}
                  className="shrink-0 bg-emerald-500/20 hover:bg-emerald-500/30 text-[10px] font-bold text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  title="Switch Design Style"
                >
                  {selectedDesign === "design1" ? "Design 1 (Glass)" : "Design 2 (HUD)"}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Share Banner (Compact Toast right above shutter) */}
          {lastSavedPhoto && (
            <div className="w-full bg-emerald-950/90 backdrop-blur-md border border-emerald-500/40 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-white shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center space-x-1.5 min-w-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="text-[11px] font-semibold text-emerald-100 truncate">
                  Saved to Gallery!
                </span>
              </div>
              <div className="flex items-center space-x-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareGisPhotoRecord(lastSavedPhoto)}
                  className="h-6 px-2 text-[10px] font-bold gap-1 bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500"
                >
                  <Share2 className="h-2.5 w-2.5" />
                  <span>WhatsApp</span>
                </Button>
                <button
                  onClick={() => setSelectedPhoto(lastSavedPhoto)}
                  className="h-6 px-1.5 text-[10px] font-semibold text-slate-300 hover:text-white"
                >
                  View
                </button>
                <button
                  onClick={() => setLastSavedPhoto(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Custom Tag Input */}
          <div className="w-full shrink-0">
            <div className="relative flex items-center">
              <Tag className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                value={customTag}
                onChange={e => setCustomTag(e.target.value)}
                placeholder="Enter Note / Con ID / Pole No (optional)..."
                className="pl-7 pr-7 text-xs h-8 rounded-xl bg-white border-slate-200 shadow-2xs focus-visible:ring-blue-500"
              />
              {customTag && (
                <button
                  onClick={() => setCustomTag("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Camera Action Toolbar */}
          <div className="w-full flex items-center justify-between px-6 py-1.5 bg-slate-900 text-white rounded-2xl shadow-md shrink-0">
            {/* Gallery Shortcut */}
            <button
              onClick={() => {
                setActiveTab("gallery")
                loadGalleryPhotos()
              }}
              className="relative h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95"
              title="Open Gallery"
            >
              {photos.length > 0 ? (
                <img
                  src={photos[0].dataUrl}
                  alt="Recent"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
            </button>

            {/* Big Shutter Capture Button */}
            <button
              onClick={handleCapturePhoto}
              disabled={isProcessing}
              className="relative h-14 w-14 rounded-full border-4 border-white/80 p-0.5 flex items-center justify-center transition-transform active:scale-90 disabled:opacity-50 cursor-pointer shadow-lg hover:border-blue-400"
              title="Capture GIS Photo"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center transition-colors">
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-600 active:bg-blue-700" />
                )}
              </div>
            </button>

            {/* Camera Flip Shortcut */}
            <button
              onClick={flipCamera}
              className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
              title="Flip Camera (Front/Back)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. GALLERY TAB (WITH MULTI-SELECT BATCH SHARE & SMOOTH SCROLL)            */}
      {/* ========================================================================= */}
      {activeTab === "gallery" && (
        <div className="flex flex-col flex-1 min-h-0 w-full space-y-2 overflow-y-auto overscroll-contain pb-28 pr-0.5">
          {/* Top Control Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search photos by village, note, date..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs rounded-xl bg-white border-slate-200"
              />
            </div>

            {photos.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant={isSelectMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setIsSelectMode(!isSelectMode)
                    setSelectedIds(new Set())
                  }}
                  className={`h-8 px-2.5 text-xs font-bold rounded-xl ${
                    isSelectMode ? "bg-blue-600 text-white" : "text-slate-700 border-slate-200"
                  }`}
                >
                  {isSelectMode ? "Done" : "Select"}
                </Button>

                {!isSelectMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("Are you sure you want to clear all stored GIS photos from local storage?")) {
                        clearAllGisPhotos().then(() => setPhotos([]))
                      }
                    }}
                    className="h-8 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Select Mode Sub-Bar */}
          {isSelectMode && (
            <div className="flex items-center justify-between px-2 py-1 bg-blue-50 border border-blue-200/80 rounded-xl text-xs font-semibold text-blue-900">
              <span>{selectedIds.size} of {filteredPhotos.length} selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectedIds.size === filteredPhotos.length ? deselectAll : selectAll}
                  className="text-blue-700 hover:underline font-bold"
                >
                  {selectedIds.size === filteredPhotos.length ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>
          )}

          {/* Photos Grid */}
          {galleryLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600 mb-2" />
              <p className="text-xs text-slate-500">Loading stored photos...</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50">
              <ImageIcon className="h-9 w-9 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No GIS Photos Yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Photos are automatically saved here the instant you press the Shutter button.
              </p>
              <Button
                size="sm"
                onClick={() => setActiveTab("camera")}
                className="mt-3 gap-1.5 bg-blue-600 text-white rounded-xl h-8 text-xs"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Open Camera</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-4">
              {filteredPhotos.map(photo => {
                const isSelected = selectedIds.has(photo.id)
                return (
                  <div
                    key={photo.id}
                    onClick={() => {
                      if (isSelectMode) toggleSelectPhoto(photo.id)
                      else setSelectedPhoto(photo)
                    }}
                    className={`group relative bg-white rounded-xl overflow-hidden border shadow-2xs transition-all flex flex-col cursor-pointer ${
                      isSelected
                        ? "ring-2 ring-blue-600 border-blue-600"
                        : "border-slate-200 hover:shadow-md"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                      <img
                        src={photo.dataUrl}
                        alt={photo.locationName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />

                      {/* Select Mode Checkbox Overlay */}
                      {isSelectMode ? (
                        <div className="absolute top-2 right-2 z-10">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center border transition-all ${
                            isSelected
                              ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                              : "bg-black/40 border-white text-transparent"
                          }`}>
                            <Check className="h-3 w-3" />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                          <span className="text-[9px] text-white flex items-center gap-1 font-semibold">
                            <Maximize2 className="h-2.5 w-2.5" /> Full
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Metadata Card Footer */}
                    <div className="p-2 flex-1 flex flex-col justify-between space-y-1 bg-white">
                      <div>
                        <p className="text-[11px] font-bold text-slate-900 truncate" title={photo.locationName}>
                          {photo.locationName}
                        </p>
                        {photo.note && (
                          <p className="text-[10px] text-blue-700 font-semibold truncate">
                            Tag: {photo.note}
                          </p>
                        )}
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {photo.dateFormatted} • {photo.timeFormatted}
                        </p>
                      </div>

                      {/* Action Bar (When not in Select Mode) */}
                      {!isSelectMode && (
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              shareGisPhotoRecord(photo)
                            }}
                            className="h-6 px-1.5 text-[10px] font-bold gap-1 rounded-lg border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            title="Share to WhatsApp"
                          >
                            <Share2 className="h-2.5 w-2.5" />
                            <span>Share</span>
                          </Button>

                          <div className="flex items-center space-x-0.5">
                            <a
                              href={photo.dataUrl}
                              download={`GIS_${photo.dateFormatted}.jpg`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100"
                              title="Download"
                            >
                              <Download className="h-3 w-3" />
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePhoto(photo.id)
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Sticky Floating Batch Actions Bar (When Items Selected) */}
          {isSelectMode && selectedIds.size > 0 && (
            <div className="fixed bottom-4 inset-x-3 max-w-md mx-auto z-40 bg-slate-900/95 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl border border-white/15 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <span className="text-xs font-bold pl-2 text-sky-300">
                {selectedIds.size} Selected
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={handleBatchShare}
                  disabled={isBatchSharing}
                  className="h-8 px-3 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl"
                >
                  {isBatchSharing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Share2 className="h-3.5 w-3.5" />
                  )}
                  <span>Share ({selectedIds.size})</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchDownload}
                  className="h-8 px-2.5 text-xs font-bold bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 rounded-xl"
                  title="Download Selected"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchDelete}
                  className="h-8 px-2.5 text-xs font-bold bg-red-950/40 border-red-800 text-red-400 hover:bg-red-900 rounded-xl"
                  title="Delete Selected"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FULLSCREEN PREVIEW & LIGHTBOX MODAL                                    */}
      {/* ========================================================================= */}
      {selectedPhoto && (
        <Dialog open={Boolean(selectedPhoto)} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] p-2.5 sm:p-4 rounded-2xl flex flex-col bg-slate-950 text-white border-slate-800">
            <DialogHeader className="flex flex-row items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="min-w-0 pr-2">
                <DialogTitle className="text-xs sm:text-sm font-bold text-white flex items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{selectedPhoto.locationName}</span>
                </DialogTitle>
                <p className="text-[10px] text-slate-400 truncate">
                  Lat: {selectedPhoto.lat.toFixed(6)}°, Long: {selectedPhoto.lng.toFixed(6)}° • {selectedPhoto.dateFormatted} {selectedPhoto.timeFormatted}
                </p>
              </div>
            </DialogHeader>

            {/* Fullscreen Stamped Image View */}
            <div className="relative flex-1 max-h-[66vh] overflow-auto flex items-center justify-center p-1 bg-black/50 rounded-xl">
              <img
                src={selectedPhoto.dataUrl}
                alt="Stamped GIS Capture"
                className="max-h-[64vh] w-auto object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Bottom Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="text-[10px] text-slate-400 truncate max-w-[45%]">
                {selectedPhoto.note ? `Note: ${selectedPhoto.note}` : "GIS Watermark"}
              </div>

              <div className="flex items-center space-x-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareGisPhotoRecord(selectedPhoto)}
                  className="h-7 px-2.5 text-xs font-bold gap-1 rounded-xl bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 cursor-pointer"
                >
                  <Share2 className="h-3 w-3" />
                  <span>WhatsApp</span>
                </Button>
                <a
                  href={selectedPhoto.dataUrl}
                  download={`GIS_${selectedPhoto.dateFormatted}.jpg`}
                  className="h-7 px-2 text-xs font-bold gap-1 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center justify-center"
                >
                  <Download className="h-3 w-3" />
                  <span>Save</span>
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
