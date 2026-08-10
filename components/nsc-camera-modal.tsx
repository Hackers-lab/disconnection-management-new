"use client"

import React, { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, X, Zap, ZapOff, RotateCcw, CheckCircle2 } from "lucide-react"

interface NscCameraModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (base64Img: string) => void
  capturedCount: number
}

export function NscCameraModal({
  isOpen,
  onClose,
  onCapture,
  capturedCount,
}: NscCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [flashAnimation, setFlashAnimation] = useState(false)

  // Start Camera Stream
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    let isSubscribed = true

    async function startCamera() {
      setCameraError(null)
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera access is not supported by your browser.")
        }

        if (stream) {
          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })

        if (!isSubscribed) {
          mediaStream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
          return
        }

        setStream(mediaStream)

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          await videoRef.current.play()
        }

        const videoTrack = mediaStream.getVideoTracks()[0]
        if (videoTrack) {
          const capabilities = typeof (videoTrack as any).getCapabilities === "function" 
            ? (videoTrack as any).getCapabilities() 
            : {}
          setHasTorch(!!capabilities?.torch)
        }
      } catch (err: any) {
        console.error("Camera access error:", err)
        setCameraError(
          err.name === "NotAllowedError"
            ? "Camera permission was denied. Please allow camera access in browser settings."
            : err.message || "Could not access camera."
        )
      }
    }

    startCamera()

    return () => {
      isSubscribed = false
      stopCamera()
    }
  }, [isOpen, facingMode])

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      setStream(null)
    }
    setTorchOn(false)
  }

  const toggleTorch = async () => {
    if (!stream) return
    const track = stream.getVideoTracks()[0]
    if (track && hasTorch) {
      try {
        const nextState = !torchOn
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        })
        setTorchOn(nextState)
      } catch (err) {
        console.error("Torch error:", err)
      }
    }
  }

  const toggleFacingMode = () => {
    setFacingMode((prev: "environment" | "user") => (prev === "environment" ? "user" : "environment"))
  }

  const takePhoto = () => {
    if (!videoRef.current || isCapturing) return
    setIsCapturing(true)

    setFlashAnimation(true)
    setTimeout(() => setFlashAnimation(false), 150)
    if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
      try { (navigator as any).vibrate(40) } catch {}
    }

    const video = videoRef.current
    const canvas = canvasRef.current || document.createElement("canvas")
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
      onCapture(dataUrl)
    }

    setTimeout(() => setIsCapturing(false), 200)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col justify-between select-none overflow-hidden touch-none">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/95 to-transparent z-[210]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20 rounded-full h-10 w-10"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>

        <span className="text-xs font-bold text-white tracking-widest uppercase bg-indigo-600/90 px-3.5 py-1 rounded-full border border-indigo-400/40 backdrop-blur-md shadow-md">
          A4 Camera Scanner
        </span>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`rounded-full h-10 w-10 ${
                torchOn ? "bg-amber-400 text-black" : "text-white hover:bg-white/20"
              }`}
              onClick={toggleTorch}
            >
              {torchOn ? <Zap className="h-5 w-5 fill-current" /> : <ZapOff className="h-5 w-5" />}
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
            onClick={toggleFacingMode}
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Video Stream & Viewfinder */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="p-6 text-center text-white max-w-sm">
            <Camera className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold mb-2">{cameraError}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2 text-xs"
              onClick={onClose}
            >
              Use File Upload Instead
            </Button>
          </div>
        ) : (
          <>
            {/* Live Camera Video Feed */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* FULL SCREEN A4 VIEWFINDER WITH OUTSIDE BLUR MASK */}
            <div className="absolute inset-0 flex flex-col pointer-events-none z-10">
              {/* Top Blurred Backdrop Outside Frame */}
              <div className="flex-1 bg-black/60 backdrop-blur-md border-b border-indigo-500/30" />

              {/* Center Row containing Full-Screen Clear A4 Frame */}
              <div className="flex w-full max-h-[82vh] aspect-[1/1.414] self-center items-center justify-center">
                {/* Left Blurred Backdrop */}
                <div className="w-2.5 sm:w-5 h-full bg-black/60 backdrop-blur-md border-r border-indigo-500/30" />

                {/* CLEAR CAMERA WINDOW (Zero blur, crystal clear video) */}
                <div className="flex-1 h-full relative border-2 border-indigo-400 rounded-2xl flex flex-col justify-between p-3 shadow-[0_0_50px_rgba(99,102,241,0.3)]">
                  {/* Top Corner Brackets */}
                  <div className="flex justify-between">
                    <div className="w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-xl shadow-sm" />
                    <div className="w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-xl shadow-sm" />
                  </div>

                  {/* Alignment Guide Pill */}
                  <div className="self-center bg-black/85 text-white text-[11px] font-bold px-4 py-1.5 rounded-full border border-indigo-400/50 shadow-xl tracking-wider uppercase backdrop-blur-sm">
                    Align A4 Document
                  </div>

                  {/* Bottom Corner Brackets */}
                  <div className="flex justify-between">
                    <div className="w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-xl shadow-sm" />
                    <div className="w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-xl shadow-sm" />
                  </div>
                </div>

                {/* Right Blurred Backdrop */}
                <div className="w-2.5 sm:w-5 h-full bg-black/60 backdrop-blur-md border-l border-indigo-500/30" />
              </div>

              {/* Bottom Blurred Backdrop Outside Frame */}
              <div className="flex-1 bg-black/60 backdrop-blur-md border-t border-indigo-500/30" />
            </div>

            {/* Visual Shutter Flash */}
            {flashAnimation && (
              <div className="absolute inset-0 bg-white opacity-85 transition-opacity duration-150 pointer-events-none z-30" />
            )}
          </>
        )}
      </div>

      {/* Bottom Shutter & Controls Container */}
      <div className="bg-gradient-to-t from-black/95 via-black/85 to-transparent px-6 pt-4 pb-10 flex items-center justify-between z-[210] relative">
        {/* Page Counter Badge */}
        <div className="w-20 flex justify-start">
          {capturedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg animate-pulse">
              <span>{capturedCount}</span>
              <span className="text-[10px] opacity-90">pgs</span>
            </div>
          )}
        </div>

        {/* Shutter Button */}
        <button
          type="button"
          onClick={takePhoto}
          disabled={!!cameraError || isCapturing}
          className="relative group focus:outline-none disabled:opacity-50"
        >
          <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 group-active:scale-95 transition-transform shadow-xl">
            <div className="w-full h-full bg-white group-active:bg-indigo-300 rounded-full transition-colors shadow-inner" />
          </div>
        </button>

        {/* Finish & Close Button */}
        <div className="w-20 flex justify-end">
          <Button
            type="button"
            onClick={onClose}
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-lg border border-emerald-400/40"
          >
            <CheckCircle2 className="h-4 w-4" />
            {capturedCount > 0 ? `Done (${capturedCount})` : "Close"}
          </Button>
        </div>
      </div>
    </div>
  )
}
