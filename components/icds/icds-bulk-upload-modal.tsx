"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { FileSpreadsheet, Download, Upload, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"

const loadXLSX = () => import("xlsx")

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function IcdsBulkUploadModal({ open, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ createdCount: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()

      const headers = [
        "AWC Code",
        "AWC Name",
        "Block Name",
        "GP Name",
        "AWC Address",
        "Property Status",
        "AWW Name",
        "AWW Mobile",
        "CDPO Name",
        "Assigned Agency",
      ]

      const sampleRows = [
        {
          "AWC Code": "19323010101",
          "AWC Name": "Joynagar-1 AWC",
          "Block Name": "Joynagar",
          "GP Name": "Joynagar Gram Panchayat",
          "AWC Address": "Vill Joynagar, Near Primary School, PO Joynagar",
          "Property Status": "OWN_BUILDING",
          "AWW Name": "Sunita Mandal",
          "AWW Mobile": "9876543210",
          "CDPO Name": "CDPO Joynagar",
          "Assigned Agency": "M/S Power Solutions",
        },
        {
          "AWC Code": "19323010102",
          "AWC Name": "Kultali West AWC",
          "Block Name": "Kultali",
          "GP Name": "Gopalganj GP",
          "AWC Address": "Vill Gopalganj Ward 3",
          "Property Status": "SCHOOL",
          "AWW Name": "Anjali Das",
          "AWW Mobile": "9876543211",
          "CDPO Name": "CDPO Kultali",
          "Assigned Agency": "M/S Ghosh Electricals",
        },
      ]

      const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers })
      XLSX.utils.book_append_sheet(wb, ws, "ICDS Template")
      XLSX.writeFile(wb, "ICDS_Electrification_Template.xlsx")
      toast.success("Template downloaded successfully")
    } catch (e: any) {
      toast.error("Failed to download template: " + e.message)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select an Excel file to upload")
      return
    }

    setUploading(true)
    setProgress(20)

    try {
      const XLSX = await loadXLSX()
      const data = await file.arrayBuffer()
      setProgress(40)

      const workbook = XLSX.read(data, { type: "array" })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" })

      // Filter out completely blank rows
      const validRows = jsonData.filter((r) => {
        if (!r || typeof r !== "object") return false
        return Object.values(r).some((v) => String(v ?? "").trim() !== "")
      })

      if (validRows.length === 0) {
        throw new Error("The uploaded Excel sheet contains no valid data rows.")
      }

      setProgress(60)

      const res = await fetch("/api/icds/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      })

      setProgress(90)
      const respData = await res.json()

      if (!res.ok) {
        throw new Error(respData.error || "Bulk upload failed on server")
      }

      setResult({
        createdCount: respData.createdCount || 0,
        errors: respData.errors || [],
      })
      setProgress(100)

      if (respData.createdCount > 0) {
        toast.success(`Successfully uploaded ${respData.createdCount} centers!`)
        onSuccess()
      } else {
        toast.warning("No new centers were added (all rows had errors or duplicates).")
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to parse/upload file")
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setResult(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Bulk Upload Anganwadi Centers (Excel)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Upload bulk Anganwadi centers using the standardized Excel template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <div>
              <p className="font-semibold text-blue-900">Need the standard column format?</p>
              <p className="text-blue-700">Download our sample template with Block, GP, 11-digit AWC Code, Worker Phone, etc.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="text-xs bg-white text-blue-700 font-semibold border-blue-300 hover:bg-blue-100 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Template
            </Button>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center space-y-2 hover:border-slate-400 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
              id="icds-excel-upload"
            />
            <label htmlFor="icds-excel-upload" className="cursor-pointer block">
              <Upload className="h-8 w-8 mx-auto text-slate-400 mb-1" />
              <p className="text-sm font-semibold text-slate-700">
                {file ? file.name : "Click to select Excel file (.xlsx, .xls)"}
              </p>
              <p className="text-xs text-slate-500">Auto-detects AWC Code, Name, GP, Block, Worker Name, Mobile, Agency</p>
            </label>
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Processing centers...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <Alert className={result.createdCount > 0 ? "border-emerald-500 bg-emerald-50" : "border-amber-500 bg-amber-50"}>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-xs text-emerald-900">
                  <strong>{result.createdCount}</strong> new Anganwadi Centers created successfully!
                </AlertDescription>
              </Alert>

              {result.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg max-h-36 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-red-800 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Issues found ({result.errors.length}):
                  </p>
                  <ul className="list-disc pl-4 text-[11px] text-red-700 space-y-0.5">
                    {result.errors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          {result ? (
            <Button type="button" onClick={handleReset} variant="outline" size="sm" className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Upload Another File
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
            Close
          </Button>
          {!result && (
            <Button
              type="button"
              size="sm"
              disabled={!file || uploading}
              onClick={handleUpload}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Start Bulk Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
