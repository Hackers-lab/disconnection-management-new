"use client"

import React, { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, RefreshCw, X, Check, Zap, ZapOff, Image as ImageIcon, RotateCcw } from "lucide-react"

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

        // Stop existing stream if any
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

        // Check torch capability
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

    // Trigger visual shutter flash & haptic vibration
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
      // Draw frame from video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
      onCapture(dataUrl)
    }

    setTimeout(() => setIsCapturing(false), 200)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden touch-none">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent z-20">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20 rounded-full h-10 w-10"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>

        <span className="text-xs font-bold text-white tracking-widest uppercase bg-indigo-600/60 px-3 py-1 rounded-full border border-indigo-400/30 backdrop-blur-md">
          A4 Camera Viewfinder
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
              Use Standard File Upload
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Exact A4 Ratio Viewfinder Box Overlay (1 : 1.414) */}
            <div className="absolute inset-x-6 top-14 bottom-20 flex items-center justify-center pointer-events-none">
              <div className="w-full max-w-xs aspect-[1/1.414] border-2 border-indigo-400/80 rounded-2xl relative flex flex-col justify-between p-3 bg-indigo-900/10 shadow-2xl backdrop-blur-[1px]">
                <div className="flex justify-between">
                  <div className="w-7 h-7 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg"></div>
                  <div className="w-7 h-7 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg"></div>
                </div>
                <p className="text-center text-white text-[11px] bg-black/70 py-1.5 px-3 rounded-full self-center backdrop-blur-md font-bold tracking-wide border border-indigo-400/40">
                  Align A4 Document
                </p>
                <div className="flex justify-between">
                  <div className="w-7 h-7 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg"></div>
                  <div className="w-7 h-7 border-b-4 border-r-4 border-indigo-400 rounded-br-lg"></div>
                </div>
              </div>
            </div>

            {/* Visual Shutter Flash */}
            {flashAnimation && (
              <div className="absolute inset-0 bg-white opacity-85 transition-opacity duration-150 pointer-events-none z-30" />
            )}
          </>
        )}
      </div>

      {/* Bottom Shutter & Controls */}
      <div className="bg-gradient-to-t from-black/95 via-black/80 to-transparent px-6 py-6 flex items-center justify-between z-20">
        {/* Gallery / Status Counter */}
        <div className="w-16 flex justify-start">
          {capturedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-600/90 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg animate-pulse">
              <span>{capturedCount}</span>
              <span className="text-[10px] opacity-80">pg</span>
            </div>
          )}
        </div>

        {/* Persistent Shutter Button */}
        <button
          type="button"
          onClick={takePhoto}
          disabled={!!cameraError || isCapturing}
          className="relative group focus:outline-none disabled:opacity-50"
        >
          <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 group-active:scale-95 transition-transform">
            <div className="w-full h-full bg-white group-active:bg-indigo-300 rounded-full transition-colors shadow-inner" />
          </div>
        </button>

        {/* Done / Finish Capture Button */}
        <div className="w-16 flex justify-end">
          <Button
            type="button"
            disabled={capturedCount === 0}
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1 shadow-md disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
