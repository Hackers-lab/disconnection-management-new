"use client"

import { useState, useEffect, useRef } from "react"
import type { IcdsRecord } from "@/lib/icds-types"
import { compressAndWatermarkImage } from "@/lib/image-processor"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  FileCheck,
  Gauge,
  ExternalLink,
  Search,
} from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  onSuccess: (updated: IcdsRecord) => void
  username: string
}

export function IcdsConnectionModal({ record, open, onClose, onSuccess, username }: Props) {
  const [submittingStep, setSubmittingStep] = useState<string | null>(null)
  const [uploadingBooklet, setUploadingBooklet] = useState(false)

  // Step 1: Booklet Received
  const [bookletReceived, setBookletReceived] = useState(false)
  const [bookletReceivedDate, setBookletReceivedDate] = useState("")
  const [bookletScanUrl, setBookletScanUrl] = useState("")

  // Step 2: Quotation & CRM Application Number
  const [officialApplicationNo, setOfficialApplicationNo] = useState("")
  const [quotationNo, setQuotationNo] = useState("")
  const [quotationDate, setQuotationDate] = useState("")
  const [quotationAmount, setQuotationAmount] = useState<number | "">("")

  // Step 3: Work Order & Smart Meter Issue
  const [workOrderNo, setWorkOrderNo] = useState("")
  const [workOrderDate, setWorkOrderDate] = useState("")
  const [assignedAgency, setAssignedAgency] = useState("")
  const [meterIssuedNo, setMeterIssuedNo] = useState("")
  const [meterIssuedDate, setMeterIssuedDate] = useState("")

  // Dynamic Lists
  const [agencies, setAgencies] = useState<string[]>([])
  const [availableMeters, setAvailableMeters] = useState<string[]>([])
  const [meterSearch, setMeterSearch] = useState("")
  const [showMeterPicker, setShowMeterPicker] = useState(false)

  const bookletInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadMetadata() {
      // 1. Load Agencies
      const cachedAgencies = await getFromCache<string[]>("agencies_data_cache")
      if (cachedAgencies && cachedAgencies.length > 0) {
        setAgencies(cachedAgencies)
      } else {
        try {
          const res = await fetch("/api/admin/agencies")
          if (res.ok) {
            const data = await res.json()
            const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
            setAgencies(names)
          }
        } catch { /* ignore */ }
      }

      // 2. Load Stock Meters
      try {
        const res = await fetch("/api/meters/stock")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.stock)) {
            const singlePhase = data.stock
              .filter((m: any) => m.status === "in_stock" || !m.status)
              .map((m: any) => m.serialNo || m.serial)
              .filter(Boolean)
            setAvailableMeters(Array.from(new Set(singlePhase)))
          }
        }
      } catch { /* ignore */ }
    }

    if (open) {
      loadMetadata()
    }
  }, [open])

  if (!record) return null

  const handleOpen = () => {
    setBookletReceived(record.bookletReceived || false)
    setBookletReceivedDate(record.bookletReceivedDate || new Date().toISOString().slice(0, 10))
    setBookletScanUrl(record.bookletScanUrl || "")

    setOfficialApplicationNo(record.officialApplicationNo || "")
    setQuotationNo(record.quotationNo || "")
    setQuotationDate(record.quotationDate || "")
    setQuotationAmount(record.quotationAmount || "")

    setWorkOrderNo(record.workOrderNo || "")
    setWorkOrderDate(record.workOrderDate || "")
    setAssignedAgency(record.assignedAgency || "")
    setMeterIssuedNo(record.meterIssuedNo || record.smartMeterNo || "")
    setMeterIssuedDate(record.meterIssuedDate || "")
  }

  const handleBookletScanUpload = async (file: File) => {
    setUploadingBooklet(true)
    try {
      const watermark = `${record.awcCode} | BOOKLET SCAN | ${new Date().toLocaleString("en-IN")}`
      const processed = await compressAndWatermarkImage(file, { watermarkLines: [watermark] })

      const form = new FormData()
      form.append("file", processed)
      form.append("moduleName", "icds-electrification")
      form.append("consumerId", record.awcCode || record.id)
      form.append("recordId", record.id)
      form.append("photoType", "booklet")

      const res = await fetch("/api/upload-image", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")

      setBookletScanUrl(data.url)
      setBookletReceived(true)
      toast.success("Application Booklet Scan uploaded successfully!")
    } catch (e: any) {
      toast.error("Booklet scan upload failed: " + e.message)
    } finally {
      setUploadingBooklet(false)
    }
  }

  const saveMilestone = async (stepKey: "booklet" | "quotation" | "workorder") => {
    setSubmittingStep(stepKey)
    try {
      let patch: Partial<IcdsRecord> = {}

      if (stepKey === "booklet") {
        patch = {
          bookletReceived,
          bookletReceivedDate: bookletReceived ? (bookletReceivedDate || new Date().toISOString().slice(0, 10)) : undefined,
          bookletScanUrl: bookletScanUrl || undefined,
          stage: (record.stage === "PENDING_INSPECTION" || record.stage === "INSPECTED") ? "APPLICATION_PENDING" : record.stage,
        }
      } else if (stepKey === "quotation") {
        if (officialApplicationNo.trim() && officialApplicationNo.trim().length !== 10) {
          toast.warning("Note: WBSEDCL CRM Application No is usually 10 digits")
        }
        patch = {
          officialApplicationNo: officialApplicationNo.trim() || undefined,
          quotationNo: quotationNo.trim() || undefined,
          quotationDate: quotationDate || undefined,
          quotationAmount: quotationAmount !== "" ? Number(quotationAmount) : undefined,
        }
      } else if (stepKey === "workorder") {
        if (!assignedAgency) {
          throw new Error("Please select an assigned agency for work order execution")
        }
        patch = {
          workOrderNo: workOrderNo.trim() || undefined,
          workOrderDate: workOrderDate || undefined,
          assignedAgency: assignedAgency || undefined,
          meterIssuedNo: meterIssuedNo.trim() || undefined,
          meterIssuedDate: meterIssuedDate || (meterIssuedNo ? new Date().toISOString().slice(0, 10) : undefined),
          smartMeterNo: meterIssuedNo.trim() || record.smartMeterNo || undefined,
          stage: "WO_ISSUED",
        }
      }

      const res = await fetch(`/api/icds/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update record")

      toast.success(
        stepKey === "booklet"
          ? "Application Booklet status saved!"
          : stepKey === "quotation"
          ? "Quotation details saved!"
          : "Work Order and Meter issued to agency!"
      )
      onSuccess(data)
    } catch (e: any) {
      toast.error(e.message || "Failed to save details")
    } finally {
      setSubmittingStep(null)
    }
  }

  const filteredMeters = availableMeters.filter((m) =>
    m.toLowerCase().includes(meterSearch.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Admin CRM Lifecycle & Work Order Issuance
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Process CDPO physical booklet scan, CRM quotation generation, and issue Work Order & Smart Meter to the agency. Each section can be saved individually.
          </DialogDescription>
        </DialogHeader>

        {/* Center Header */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-extrabold text-slate-900 text-sm">{record.awcName}</p>
            <p className="text-slate-500 font-mono text-[11px]">Code: {record.awcCode} • {record.blockName} • {record.gpName}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Current Stage</span>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-mono text-[10px]">
              {record.stage}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* SECTION 1: CDPO APPLICATION BOOKLET RECEIPT */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">1</div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs">CDPO Physical Application Booklet</h3>
                  <p className="text-[11px] text-slate-500">Mark application receipt and upload scanned copy</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-700">Received?</span>
                <Switch checked={bookletReceived} onCheckedChange={setBookletReceived} />
              </div>
            </div>

            {bookletReceived && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Booklet Received Date</Label>
                    <Input
                      type="date"
                      value={bookletReceivedDate}
                      onChange={(e) => setBookletReceivedDate(e.target.value)}
                      className="h-8 text-xs bg-slate-50 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Booklet Scan / Application Photo</Label>
                    {bookletScanUrl ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={bookletScanUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="h-8 px-2.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 truncate border border-blue-200"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          View Scan Copy
                          <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                        </a>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => bookletInputRef.current?.click()}
                          className="h-8 text-xs px-2 rounded-lg"
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => bookletInputRef.current?.click()}
                        disabled={uploadingBooklet}
                        className="h-8 text-xs w-full justify-start rounded-lg border-dashed text-slate-600 hover:bg-slate-50"
                      >
                        {uploadingBooklet ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-blue-600" />
                        ) : (
                          <Upload className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                        )}
                        Upload Application Booklet Scan (.jpg / .pdf)
                      </Button>
                    )}
                    <input
                      type="file"
                      ref={bookletInputRef}
                      accept="image/*,.pdf"
                      onChange={(e) => e.target.files?.[0] && handleBookletScanUpload(e.target.files[0])}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveMilestone("booklet")}
                    disabled={submittingStep === "booklet" || uploadingBooklet}
                    className="h-8 px-3 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                  >
                    {submittingStep === "booklet" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save Booklet Status
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: WBSEDCL CRM APPLICATION & QUOTATION */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">2</div>
              <div>
                <h3 className="font-bold text-slate-900 text-xs">CRM Application & Quotation Generation</h3>
                <p className="text-[11px] text-slate-500">Record official 10-digit CRM app number, quotation no, and quotation date</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">10-Digit CRM Application No</Label>
                <Input
                  value={officialApplicationNo}
                  onChange={(e) => setOfficialApplicationNo(e.target.value)}
                  placeholder="e.g. 2004928190"
                  maxLength={10}
                  className="h-8 text-xs font-mono bg-slate-50 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Quotation Number</Label>
                <Input
                  value={quotationNo}
                  onChange={(e) => setQuotationNo(e.target.value)}
                  placeholder="e.g. QT/2026/092"
                  className="h-8 text-xs font-mono bg-slate-50 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Quotation Date</Label>
                <Input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                  className="h-8 text-xs bg-slate-50 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Quotation Amount (₹)</Label>
                <Input
                  type="number"
                  value={quotationAmount}
                  onChange={(e) => setQuotationAmount(e.target.value ? Number(e.target.value) : "")}
                  placeholder="e.g. 6611"
                  className="h-8 text-xs bg-slate-50 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                onClick={() => saveMilestone("quotation")}
                disabled={submittingStep === "quotation"}
                className="h-8 px-3 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
              >
                {submittingStep === "quotation" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save Quotation Details
              </Button>
            </div>
          </div>

          {/* SECTION 3: WORK ORDER & SMART METER ISSUE TO AGENCY */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">3</div>
              <div>
                <h3 className="font-bold text-slate-900 text-xs">Work Order & Smart Meter Issue</h3>
                <p className="text-[11px] text-slate-500">Assign agency contractor and issue single-phase smart meter from stock</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Work Order (WO) No</Label>
                <Input
                  value={workOrderNo}
                  onChange={(e) => setWorkOrderNo(e.target.value)}
                  placeholder="e.g. WO/EDD49/2026/04"
                  className="h-8 text-xs font-mono bg-slate-50 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Work Order Date</Label>
                <Input
                  type="date"
                  value={workOrderDate}
                  onChange={(e) => setWorkOrderDate(e.target.value)}
                  className="h-8 text-xs bg-slate-50 rounded-lg"
                />
              </div>

              {/* Agency Dropdown */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Assigned Agency (Contractor) *</Label>
                <Select value={assignedAgency} onValueChange={setAssignedAgency}>
                  <SelectTrigger className="h-8 text-xs bg-slate-50 rounded-lg border-slate-200">
                    <SelectValue placeholder="Select Agency..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-56">
                    {agencies.length === 0 ? (
                      <SelectItem value={assignedAgency || "UNASSIGNED"} disabled>
                        No agencies loaded
                      </SelectItem>
                    ) : (
                      agencies.map((agency) => (
                        <SelectItem key={agency} value={agency} className="text-xs">
                          {agency}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Smart Meter Issue with Search / Stock Dropdown */}
              <div className="space-y-1 relative">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold">Issue Smart Meter Serial No</Label>
                  {availableMeters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMeterPicker(!showMeterPicker)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      {showMeterPicker ? "Hide Stock" : `Pick from Stock (${availableMeters.length})`}
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Input
                    value={meterIssuedNo}
                    onChange={(e) => setMeterIssuedNo(e.target.value)}
                    placeholder="Enter or select smart meter serial..."
                    className="h-8 text-xs font-mono bg-slate-50 rounded-lg pr-7"
                  />
                  <Gauge className="h-3.5 w-3.5 absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
                </div>

                {/* Stock Picker Dropdown */}
                {showMeterPicker && (
                  <div className="absolute z-50 left-0 right-0 top-14 bg-white border border-slate-200 rounded-xl shadow-xl p-2 space-y-1.5 max-h-48 overflow-y-auto">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" />
                      <Input
                        value={meterSearch}
                        onChange={(e) => setMeterSearch(e.target.value)}
                        placeholder="Search meter serial..."
                        className="h-7 text-xs pl-7 rounded-lg"
                      />
                    </div>
                    <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                      {filteredMeters.length === 0 ? (
                        <p className="text-[11px] text-slate-400 text-center py-2">No matching meters in stock</p>
                      ) : (
                        filteredMeters.slice(0, 30).map((m) => (
                          <div
                            key={m}
                            onClick={() => {
                              setMeterIssuedNo(m)
                              setShowMeterPicker(false)
                            }}
                            className="py-1.5 px-2 hover:bg-blue-50 cursor-pointer rounded text-xs font-mono text-slate-800 flex items-center justify-between"
                          >
                            <span>{m}</span>
                            <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">Available</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Meter Issue Date</Label>
                <Input
                  type="date"
                  value={meterIssuedDate || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setMeterIssuedDate(e.target.value)}
                  className="h-8 text-xs bg-slate-50 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500">
                Saving will set status to <span className="font-bold text-emerald-700">WO_ISSUED</span> and dispatch for agency execution.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => saveMilestone("workorder")}
                disabled={submittingStep === "workorder" || !assignedAgency}
                className="h-8 px-4 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
              >
                {submittingStep === "workorder" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Issue Work Order & Meter
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
            Close Dialog
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
