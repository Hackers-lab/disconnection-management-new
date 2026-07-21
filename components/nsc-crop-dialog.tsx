"use client"

import React, { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Crop, Check, RotateCcw } from "lucide-react"
import { Point, detectDocumentCorners, warpPerspective } from "@/lib/document-scanner"

interface NscCropDialogProps {
  isOpen: boolean
  imageSrc: string | null
  onClose: () => void
  onApplyCrop: (warpedBase64: string) => void
}

export function NscCropDialog({
  isOpen,
  imageSrc,
  onClose,
  onApplyCrop,
}: NscCropDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [corners, setCorners] = useState<[Point, Point, Point, Point]>([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ])
  const [activeCorner, setActiveCorner] = useState<number | null>(null)
  const [imgSize, setImgSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  useEffect(() => {
    if (!isOpen || !imageSrc) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      setImgSize({ width: img.width, height: img.height })

      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.drawImage(img, 0, 0)

      const autoCorners = detectDocumentCorners(canvas)
      setCorners(autoCorners)
    }
    img.src = imageSrc
  }, [isOpen, imageSrc])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget
    setDisplaySize({
      width: target.clientWidth,
      height: target.clientHeight,
    })
  }

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setActiveCorner(index)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeCorner === null || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const relativeY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))

    const scaleX = imgSize.width / rect.width
    const scaleY = imgSize.height / rect.height

    const realX = Math.round(relativeX * scaleX)
    const realY = Math.round(relativeY * scaleY)

    setCorners((prev: [Point, Point, Point, Point]) => {
      const next = [...prev] as [Point, Point, Point, Point]
      next[activeCorner] = { x: realX, y: realY }
      return next
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner !== null) {
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
      setActiveCorner(null)
    }
  }

  const resetCorners = () => {
    if (!imgSize.width || !imgSize.height) return
    const w = imgSize.width
    const h = imgSize.height
    setCorners([
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ])
  }

  const applyCropAndWarp = () => {
    if (!imageSrc || !imgSize.width) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.drawImage(img, 0, 0)
      const isLandscape = img.width > img.height
      const warpedCanvas = warpPerspective(canvas, corners, isLandscape)
      const dataUrl = warpedCanvas.toDataURL("image/jpeg", 0.85)
      onApplyCrop(dataUrl)
      onClose()
    }
    img.src = imageSrc
  }

  if (!isOpen || !imageSrc) return null

  const scaleX = displaySize.width ? displaySize.width / imgSize.width : 1
  const scaleY = displaySize.height ? displaySize.height / imgSize.height : 1

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full p-4 bg-slate-950 text-white border-slate-800 rounded-2xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-white">
            <Crop className="h-4 w-4 text-indigo-400" />
            A4 Document Edge & Perspective Warp
          </DialogTitle>
          <p className="text-[11px] text-slate-400">
            Drag the 4 corner handles to align document edges precisely into an A4 page.
          </p>
        </DialogHeader>

        {/* Workspace Container */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative my-2 flex items-center justify-center bg-black/60 rounded-xl overflow-hidden touch-none select-none max-h-[55vh]"
        >
          <img
            ref={imageRef}
            src={imageSrc}
            onLoad={handleImageLoad}
            alt="Crop target"
            className="w-full h-auto max-h-[55vh] object-contain"
          />

          {/* SVG Overlay Polygon connecting corners */}
          {displaySize.width > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
            >
              <polygon
                points={corners
                  .map((c: Point) => `${c.x * scaleX},${c.y * scaleY}`)
                  .join(" ")}
                fill="rgba(99, 102, 241, 0.25)"
                stroke="#818cf8"
                strokeWidth="2.5"
                strokeDasharray="4 4"
              />
            </svg>
          )}

          {/* 4 Interactive Corner Drag Handles */}
          {displaySize.width > 0 &&
            corners.map((c: Point, i: number) => (
              <div
                key={i}
                onPointerDown={handlePointerDown(i)}
                style={{
                  left: `${c.x * scaleX}px`,
                  top: `${c.y * scaleY}px`,
                }}
                className={`absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-white flex items-center justify-center shadow-xl cursor-grab active:cursor-grabbing ${
                  activeCorner === i ? "bg-indigo-500 scale-125 z-30" : "bg-indigo-600 hover:scale-110 z-20"
                }`}
              >
                <span className="text-[9px] font-bold text-white leading-none">
                  {i === 0 ? "TL" : i === 1 ? "TR" : i === 2 ? "BR" : "BL"}
                </span>
              </div>
            ))}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetCorners}
            className="text-slate-400 hover:text-white text-xs h-9"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Full Page
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9"
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={applyCropAndWarp}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-md"
            >
              <Check className="h-3.5 w-3.5 mr-1" /> Apply Crop
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
