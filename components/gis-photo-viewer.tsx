"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  X,
  ChevronLeft,
  ChevronRight,
  Share2,
  Download,
  Trash2,
  Cloud,
  ZoomIn,
  ZoomOut,
  Info,
  MapPin,
  User,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { GisPhotoRecord } from "@/lib/indexed-db"
import { shareGisPhotoRecord } from "@/lib/gis-watermark"

interface GisPhotoViewerProps {
  photos: GisPhotoRecord[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
  onDeletePhoto?: (photo: GisPhotoRecord) => Promise<void> | void
}

export function GisPhotoViewer({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
  onDeletePhoto,
}: GisPhotoViewerProps) {
  const [mounted, setMounted] = useState<boolean>(false)
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [isDetailsVisible, setIsDetailsVisible] = useState<boolean>(true)
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null)
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0)
  const [isSwiping, setIsSwiping] = useState<boolean>(false)

  const filmstripRef = useRef<HTMLDivElement | null>(null)
  const imageContainerRef = useRef<HTMLDivElement | null>(null)

  // Current photo
  const currentPhoto = photos[currentIndex] || null
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  // Handle client mount for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll when viewer is open
  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow
      const origTouchAction = document.body.style.touchAction
      document.body.style.overflow = "hidden"
      document.body.style.touchAction = "none"

      return () => {
        document.body.style.overflow = origOverflow
        document.body.style.touchAction = origTouchAction
      }
    }
  }, [isOpen])

  // Reset zoom on photo change
  useEffect(() => {
    setZoomLevel(1)
    setTouchDeltaX(0)
    setIsSwiping(false)
  }, [currentIndex])

  // Scroll active thumbnail into view
  useEffect(() => {
    if (!filmstripRef.current || !isOpen) return
    const activeThumb = filmstripRef.current.children[currentIndex] as HTMLElement
    if (activeThumb) {
      activeThumb.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      })
    }
  }, [currentIndex, isOpen])

  // Preload neighboring images for instantaneous sliding
  useEffect(() => {
    if (!isOpen) return
    const preload = (index: number) => {
      if (index >= 0 && index < photos.length && photos[index]?.dataUrl) {
        const img = new Image()
        img.src = photos[index].dataUrl
      }
    }
    preload(currentIndex - 1)
    preload(currentIndex + 1)
  }, [currentIndex, photos, isOpen])

  // Slide navigation
  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1)
    }
  }, [currentIndex, onIndexChange])

  const goToNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onIndexChange(currentIndex + 1)
    }
  }, [currentIndex, photos.length, onIndexChange])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowLeft") {
        goToPrev()
      } else if (e.key === "ArrowRight") {
        goToNext()
      } else if (e.key.toLowerCase() === "i") {
        setIsDetailsVisible(prev => !prev)
      } else if (e.key === "+" || e.key === "=") {
        setZoomLevel(z => Math.min(3, z + 0.5))
      } else if (e.key === "-") {
        setZoomLevel(z => Math.max(1, z - 0.5))
      } else if (e.key === "0") {
        setZoomLevel(1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, goToPrev, goToNext])

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoomLevel > 1) return // Allow pan instead of swipe when zoomed in
    if (e.touches.length === 1) {
      setTouchStartPos({ x: e.touches[0].clientX, y: e.touches[0].clientY })
      setIsSwiping(true)
      setTouchDeltaX(0)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || !touchStartPos || zoomLevel > 1) return
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = currentX - touchStartPos.x
    const deltaY = currentY - touchStartPos.y

    // Check if horizontal movement dominates
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if ((!hasPrev && deltaX > 0) || (!hasNext && deltaX < 0)) {
        setTouchDeltaX(deltaX * 0.3)
      } else {
        setTouchDeltaX(deltaX)
      }
    }
  }

  const handleTouchEnd = () => {
    if (!isSwiping || zoomLevel > 1) return
    const swipeThreshold = 45 // minimum px required to change slide

    if (touchDeltaX < -swipeThreshold && hasNext) {
      goToNext()
    } else if (touchDeltaX > swipeThreshold && hasPrev) {
      goToPrev()
    }

    setTouchDeltaX(0)
    setIsSwiping(false)
    setTouchStartPos(null)
  }

  // Double tap / double click to toggle zoom
  const handleToggleZoom = () => {
    setZoomLevel(prev => (prev > 1 ? 1 : 2))
  }

  // Handle photo deletion
  const handleDeleteCurrent = async () => {
    if (!currentPhoto || !onDeletePhoto) return
    if (confirm("Are you sure you want to delete this photo?")) {
      const nextIdx = currentIndex > 0 ? currentIndex - 1 : 0
      await onDeletePhoto(currentPhoto)
      if (photos.length <= 1) {
        onClose()
      } else {
        onIndexChange(nextIdx)
      }
    }
  }

  if (!isOpen || !currentPhoto || !mounted) return null

  const viewerContent = (
    <div
      className="fixed inset-0 z-[99999] bg-black text-white flex flex-col select-none overflow-hidden touch-none w-screen h-[100dvh]"
      style={{ margin: 0, padding: 0 }}
    >
      {/* 1. TOP HEADER BAR (Always Visible & Never Hidden) */}
      <div
        className="w-full z-30 flex items-center justify-between px-3 sm:px-6 py-2.5 bg-gradient-to-b from-black via-black/90 to-transparent shrink-0"
        style={{ paddingTop: "max(0.6rem, env(safe-area-inset-top))" }}
      >
        {/* Left: Prominent Close Button & Counter */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md flex items-center gap-1.5 text-xs font-bold text-white transition-all cursor-pointer border border-white/20 shadow-md shrink-0"
            title="Close Gallery (Esc)"
          >
            <X className="h-4 w-4" />
            <span>Close</span>
          </button>

          {/* Photo Counter */}
          <div className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-semibold text-white/90 shrink-0">
            <span>{currentIndex + 1}</span>
            <span className="text-white/40 mx-1">/</span>
            <span>{photos.length}</span>
          </div>
        </div>

        {/* Right: Actions (Share, Download, More) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Prominent WhatsApp Share Button */}
          <button
            onClick={() => shareGisPhotoRecord(currentPhoto)}
            className="h-9 px-3 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 backdrop-blur-md flex items-center gap-1.5 text-xs font-bold text-white transition-all cursor-pointer border border-emerald-400/40 shadow-lg shrink-0"
            title="Share with Stamped Watermark to WhatsApp"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share</span>
          </button>

          {/* Save / Download */}
          <a
            href={currentPhoto.dataUrl}
            download={`GIS_${currentPhoto.note ? currentPhoto.note.replace(/[^a-zA-Z0-9]/g, "_") + "_" : ""}${currentPhoto.dateFormatted}.jpg`}
            className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md flex items-center justify-center text-white transition-all border border-white/20 shrink-0"
            title="Download Watermarked Image"
          >
            <Download className="h-4 w-4" />
          </a>

          {/* Google Drive Link (Desktop & Tablet) */}
          {currentPhoto.driveUrl && (
            <a
              href={currentPhoto.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex h-9 px-2.5 rounded-full bg-blue-600/80 hover:bg-blue-600 active:scale-95 backdrop-blur-md items-center gap-1 text-xs font-bold text-white transition-all border border-blue-400/30 shrink-0"
              title="Open in Google Drive"
            >
              <Cloud className="h-3.5 w-3.5" />
              <span>Drive</span>
            </a>
          )}

          {/* Zoom toggle (Desktop) */}
          <button
            onClick={handleToggleZoom}
            className="hidden sm:flex h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md items-center justify-center text-white transition-all cursor-pointer border border-white/10 shrink-0"
            title={zoomLevel > 1 ? "Reset Zoom" : "Zoom In (2x)"}
          >
            {zoomLevel > 1 ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>

          {/* Delete Photo */}
          {onDeletePhoto && (
            <button
              onClick={handleDeleteCurrent}
              className="h-9 w-9 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 active:scale-95 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer border border-red-500/30 shrink-0"
              title="Delete Photo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {/* Toggle Details Info */}
          <button
            onClick={() => setIsDetailsVisible(prev => !prev)}
            className={`h-9 w-9 rounded-full active:scale-95 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer border shrink-0 ${
              isDetailsVisible
                ? "bg-sky-500/30 text-sky-300 border-sky-400/50"
                : "bg-white/10 text-white/80 hover:bg-white/20 border-white/10"
            }`}
            title="Toggle Photo Details"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. MAIN FULL-PAGE IMAGE CANVAS (Centered, Constrained & Slidable) */}
      <div
        ref={imageContainerRef}
        className="relative flex-1 min-h-0 min-w-0 w-full h-full flex items-center justify-center overflow-hidden cursor-default select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleToggleZoom}
      >
        <div
          className={`relative w-full h-full max-h-full max-w-full flex items-center justify-center p-1 sm:p-3 overflow-hidden ${
            isSwiping ? "" : "transition-transform duration-300 ease-out"
          }`}
          style={{
            transform: `translateX(${touchDeltaX}px) scale(${zoomLevel})`,
            transformOrigin: "center center",
            cursor: zoomLevel > 1 ? "zoom-out" : "zoom-in",
          }}
        >
          <img
            src={currentPhoto.dataUrl}
            alt={currentPhoto.note || currentPhoto.locationName || "GIS Photo"}
            className="w-full h-full max-h-full max-w-full object-contain drop-shadow-2xl select-none pointer-events-none rounded-sm"
            draggable={false}
          />
        </div>

        {/* Previous Button (Left) */}
        {hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              goToPrev()
            }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 sm:h-14 sm:w-14 rounded-full bg-black/50 hover:bg-black/80 active:scale-90 text-white backdrop-blur-md border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-xl"
            title="Previous Photo (←)"
          >
            <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
          </button>
        )}

        {/* Next Button (Right) */}
        {hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              goToNext()
            }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 sm:h-14 sm:w-14 rounded-full bg-black/50 hover:bg-black/80 active:scale-90 text-white backdrop-blur-md border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-xl"
            title="Next Photo (→)"
          >
            <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
          </button>
        )}
      </div>

      {/* 3. FLOATING BOTTOM HUD (Details & Filmstrip) */}
      <div
        className="w-full z-30 flex flex-col items-center bg-gradient-to-t from-black via-black/85 to-transparent pt-3 pb-2 px-3 shrink-0"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {/* Floating Glassmorphism Metadata Card (Expanded by Default) */}
        {isDetailsVisible && (
          <div className="w-full max-w-xl mx-auto mb-1.5 bg-slate-950/90 backdrop-blur-xl border border-white/20 rounded-2xl p-2.5 sm:p-3 shadow-2xl text-left transition-all animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Header: Note & Close Details button */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-sky-300 bg-sky-950/70 border border-sky-400/40 px-2 py-0.5 rounded-lg truncate inline-flex items-center gap-1">
                    <span>📝</span>
                    <span>{currentPhoto.note || "GIS Photo"}</span>
                  </span>

                  {currentPhoto.cloudSynced || currentPhoto.driveUrl ? (
                    <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-400/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Cloud className="h-3 w-3" />
                      <span>Drive Synced</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-amber-300 bg-amber-950/70 border border-amber-400/30 px-2 py-0.5 rounded-md">
                      Local Device
                    </span>
                  )}
                </div>

                {/* Location */}
                <p className="text-xs text-slate-200 font-medium flex items-center gap-1 mt-1 line-clamp-1">
                  <MapPin className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{currentPhoto.locationName || "Location not recorded"}</span>
                </p>

                {/* Technical Coordinates & Author Info */}
                <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3 text-slate-400" />
                    <span>@{currentPhoto.uploadedBy || "user"}</span>
                  </span>
                  <span>•</span>
                  <span>
                    {currentPhoto.dateFormatted} {currentPhoto.timeFormatted}
                  </span>
                  <span>•</span>
                  <span className="font-mono text-slate-300">
                    {currentPhoto.lat?.toFixed(5)}°, {currentPhoto.lng?.toFixed(5)}°
                  </span>
                </div>
              </div>

              {/* Action Buttons inside Card */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Secondary WhatsApp share right inside details card */}
                <button
                  onClick={() => shareGisPhotoRecord(currentPhoto)}
                  className="h-7 px-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1 border border-emerald-500/40"
                  title="Share to WhatsApp"
                >
                  <Share2 className="h-3 w-3" />
                  <span className="hidden xs:inline">WhatsApp</span>
                </button>

                {/* Minimize details button */}
                <button
                  onClick={() => setIsDetailsVisible(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Minimize Details"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collapsed Details Mini-Bar (When isDetailsVisible is false) */}
        {!isDetailsVisible && (
          <button
            onClick={() => setIsDetailsVisible(true)}
            className="mb-1.5 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-white/20 text-xs text-slate-200 hover:text-white flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
            title="Show Photo Details"
          >
            <Info className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-semibold text-white/90 truncate max-w-[200px]">
              {currentPhoto.note || "GIS Photo"}
            </span>
            <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
          </button>
        )}

        {/* Horizontal Filmstrip (Mini Thumbnails for quick jumping) */}
        {photos.length > 1 && (
          <div
            ref={filmstripRef}
            className="w-full max-w-2xl flex items-center gap-1.5 overflow-x-auto py-1 px-2 select-none"
            style={{ scrollbarWidth: "none" }}
          >
            {photos.map((photo, idx) => {
              const isActive = idx === currentIndex
              return (
                <button
                  key={photo.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onIndexChange(idx)
                  }}
                  className={`relative shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-lg overflow-hidden transition-all duration-200 border cursor-pointer ${
                    isActive
                      ? "ring-2 ring-sky-400 border-white scale-105 z-10 opacity-100 shadow-md"
                      : "border-white/20 opacity-50 hover:opacity-90 scale-95"
                  }`}
                  title={photo.note || `Photo ${idx + 1}`}
                >
                  <img
                    src={photo.dataUrl}
                    alt={photo.note || `Thumb ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(viewerContent, document.body)
}
