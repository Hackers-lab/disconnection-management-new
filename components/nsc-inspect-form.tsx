"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Camera, Upload, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react"
import { NSC_CLASSES } from "@/lib/nsc-types"
import type { NSCApplication } from "@/lib/nsc-types"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface Props {
  app: NSCApplication
  onSave: () => void
  onCancel: () => void
}

// ── Verify field (ok / corrected) ─────────────────────────────────────────────
function VerifyField({ label, original, value, onChange, options }: {
  label:    string
  original: string
  value:    string
  onChange: (v: string) => void
  options?: { value: string; label: string }[]
}) {
  const isOk  = value === "ok"
  const isCorr = value !== "ok" && value !== ""
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-white">
      <div className="flex justify-between items-start gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
        <span className="text-sm font-semibold text-gray-800 text-right">{original || "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange("ok")}
          className={`py-1.5 text-xs rounded-lg font-semibold flex items-center justify-center gap-1 transition ${isOk ? "bg-green-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
          <CheckCircle2 className="h-3 w-3" /> Correct
        </button>
        <button type="button" onClick={() => { if (!isCorr) onChange(original || " ") }}
          className={`py-1.5 text-xs rounded-lg font-semibold flex items-center justify-center gap-1 transition ${isCorr ? "bg-red-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
          <XCircle className="h-3 w-3" /> Correction
        </button>
      </div>
      {isCorr && (
        options ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="text-sm"><SelectValue placeholder={`Select corrected ${label.toLowerCase()}`} /></SelectTrigger>
            <SelectContent>
              {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input value={value} onChange={e => onChange(e.target.value)} placeholder={`Corrected ${label.toLowerCase()}`} className="text-sm" />
        )
      )}
    </div>
  )
}

// ── Yes / No toggle ───────────────────────────────────────────────────────────
function YesNo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500 uppercase tracking-wide">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        {["yes", "no"].map(v => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`py-2 text-sm rounded-lg font-medium border transition capitalize ${value === v ? (v === "yes" ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600") : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
            {v === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Image upload slot ─────────────────────────────────────────────────────────
function ImageSlot({ label, required, url, onUrl, tag }: {
  label:    string
  required: boolean
  url:      string
  onUrl:    (u: string) => void
  tag:      string
}) {
  const [preview, setPreview]     = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cameraOn, setCameraOn]   = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = s; setCameraOn(true)
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = s })
    } catch { alert("Camera unavailable.") }
  }
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }
  const capture = () => {
    const v = videoRef.current; if (!v) return
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext("2d")?.drawImage(v, 0, 0)
    c.toBlob(blob => { if (blob) { stopCamera(); upload(new File([blob], `${tag}.jpg`, { type: "image/jpeg" })) } }, "image/jpeg")
  }

  const upload = async (file: File) => {
    setPreview(URL.createObjectURL(file)); setUploading(true)
    try {
      const dateStr = new Date().toLocaleString("en-IN", { 
        day: "2-digit", 
        month: "2-digit", 
        year: "numeric", 
        hour: "2-digit", 
        minute: "2-digit", 
        hour12: true 
      })
      const compressed = await compressAndWatermarkImage(file, {
        maxDim: 800,
        watermarkLines: [`NSC: ${label} — ${tag}`, `Date: ${dateStr}`],
        targetKb: 95
      })
      const fd = new FormData(); fd.append("file", compressed); fd.append("consumerId", tag)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const d = await res.json()
      if (d.success) onUrl(d.url)
    } catch { alert("Upload failed.") }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-500 uppercase tracking-wide">{label} {required && "*"}</Label>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      {cameraOn ? (
        <div className="space-y-2 bg-black p-2 rounded-lg">
          <div className="relative w-full h-44 bg-black rounded overflow-hidden">
            <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 bg-white text-black" onClick={capture}>Capture</Button>
            <Button variant="destructive" onClick={stopCamera}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={startCamera}>
            <Camera className="h-4 w-4 mr-1" /> Camera
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Gallery
          </Button>
        </div>
      )}
      {preview && !cameraOn && (
        <div className="relative rounded-lg overflow-hidden border">
          <img src={preview} alt={label} className="w-full h-36 object-cover" />
          {uploading && (
            <div className="absolute top-1 right-1 bg-white/90 backdrop-blur-sm rounded-full p-1 shadow">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
            </div>
          )}
          {url && !uploading && <div className="absolute top-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">✓ Synced</div>}
          {!url && !uploading && preview && <div className="absolute top-1 right-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded font-medium">⚠ Not saved</div>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function NscInspectForm({ app, onSave, onCancel }: Props) {
  // Verification
  const [verifyName,    setVerifyName]    = useState(app.verifyName    || "ok")
  const [verifyCO,      setVerifyCO]      = useState(app.verifyCO      || "ok")
  const [verifyAddress, setVerifyAddress] = useState(app.verifyAddress || "ok")
  const [verifyClass,   setVerifyClass]   = useState(app.verifyClass   || "ok")
  // Site conditions
  const [existingMeter,    setExistingMeter]    = useState(app.existingMeter   || "no")
  const [existingMeterNo,  setExistingMeterNo]  = useState(app.existingMeterNo  || "")
  const [existingMeterImg, setExistingMeterImg] = useState(app.existingMeterImg || "")
  const [validPartition,   setValidPartition]   = useState(app.validPartition   || "yes")
  const [partitionImg,     setPartitionImg]     = useState(app.partitionImg     || "")
  const [dispute,          setDispute]          = useState(app.dispute          || "")
  // Technical
  const [load,           setLoad]           = useState(app.load           || "")
  const [serviceLength,  setServiceLength]  = useState(app.serviceLength  || "")
  const [poleRequired,   setPoleRequired]   = useState(app.poleRequired   || "no")
  const [poleDrawingImg, setPoleDrawingImg] = useState(app.poleDrawingImg || "")
  const [dtrCapacity,    setDtrCapacity]    = useState(app.dtrCapacity    || "")
  const [dtrLoad,        setDtrLoad]        = useState(app.dtrLoad        || "")
  // Evidence
  const [siteImg,           setSiteImg]           = useState(app.siteImg           || "")
  const [inspectionFormImg, setInspectionFormImg] = useState(app.inspectionFormImg || "")
  // Decision
  const [agencyDecision, setAgencyDecision] = useState<"accepted" | "rejected" | "">(
    (app.agencyDecision as any) || ""
  )
  const [agencyRemarks, setAgencyRemarks]   = useState(app.agencyRemarks || "")
  const [submitting, setSubmitting]         = useState(false)

  const handleSubmit = async () => {
    if (!verifyName || !verifyCO || !verifyAddress || !verifyClass) {
      alert("Please verify all applicant details (mark each as Correct or enter correction)."); return
    }
    if (!existingMeter)  { alert("Please answer: Existing meter?"); return }
    if (!validPartition) { alert("Please answer: Valid partition?"); return }
    if (!load.trim())    { alert("Applied load (kW) is required."); return }
    if (poleRequired === "yes" && !poleDrawingImg) { alert("Pole / Line Drawing is required for pole cases."); return }
    if (!dtrCapacity.trim()) { alert("DTR Capacity is required."); return }
    if (!siteImg)        { alert("Site image is required."); return }
    if (!inspectionFormImg) { alert("Inspection form image is required."); return }
    if (!agencyDecision) { alert("Please select Accepted or Rejected."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/nsc/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiveNo: app.receiveNo,
          verifyName, verifyCO, verifyAddress, verifyClass,
          existingMeter, existingMeterNo, existingMeterImg,
          validPartition, partitionImg, dispute,
          load, serviceLength, poleRequired, poleDrawingImg,
          dtrCapacity, dtrLoad, siteImg, inspectionFormImg,
          agencyDecision, agencyRemarks,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      window.dispatchEvent(new Event("notif-refresh"))
      onSave()
    } catch (e: any) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  const tag = app.receiveNo.replace(/\//g, "-")

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Site Inspection</h1>
          <p className="text-xs text-gray-500 font-mono">{app.receiveNo}</p>
        </div>
      </div>

      {/* Application summary */}
      <Card className="bg-slate-50">
        <CardContent className="p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Applicant</span><span className="font-semibold">{app.applicantName}</span></div>
          {app.careOf && <div className="flex justify-between"><span className="text-gray-500">C/O</span><span>{app.careOf}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="text-right max-w-[60%]">{app.address}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Mobile</span><a href={`tel:${app.mobile}`} className="text-blue-600 font-mono">{app.mobile}</a></div>
          <div className="flex justify-between"><span className="text-gray-500">Class / Phase</span><span>{app.appliedClass?.toUpperCase()} · {app.phase}</span></div>
        </CardContent>
      </Card>

      {/* 1. Verification */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">1. Verify Applicant Details</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <VerifyField label="Name"    original={app.applicantName} value={verifyName}    onChange={setVerifyName} />
          <VerifyField label="C/O"     original={app.careOf}        value={verifyCO}      onChange={setVerifyCO} />
          <VerifyField label="Address" original={app.address}       value={verifyAddress} onChange={setVerifyAddress} />
          <VerifyField label="Class"   original={app.appliedClass}  value={verifyClass}   onChange={setVerifyClass} options={NSC_CLASSES} />
        </CardContent>
      </Card>

      {/* 2. Site conditions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">2. Site Conditions</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <YesNo label="Existing Meter at Site?" value={existingMeter} onChange={setExistingMeter} />
          {existingMeter === "yes" && (
            <div className="space-y-2 pl-2 border-l-2 border-orange-200">
              <div className="space-y-1">
                <Label className="text-xs">Existing Meter No</Label>
                <Input value={existingMeterNo} onChange={e => setExistingMeterNo(e.target.value)} placeholder="Meter number" className="font-mono" />
              </div>
              <ImageSlot label="Existing Meter Photo" required={false} url={existingMeterImg} onUrl={setExistingMeterImg} tag={`${tag}-existing`} />
            </div>
          )}

          <YesNo label="Valid Partition / Separate Space?" value={validPartition} onChange={setValidPartition} />
          {validPartition === "no" && (
            <div className="pl-2 border-l-2 border-red-200">
              <ImageSlot label="Partition Issue Photo" required={false} url={partitionImg} onUrl={setPartitionImg} tag={`${tag}-partition`} />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-gray-500 uppercase tracking-wide">Any Other Dispute / Remarks</Label>
            <Textarea value={dispute} onChange={e => setDispute(e.target.value)} placeholder="Describe any issues or disputes at site..." rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* 3. Technical details */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">3. Technical Details</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Applied Load (kW) *</Label>
              <Input value={load} onChange={e => setLoad(e.target.value)} placeholder="e.g. 2.5" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Service Length (m)</Label>
              <Input value={serviceLength} onChange={e => setServiceLength(e.target.value)} placeholder="e.g. 25" inputMode="decimal" />
            </div>
          </div>

          <YesNo label="Pole Required?" value={poleRequired} onChange={setPoleRequired} />
          {poleRequired === "yes" && (
            <div className="pl-2 border-l-2 border-blue-200">
              <ImageSlot label="Pole / Line Drawing" required={true} url={poleDrawingImg} onUrl={setPoleDrawingImg} tag={`${tag}-pole`} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">DTR Capacity (KVA) *</Label>
              <Input value={dtrCapacity} onChange={e => setDtrCapacity(e.target.value)} placeholder="e.g. 100" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">DTR Present Load (KVA)</Label>
              <Input value={dtrLoad} onChange={e => setDtrLoad(e.target.value)} placeholder="e.g. 65" inputMode="decimal" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Evidence images */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">4. Evidence Photos</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <ImageSlot label="Site Photo" required url={siteImg} onUrl={setSiteImg} tag={`${tag}-site`} />
          <ImageSlot label="Inspection Form Photo" required url={inspectionFormImg} onUrl={setInspectionFormImg} tag={`${tag}-form`} />
        </CardContent>
      </Card>

      {/* 5. Agency decision */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">5. Inspection Decision</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setAgencyDecision("accepted")}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition ${agencyDecision === "accepted" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-600 hover:border-green-300"}`}>
              ✓ Accepted
            </button>
            <button type="button" onClick={() => setAgencyDecision("rejected")}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition ${agencyDecision === "rejected" ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600 hover:border-red-300"}`}>
              ✗ Rejected
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Remarks {agencyDecision === "rejected" && "*"}</Label>
            <Textarea value={agencyRemarks} onChange={e => setAgencyRemarks(e.target.value)} placeholder="Reason for acceptance / rejection..." rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button
          className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white"
          onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Submitting..." : agencyDecision === "rejected" ? "Submit as Rejected" : "Submit Inspection"}
        </Button>
      </div>
    </div>
  )
}
