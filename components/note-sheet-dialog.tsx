"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, FileText } from "lucide-react"

interface Props {
  issueId?: string
  issueIds?: string[]
  replacementId?: string
  replacementIds?: string[]
  currentNoteSheetNo?: string
  workOrderNo?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function NoteSheetDialog({ issueId, issueIds, replacementId, replacementIds, currentNoteSheetNo = "", workOrderNo = "", isOpen, onClose, onSuccess }: Props) {
  const [noteSheetNo, setNoteSheetNo] = useState(currentNoteSheetNo)
  const [submitting, setSubmitting]   = useState(false)

  const allIds = Array.from(new Set([
    ...(issueIds || []),
    ...(replacementIds || []),
    ...(issueId ? [issueId] : []),
    ...(replacementId ? [replacementId] : []),
  ].filter(Boolean)))

  const count = allIds.length
  const isBulk = count > 1

  const handleSubmit = async () => {
    if (!noteSheetNo.trim()) {
      alert("Please enter a Note Sheet Number.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/note-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueIds: allIds,
          noteSheetNo: noteSheetNo.trim(),
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      onSuccess()
      onClose()
    } catch (e: any) {
      alert(e.message || "Failed to save Note Sheet Number")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-blue-600" />
            <span>{isBulk ? `Bulk Add Note Sheet (${count} Selected)` : "Edit Note Sheet Number"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {workOrderNo && !isBulk && (
            <div className="bg-slate-50 p-2.5 rounded-lg text-xs flex justify-between border">
              <span className="text-gray-500">Work Order No:</span>
              <span className="font-mono font-bold text-slate-800">{workOrderNo}</span>
            </div>
          )}

          {isBulk && (
            <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg text-xs text-blue-900 font-semibold">
              Applying same Note Sheet Number to {count} selected replacement record(s).
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note-sheet-input" className="text-xs font-semibold">Note Sheet Number *</Label>
            <Input
              id="note-sheet-input"
              value={noteSheetNo}
              onChange={e => setNoteSheetNo(e.target.value)}
              placeholder="e.g. NS-2026/1042"
              className="font-mono text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-500">
              {isBulk
                ? "This Note Sheet reference number will be saved for all selected meters."
                : "Enter the Note Sheet reference number for this finalized replacement."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-slate-950 hover:bg-slate-900 text-white">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} {isBulk ? `Apply to ${count} Meters` : "Save Note Sheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
