"use client"

import { useState, useRef } from "react"
import type { IcdsRecord, CsrEquipmentChecklist } from "@/lib/icds-types"
import { generateIcdsServiceCertificatePDF } from "@/lib/icds-pdf"
import { compressAndWatermarkImage } from "@/lib/image-processor"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Zap,
  Gauge,
  Layers,
  Award,
  Download,
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  FileCheck,
  Building2,
  Phone,
  Check,
} from "lucide-react"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  onSuccess: (updated: IcdsRecord) => void
  username: string
}

export function IcdsExecutionModal({ record, open, onClose, onSuccess, username }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [uploadingMeterPhoto, setUploadingMeterPhoto] = useState(false)
  const [uploadingAfterPhoto, setUploadingAfterPhoto] = useState(false)
  const [uploadingCertPhoto, setUploadingCertPhoto] = useState(false)

  // 1. Meter Installation Details
  const [smartMeterNo, setSmartMeterNo] = useState("")
  const [meterInstallDate, setMeterInstallDate] = useState("")
  const [meterInitialReading, setMeterInitialReading] = useState("0")
  const [meterPhotoUrl, setMeterPhotoUrl] = useState("")

  // 2. CSR Electrical Package Checklist (EDD/49)
  const [mainSwitch, setMainSwitch] = useState(true)
  const [switchBoard, setSwitchBoard] = useState(true)
  const [wiring, setWiring] = useState(true)
  const [earthing, setEarthing] = useState(true)
  const [ledBulbsCount, setLedBulbsCount] = useState(3)
  const [fan80WCount, setFan80WCount] = useState(1)
  const [fanBrand, setFanBrand] = useState("CGL/Orient/Phillips")
  const [equipmentInstallDate, setEquipmentInstallDate] = useState("")

  // 3. Handover & Service Certification with AWW
  const [afterPhotoUrl, setAfterPhotoUrl] = useState("")
  const [certificatePhotoUrl, setCertificatePhotoUrl] = useState("")
  const [certificateSignatory, setCertificateSignatory] = useState("")
  const [certificateSignatoryDesignation, setCertificateSignatoryDesignation] = useState("Anganwadi Worker")
  const [certificateDate, setCertificateDate] = useState("")
  const [finalRemarks, setFinalRemarks] = useState("")

  const meterPhotoInputRef = useRef<HTMLInputElement>(null)
  const afterPhotoInputRef = useRef<HTMLInputElement>(null)
  const certPhotoInputRef = useRef<HTMLInputElement>(null)

  if (!record) return null

  const handleOpen = () => {
    const today = new Date().toISOString().slice(0, 10)
    const cl = record.equipmentChecklist

    setSmartMeterNo(record.smartMeterNo || record.meterIssuedNo || "")
    setMeterInstallDate(record.meterInstallDate || today)
    setMeterInitialReading(record.meterInitialReading || "0")
    setMeterPhotoUrl(record.meterPhotoUrl || "")

    setMainSwitch(cl?.mainSwitch16ADp ?? true)
    setSwitchBoard(cl?.switchBoard5S1R1P ?? true)
    setWiring(cl?.frlsWiringConduit ?? true)
    setEarthing(cl?.earthingArrangement ?? true)
    setLedBulbsCount(cl?.ledBulbsCount ?? 3)
    setFan80WCount(cl?.fan80WCount ?? 1)
    setFanBrand(cl?.fanBrand || "CGL/Orient/Phillips")
    setEquipmentInstallDate(record.equipmentInstallDate || today)

    setAfterPhotoUrl(record.afterPhotoUrl || "")
    setCertificatePhotoUrl(record.certificatePhotoUrl || "")
    setCertificateSignatory(record.certificateSignatory || record.awwName || "")
    setCertificateSignatoryDesignation(record.certificateSignatoryDesignation || "Anganwadi Worker")
    setCertificateDate(record.certificateDate || today)
    setFinalRemarks(record.finalRemarks || "")
  }

  const handleDownloadPDF = () => {
    try {
      const doc = generateIcdsServiceCertificatePDF(record)
      doc.save(`WBSEDCL_Service_Certificate_${record.awcCode || record.id}.pdf`)
      toast.success("Official WBSEDCL Service Certificate PDF downloaded!")
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message)
    }
  }

  const handlePhotoUpload = async (file: File, photoType: "meter" | "after" | "certificate") => {
    if (photoType === "meter") setUploadingMeterPhoto(true)
    if (photoType === "after") setUploadingAfterPhoto(true)
    if (photoType === "certificate") setUploadingCertPhoto(true)

    try {
      const label =
        photoType === "meter"
          ? "SMART METER INSTALLED"
          : photoType === "after"
          ? "AFTER COMPLETION WITH AWW"
          : "SIGNED SERVICE CERTIFICATE"
      const watermark = `${record.awcCode} | ${label} | ${new Date().toLocaleString("en-IN")}`
      const processed = await compressAndWatermarkImage(file, { watermarkLines: [watermark] })

      const form = new FormData()
      form.append("file", processed)
      form.append("moduleName", "icds-electrification")
      form.append("recordId", record.id)
      form.append("photoType", photoType)

      const res = await fetch("/api/upload-image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")

      if (photoType === "meter") setMeterPhotoUrl(data.url)
      if (photoType === "after") setAfterPhotoUrl(data.url)
      if (photoType === "certificate") setCertificatePhotoUrl(data.url)

      toast.success(`${label} compressed and uploaded successfully!`)
    } catch (e: any) {
      toast.error("Photo upload failed: " + e.message)
    } finally {
      if (photoType === "meter") setUploadingMeterPhoto(false)
      if (photoType === "after") setUploadingAfterPhoto(false)
      if (photoType === "certificate") setUploadingCertPhoto(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!smartMeterNo.trim()) {
      toast.error("Please enter or verify the Installed Smart Meter Serial Number")
      return
    }

    setSubmitting(true)
    try {
      const checklist: CsrEquipmentChecklist = {
        mainSwitch16ADp: mainSwitch,
        switchBoard5S1R1P: switchBoard,
        frlsWiringConduit: wiring,
        earthingArrangement: earthing,
        ledBulbsCount: Number(ledBulbsCount),
        fan80WCount: Number(fan80WCount),
        fanBrand: fanBrand.trim(),
        packageRateRs: 6611,
      }

      const patch: Partial<IcdsRecord> = {
        smartMeterNo: smartMeterNo.trim(),
        meterInstallDate: meterInstallDate || new Date().toISOString().slice(0, 10),
        meterInitialReading: meterInitialReading.trim() || "0",
        meterInstalledBy: username,
        meterPhotoUrl: meterPhotoUrl || undefined,

        equipmentPackageInstalled: true,
        equipmentChecklist: checklist,
        equipmentInstallDate: equipmentInstallDate || new Date().toISOString().slice(0, 10),
        equipmentAgency: record.assignedAgency,

        afterPhotoUrl: afterPhotoUrl || undefined,
        certificatePhotoUrl: certificatePhotoUrl || undefined,
        certificateSignatory: certificateSignatory.trim() || record.awwName || "Anganwadi Worker",
        certificateSignatoryDesignation: certificateSignatoryDesignation.trim() || "Anganwadi Worker",
        certificateDate: certificateDate || new Date().toISOString().slice(0, 10),
        finalRemarks: finalRemarks.trim() || undefined,

        stage: "COMPLETED",
      }

      const res = await fetch(`/api/icds/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit execution details")

      toast.success("Site Execution & Service Handover completed successfully!")
      onSuccess(data)
      onClose()
    } catch (e: any) {
      toast.error(e.message || "Failed to save execution details")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600" />
            Agency Work Execution & Handover Certification
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Install smart meter, complete standard CSR internal wiring package (WBSEDCL EDD/49), and upload handover photo & signed service slip with Anganwadi Worker.
          </DialogDescription>
        </DialogHeader>

        {/* Center Header */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-extrabold text-slate-900 text-sm">{record.awcName}</p>
            <p className="text-slate-500 font-mono text-[11px]">Code: {record.awcCode} • {record.blockName} • {record.gpName}</p>
            {record.awwMobile && (
              <a href={`tel:${record.awwMobile}`} className="text-blue-600 font-mono text-[11px] flex items-center gap-1 font-semibold mt-0.5">
                <Phone className="h-3 w-3" /> AWW: {record.awwName || "Worker"} ({record.awwMobile})
              </a>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Agency</span>
            <p className="font-bold text-slate-800">{record.assignedAgency || "Unassigned"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-1 text-xs">
          {/* 1. SMART METER INSTALLATION */}
          <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30 shadow-sm">
            <div className="flex items-center gap-2 border-b border-blue-200/60 pb-2">
              <Gauge className="h-4 w-4 text-blue-600" />
              <h3 className="font-bold text-blue-950 text-xs">1. Smart Meter Physical Installation</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Installed Smart Meter Serial *</Label>
                <Input
                  value={smartMeterNo}
                  onChange={(e) => setSmartMeterNo(e.target.value)}
                  placeholder="e.g. SM-108492"
                  className="h-8 text-xs font-mono bg-white rounded-lg"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Installation Date</Label>
                <Input
                  type="date"
                  value={meterInstallDate}
                  onChange={(e) => setMeterInstallDate(e.target.value)}
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Initial kWh Reading</Label>
                <Input
                  value={meterInitialReading}
                  onChange={(e) => setMeterInitialReading(e.target.value)}
                  placeholder="0.0"
                  className="h-8 text-xs font-mono bg-white rounded-lg"
                />
              </div>
            </div>

            {/* Meter Photo */}
            <div className="pt-2 border-t border-blue-200/60">
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[11px] font-semibold text-blue-950">Meter Board / Terminal Photo</Label>
                {uploadingMeterPhoto && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
              </div>
              {meterPhotoUrl ? (
                <div className="flex items-center gap-3">
                  <div className="h-14 w-20 rounded-lg border overflow-hidden bg-black/10">
                    <img src={meterPhotoUrl} alt="Meter" className="h-full w-full object-cover" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => meterPhotoInputRef.current?.click()}
                    className="text-xs h-7 rounded-lg"
                  >
                    Change Meter Photo
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => meterPhotoInputRef.current?.click()}
                  className="border-2 border-dashed border-blue-200 rounded-xl p-2.5 text-center cursor-pointer hover:border-blue-400 bg-white"
                >
                  <Camera className="h-4 w-4 mx-auto text-blue-500 mb-0.5" />
                  <p className="text-[11px] font-semibold text-blue-900">Upload / Capture Installed Smart Meter Photo</p>
                </div>
              )}
              <input
                type="file"
                ref={meterPhotoInputRef}
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], "meter")}
                className="hidden"
              />
            </div>
          </div>

          {/* 2. CSR INTERNAL WIRING PACKAGE (EDD/49) */}
          <div className="border border-purple-200 rounded-xl p-4 space-y-3 bg-purple-50/30 shadow-sm">
            <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" />
                <h3 className="font-bold text-purple-950 text-xs">2. Standard CSR Electrification Package (EDD/49 - ₹6,611)</h3>
              </div>
              <Badge className="bg-purple-100 text-purple-800 text-[10px] font-mono">EDD/49 Compliant</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer">
                <Checkbox checked={mainSwitch} onCheckedChange={(v) => setMainSwitch(Boolean(v))} />
                <span className="text-[11px] font-medium text-slate-800">16A-DP Main Switch (1 No.)</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer">
                <Checkbox checked={switchBoard} onCheckedChange={(v) => setSwitchBoard(Boolean(v))} />
                <span className="text-[11px] font-medium text-slate-800">Switchboard (5S + 1R + 1 Ind + 1P)</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer">
                <Checkbox checked={wiring} onCheckedChange={(v) => setWiring(Boolean(v))} />
                <span className="text-[11px] font-medium text-slate-800">FRLS Copper Wiring in 20mm PVC Conduit</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer">
                <Checkbox checked={earthing} onCheckedChange={(v) => setEarthing(Boolean(v))} />
                <span className="text-[11px] font-medium text-slate-800">Chemical Pipe Earthing + GI Wire</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">LED Bulbs Count</Label>
                <Input
                  type="number"
                  value={ledBulbsCount}
                  onChange={(e) => setLedBulbsCount(Number(e.target.value))}
                  min={0}
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">80W Ceiling Fan Count</Label>
                <Input
                  type="number"
                  value={fan80WCount}
                  onChange={(e) => setFan80WCount(Number(e.target.value))}
                  min={0}
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Fan Brand / Warranty</Label>
                <Input
                  value={fanBrand}
                  onChange={(e) => setFanBrand(e.target.value)}
                  placeholder="e.g. CGL / Orient (2 Yr)"
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* 3. HANDOVER CERTIFICATION & AWW AFTER PHOTO */}
          <div className="border border-emerald-200 rounded-xl p-4 space-y-3 bg-emerald-50/30 shadow-sm">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-600" />
                <h3 className="font-bold text-emerald-950 text-xs">3. Handover & Service Certification (Page 4)</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                className="h-7 text-[11px] px-2 rounded-lg text-emerald-700 bg-white border-emerald-300 hover:bg-emerald-50 font-bold"
              >
                <Download className="h-3 w-3 mr-1" />
                Download Blank PDF Slip
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* After Photo with Worker */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-emerald-950">"After" Photo with Anganwadi Worker *</Label>
                  {uploadingAfterPhoto && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
                </div>
                {afterPhotoUrl ? (
                  <div className="flex items-center gap-2.5">
                    <div className="h-14 w-20 rounded-lg border overflow-hidden bg-black/10">
                      <img src={afterPhotoUrl} alt="After" className="h-full w-full object-cover" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => afterPhotoInputRef.current?.click()}
                      className="text-xs h-7 rounded-lg"
                    >
                      Change Photo
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => afterPhotoInputRef.current?.click()}
                    className="border-2 border-dashed border-emerald-300 rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500 bg-white"
                  >
                    <Camera className="h-4 w-4 mx-auto text-emerald-600 mb-0.5" />
                    <p className="text-[11px] font-semibold text-emerald-900">Upload Site Photo with Worker</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={afterPhotoInputRef}
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], "after")}
                  className="hidden"
                />
              </div>

              {/* Scanned Signed Service Slip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-emerald-950">Signed Service Certificate Slip *</Label>
                  {uploadingCertPhoto && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
                </div>
                {certificatePhotoUrl ? (
                  <div className="flex items-center gap-2.5">
                    <div className="h-14 w-20 rounded-lg border overflow-hidden bg-black/10">
                      <img src={certificatePhotoUrl} alt="Certificate" className="h-full w-full object-cover" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => certPhotoInputRef.current?.click()}
                      className="text-xs h-7 rounded-lg"
                    >
                      Change Slip
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => certPhotoInputRef.current?.click()}
                    className="border-2 border-dashed border-emerald-300 rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500 bg-white"
                  >
                    <Upload className="h-4 w-4 mx-auto text-emerald-600 mb-0.5" />
                    <p className="text-[11px] font-semibold text-emerald-900">Upload Signed Page 4 Slip</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={certPhotoInputRef}
                  accept="image/*,.pdf"
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], "certificate")}
                  className="hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-emerald-200/60">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Signatory (AWW Worker Name)</Label>
                <Input
                  value={certificateSignatory}
                  onChange={(e) => setCertificateSignatory(e.target.value)}
                  placeholder="Worker Full Name"
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Designation</Label>
                <Input
                  value={certificateSignatoryDesignation}
                  onChange={(e) => setCertificateSignatoryDesignation(e.target.value)}
                  placeholder="Anganwadi Worker / In-Charge"
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Handover Date</Label>
                <Input
                  type="date"
                  value={certificateDate}
                  onChange={(e) => setCertificateDate(e.target.value)}
                  className="h-8 text-xs bg-white rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <Label className="text-[11px] font-semibold">Commissioning Remarks</Label>
              <Textarea
                value={finalRemarks}
                onChange={(e) => setFinalRemarks(e.target.value)}
                placeholder="Smart meter & CSR internal wiring commissioned successfully, tested fan & bulbs in presence of AWW..."
                className="h-14 text-xs bg-white rounded-lg"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || uploadingMeterPhoto || uploadingAfterPhoto || uploadingCertPhoto}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm"
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
