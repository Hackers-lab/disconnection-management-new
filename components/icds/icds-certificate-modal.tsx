"use client"

import { useState, useRef } from "react"
import type { IcdsRecord, IcdsCertificateInput } from "@/lib/icds-types"
import { generateIcdsServiceCertificatePDF } from "@/lib/icds-pdf"
import { compressAndWatermarkImage } from "@/lib/image-processor"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  Award,
  Download,
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  FileCheck2,
  Building2,
  FileText,
  AlertCircle,
} from "lucide-react"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  onSuccess: (updated: IcdsRecord) => void
  username: string
}

export function IcdsCertificateModal({ record, open, onClose, onSuccess, username }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [uploadingAfter, setUploadingAfter] = useState(false)
  const [uploadingCert, setUploadingCert] = useState(false)

  const [afterPhotoUrl, setAfterPhotoUrl] = useState("")
  const [certificatePhotoUrl, setCertificatePhotoUrl] = useState("")
  const [certificateSignatory, setCertificateSignatory] = useState("")
  const [certificateSignatoryDesignation, setCertificateSignatoryDesignation] = useState("Anganwadi Worker")
  const [certificateDate, setCertificateDate] = useState(new Date().toISOString().slice(0, 10))
  const [finalRemarks, setFinalRemarks] = useState("")

  const afterInputRef = useRef<HTMLInputElement>(null)
  const certInputRef = useRef<HTMLInputElement>(null)

  if (!record) return null

  // Initialize fields
  const handleOpen = () => {
    setAfterPhotoUrl(record.afterPhotoUrl || "")
    setCertificatePhotoUrl(record.certificatePhotoUrl || "")
    setCertificateSignatory(record.certificateSignatory || record.awwName || "")
    setCertificateSignatoryDesignation(record.certificateSignatoryDesignation || "Anganwadi Worker")
    setCertificateDate(record.certificateDate || new Date().toISOString().slice(0, 10))
    setFinalRemarks(record.finalRemarks || "")
  }

  const handleDownloadPDF = () => {
    try {
      const doc = generateIcdsServiceCertificatePDF(record)
      doc.save(`WBSEDCL_Service_Certificate_${record.awcCode || record.id}.pdf`)
      toast.success("Official WBSEDCL Service Certificate PDF generated!")
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message)
    }
  }

  const handlePhotoUpload = async (file: File, type: "after" | "cert") => {
    const isAfter = type === "after"
    if (isAfter) setUploadingAfter(true)
    else setUploadingCert(true)

    try {
      const watermark = `${record.awcCode} | ${isAfter ? "COMPLETION AFTER" : "SERVICE CERTIFICATE"} | ${new Date().toLocaleString("en-IN")}`
      const processed = await compressAndWatermarkImage(file, { watermarkLines: [watermark] })

      const form = new FormData()
      form.append("file", processed)
      form.append("moduleName", "icds-electrification")
      form.append("recordId", record.id)
      form.append("photoType", isAfter ? "after" : "certificate")

      const res = await fetch("/api/upload-image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Image upload failed")

      if (isAfter) {
        setAfterPhotoUrl(data.url)
        toast.success("After Photo uploaded and compressed!")
      } else {
        setCertificatePhotoUrl(data.url)
        toast.success("Signed Certificate Photo uploaded!")
      }
    } catch (e: any) {
      toast.error("Upload error: " + e.message)
    } finally {
      if (isAfter) setUploadingAfter(false)
      else setUploadingCert(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!certificatePhotoUrl && !record.certificatePhotoUrl) {
      toast.error("Please upload the signed Service Certificate photo to complete the project.")
      return
    }

    setSubmitting(true)
    try {
      const payload: IcdsCertificateInput = {
        afterPhotoUrl: afterPhotoUrl || record.afterPhotoUrl || "",
        certificatePhotoUrl: certificatePhotoUrl || record.certificatePhotoUrl || "",
        certificateSignatory: certificateSignatory.trim() || record.awwName,
        certificateSignatoryDesignation: certificateSignatoryDesignation.trim(),
        certificateDate,
        finalRemarks: finalRemarks.trim() || undefined,
      }

      const res = await fetch(`/api/icds/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "certify", ...payload }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to finalize certificate")

      toast.success("Center Electrification Certified & Completed successfully!")
      onSuccess(data.record)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to update certificate")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-emerald-600" />
              Stage 4: Handover & Service Certification (WBSEDCL EDD/49)
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDownloadPDF}
              className="text-xs bg-emerald-50 text-emerald-800 font-bold border-emerald-300 hover:bg-emerald-100 rounded-xl"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Download Page 4 PDF Slip
            </Button>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Compare Before and After electrification photos, upload signed certification slip, and complete electrification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* Center Summary Header */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-extrabold text-slate-900 text-sm">{record.awcName}</p>
              <p className="text-slate-500 font-mono text-[11px]">Code: {record.awcCode} • {record.blockName} • {record.gpName}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Smart Meter</span>
              <p className="font-mono font-bold text-emerald-700">{record.smartMeterNo || "Installed"}</p>
            </div>
          </div>

          {/* Photo Comparison Section: Before vs After */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-800">Visual Handover Audit (Before vs After)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Before Photo (from Stage 1) */}
              <div className="border rounded-lg p-2.5 bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">1. Before Photo (Raw Site)</span>
                  <span className="text-[10px] text-slate-400">Stage 1 Inspection</span>
                </div>
                {record.beforePhotoUrl ? (
                  <div className="h-32 rounded border overflow-hidden bg-black/5">
                    <img src={record.beforePhotoUrl} alt="Before" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-32 border border-dashed rounded flex items-center justify-center text-slate-400 text-[11px]">
                    No Before Photo Captured
                  </div>
                )}
              </div>

              {/* After Photo (Illuminated room with fan/lights) */}
              <div className="border rounded-lg p-2.5 bg-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">2. After Photo (Illuminated)</span>
                  {uploadingAfter && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                </div>
                {afterPhotoUrl || record.afterPhotoUrl ? (
                  <div className="h-32 rounded border overflow-hidden relative group">
                    <img src={afterPhotoUrl || record.afterPhotoUrl} alt="After" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => afterInputRef.current?.click()}
                      className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-semibold"
                    >
                      Change Photo
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => afterInputRef.current?.click()}
                    className="h-32 border-2 border-dashed rounded flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:border-slate-400 bg-slate-50"
                  >
                    <Camera className="h-6 w-6 text-slate-400 mb-1" />
                    <span className="font-semibold text-[11px]">Upload After Photo</span>
                    <span className="text-[10px] text-slate-400">Illuminated center with fan & bulbs</span>
                  </div>
                )}
                <input
                  type="file"
                  ref={afterInputRef}
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], "after")}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Signed Service Certificate Photo Upload (Required) */}
          <div className="border rounded-lg p-3 bg-emerald-50/50 border-emerald-200 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <FileCheck2 className="h-4 w-4 text-emerald-600" />
                Signed Service Certificate Photo (Page 4 Template) *
              </Label>
              {uploadingCert && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
            </div>
            <p className="text-[11px] text-emerald-800">
              Download the pre-filled PDF slip, get it signed by the Anganwadi Worker / CDPO representative, and upload the signed snapshot here.
            </p>

            {certificatePhotoUrl || record.certificatePhotoUrl ? (
              <div className="h-36 rounded border overflow-hidden relative group max-w-sm mx-auto">
                <img src={certificatePhotoUrl || record.certificatePhotoUrl} alt="Signed Certificate" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => certInputRef.current?.click()}
                  className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-semibold"
                >
                  Change Certificate Photo
                </button>
              </div>
            ) : (
              <div
                onClick={() => certInputRef.current?.click()}
                className="h-28 border-2 border-dashed border-emerald-300 rounded-lg flex flex-col items-center justify-center text-emerald-700 cursor-pointer hover:border-emerald-400 bg-white"
              >
                <Upload className="h-6 w-6 text-emerald-500 mb-1" />
                <span className="font-semibold text-xs">Click to Upload Signed Certificate Photo</span>
                <span className="text-[10px] text-emerald-600">Auto-compressed & watermarked</span>
              </div>
            )}
            <input
              type="file"
              ref={certInputRef}
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], "cert")}
              className="hidden"
            />
          </div>

          {/* Certificate Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Signatory Representative</Label>
              <Input
                value={certificateSignatory}
                onChange={(e) => setCertificateSignatory(e.target.value)}
                placeholder="e.g. Smt. Sunita Mandal"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Signatory Designation</Label>
              <Input
                value={certificateSignatoryDesignation}
                onChange={(e) => setCertificateSignatoryDesignation(e.target.value)}
                placeholder="Anganwadi Worker / CDPO"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Certification Date</Label>
              <Input
                type="date"
                value={certificateDate}
                onChange={(e) => setCertificateDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">Handover / Commissioning Remarks</Label>
            <Textarea
              value={finalRemarks}
              onChange={(e) => setFinalRemarks(e.target.value)}
              placeholder="All 3 LED bulbs, 80W ceiling fan, and smart meter energized and tested functional..."
              className="h-16 text-xs"
            />
          </div>

          <DialogFooter className="gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || uploadingAfter || uploadingCert}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Complete & Certify Electrification
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
