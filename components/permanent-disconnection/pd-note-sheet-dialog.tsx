"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, FileText } from "lucide-react"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  pdId?: string
  pdIds?: string[]
  currentNoteSheetNo?: string
  currentNoteSheetDate?: string
}

export function PDNoteSheetDialog({
  isOpen,
  onClose,
  onSuccess,
  pdId,
  pdIds,
  currentNoteSheetNo = "",
  currentNoteSheetDate = ""
}: Props) {
  const { toast } = useToast()
  const [noteSheetNo, setNoteSheetNo] = useState(currentNoteSheetNo)
  const [noteSheetDate, setNoteSheetDate] = useState(
    currentNoteSheetDate || new Date().toISOString().split("T")[0]
  )
  const [submitting, setSubmitting] = useState(false)

  const allIds = Array.from(new Set([...(pdIds || []), ...(pdId ? [pdId] : [])].filter(Boolean)))
  const count = allIds.length
  const isBulk = count > 1

  const handleSubmit = async () => {
    if (!noteSheetNo.trim()) {
      toast({ title: "Please enter Note Sheet Number", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      for (const id of allIds) {
        const res = await fetch("/api/permanent-disconnection", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "note_sheet",
            pdId: id,
            noteSheetNo: noteSheetNo.trim(),
            noteSheetDate
          })
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "Failed to update Note Sheet")
        }
      }

      toast({
        title: "Note Sheet Recorded",
        description: `Saved Note Sheet "${noteSheetNo}" for ${count} record(s).`
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({ title: e.message || "Failed to save Note Sheet", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <FileText className="h-5 w-5 text-purple-600" />
            <span>{isBulk ? `Bulk Note Sheet Entry (${count} Records)` : "Add Note Sheet Reference"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          {isBulk && (
            <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-lg text-purple-900 font-semibold">
              Applying the same Note Sheet Reference Number & Date to {count} selected records.
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pd-ns-no" className="text-xs font-semibold text-slate-700">
              Note Sheet Number *
            </Label>
            <Input
              id="pd-ns-no"
              value={noteSheetNo}
              onChange={e => setNoteSheetNo(e.target.value)}
              placeholder="e.g. NS/PD/2026/048"
              className="font-mono text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pd-ns-date" className="text-xs font-semibold text-slate-700">
              Note Sheet Date *
            </Label>
            <Input
              id="pd-ns-date"
              type="date"
              value={noteSheetDate}
              onChange={e => setNoteSheetDate(e.target.value)}
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
            disabled={submitting || !noteSheetNo.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {isBulk ? `Apply to ${count} Records` : "Save Note Sheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
