"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  FileCheck2,
  FileWarning,
  Download,
  Printer,
  Loader2,
  User,
  MapPin,
  Building2,
  Calendar,
  IndianRupee,
  ShieldCheck,
  AlertTriangle,
  X,
} from "lucide-react"

interface OsdDetailsData {
  consumerId: string
  name: string
  address: string
  office: string
  connectionStatus: string
  connDate: string
  docType: string
  osd: number
  lpsc: number
  totalDues: number
  pdfBase64: string
  fileSizeKb: number
}

interface OsdDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OsdDetailsDialog({ open, onOpenChange }: OsdDetailsDialogProps) {
  const [consumerId, setConsumerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<OsdDetailsData | null>(null)

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const cleanId = consumerId.trim()
    if (!cleanId) {
      setError("Please enter a 9-digit Consumer ID")
      return
    }

    if (!/^\d{9}$/.test(cleanId)) {
      setError("Consumer ID must be a 9-digit number")
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch(`/api/osd-details?consumerId=${encodeURIComponent(cleanId)}`)
      const responseText = await res.text()

      let json: any = null
      try {
        json = JSON.parse(responseText)
      } catch {
        if (res.status === 401) {
          throw new Error("Session expired or unauthorized. Please log in again.")
        }
        throw new Error(`Server returned HTTP status ${res.status}. Check Vercel server logs.`)
      }

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch consumer OSD details")
      }

      setData(json.data)
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = () => {
    if (!data?.pdfBase64) return

    try {
      const byteCharacters = atob(data.pdfBase64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: "application/pdf" })

      const filename =
        data.docType === "NO DUES CERTIFICATE"
          ? `WBSEDCL_NoDues_${data.consumerId}.pdf`
          : `WBSEDCL_OSD_Report_${data.consumerId}.pdf`

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch (err) {
      console.error("Failed to download PDF", err)
    }
  }

  const handlePrintPdf = () => {
    if (!data?.pdfBase64) return

    try {
      const byteCharacters = atob(data.pdfBase64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: "application/pdf" })
      const blobUrl = URL.createObjectURL(blob)

      const iframe = document.createElement("iframe")
      iframe.style.position = "fixed"
      iframe.style.right = "0"
      iframe.style.bottom = "0"
      iframe.style.width = "0"
      iframe.style.height = "0"
      iframe.style.border = "0"
      iframe.src = blobUrl

      document.body.appendChild(iframe)

      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          setTimeout(() => {
            document.body.removeChild(iframe)
            URL.revokeObjectURL(blobUrl)
          }, 2000)
        }, 300)
      }
    } catch (err) {
      console.error("Failed to print PDF", err)
    }
  }

  const resetDialog = () => {
    setConsumerId("")
    setError(null)
    setData(null)
    setLoading(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetDialog()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-5">
        <DialogHeader className="pb-1 border-b">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
            <DialogTitle className="text-base font-bold">OSD & No Dues Check</DialogTitle>
          </div>
        </DialogHeader>

        {/* Compact Single-Row Search Form */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 pt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="consumerIdInput"
              placeholder="Search 9-digit Consumer ID..."
              value={consumerId}
              onChange={(e) => setConsumerId(e.target.value)}
              className="pl-8 pr-8 h-9 text-xs sm:text-sm"
              maxLength={9}
              disabled={loading}
              autoFocus
            />
            {consumerId && !loading && (
              <button
                type="button"
                onClick={() => setConsumerId("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            disabled={loading || !consumerId.trim()}
            className="h-9 px-4 gap-1.5 text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </>
            )}
          </Button>
        </form>

        {/* Compact Error Alert */}
        {error && (
          <div className="mt-2 p-2 px-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-2 py-2 animate-pulse">
            <div className="h-10 rounded-lg bg-muted/60" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-16 rounded-lg bg-muted/40" />
              <div className="h-16 rounded-lg bg-muted/40" />
              <div className="h-16 rounded-lg bg-muted/40" />
            </div>
            <div className="h-28 rounded-lg bg-muted/30" />
          </div>
        )}

        {/* Compact Results Section */}
        {data && !loading && (
          <div className="space-y-2.5 pt-1">
            {/* Status Header Bar + Action Buttons */}
            <div
              className={`p-2.5 px-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 shadow-2xs ${
                data.docType === "NO DUES CERTIFICATE"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {data.docType === "NO DUES CERTIFICATE" ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <FileWarning className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{data.docType}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 font-bold ${
                      data.docType === "NO DUES CERTIFICATE"
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-800 dark:text-emerald-200"
                        : "bg-amber-500/20 border-amber-500/40 text-amber-800 dark:text-amber-200"
                    }`}
                  >
                    {data.docType === "NO DUES CERTIFICATE" ? "CLEAR" : "OUTSTANDING"}
                  </Badge>
                </div>
              </div>

              {/* Tight Action Buttons */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintPdf}
                  className="h-8 px-2.5 text-xs gap-1.5 bg-background shadow-none"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleDownloadPdf}
                  className="h-8 px-2.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-none"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </Button>
              </div>
            </div>

            {/* Financial Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-card border rounded-lg p-2.5 shadow-2xs">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  OSD Amount
                </span>
                <div className="flex items-baseline gap-0.5 text-base font-bold text-foreground mt-0.5">
                  <IndianRupee className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{data.osd.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="bg-card border rounded-lg p-2.5 shadow-2xs">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  LPSC Surcharge
                </span>
                <div className="flex items-baseline gap-0.5 text-base font-bold text-foreground mt-0.5">
                  <IndianRupee className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{data.lpsc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div
                className={`border rounded-lg p-2.5 shadow-2xs ${
                  data.totalDues === 0
                    ? "bg-emerald-500/5 border-emerald-500/30"
                    : "bg-amber-500/5 border-amber-500/30"
                }`}
              >
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Total Dues
                </span>
                <div
                  className={`flex items-baseline gap-0.5 text-base font-extrabold mt-0.5 ${
                    data.totalDues === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>{data.totalDues.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Consumer Details Card (Compact Disconnection List Format) */}
            <div className="bg-card border rounded-lg p-3 shadow-2xs space-y-2">
              <div className="flex items-center justify-between border-b pb-1.5">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  Consumer Details
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  ID: {data.consumerId}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-muted/40 p-2 rounded border border-border/50">
                  <span className="text-[10px] text-muted-foreground block font-medium">Consumer Name</span>
                  <span className="font-bold text-foreground block truncate">{data.name}</span>
                </div>

                <div className="bg-muted/40 p-2 rounded border border-border/50">
                  <span className="text-[10px] text-muted-foreground block font-medium">CCC / Office</span>
                  <span className="font-semibold text-foreground flex items-center gap-1 truncate">
                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    {data.office}
                  </span>
                </div>

                <div className="bg-muted/40 p-2 rounded border border-border/50">
                  <span className="text-[10px] text-muted-foreground block font-medium">Connection Status</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-semibold mt-0.5">
                    {data.connectionStatus}
                  </Badge>
                </div>

                <div className="bg-muted/40 p-2 rounded border border-border/50">
                  <span className="text-[10px] text-muted-foreground block font-medium">Conn. Date</span>
                  <span className="font-medium text-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                    {data.connDate}
                  </span>
                </div>

                <div className="sm:col-span-2 bg-muted/40 p-2 rounded border border-border/50">
                  <span className="text-[10px] text-muted-foreground block font-medium">Service Location Address</span>
                  <span className="font-medium text-foreground flex items-start gap-1">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{data.address}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
