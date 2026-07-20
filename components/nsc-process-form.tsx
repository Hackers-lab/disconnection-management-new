"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, CheckCircle2, XCircle, RotateCcw, FileText, ClipboardList } from "lucide-react"
import { NSC_STATUS_COLORS, NSC_STATUS_LABELS } from "@/lib/nsc-types"
import type { NSCApplication } from "@/lib/nsc-types"
import { getFromCache } from "@/lib/indexed-db"

interface Props {
  app:        NSCApplication
  agencies:   string[]
  onSave:     () => void
  onCancel:   () => void
}

export function NscProcessForm({ app, agencies, onSave, onCancel }: Props) {
  const [adminDecision, setAdminDecision] = useState<"accepted" | "rejected" | "">(
    (app.adminDecision as any) || app.agencyDecision as any || ""
  )
  const [adminRemarks,        setAdminRemarks]        = useState(app.adminRemarks        || "")
  const [finalAction,         setFinalAction]         = useState<"quotation" | "dispute_letter" | "reassign" | "">("")
  const [memoNo,              setMemoNo]              = useState(app.memoNo              || "")
  const [applicationNo,       setApplicationNo]       = useState(app.applicationNo       || "")
  const [newAgency,           setNewAgency]           = useState(app.agency              || "")
  const [existingConsumerId,  setExistingConsumerId]  = useState(app.existingConsumerId  || "")
  const [submitting,    setSubmitting]    = useState(false)
  const [agencyList,    setAgencyList]    = useState<string[]>(agencies)

  useEffect(() => {
    async function loadAgencies() {
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
    loadAgencies()
  }, [])

  const isDecisionChanged = adminDecision !== app.agencyDecision

  const handleSubmit = async () => {
    if (!finalAction) { alert("Select an action to proceed."); return }
    if (!adminDecision && finalAction !== "reassign") { alert("Select Accept or Reject."); return }
    if (isDecisionChanged && !adminRemarks.trim()) { alert("Remarks required when overriding agency decision."); return }
    if (finalAction === "quotation"      && applicationNo.trim().length !== 10) { alert("Application No must be exactly 10 digits."); return }
    if (finalAction === "dispute_letter" && !memoNo.trim()) { alert("Memo No is required."); return }
    if (finalAction === "reassign"       && !newAgency)     { alert("Select agency to reassign."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/nsc/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiveNo:          app.receiveNo,
          adminDecision:      finalAction !== "reassign" ? adminDecision : "",
          adminRemarks:       adminRemarks.trim(),
          finalAction,
          memoNo:             memoNo.trim(),
          applicationNo:      applicationNo.trim(),
          newAgency:          finalAction === "reassign" ? newAgency : "",
          existingConsumerId: existingConsumerId.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      onSave()
    } catch (e: any) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  const InspDetail = ({ label, value, corrected }: { label: string; value: string; corrected?: boolean }) => (
    <div className="flex items-center justify-between py-1 border-b last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-medium ${corrected ? "text-orange-600" : "text-gray-800"}`}>
        {corrected && "⚠ "}{value || "—"}
      </span>
    </div>
  )

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Process Application</h1>
          <p className="text-xs font-mono text-gray-500">{app.receiveNo}</p>
        </div>
        <Badge className={`ml-auto ${NSC_STATUS_COLORS[app.status] || ""}`}>{NSC_STATUS_LABELS[app.status] || app.status}</Badge>
      </div>

      {/* Application details */}
      <Card className="bg-slate-50">
        <CardContent className="p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Applicant</span><span className="font-semibold">{app.applicantName}</span></div>
          {app.careOf  && <div className="flex justify-between"><span className="text-gray-500">C/O</span><span>{app.careOf}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="text-right max-w-[60%] text-xs">{app.address}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Mobile</span><a href={`tel:${app.mobile}`} className="text-blue-600 font-mono text-xs">{app.mobile}</a></div>
          <div className="flex justify-between"><span className="text-gray-500">Class / Phase</span><span>{app.appliedClass?.toUpperCase()} · {app.phase}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Agency</span><span className="font-medium">{app.agency}</span></div>
        </CardContent>
      </Card>

      {/* Inspection summary */}
      {app.status !== "pending" && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Inspection Report</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {/* Agency decision badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Agency Decision</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${app.agencyDecision === "accepted" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {app.agencyDecision === "accepted" ? "✓ Accepted" : "✗ Rejected"}
              </span>
            </div>
            {app.agencyRemarks && <p className="text-xs text-gray-600 italic">"{app.agencyRemarks}"</p>}
            <p className="text-xs text-gray-400">Inspected: {app.inspectedAt} by {app.inspectedBy}</p>

            {/* Verified details */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-0">
              <InspDetail label="Name"    value={app.verifyName    === "ok" ? app.applicantName : app.verifyName}    corrected={app.verifyName    !== "ok" && !!app.verifyName} />
              <InspDetail label="C/O"     value={app.verifyCO      === "ok" ? app.careOf        : app.verifyCO}      corrected={app.verifyCO      !== "ok" && !!app.verifyCO} />
              <InspDetail label="Address" value={app.verifyAddress === "ok" ? app.address       : app.verifyAddress} corrected={app.verifyAddress !== "ok" && !!app.verifyAddress} />
              <InspDetail label="Class"   value={app.verifyClass   === "ok" ? app.appliedClass  : app.verifyClass}   corrected={app.verifyClass   !== "ok" && !!app.verifyClass} />
            </div>

            {/* Technical */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded p-2"><p className="text-gray-400">Load</p><p className="font-semibold">{app.load || "—"} kW</p></div>
              <div className="bg-gray-50 rounded p-2"><p className="text-gray-400">Service Length</p><p className="font-semibold">{app.serviceLength || "—"} m</p></div>
              <div className="bg-gray-50 rounded p-2"><p className="text-gray-400">DTR Capacity</p><p className="font-semibold">{app.dtrCapacity || "—"} KVA</p></div>
              <div className="bg-gray-50 rounded p-2"><p className="text-gray-400">DTR Load</p><p className="font-semibold">{app.dtrLoad || "—"} KVA</p></div>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-2 text-xs">
              {app.existingMeter === "yes" && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Existing Meter: {app.existingMeterNo || "—"}</span>}
              {app.validPartition === "no"  && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Invalid Partition</span>}
              {app.poleRequired === "yes"   && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Pole Required</span>}
              {app.dispute && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Dispute noted</span>}
            </div>

            {/* Image links */}
            <div className="flex flex-wrap gap-3 text-xs">
              {app.siteImg           && <a href={app.siteImg}           target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Site Photo ↗</a>}
              {app.inspectionFormImg && <a href={app.inspectionFormImg} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Inspection Form ↗</a>}
              {app.existingMeterImg  && <a href={app.existingMeterImg}  target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Existing Meter ↗</a>}
              {app.poleDrawingImg    && <a href={app.poleDrawingImg}    target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Pole Drawing ↗</a>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin decision */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Admin Decision</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setAdminDecision("accepted")}
              className={`py-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-1 transition ${adminDecision === "accepted" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-600 hover:border-green-300"}`}>
              <CheckCircle2 className="h-4 w-4" /> Accept
            </button>
            <button type="button" onClick={() => setAdminDecision("rejected")}
              className={`py-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-1 transition ${adminDecision === "rejected" ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600 hover:border-red-300"}`}>
              <XCircle className="h-4 w-4" /> Reject
            </button>
          </div>
          {isDecisionChanged && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Overriding agency {app.agencyDecision || "pending"} decision — remarks required.
            </p>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Remarks {isDecisionChanged && "*"}</Label>
            <Textarea value={adminRemarks} onChange={e => setAdminRemarks(e.target.value)} placeholder="Admin notes / override reason..." rows={2} />
          </div>
          {/* Existing Consumer ID — relevant when applicant already has a connection */}
          <div className="space-y-1">
            <Label className="text-xs">Existing Consumer ID <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              value={existingConsumerId}
              onChange={e => setExistingConsumerId(e.target.value)}
              placeholder="e.g. 1234567890 — if applicant has existing connection"
              className="font-mono"
            />
            <p className="text-xs text-gray-400">Stored separately from remarks for future search. Used when a dispute is based on an existing consumer relationship.</p>
          </div>
        </CardContent>
      </Card>

      {/* Final action */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Final Action</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 gap-2">
            <button type="button" onClick={() => setFinalAction("quotation")}
              className={`py-3 px-4 rounded-xl text-sm font-semibold border-2 flex items-center gap-2 transition ${finalAction === "quotation" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700 hover:border-blue-300"}`}>
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span>Issue Quotation <span className="font-normal text-xs opacity-70">— enter 10-digit application no</span></span>
            </button>
            <button type="button" onClick={() => setFinalAction("dispute_letter")}
              className={`py-3 px-4 rounded-xl text-sm font-semibold border-2 flex items-center gap-2 transition ${finalAction === "dispute_letter" ? "bg-orange-600 text-white border-orange-600" : "border-gray-300 text-gray-700 hover:border-orange-300"}`}>
              <FileText className="h-4 w-4 shrink-0" />
              <span>Issue Dispute Letter <span className="font-normal text-xs opacity-70">— enter memo no</span></span>
            </button>
            <button type="button" onClick={() => setFinalAction("reassign")}
              className={`py-3 px-4 rounded-xl text-sm font-semibold border-2 flex items-center gap-2 transition ${finalAction === "reassign" ? "bg-purple-600 text-white border-purple-600" : "border-gray-300 text-gray-700 hover:border-purple-300"}`}>
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>Reassign / Send for Re-inspection</span>
            </button>
          </div>

          {finalAction === "quotation" && (
            <div className="space-y-1">
              <Label>Application No * <span className="text-gray-400 font-normal text-xs">(exactly 10 digits)</span></Label>
              <Input value={applicationNo} onChange={e => setApplicationNo(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="0000000000" className="font-mono tracking-widest text-center text-lg" inputMode="numeric" />
              <p className="text-xs text-gray-400 text-center">{applicationNo.length}/10 digits</p>
            </div>
          )}

          {finalAction === "dispute_letter" && (
            <div className="space-y-1">
              <Label>Memo No *</Label>
              <Input value={memoNo} onChange={e => setMemoNo(e.target.value)} placeholder="e.g. DL/26-27/001" />
            </div>
          )}

          {finalAction === "reassign" && (
            <div className="space-y-1">
              <Label>Assign to Agency *</Label>
              <Select value={newAgency} onValueChange={setNewAgency}>
                <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
                <SelectContent>
                  {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white" onClick={handleSubmit} disabled={submitting || !finalAction}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Processing..." : "Confirm & Process"}
        </Button>
      </div>
    </div>
  )
}
