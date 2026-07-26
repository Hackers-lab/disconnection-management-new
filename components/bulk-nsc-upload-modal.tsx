"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, Upload, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const loadXLSX = () => import("xlsx")

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BulkNscUploadModal({ open, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<{ issuedCount: number; errors: string[] } | null>(null)
  const { toast } = useToast()

  const downloadTemplate = async () => {
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()
      const sampleData = [
        [
          "Application Number",
          "Applicant Name",
          "Address",
          "Mobile Number",
          "Agency",
          "Work Order Number",
          "Serial Number",
          "Remarks"
        ],
        [
          "1029384756",
          "Rajesh Kumar",
          "Plot 45, Sector 2, City",
          "9876543210",
          "FEDCO",
          "WO-2026-901",
          "SN-1002003",
          "NSC Meter Bulk Issue"
        ],
        [
          "1029384757",
          "Priya Sharma",
          "House 12, Main Road, City",
          "9123456789",
          "FEDCO",
          "WO-2026-902",
          "SN-1002004",
          "Legacy Entry"
        ]
      ]
      const ws = XLSX.utils.aoa_to_sheet(sampleData)
      ws["!cols"] = [
        { wch: 20 }, { wch: 22 }, { wch: 30 }, { wch: 15 },
        { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 25 }
      ]
      XLSX.utils.book_append_sheet(wb, ws, "NSC Bulk Issue Template")
      XLSX.writeFile(wb, "nsc_bulk_meter_issue_template.xlsx")
      toast({ title: "Template Downloaded" })
    } catch (e: any) {
      toast({ title: "Failed to generate template", description: e.message, variant: "destructive" })
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Please select an Excel file", variant: "destructive" })
      return
    }

    setUploading(true)
    setResults(null)

    try {
      const XLSX = await loadXLSX()
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: "array" })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (rawRows.length < 2) {
        throw new Error("Excel file is empty or missing data rows")
      }

      // Headers row 0, data rows start at 1
      const parsedRows = []
      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i]
        if (!row || row.length === 0) continue

        const appNo = String(row[0] || "").trim()
        const name = String(row[1] || "").trim()
        const address = String(row[2] || "").trim()
        const mobile = String(row[3] || "").trim()
        const agency = String(row[4] || "").trim()
        const workOrderNo = String(row[5] || "").trim()
        const serialNo = String(row[6] || "").trim()
        const remarks = String(row[7] || "").trim()

        if (serialNo || agency || workOrderNo || appNo) {
          parsedRows.push({
            applicationNo: appNo,
            applicantName: name,
            address,
            mobile,
            agency,
            workOrderNo,
            serialNo,
            remarks
          })
        }
      }

      if (parsedRows.length === 0) {
        throw new Error("No valid data rows found in the uploaded file")
      }

      const res = await fetch("/api/meters/bulk-issue-nsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows })
      })

      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || "Failed to process upload")

      setResults({
        issuedCount: resData.issuedCount || 0,
        errors: resData.errors || []
      })

      toast({
        title: "Bulk NSC Meter Issue Completed",
        description: `Successfully issued ${resData.issuedCount} meter(s).`
      })

      onSuccess()
    } catch (e: any) {
      toast({ title: "Upload Failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResults(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Bulk Upload NSC Meter Issue
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Upload an Excel file to issue NSC meters in bulk for legacy or new applications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: Download Template */}
          <div className="bg-slate-50 border rounded-xl p-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-gray-800">1. Excel Template</p>
              <p className="text-[11px] text-gray-500">Download formatted Excel sheet</p>
            </div>
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="h-8 text-xs font-semibold">
              <Download className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Download
            </Button>
          </div>

          {/* Step 2: File Select */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-800">2. Select Filled Excel File (.xlsx, .xls)</Label>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border rounded-lg p-1.5"
            />
          </div>

          {/* Upload Results Summary */}
          {results && (
            <div className="space-y-2 pt-2 border-t text-xs">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Successfully Issued: {results.issuedCount} meter(s)</span>
              </div>
              {results.errors.length > 0 && (
                <div className="bg-red-50 p-2.5 rounded-lg border border-red-200 space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-bold text-red-800 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" /> Errors ({results.errors.length}):
                  </p>
                  <ul className="list-disc list-inside text-red-700 space-y-0.5 font-mono text-[11px]">
                    {results.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={uploading || !file}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            {uploading ? "Processing..." : "Upload & Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
