"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, Calculator, CheckCircle2, AlertTriangle, RotateCcw, ArrowRight } from "lucide-react"
import type { MeterIssue } from "@/lib/meter-types"

interface Props {
  issue: MeterIssue
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CheckMeterDialog({ issue, isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"cross_check" | "finalize">("cross_check")
  const [checkNum, setCheckNum] = useState<1 | 2>(issue.crossCheckDate1 && issue.existingMeterReading1 ? 2 : 1)

  const [crossCheckDate, setCrossCheckDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [existingReading, setExistingReading] = useState("")
  const [checkReading, setCheckReading]       = useState("")
  const [nextCheckDate, setNextCheckDate]     = useState("")

  const [outcome, setOutcome] = useState<"removed_ok" | "replace_meter">("removed_ok")
  const [remarks, setRemarks] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Calculations
  const startExist = parseFloat(issue.existingMeterStartReading || issue.lastReading || "0")
  const startCheck = parseFloat(issue.newReading || "0")
  const currentExist = parseFloat(existingReading)
  const currentCheck = parseFloat(checkReading)

  const existDiff = !isNaN(startExist) && !isNaN(currentExist) ? currentExist - startExist : 0
  const checkDiff = !isNaN(startCheck) && !isNaN(currentCheck) ? currentCheck - startCheck : 0

  const diffUnits = checkDiff - existDiff
  const accuracyPct = existDiff > 0 ? ((checkDiff - existDiff) / existDiff) * 100 : 0

  const handleSaveCrossCheck = async () => {
    if (!existingReading.trim() || !checkReading.trim() || !crossCheckDate) {
      alert("Please enter readings and cross-check date.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/check-meter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cross_check",
          issueId: issue.issueId,
          checkNum,
          crossCheckDate,
          existingMeterReading: existingReading.trim(),
          checkMeterReading: checkReading.trim(),
          nextCheckDate,
          diffUnits: String(Math.round(diffUnits * 100) / 100),
          accuracyPct: `${accuracyPct >= 0 ? "+" : ""}${Math.round(accuracyPct * 10) / 10}%`,
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      onSuccess()
      onClose()
    } catch (e: any) {
      alert(e.message || "Save cross check failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinalize = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/check-meter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          issueId: issue.issueId,
          outcome,
          remarks: remarks.trim(),
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      onSuccess()
      onClose()
    } catch (e: any) {
      alert(e.message || "Finalize failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Slow / Fast Check Meter</span>
            <Badge variant="outline" className="font-mono text-xs">{issue.issueId}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Tab Switcher inside Modal */}
        <div className="grid grid-cols-2 gap-2 my-2">
          <button
            type="button"
            onClick={() => setStep("cross_check")}
            className={`py-2 text-xs font-semibold rounded-lg border transition ${
              step === "cross_check" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-700"
            }`}>
            Reading Cross-Check ({checkNum === 1 ? "1st Check" : "2nd Check"})
          </button>
          <button
            type="button"
            onClick={() => setStep("finalize")}
            className={`py-2 text-xs font-semibold rounded-lg border transition ${
              step === "finalize" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-700"
            }`}>
            Check Meter Finalization
          </button>
        </div>

        {step === "cross_check" ? (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 border">
              <p className="font-semibold text-gray-800">Consumer: {issue.consumerName} ({issue.consumerId})</p>
              <div className="grid grid-cols-2 gap-2 text-gray-600 pt-1">
                <div>Pre-installed Meter: <strong className="font-mono">{issue.existingMeterNo || "Existing"}</strong></div>
                <div>Check Meter: <strong className="font-mono">{issue.serialNo}</strong></div>
              </div>
              {issue.crossCheckDate1 && (
                <div className="pt-1 text-blue-700 border-t mt-1">
                  ✓ 1st Check Done ({issue.crossCheckDate1}): Exist = {issue.existingMeterReading1 || "—"}, Check = {issue.checkMeterReading1 || "—"}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Check Phase</Label>
                  <select
                    className="w-full h-9 rounded-md border text-xs px-2"
                    value={checkNum}
                    onChange={e => setCheckNum(parseInt(e.target.value) as 1 | 2)}>
                    <option value={1}>1st Reading Cross Check</option>
                    <option value={2}>2nd Reading Cross Check</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reading Date *</Label>
                  <Input type="date" value={crossCheckDate} onChange={e => setCrossCheckDate(e.target.value)} className="h-9 text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Pre-Installed Meter Reading *</Label>
                  <Input value={existingReading} onChange={e => setExistingReading(e.target.value)} placeholder="Current reading" className="font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Check Meter Reading *</Label>
                  <Input value={checkReading} onChange={e => setCheckReading(e.target.value)} placeholder="Current reading" className="font-mono text-xs" />
                </div>
              </div>

              {/* Live difference preview */}
              {existingReading && checkReading && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>Pre-Installed Units: {Math.round(existDiff * 100) / 100}</span>
                    <span>Check Meter Units: {Math.round(checkDiff * 100) / 100}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                    <span className="font-bold text-blue-900">Unit Difference: {Math.round(diffUnits * 100) / 100} units</span>
                    <Badge className={accuracyPct > 2 ? "bg-red-600" : accuracyPct < -2 ? "bg-amber-600" : "bg-green-600"}>
                      {accuracyPct > 2 ? `Fast (+${Math.round(accuracyPct * 10) / 10}%)` : accuracyPct < -2 ? `Slow (${Math.round(accuracyPct * 10) / 10}%)` : "Normal Accuracy"}
                    </Badge>
                  </div>
                </div>
              )}

              {checkNum === 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Next Cross-Check Date (Optional 2nd Check)</Label>
                  <Input type="date" value={nextCheckDate} onChange={e => setNextCheckDate(e.target.value)} className="h-9 text-xs" />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSaveCrossCheck} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save Cross Check
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 border">
              <p className="font-semibold">Test Summary for {issue.consumerName}</p>
              {issue.accuracyPercentage && (
                <p className="text-blue-800 font-bold">Calculated Accuracy: {issue.accuracyPercentage} (Diff: {issue.calculatedDiffUnits} units)</p>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold">Select Final Check Meter Action *</Label>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${outcome === "removed_ok" ? "bg-green-50 border-green-300" : "hover:bg-gray-50"}`}>
                  <input type="radio" name="outcome" value="removed_ok" checked={outcome === "removed_ok"} onChange={() => setOutcome("removed_ok")} className="mt-1" />
                  <div>
                    <p className="font-bold text-sm text-green-900">Remove Check Meter (Meter Accurate)</p>
                    <p className="text-xs text-green-700">Check meter will be uninstalled and returned to stock as Available. Pre-installed meter remains intact.</p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${outcome === "replace_meter" ? "bg-amber-50 border-amber-300" : "hover:bg-gray-50"}`}>
                  <input type="radio" name="outcome" value="replace_meter" checked={outcome === "replace_meter"} onChange={() => setOutcome("replace_meter")} className="mt-1" />
                  <div>
                    <p className="font-bold text-sm text-amber-900">Replace Pre-Installed Meter (Meter Inaccurate)</p>
                    <p className="text-xs text-amber-700">Pre-installed meter verified faulty/slow/fast. Requires meter replacement flow.</p>
                  </div>
                </label>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Finalization Remarks</Label>
                <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Final test outcome summary..." rows={2} className="text-xs" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleFinalize} disabled={submitting} className="bg-slate-950 hover:bg-slate-900 text-white">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Finalize Check Meter
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
