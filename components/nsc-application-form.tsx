"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Loader2, Camera, Trash2, RotateCw,
  ArrowUp, ArrowDown, UploadCloud, CheckCircle2
} from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import { NSC_CLASSES, NSC_PHASES } from "@/lib/nsc-types"

interface Props {
  agencies: string[]
  onSave: (receiveNo: string) => void
  onCancel: () => void
}

interface CapturedPage {
  src: string // base64 URL
  rotation: number // 0, 90, 180, 270
}

// Helper function to apply rotation and filter on a canvas
const applyFilterToImage = (
  imgSrc: string,
  filter: "color" | "grayscale" | "bw",
  rotationAngle: number
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve(imgSrc); return }

      const isRotated = rotationAngle === 90 || rotationAngle === 270
      const origW = img.width
      const origH = img.height

      // Downscale to maximum 1200px for storage efficiency
      const MAX_SIZE = 1200
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

      canvas.width = isRotated ? h : w
      canvas.height = isRotated ? w : h

      // Translate, rotate, and draw image centered
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotationAngle * Math.PI) / 180)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)

      // Apply image scan filters
      if (filter !== "color") {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imgData.data
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)

          if (filter === "bw") {
            const val = gray > 120 ? 255 : 0 // Threshold binarization
            data[i] = val
            data[i + 1] = val
            data[i + 2] = val
          } else {
            // Grayscale
            data[i] = gray
            data[i + 1] = gray
            data[i + 2] = gray
          }
        }
        ctx.putImageData(imgData, 0, 0)
      }

      resolve(canvas.toDataURL("image/jpeg", 0.55))
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

  // Document scan states
  const [pages, setPages]                 = useState<CapturedPage[]>([])
  const [filter, setFilter]               = useState<"color" | "grayscale" | "bw">("grayscale")
  const [uploadingPdf, setUploadingPdf]   = useState(false)
  const [applicationFormUrl, setApplicationFormUrl] = useState("")

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

  const handleImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const fileList = Array.from(files)

    fileList.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target?.result) {
          setPages((prev) => [...prev, { src: event.target!.result as string, rotation: 0 }])
        }
      }
      reader.readAsDataURL(file)
    })
    // Reset file input value to allow uploading same file again if deleted
    e.target.value = ""
  }

  const rotatePage = (index: number) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    )
  }

  const deletePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index))
  }

  const movePageUp = (index: number) => {
    if (index === 0) return
    setPages((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index - 1]
      next[index - 1] = temp
      return next
    })
  }

  const movePageDown = (index: number) => {
    if (index === pages.length - 1) return
    setPages((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index + 1]
      next[index + 1] = temp
      return next
    })
  }

  const compileAndUploadPdf = async () => {
    if (pages.length === 0) { alert("Please capture or select at least one page."); return }
    setUploadingPdf(true)
    try {
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true
      })

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const processedSrc = await applyFilterToImage(page.src, filter, page.rotation)

        if (i > 0) {
          doc.addPage()
        }

        // Add JPEG image fitting A4 page proportions
        doc.addImage(processedSrc, "JPEG", 0, 0, 210, 297, undefined, "FAST")
      }

      const pdfBlob = doc.output("blob")
      const pdfFile = new File([pdfBlob], `nsc_app_${Date.now()}.pdf`, { type: "application/pdf" })

      const formData = new FormData()
      formData.append("file", pdfFile)
      // Form identification name
      const safeApplicantName = applicantName.trim().replace(/[^a-zA-Z0-9]/g, "_") || "nsc"
      formData.append("consumerId", `NSC_FORM_${safeApplicantName}`)

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to upload")
      setApplicationFormUrl(data.url)
      alert("Application Form PDF compiled and uploaded successfully!")
    } catch (e: any) {
      alert("Error compiling or uploading PDF: " + e.message)
    } finally {
      setUploadingPdf(false)
    }
  }

  const handleSubmit = async () => {
    if (!applicantName.trim()) { alert("Applicant name is required."); return }
    if (!address.trim())       { alert("Address is required."); return }
    if (!mobile.trim())        { alert("Mobile number is required."); return }
    if (!appliedClass)         { alert("Applied class is required."); return }
    if (!phase)                { alert("Phase is required."); return }
    if (!agency)               { alert("Please assign an agency."); return }
    if (!applicationFormUrl)   { alert("Please compile and upload the Application Form PDF first."); return }

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

      {/* Application Form PDF Scan Card */}
      <Card className="border-indigo-100 bg-indigo-50/20">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm text-indigo-900 flex items-center gap-2">
            <Camera className="h-4 w-4 text-indigo-600" />
            Application Form Scan (PDF)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelection}
            className="hidden"
            id="nsc-camera-input"
          />
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelection}
            className="hidden"
            id="nsc-gallery-input"
          />

          {!applicationFormUrl && (
            <div className="grid grid-cols-2 gap-3">
              <label htmlFor="nsc-camera-input" className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 bg-white rounded-xl p-4 cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-300 transition group text-center">
                <Camera className="h-6 w-6 text-indigo-500 group-hover:text-indigo-600 mb-1.5 transition-colors" />
                <span className="text-xs font-semibold text-indigo-950">Open Camera</span>
                <span className="text-[9px] text-gray-400 mt-1">Take photo directly</span>
              </label>
              
              <label htmlFor="nsc-gallery-input" className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 bg-white rounded-xl p-4 cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-300 transition group text-center">
                <UploadCloud className="h-6 w-6 text-indigo-500 group-hover:text-indigo-600 mb-1.5 transition-colors" />
                <span className="text-xs font-semibold text-indigo-950">Upload Images</span>
                <span className="text-[9px] text-gray-400 mt-1">Choose from gallery</span>
              </label>
            </div>
          )}

          {pages.length > 0 && !applicationFormUrl && (
            <div className="space-y-3">
              {/* Pages editor list */}
              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                {pages.map((p, index) => (
                  <div key={index} className="flex items-center gap-3 bg-white border border-indigo-100 rounded-xl p-2 relative">
                    <div className="h-16 w-12 shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center relative border border-gray-200">
                      <img
                        src={p.src}
                        alt={`Page ${index + 1}`}
                        className="h-full w-full object-cover transition-transform"
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                      />
                      <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[8px] font-bold px-1 rounded">
                        P{index + 1}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700">Page {index + 1} of {pages.length}</p>
                      <p className="text-[9px] text-gray-400 font-mono">Rotation: {p.rotation}°</p>

                      <div className="flex gap-1.5 mt-1.5">
                        <Button
                          type="button" variant="outline" size="icon" className="h-6 w-6 rounded border-indigo-100 hover:bg-indigo-50"
                          onClick={() => rotatePage(index)}
                          title="Rotate 90°"
                        >
                          <RotateCw className="h-3 w-3 text-indigo-700" />
                        </Button>
                        <Button
                          type="button" variant="outline" size="icon" className="h-6 w-6 rounded border-indigo-100 hover:bg-indigo-50"
                          onClick={() => movePageUp(index)}
                          disabled={index === 0}
                          title="Move Up"
                        >
                          <ArrowUp className="h-3 w-3 text-indigo-700" />
                        </Button>
                        <Button
                          type="button" variant="outline" size="icon" className="h-6 w-6 rounded border-indigo-100 hover:bg-indigo-50"
                          onClick={() => movePageDown(index)}
                          disabled={index === pages.length - 1}
                          title="Move Down"
                        >
                          <ArrowDown className="h-3 w-3 text-indigo-700" />
                        </Button>
                        <Button
                          type="button" variant="outline" size="icon" className="h-6 w-6 rounded text-red-500 hover:text-red-700 hover:bg-red-50 border-red-100 hover:border-red-200"
                          onClick={() => deletePage(index)}
                          title="Delete Page"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Document scanner filters */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-indigo-900 uppercase tracking-wider font-bold">Document Scanner Filter</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "color", label: "Color" },
                    { value: "grayscale", label: "Grayscale" },
                    { value: "bw", label: "B&W Photocopy" },
                  ].map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value as any)}
                      className={`py-1.5 rounded-lg text-xs font-semibold border transition ${
                        filter === f.value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-indigo-900 border-indigo-200 hover:bg-indigo-50/50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-gray-400">
                  Grayscale and B&W filters clear up shadows and optimize PDF size for storage.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {pages.length > 0 && (
            <div>
              {applicationFormUrl ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-green-800 font-sans">Form Compiled Successfully</p>
                      <a href={applicationFormUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 underline font-mono">
                        View Uploaded PDF ↗
                      </a>
                    </div>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="h-8 text-red-500 border-red-200 hover:bg-red-50 text-[10px] font-semibold"
                    onClick={() => { setApplicationFormUrl(""); setPages([]) }}
                  >
                    Clear Form
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2"
                  onClick={compileAndUploadPdf}
                  disabled={uploadingPdf}
                >
                  {uploadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  {uploadingPdf ? "Generating & Compiling..." : `Compile & Upload ${pages.length} Page(s) as PDF`}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
        <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Creating..." : "Create Application"}
        </Button>
      </div>
    </div>
  )
}
