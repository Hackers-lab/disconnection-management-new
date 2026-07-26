"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Camera, Upload, Loader2, MapPin, Phone, Home } from "lucide-react"
import type { MeterIssue } from "@/lib/meter-types"
import { getFromCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import { compressAndWatermarkImage } from "@/lib/image-processor"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "Faulty/Defective Replacement",
  burnt_replacement:  "Burnt Meter Replacement",
  slow_fast:          "Slow/Fast Meter",
  nsc:                "New Service Connection",
}

interface Props {
  issue: MeterIssue
  onSave: () => void
  onCancel: () => void
}

export function MeterCompleteForm({ issue, onSave, onCancel }: Props) {
  const isNSC         = issue.purpose === "nsc"
  const isReplacement = !isNSC

  const [consumer, setConsumer] = useState<{ address: string; mobile: string; device: string } | null>(null)

  useEffect(() => {
    if (!issue.consumerId) return
    getFromCache<ConsumerData[]>("consumers_data_cache").then(cache => {
      const match = cache?.find(c => c.consumerId === issue.consumerId)
      if (match) setConsumer({ address: match.address || "", mobile: match.mobileNumber || "", device: match.device || "" })
    })
  }, [issue.consumerId])

  const is3Phase = (issue.meterType || "").includes("3P") || (issue.meterType || "").includes("3-Phase")
  const isSlowFast = issue.purpose === "slow_fast"

  const [installationDate, setInstallationDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [beforeImageUrl, setBeforeImageUrl] = useState("")
  const [afterImageUrl, setAfterImageUrl]   = useState("")
  const [beforePreview, setBeforePreview]   = useState<string | null>(null)
  const [afterPreview, setAfterPreview]     = useState<string | null>(null)
  const [lastReading, setLastReading]       = useState("")
  const [newReading, setNewReading]         = useState("")

  // 3-Phase TOD readings (N, P, O, CU)
  const [lastN, setLastN]   = useState("")
  const [lastP, setLastP]   = useState("")
  const [lastO, setLastO]   = useState("")
  const [lastCU, setLastCU] = useState("")

  const [newN, setNewN]     = useState("")
  const [newP, setNewP]     = useState("")
  const [newO, setNewO]     = useState("")
  const [newCU, setNewCU]   = useState("")

  // Check meter fields
  const [crossCheckDate1, setCrossCheckDate1] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7) // default 7 days from now
    return d.toISOString().slice(0, 10)
  })

  // Auto-calculate CU = N + P + O for Last Reading if numbers
  const handleLastTODChange = (field: "n" | "p" | "o" | "cu", val: string) => {
    let n = field === "n" ? val : lastN
    let p = field === "p" ? val : lastP
    let o = field === "o" ? val : lastO
    if (field === "n") setLastN(val)
    if (field === "p") setLastP(val)
    if (field === "o") setLastO(val)
    if (field === "cu") { setLastCU(val); return }

    const numN = parseFloat(n)
    const numP = parseFloat(p)
    const numO = parseFloat(o)
    if (!isNaN(numN) || !isNaN(numP) || !isNaN(numO)) {
      const sum = (isNaN(numN) ? 0 : numN) + (isNaN(numP) ? 0 : numP) + (isNaN(numO) ? 0 : numO)
      setLastCU(String(Math.round(sum * 100) / 100))
    }
  }

  // Auto-calculate CU = N + P + O for New Reading if numbers
  const handleNewTODChange = (field: "n" | "p" | "o" | "cu", val: string) => {
    let n = field === "n" ? val : newN
    let p = field === "p" ? val : newP
    let o = field === "o" ? val : newO
    if (field === "n") setNewN(val)
    if (field === "p") setNewP(val)
    if (field === "o") setNewO(val)
    if (field === "cu") { setNewCU(val); return }

    const numN = parseFloat(n)
    const numP = parseFloat(p)
    const numO = parseFloat(o)
    if (!isNaN(numN) || !isNaN(numP) || !isNaN(numO)) {
      const sum = (isNaN(numN) ? 0 : numN) + (isNaN(numP) ? 0 : numP) + (isNaN(numO) ? 0 : numO)
      setNewCU(String(Math.round(sum * 100) / 100))
    }
  }

  const [remarks, setRemarks]               = useState("")
  const [uploading, setUploading]           = useState<"before" | "after" | null>(null)
  const [submitting, setSubmitting]         = useState(false)
  const [cameraFor, setCameraFor]           = useState<"before" | "after" | null>(null)

  const beforeRef = useRef<HTMLInputElement>(null)
  const afterRef  = useRef<HTMLInputElement>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCamera = async (slot: "before" | "after") => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = s; setCameraFor(slot)
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = s })
    } catch { alert("Camera unavailable.") }
  }
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraFor(null)
  }
  const capturePhoto = (slot: "before" | "after") => {
    const v = videoRef.current; if (!v) return
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext("2d")?.drawImage(v, 0, 0)
    c.toBlob(blob => { if (blob) { stopCamera(); uploadImage(new File([blob], `${slot}.jpg`, { type: "image/jpeg" }), slot) } }, "image/jpeg")
  }

  // ── Image compression ─────────────────────────────────────────────────────
  const compressImage = async (file: File, slot: "before" | "after"): Promise<File> => {
    const dateStr = new Date().toLocaleString("en-IN")
    const titleStr = `${slot === "before" ? "Before" : "After"} Installation — ${issue.issueId}`
    return compressAndWatermarkImage(file, {
      maxDim: 800,
      watermarkLines: [titleStr, `Date: ${dateStr}`],
      targetKb: 95
    })
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadImage = async (file: File, slot: "before" | "after") => {
    const setPreview = slot === "before" ? setBeforePreview : setAfterPreview
    const setUrl     = slot === "before" ? setBeforeImageUrl : setAfterImageUrl
    setPreview(URL.createObjectURL(file)); setUploading(slot)
    try {
      const compressed = await compressImage(file, slot)
      const fd = new FormData()
      fd.append("file", compressed); fd.append("consumerId", issue.consumerId || issue.nscReceiveNo)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setUrl(data.url)
    } catch { alert("Upload failed.") }
    finally { setUploading(null) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!afterImageUrl) { alert("After-installation image is required."); return }
    if (isReplacement && !beforeImageUrl) { alert("Before image is required for replacements."); return }

    let finalLastReading = lastReading.trim()
    let finalNewReading  = newReading.trim()

    if (is3Phase) {
      if (isReplacement && (!lastCU.trim() && !lastN.trim())) {
        alert("3-Phase Old Meter Readings (N, P, O, CU) are required."); return
      }
      if (!newCU.trim() && !newN.trim()) {
        alert("3-Phase New Meter Initial Readings (N, P, O, CU) are required."); return
      }
      finalLastReading = `N:${lastN.trim()} | P:${lastP.trim()} | O:${lastO.trim()} | CU:${lastCU.trim()}`
      finalNewReading  = `N:${newN.trim()} | P:${newP.trim()} | O:${newO.trim()} | CU:${newCU.trim()}`
    } else {
      if (isReplacement && !finalLastReading) { alert("Last meter reading is required."); return }
      if (!finalNewReading) { alert("New meter initial reading is required."); return }
    }

    if (!installationDate) { alert("Installation date is required."); return }

    let formattedInstDate = ""
    if (installationDate) {
      const parts = installationDate.split("-")
      if (parts.length === 3) {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, "0")
        const min = String(now.getMinutes()).padStart(2, "0")
        formattedInstDate = `${parts[2]}/${parts[1]}/${parts[0]} ${hh}:${min}`
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId:          issue.issueId,
          afterImage:       afterImageUrl,
          beforeImage:      beforeImageUrl,
          lastReading:      finalLastReading,
          newReading:       finalNewReading,
          installationDate: formattedInstDate,
          remarks:          remarks.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")

      // If slow_fast check meter, save crossCheckDate1
      if (isSlowFast && crossCheckDate1) {
        await fetch("/api/meters/check-meter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cross_check",
            issueId: issue.issueId,
            checkNum: 1,
            crossCheckDate: crossCheckDate1,
            existingMeterReading: finalLastReading,
            checkMeterReading: finalNewReading,
          })
        })
      }

      window.dispatchEvent(new Event("notif-refresh"))
      onSave()
    } catch (e: any) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  // ── Image slot UI ─────────────────────────────────────────────────────────
  const ImageSlot = ({ slot, label, required }: { slot: "before" | "after"; label: string; required: boolean }) => {
    const preview = slot === "before" ? beforePreview : afterPreview
    const url     = slot === "before" ? beforeImageUrl : afterImageUrl
    const ref     = slot === "before" ? beforeRef : afterRef
    const isUp    = uploading === slot
    return (
      <div className="space-y-2">
        <Label className="text-xs font-bold text-gray-500 uppercase">{label} {required && "*"}</Label>
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], slot)} />
        {cameraFor === slot ? (
          <div className="space-y-2 bg-black p-2 rounded-lg">
            <div className="relative w-full h-44 bg-black rounded overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-white text-black" onClick={() => capturePhoto(slot)}>Capture</Button>
              <Button variant="destructive" onClick={stopCamera}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-10" onClick={() => startCamera(slot)} disabled={isUp}>
              <Camera className="h-4 w-4 mr-2" /> Camera
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={() => ref.current?.click()} disabled={isUp}>
              <Upload className="h-4 w-4 mr-2" /> Gallery
            </Button>
          </div>
        )}
        {preview && !cameraFor && (
          <div className="relative rounded-lg overflow-hidden border">
            <img src={preview} alt={label} className={`w-full h-36 object-cover ${isUp ? "opacity-50" : ""}`} />
            {isUp && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Complete Installation</h1>
          <p className="text-sm text-gray-500">{issue.issueId} — {PURPOSE_LABELS[issue.purpose]}</p>
        </div>
      </div>

      {/* Issue details */}
      <Card className="bg-slate-50">
        <CardContent className="p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Consumer / NSC</span>
            <span className="font-mono font-semibold">{issue.consumerId || issue.nscReceiveNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Name</span>
            <span className="font-medium">{issue.consumerName || "—"}</span>
          </div>
          {consumer?.address && (
            <div className="flex items-start gap-2">
              <Home className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span className="text-gray-700 text-xs">{consumer.address}</span>
            </div>
          )}
          {consumer?.mobile && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <a href={`tel:${consumer.mobile}`} className="text-blue-600 text-xs font-mono">{consumer.mobile}</a>
            </div>
          )}
          {consumer?.device && isReplacement && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">Old Device</span>
              <span className="font-mono text-xs text-orange-700">{consumer.device}</span>
            </div>
          )}
          <div className="border-t pt-1.5 mt-1 flex justify-between">
            <span className="text-gray-500">Meter Serial</span>
            <span className="font-mono font-semibold text-blue-700">{issue.serialNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Type</span>
            <span>{issue.meterType}</span>
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Evidence Images</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {isReplacement && <ImageSlot slot="before" label="Before (Old Meter)" required={true} />}
          <ImageSlot slot="after" label="After (New Meter Installed)" required={true} />
        </CardContent>
      </Card>

      {/* Readings */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Installation Date & Meter Readings</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="installation-date">Installation Date *</Label>
            <Input
              id="installation-date"
              type="date"
              value={installationDate}
              onChange={e => setInstallationDate(e.target.value)}
              required
            />
          </div>

          {isSlowFast && (
            <div className="space-y-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <Label className="text-amber-900 font-semibold">Scheduled 1st Cross-Check Date *</Label>
              <Input
                type="date"
                value={crossCheckDate1}
                onChange={e => setCrossCheckDate1(e.target.value)}
                className="bg-white"
              />
              <p className="text-xs text-amber-700">Set the expected date to perform the 1st reading cross-check.</p>
            </div>
          )}

          {is3Phase ? (
            <div className="space-y-4">
              {isReplacement && (
                <div className="space-y-2 border p-3 rounded-lg bg-slate-50">
                  <Label className="font-bold text-xs uppercase text-slate-700">3-Phase Old Meter Readings (N, P, O, CU) *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-gray-500">N (Normal)</Label>
                      <Input value={lastN} onChange={e => handleLastTODChange("n", e.target.value)} placeholder="Normal" className="font-mono text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500">P (Peak)</Label>
                      <Input value={lastP} onChange={e => handleLastTODChange("p", e.target.value)} placeholder="Peak" className="font-mono text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500">O (Off-Peak)</Label>
                      <Input value={lastO} onChange={e => handleLastTODChange("o", e.target.value)} placeholder="Off-Peak" className="font-mono text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500 font-bold">CU (Cumulative Total)</Label>
                      <Input value={lastCU} onChange={e => handleLastTODChange("cu", e.target.value)} placeholder="Cumulative" className="font-mono text-xs font-bold bg-white" />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 border p-3 rounded-lg bg-blue-50/40 border-blue-200">
                <Label className="font-bold text-xs uppercase text-blue-900">3-Phase New Meter Initial Readings (N, P, O, CU) *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-gray-500">N (Normal)</Label>
                    <Input value={newN} onChange={e => handleNewTODChange("n", e.target.value)} placeholder="Normal" className="font-mono text-xs bg-white" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-500">P (Peak)</Label>
                    <Input value={newP} onChange={e => handleNewTODChange("p", e.target.value)} placeholder="Peak" className="font-mono text-xs bg-white" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-500">O (Off-Peak)</Label>
                    <Input value={newO} onChange={e => handleNewTODChange("o", e.target.value)} placeholder="Off-Peak" className="font-mono text-xs bg-white" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-500 font-bold">CU (Cumulative Total)</Label>
                    <Input value={newCU} onChange={e => handleNewTODChange("cu", e.target.value)} placeholder="Cumulative" className="font-mono text-xs font-bold bg-white" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isReplacement && (
                <div className="space-y-2">
                  <Label>Last Reading (Old Meter) *</Label>
                  <Input value={lastReading} onChange={e => setLastReading(e.target.value)} placeholder="Reading at removal" />
                </div>
              )}
              <div className="space-y-2">
                <Label>New Meter Initial Reading *</Label>
                <Input value={newReading} onChange={e => setNewReading(e.target.value)} placeholder="Reading at installation" />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white" onClick={handleSubmit} disabled={submitting || !!uploading}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Saving..." : "Mark Installation Done"}
        </Button>
      </div>
    </div>
  )
}
