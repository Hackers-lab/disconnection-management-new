"use client"

import { useState } from "react"
import { MiscInspectionRecord, AdminDecision } from "@/lib/misc-inspection-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, FileText, Download, CheckCircle2, Clock, MapPin, Building2, User, AlertTriangle, ShieldCheck } from "lucide-react"

interface MiscInspectionViewDialogProps {
  record: MiscInspectionRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  userRole?: string
}

export function MiscInspectionViewDialog({
  record,
  open,
  onOpenChange,
  onSuccess,
  userRole,
}: MiscInspectionViewDialogProps) {
  const [loading, setLoading] = useState(false)
  const [showAdminFinalize, setShowAdminFinalize] = useState(false)

  // Admin Finalization State
  const [adminDecision, setAdminDecision] = useState<AdminDecision>("APPROVED")
  const [adminRemarks, setAdminRemarks] = useState("")
  const [memoNo, setMemoNo] = useState("")

  const isAdminOrExec =
    userRole?.toLowerCase() === "admin" ||
    userRole?.toLowerCase() === "executive" ||
    userRole?.toLowerCase() === "superuser"

  const handleDownloadPDF = async () => {
    if (!record) return
    try {
      const { jsPDF } = await import("jspdf")
      const autoTable = (await import("jspdf-autotable")).default

      const doc = new jsPDF()

      // Header Banner
      doc.setFillColor(30, 41, 59)
      doc.rect(0, 0, 210, 25, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.text("MISCELLANEOUS SITE INSPECTION REPORT", 105, 14, { align: "center" })

      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.text(`Ref ID: ${record.id}  |  Date: ${record.createdAt.split(" ")[0]}`, 105, 20, { align: "center" })

      // Content Table
      doc.setTextColor(0, 0, 0)
      autoTable(doc, {
        startY: 30,
        head: [["Field / Parameter", "Details"]],
        body: [
          ["Inspection ID", record.id],
          ["Reference / File No", record.referenceNo || "N/A"],
          ["Category", record.category],
          ["Inspection Title", record.title],
          ["Description / Notes", record.description || "N/A"],
          ["Consumer / Applicant", record.applicantName || "N/A"],
          ["Address / Location", record.address || "N/A"],
          ["Assigned Agency", record.agency],
          ["Urgency Priority", record.priority],
          ["Status", record.status],
          ["Created By / At", `${record.createdBy} (${record.createdAt})`],
          ["Inspected By / At", record.inspectedBy ? `${record.inspectedBy} (${record.inspectedAt})` : "Pending"],
          ["Agency Decision", record.agencyDecision || "Pending"],
          ["Agency Findings", record.agencyRemarks || "N/A"],
          ["Meter Serial / Reading", record.existingMeterNo ? `${record.existingMeterNo} / ${record.meterReading || "N/A"} kWh` : "N/A"],
          ["GPS Coordinates", record.geoCoordinates || "N/A"],
          ["Admin Decision", record.adminDecision || "Pending Review"],
          ["Memo / Dispatch No", record.memoNo || "N/A"],
          ["Admin Remarks", record.adminRemarks || "N/A"],
        ],
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 3 },
      })

      doc.save(`Misc_Inspection_${record.id}.pdf`)
      toast.success("Inspection report PDF downloaded successfully")
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message)
    }
  }

  const handleFinalizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!record) return

    setLoading(true)
    try {
      const res = await fetch(`/api/misc-inspection/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminDecision,
          adminRemarks: adminRemarks.trim(),
          memoNo: memoNo.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to finalize inspection")
      }

      toast.success(`Inspection finalized with decision: ${adminDecision}`)
      setShowAdminFinalize(false)
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center pr-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileText className="h-5 w-5 text-primary" /> Inspection Details — {record.id}
            </DialogTitle>
            <Badge
              variant={
                record.status === "FINALIZED"
                  ? "default"
                  : record.status === "INSPECTED"
                  ? "secondary"
                  : record.status === "REJECTED"
                  ? "destructive"
                  : "outline"
              }
            >
              {record.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Top Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/40 p-3 rounded-lg border">
            <div>
              <span className="text-muted-foreground block text-[10px]">Category</span>
              <strong className="text-sm font-semibold text-primary">{record.category}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Assigned Agency</span>
              <strong className="text-sm font-semibold">{record.agency}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Priority</span>
              <strong className="text-sm font-semibold">{record.priority}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Created Date</span>
              <strong className="text-sm font-semibold">{record.createdAt.split(" ")[0]}</strong>
            </div>
          </div>

          {/* Issue Summary */}
          <div className="space-y-1 bg-background p-3 border rounded-lg">
            <h4 className="font-semibold text-sm text-foreground">{record.title}</h4>
            <p className="text-muted-foreground whitespace-pre-wrap">{record.description || "No description provided."}</p>
          </div>

          {/* Consumer & Site Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-lg p-3 bg-muted/20">
            <div>
              <h5 className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <User className="h-3 w-3" /> Consumer / Applicant Details
              </h5>
              <p><strong>Name:</strong> {record.applicantName || "N/A"}</p>
              <p><strong>Ref / File No:</strong> {record.referenceNo}</p>
              <p><strong>Consumer ID:</strong> {record.consumerId || "N/A"}</p>
              <p><strong>Mobile:</strong> {record.mobile || "N/A"}</p>
            </div>
            <div>
              <h5 className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Location Details
              </h5>
              <p><strong>Address:</strong> {record.address || "N/A"}</p>
              <p><strong>DTR ID / Feeder:</strong> {record.dtrId || "N/A"}</p>
              <p><strong>Target Completion:</strong> {record.targetCompletionDate || "N/A"}</p>
            </div>
          </div>

          {/* Agency Inspection Findings */}
          <div className="border rounded-lg p-3 bg-blue-500/5 border-blue-500/20 space-y-2">
            <h5 className="font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Agency Site Inspection Findings
            </h5>

            {record.inspectedAt ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <p><strong>Inspected By:</strong> {record.inspectedBy}</p>
                  <p><strong>Inspected Date:</strong> {record.inspectedAt}</p>
                  <p>
                    <strong>Agency Decision:</strong>{" "}
                    <Badge variant={record.agencyDecision === "SATISFACTORY" ? "default" : "destructive"}>
                      {record.agencyDecision}
                    </Badge>
                  </p>
                </div>
                {record.agencyRemarks && (
                  <p className="bg-background p-2 rounded border"><strong>Agency Remarks:</strong> {record.agencyRemarks}</p>
                )}
                {record.geoCoordinates && <p>📍 <strong>GPS Location:</strong> {record.geoCoordinates}</p>}

                {/* Photos Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  {record.sitePhotoUrl && (
                    <div>
                      <span className="block text-[10px] text-muted-foreground mb-1 font-semibold">Site Photo</span>
                      <a href={record.sitePhotoUrl} target="_blank" rel="noreferrer">
                        <img src={record.sitePhotoUrl} alt="Site" className="h-28 w-full object-cover rounded border hover:opacity-90" />
                      </a>
                    </div>
                  )}
                  {record.meterReadingPhotoUrl && (
                    <div>
                      <span className="block text-[10px] text-muted-foreground mb-1 font-semibold">Meter Photo</span>
                      <a href={record.meterReadingPhotoUrl} target="_blank" rel="noreferrer">
                        <img src={record.meterReadingPhotoUrl} alt="Meter" className="h-28 w-full object-cover rounded border hover:opacity-90" />
                      </a>
                    </div>
                  )}
                  {record.sketchDrawingUrl && (
                    <div>
                      <span className="block text-[10px] text-muted-foreground mb-1 font-semibold">Sketch / Drawing</span>
                      <a href={record.sketchDrawingUrl} target="_blank" rel="noreferrer">
                        <img src={record.sketchDrawingUrl} alt="Sketch" className="h-28 w-full object-cover rounded border hover:opacity-90" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground italic">Site inspection has not been completed by the agency yet.</p>
            )}
          </div>

          {/* Admin Finalization Section */}
          {record.adminDecision && (
            <div className="border rounded-lg p-3 bg-emerald-500/5 border-emerald-500/20 space-y-1">
              <h5 className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Admin Final Decision
              </h5>
              <div className="grid grid-cols-2 gap-2">
                <p><strong>Decision:</strong> {record.adminDecision}</p>
                <p><strong>Memo No:</strong> {record.memoNo || "N/A"}</p>
                <p><strong>Finalized By:</strong> {record.finalizedBy} ({record.finalizedAt})</p>
              </div>
              {record.adminRemarks && <p className="mt-1"><strong>Admin Remarks:</strong> {record.adminRemarks}</p>}
            </div>
          )}

          {/* Inline Admin Action Form */}
          {showAdminFinalize && (
            <form onSubmit={handleFinalizeSubmit} className="border-2 border-primary rounded-lg p-3.5 bg-background space-y-3">
              <h5 className="font-bold text-sm text-primary flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Admin Review & Final Action
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Admin Decision</Label>
                  <Select value={adminDecision} onValueChange={(v) => setAdminDecision(v as AdminDecision)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPROVED">Approve & Close</SelectItem>
                      <SelectItem value="REJECTED">Reject Inspection</SelectItem>
                      <SelectItem value="RE_INSPECT">Request Re-Inspection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Memo / Order No</Label>
                  <Input className="h-9 text-xs" placeholder="e.g. DIS/MISC/2026/102" value={memoNo} onChange={(e) => setMemoNo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Admin Remarks</Label>
                <Textarea placeholder="Final admin observations or order details..." rows={2} value={adminRemarks} onChange={(e) => setAdminRemarks(e.target.value)} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdminFinalize(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Save Final Action
                </Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="mr-1.5 h-4 w-4" /> Download PDF Report
          </Button>

          <div className="flex gap-2">
            {isAdminOrExec && !showAdminFinalize && record.status === "INSPECTED" && (
              <Button type="button" size="sm" onClick={() => setShowAdminFinalize(true)}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Review & Finalize
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
