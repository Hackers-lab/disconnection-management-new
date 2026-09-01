"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2, PackageCheck, CheckCircle2 } from "lucide-react"
import { PermanentDisconnection, PDMeterCondition } from "@/lib/permanent-disconnection-types"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  record: PermanentDisconnection | null
}

export function PDReturnDialog({ isOpen, onClose, onSuccess, record }: Props) {
  const { toast } = useToast()
  const [returnDate, setReturnDate] = useState("")
  const [condition, setCondition] = useState<PDMeterCondition>("working")
  const [remarks, setRemarks] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split("T")[0]
      setReturnDate(record?.meterReturnDate || today)
      setCondition(record?.meterReturnCondition || record?.meterCondition || "working")
      setRemarks(record?.meterReturnRemarks || "")
    }
  }, [isOpen, record])

  const handleSubmit = async () => {
    if (!record) return
    if (!returnDate) {
      toast({ title: "Please select Return Date", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/permanent-disconnection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return_meter",
          pdId: record.pdId,
          returnDate,
          condition,
          remarks: remarks.trim()
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to mark meter return")
      }

      toast({
        title: "Meter Return Recorded",
        description: `Dismantled meter ${record.removedMeterNo || ""} deposited to CCC store.`
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({ title: e.message || "Failed to submit return", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            <span>Deposit Meter to CCC Store</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Consumer:</span>
              <span className="font-semibold text-slate-800">{record.consumerName} (#{record.consumerId})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Removed Meter No:</span>
              <span className="font-mono font-bold text-blue-700">{record.removedMeterNo || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Final Dial Reading:</span>
              <span className="font-mono font-bold text-slate-800">{record.finalReading || "N/A"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ret-date" className="text-xs font-semibold text-slate-700">
              Return Date *
            </Label>
            <Input
              id="ret-date"
              type="date"
              value={returnDate}
              onChange={e => setReturnDate(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ret-cond" className="text-xs font-semibold text-slate-700">
              Meter Physical Condition upon Receipt *
            </Label>
            <Select value={condition} onValueChange={(v: PDMeterCondition) => setCondition(v)}>
              <SelectTrigger id="ret-cond" className="text-xs">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="working">Working / Intact</SelectItem>
                <SelectItem value="faulty">Faulty / Non-Functional</SelectItem>
                <SelectItem value="burnt">Burnt / Melted</SelectItem>
                <SelectItem value="damaged">Damaged / Tampered Glass</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ret-remarks" className="text-xs font-semibold text-slate-700">
              Store Remarks
            </Label>
            <Textarea
              id="ret-remarks"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Received in good order, stored in Box #12"
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !returnDate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Mark Meter Returned
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
