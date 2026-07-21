"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Loader2, Camera, Trash2, RotateCw,
  ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon,
  UploadCloud, CheckCircle2, Crop, Plus, Image as ImageIcon, FileText, AlertCircle
} from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import { NSC_CLASSES, NSC_PHASES } from "@/lib/nsc-types"
import { NscCameraModal } from "@/components/nsc-camera-modal"
import { NscCropDialog } from "@/components/nsc-crop-dialog"
import { applyCamScannerMagicColor, detectDocumentCorners, warpPerspective } from "@/lib/document-scanner"

interface Props {
  agencies: string[]
  onSave: (receiveNo: string) => void
  onCancel: () => void
}

interface CapturedPage {
  id: string
  src: string // base64 URL
  rotation: number // 0, 90, 180, 270
}

// Helper to auto-detect document edges & apply perspective warp immediately upon import/capture
const autoCropImage = (imgSrc: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve(imgSrc); return }

      ctx.drawImage(img, 0, 0)
      const autoCorners = detectDocumentCorners(canvas)
      const isLandscape = img.width > img.height
      const warpedCanvas = warpPerspective(canvas, autoCorners, isLandscape)
      resolve(warpedCanvas.toDataURL("image/jpeg", 0.9))
    }
    img.onerror = () => resolve(imgSrc)
    img.src = imgSrc
  })
}

// Helper function to process rotation and apply CamScanner "Magic Color" Enhancement
const processImageForScan = (
  imgSrc: string,
  rotationAngle: number
): Promise<{ dataUrl: string; width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve({ dataUrl: imgSrc, width: img.width, height: img.height }); return }

      const isRotated = rotationAngle === 90 || rotationAngle === 270
      const origW = img.width
      const origH = img.height

      // Scale to high-clarity A4 standard resolution (max 1697px)
      const MAX_SIZE = 1697
      let w = origW
      let h = origH
      if (w > MAX_SIZE || h > MAX_SIZE) {
        if (w > h) {
          h = Math.round((h * MAX_SIZE) / w)
          w = MAX_SIZE
        } else {
          w = Math.round((w * MAX_SIZE) / h)
          h = MAX_SIZE
        }
      }

      const finalW = isRotated ? h : w
      const finalH = isRotated ? w : h
      canvas.width = finalW
      canvas.height = finalH

      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotationAngle * Math.PI) / 180)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)

      // Apply automatic CamScanner Magic Color Enhancer (pure #FFFFFF paper, crisp text, vivid ink)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      applyCamScannerMagicColor(imgData)
      ctx.putImageData(imgData, 0, 0)

      resolve({
        dataUrl: canvas.toDataURL("image/jpeg", 0.75),
        width: finalW,
        height: finalH,
      })
    }
    img.src = imgSrc
  })
}

export function NscApplicationForm({ agencies, onSave, onCancel }: Props) {
  const [applicantName, setApplicantName] = useState("")
  const [careOf, setCareOf]               = useState("")
  const [address, setAddress]             = useState("")
  const [mobile, setMobile]               = useState("")
  const [appliedClass, setAppliedClass]   = useState("")
  const [phase, setPhase]                 = useState("")
  const [agency, setAgency]               = useState("")
  const [officeRefNo, setOfficeRefNo]     = useState("")
  const [agencyList, setAgencyList]       = useState<string[]>(agencies)
  const [submitting, setSubmitting]       = useState(false)

  // Document scanner states
  const [pages, setPages]                 = useState<CapturedPage[]>([])
  const [uploadingPdf, setUploadingPdf]   = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState("")
  const [uploadError, setUploadError]     = useState<string | null>(null)
  const [applicationFormUrl, setApplicationFormUrl] = useState("")

  // Modal states
  const [isCameraOpen, setIsCameraOpen]   = useState(false)
  const [cropTargetIndex, setCropTargetIndex] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) { setAgencyList(cached); return }
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* keep prop */ }
    }
    load()
  }, [])

  // Continuous In-App Camera Capture with Instant Auto-Crop
  const handleCameraCapture = async (base64Img: string) => {
    const croppedSrc = await autoCropImage(base64Img)
    setPages((prev) => [
      ...prev,
      {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        src: croppedSrc,
        rotation: 0,
      },
    ])
  }

  // Gallery File Selection with Instant Auto-Crop
  const handleGallerySelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const fileList = Array.from(files)

    fileList.forEach((file) => {
      const reader = new FileReader()
      reader.onload = async (event) => {
        if (event.target?.result) {
          const rawSrc = event.target!.result as string
          const croppedSrc = await autoCropImage(rawSrc)
          setPages((prev) => [
            ...prev,
            {
              id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              src: croppedSrc,
              rotation: 0,
            },
          ])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  // Direct PDF File Upload Option
  const handleDirectPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    setUploadError(null)
    setUploadProgressText("Uploading PDF document to cloud storage...")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const safeApplicantName = applicantName.trim().replace(/[^a-zA-Z0-9]/g, "_") || "nsc"
      formData.append("consumerId", `NSC_FORM_${safeApplicantName}`)

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to upload PDF")
      setApplicationFormUrl(data.url)
    } catch (err: any) {
      setUploadError(err.message || "Error uploading PDF")
    } finally {
      setUploadingPdf(false)
      setUploadProgressText("")
      e.target.value = ""
    }
  }

  const rotatePage = (index: number) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    )
  }

  const deletePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index))
  }

  const movePageLeft = (index: number) => {
    if (index === 0) return
    setPages((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index - 1]
      next[index - 1] = temp
      return next
    })
  }

  const movePageRight = (index: number) => {
    if (index === pages.length - 1) return
    setPages((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index + 1]
      next[index + 1] = temp
      return next
    })
  }

  const handleApplyCrop = (warpedBase64: string) => {
    if (cropTargetIndex === null) return
    setPages((prev) =>
      prev.map((p, i) => (i === cropTargetIndex ? { ...p, src: warpedBase64 } : p))
    )
    setCropTargetIndex(null)
  }

  // Dynamic Orientation PDF Compilation
  const compileAndUploadPdf = async () => {
    if (pages.length === 0) return
    setUploadingPdf(true)
    setUploadError(null)
    setUploadProgressText("Processing A4 enhancements & compiling PDF...")
    try {
      const { jsPDF } = await import("jspdf")

      const firstProcessed = await processImageForScan(pages[0].src, pages[0].rotation)
      const firstIsLandscape = firstProcessed.width > firstProcessed.height

      const doc = new jsPDF({
        orientation: firstIsLandscape ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
        compress: true
      })

      if (firstIsLandscape) {
        doc.addImage(firstProcessed.dataUrl, "JPEG", 0, 0, 297, 210, undefined, "FAST")
      } else {
        doc.addImage(firstProcessed.dataUrl, "JPEG", 0, 0, 210, 297, undefined, "FAST")
      }

      for (let i = 1; i < pages.length; i++) {
        setUploadProgressText(`Processing page ${i + 1} of ${pages.length}...`)
        const page = pages[i]
        const processed = await processImageForScan(page.src, page.rotation)
        const isLandscape = processed.width > processed.height

        doc.addPage("a4", isLandscape ? "landscape" : "portrait")

        if (isLandscape) {
          doc.addImage(processed.dataUrl, "JPEG", 0, 0, 297, 210, undefined, "FAST")
        } else {
          doc.addImage(processed.dataUrl, "JPEG", 0, 0, 210, 297, undefined, "FAST")
        }
      }

      setUploadProgressText("Uploading compiled PDF to cloud storage...")
      const pdfBlob = doc.output("blob")
      const pdfFile = new File([pdfBlob], `nsc_app_${Date.now()}.pdf`, { type: "application/pdf" })

      const formData = new FormData()
      formData.append("file", pdfFile)
      const safeApplicantName = applicantName.trim().replace(/[^a-zA-Z0-9]/g, "_") || "nsc"
      formData.append("consumerId", `NSC_FORM_${safeApplicantName}`)

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to upload")
      setApplicationFormUrl(data.url)
    } catch (e: any) {
      setUploadError(e.message || "Error compiling or uploading PDF")
    } finally {
      setUploadingPdf(false)
      setUploadProgressText("")
    }
  }

  const handleSubmit = async () => {
    if (!applicantName.trim()) { alert("Applicant name is required."); return }
    if (!address.trim())       { alert("Address is required."); return }
    if (!mobile.trim())        { alert("Mobile number is required."); return }
    if (!appliedClass)         { alert("Applied class is required."); return }
    if (!phase)                { alert("Phase is required."); return }
    if (!agency)               { alert("Please assign an agency."); return }
    if (!applicationFormUrl)   { alert("Please upload or compile the Application Form PDF first."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/nsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantName: applicantName.trim(),
          careOf: careOf.trim(),
          address: address.trim(),
          mobile: mobile.trim(),
          appliedClass,
          phase,
          agency,
          officeRefNo: officeRefNo.trim(),
          applicationFormUrl
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      onSave(data.receiveNo)
    } catch (e: any) {
      alert(e.message || "Failed to create application")
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">New NSC Application</h1>
          <p className="text-xs text-gray-500">Receive number will be auto-assigned</p>
        </div>
      </div>

      {/* Applicant details */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Applicant Details</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label>Applicant Name *</Label>
            <Input value={applicantName} onChange={e => setApplicantName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1">
            <Label>C/O (Father / Husband Name)</Label>
            <Input value={careOf} onChange={e => setCareOf(e.target.value)} placeholder="C/O name" />
          </div>
          <div className="space-y-1">
            <Label>Address *</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address with locality" />
          </div>
          <div className="space-y-1">
            <Label>Mobile Number *</Label>
            <Input
              value={mobile}
              onChange={e => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile"
              className="font-mono"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label>Office Reference Number <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input value={officeRefNo} onChange={e => setOfficeRefNo(e.target.value)} placeholder="Manual serial or office ref" />
            <p className="text-xs text-gray-400">Office-assigned reference — different from the auto-generated receive number</p>
          </div>
        </CardContent>
      </Card>

      {/* Connection details */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Connection Details</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label>Applied Class *</Label>
            <Select value={appliedClass} onValueChange={setAppliedClass}>
              <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
              <SelectContent>
                {NSC_CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Phase *</Label>
            <div className="grid grid-cols-2 gap-2">
              {NSC_PHASES.map(p => (
                <button key={p.value} type="button"
                  onClick={() => setPhase(p.value)}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition ${phase === p.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Form Scanner Experience Card */}
      <Card className="border-indigo-200 bg-indigo-50/30 overflow-hidden shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 bg-indigo-100/50">
          <CardTitle className="text-sm text-indigo-950 flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold">
              <Camera className="h-4 w-4 text-indigo-600" />
              Document Scanner (A4 Mode)
            </span>
            {pages.length > 0 && !applicationFormUrl && (
              <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {pages.length} {pages.length === 1 ? "Page" : "Pages"}
              </span>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-4 py-4 space-y-4">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleGallerySelection}
            className="hidden"
            id="nsc-gallery-input-v2"
          />

          <input
            type="file"
            accept="application/pdf"
            onChange={handleDirectPdfUpload}
            className="hidden"
            id="nsc-direct-pdf-input"
          />

          {/* Upload Progress Loader View */}
          {uploadingPdf && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-3 shadow-xs">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              <div>
                <p className="text-xs font-bold text-indigo-950">{uploadProgressText || "Uploading document..."}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Please wait, streaming file to cloud storage...</p>
              </div>
            </div>
          )}

          {/* Success Card (Attached PDF View) */}
          {!uploadingPdf && applicationFormUrl && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-xs">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-emerald-950 font-sans truncate">Application Form PDF Attached</p>
                  <a
                    href={applicationFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-indigo-600 font-semibold underline hover:text-indigo-800 flex items-center gap-1 mt-0.5 font-mono"
                  >
                    View Uploaded Document ↗
                  </a>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-red-600 border-red-200 hover:bg-red-50 text-[10px] font-bold rounded-lg shrink-0 ml-2"
                onClick={() => {
                  setApplicationFormUrl("")
                  setPages([])
                }}
              >
                Replace
              </Button>
            </div>
          )}

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-700 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Action Launchers */}
          {!uploadingPdf && !applicationFormUrl && (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="flex flex-col items-center justify-center border-2 border-indigo-500 bg-indigo-600 text-white rounded-2xl p-3 cursor-pointer hover:bg-indigo-700 transition shadow-md group text-center"
              >
                <Camera className="h-6 w-6 text-white group-hover:scale-110 mb-1 transition-transform" />
                <span className="text-[11px] font-bold leading-tight">A4 Camera Scanner</span>
              </button>

              <label
                htmlFor="nsc-gallery-input-v2"
                className="flex flex-col items-center justify-center border-2 border-indigo-200 bg-white rounded-2xl p-3 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition group text-center"
              >
                <ImageIcon className="h-6 w-6 text-indigo-600 group-hover:scale-110 mb-1 transition-transform" />
                <span className="text-[11px] font-bold text-indigo-950 leading-tight">Import Images</span>
              </label>

              <label
                htmlFor="nsc-direct-pdf-input"
                className="flex flex-col items-center justify-center border-2 border-emerald-200 bg-emerald-50/50 rounded-2xl p-3 cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 transition group text-center"
              >
                <FileText className="h-6 w-6 text-emerald-600 group-hover:scale-110 mb-1 transition-transform" />
                <span className="text-[11px] font-bold text-emerald-950 leading-tight">Upload PDF File</span>
              </label>
            </div>
          )}

          {/* Multi-Page Horizontal Thumbnail Review Strip */}
          {!uploadingPdf && pages.length > 0 && !applicationFormUrl && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  Captured Pages ({pages.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add More Pages
                </button>
              </div>

              {/* Horizontal Page Thumbnail Strip */}
              <div className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 snap-x">
                {pages.map((p, index) => (
                  <div
                    key={p.id}
                    className="relative flex-shrink-0 w-36 bg-white border-2 border-indigo-100 rounded-xl p-2 shadow-xs snap-start flex flex-col justify-between"
                  >
                    <div className="relative h-48 w-full bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                      <img
                        src={p.src}
                        alt={`Page ${index + 1}`}
                        className="h-full w-full object-contain transition-transform duration-200"
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                      />
                      <span className="absolute top-1 left-1 bg-black/75 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                        Page {index + 1}
                      </span>
                    </div>

                    {/* Page Actions */}
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-full rounded-md border-indigo-100 hover:bg-indigo-50"
                        onClick={() => rotatePage(index)}
                        title="Rotate 90°"
                      >
                        <RotateCw className="h-3.5 w-3.5 text-indigo-700" />
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-full rounded-md border-indigo-100 hover:bg-indigo-50"
                        onClick={() => setCropTargetIndex(index)}
                        title="Perspective Crop"
                      >
                        <Crop className="h-3.5 w-3.5 text-indigo-700" />
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-full rounded-md border-indigo-100 hover:bg-indigo-50"
                        onClick={() => movePageLeft(index)}
                        disabled={index === 0}
                        title="Move Left"
                      >
                        <ArrowLeftIcon className="h-3.5 w-3.5 text-indigo-700" />
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-full rounded-md border-indigo-100 hover:bg-indigo-50"
                        onClick={() => movePageRight(index)}
                        disabled={index === pages.length - 1}
                        title="Move Right"
                      >
                        <ArrowRightIcon className="h-3.5 w-3.5 text-indigo-700" />
                      </Button>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-6 mt-1 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md font-semibold"
                      onClick={() => deletePage(index)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compile & Upload PDF Button */}
          {!uploadingPdf && pages.length > 0 && !applicationFormUrl && (
            <div>
              <Button
                type="button"
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
                onClick={compileAndUploadPdf}
              >
                <UploadCloud className="h-4 w-4" />
                Compile & Upload {pages.length} Page(s) as PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Persistent In-App Camera Viewfinder Modal */}
      <NscCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        capturedCount={pages.length}
      />

      {/* Perspective Crop & Edge Tuning Modal */}
      <NscCropDialog
        isOpen={cropTargetIndex !== null}
        imageSrc={cropTargetIndex !== null && pages[cropTargetIndex] ? pages[cropTargetIndex].src : null}
        onClose={() => setCropTargetIndex(null)}
        onApplyCrop={handleApplyCrop}
      />

      {/* Agency assignment */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Assign Agency</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <Select value={agency} onValueChange={setAgency}>
            <SelectTrigger><SelectValue placeholder="Select agency for inspection..." /></SelectTrigger>
            <SelectContent>
              {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white font-bold" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Creating..." : "Create Application"}
        </Button>
      </div>
    </div>
  )
}
