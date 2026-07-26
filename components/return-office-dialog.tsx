"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, PackageCheck, AlertCircle } from "lucide-react"

interface Props {
  issueId: string
  consumerName: string
  consumerId: string
  oldMeterNo?: string
  completedAt?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ReturnOfficeDialog({ issueId, consumerName, consumerId, oldMeterNo = "", completedAt = "", isOpen, onClose, onSuccess }: Props) {
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [condition, setCondition]   = useState<"working" | "faulty" | "burnt">("faulty")
  const [remarks, setRemarks]   = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Calculate days elapsed since installation
  let isOverdue = false
  let daysDiff = 0
  if (completedAt) {
    // Parse completedAt format (e.g. DD/MM/YYYY HH:mm or YYYY-MM-DD)
    try {
      let instDate: Date | null = null
      if (completedAt.includes("/")) {
        const [d, m, yTime] = completedAt.split("/")
        const [y] = yTime.split(" ")
        instDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      } else {
        instDate = new Date(completedAt)
      }
      if (instDate && !isNaN(instDate.getTime())) {
        const now = new Date()
        daysDiff = Math.floor((now.getTime() - instDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff > 3) isOverdue = true
      }
    } catch { /* ignored */ }
  }

  const handleSubmit = async () => {
    if (!returnDate) {
      alert("Please select a return date.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/return-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          returnDate,
          condition,
          remarks: remarks.trim(),
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      onSuccess()
      onClose()
    } catch (e: any) {
      alert(e.message || "Failed to log returned meter")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            <span>Receive Old Meter at Office</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 border">
            <p className="font-semibold text-gray-800">{consumerName} <span className="font-mono text-gray-500">({consumerId})</span></p>
            <div className="flex justify-between text-gray-600 pt-1">
              <span>Old Meter No: <strong className="font-mono text-amber-700">{oldMeterNo || "—"}</strong></span>
              <span>Issue ID: <strong className="font-mono">{issueId}</strong></span>
            </div>
            {completedAt && (
              <div className="flex items-center justify-between pt-1.5 border-t mt-1">
                <span className="text-gray-500">Installed Date: {completedAt}</span>
                {isOverdue ? (
                  <span className="text-red-600 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                    ⚠ Overdue ({daysDiff} days)
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    Within 3-Day Due Window
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Date Received at Office *</Label>
              <Input
                type="date"
                value={returnDate}
                onChange={e => setReturnDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Old Meter Condition *</Label>
              <select
                className="w-full h-9 rounded-md border text-xs px-2 bg-white"
                value={condition}
                onChange={e => setCondition(e.target.value as any)}>
                <option value="faulty">Faulty / Defective</option>
                <option value="burnt">Burnt Meter</option>
                <option value="working">Working / Normal</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Store / Scrap Remarks</Label>
              <Textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Warehouse bin number, condition notes..."
                rows={2}
                className="text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-slate-950 hover:bg-slate-900 text-white">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Log Returned Meter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
