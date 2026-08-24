"use client"

import { useState } from "react"
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
  ArrowLeft,
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

interface OsdPageViewProps {
  onBack?: () => void
}

export function OsdPageView({ onBack }: OsdPageViewProps) {
  const [consumerId, setConsumerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<OsdDetailsData | null>(null)

  const fetchOsdDetails = async (idToSearch: string) => {
    const cleanId = idToSearch.trim()
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

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    fetchOsdDetails(consumerId)
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
    <div className="space-y-4 max-w-4xl mx-auto pb-16 font-sans antialiased text-slate-900">
      {/* Header bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-600" />
              <h1 className="text-lg font-bold text-slate-900">Live OSD & No Dues Check</h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Official WBSEDCL portal live bill PDF generator & dues parser
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="consumerIdInput"
              placeholder="Enter 9-digit Consumer ID..."
              value={consumerId}
              onChange={(e) => setConsumerId(e.target.value)}
              className="pl-10 pr-10 h-11 text-sm sm:text-base font-mono rounded-xl border-slate-200"
              maxLength={9}
              disabled={loading}
              autoFocus
            />
            {consumerId && !loading && (
              <button
                type="button"
                onClick={() => setConsumerId("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            disabled={loading || !consumerId.trim()}
            className="h-11 px-6 gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm shrink-0 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Check Live OSD</span>
              </>
            )}
          </Button>
        </form>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 animate-pulse">
          <div className="h-12 rounded-xl bg-slate-100" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
          </div>
          <div className="h-36 rounded-xl bg-slate-100" />
        </div>
      )}

      {/* Results Section */}
      {data && !loading && (
        <div className="space-y-4">
          {/* Status Header Bar + Action Buttons */}
          <div
            className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 shadow-sm ${
              data.docType === "NO DUES CERTIFICATE"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-3">
              {data.docType === "NO DUES CERTIFICATE" ? (
                <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
              ) : (
                <FileWarning className="w-6 h-6 text-amber-600 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base">{data.docType}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs px-2 py-0.5 font-bold ${
                      data.docType === "NO DUES CERTIFICATE"
                        ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                        : "bg-amber-100 border-amber-300 text-amber-800"
                    }`}
                  >
                    {data.docType === "NO DUES CERTIFICATE" ? "CLEAR" : "OUTSTANDING"}
                  </Badge>
                </div>
                <p className="text-xs opacity-75 mt-0.5 font-mono">Generated from WBSEDCL Portal PDF</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintPdf}
                className="h-9 px-3 text-xs gap-1.5 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                className="h-9 px-3.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </Button>
            </div>
          </div>

          {/* Financial Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                OSD Amount
              </span>
              <div className="flex items-baseline gap-1 text-xl font-bold font-mono text-slate-900 mt-1">
                <IndianRupee className="w-4 h-4 text-slate-400" />
                <span>{data.osd.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                LPSC Surcharge
              </span>
              <div className="flex items-baseline gap-1 text-xl font-bold font-mono text-amber-600 mt-1">
                <IndianRupee className="w-4 h-4 text-amber-500" />
                <span>{data.lpsc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div
              className={`border rounded-2xl p-4 shadow-sm ${
                data.totalDues === 0
                  ? "bg-emerald-50/70 border-emerald-200"
                  : "bg-rose-50/70 border-rose-200"
              }`}
            >
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Dues
              </span>
              <div
                className={`flex items-baseline gap-1 text-2xl font-extrabold font-mono mt-1 ${
                  data.totalDues === 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                <IndianRupee className="w-5 h-5" />
                <span>{data.totalDues.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Consumer Details Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                Consumer Information
              </span>
              <span className="text-xs text-slate-600 font-mono font-bold bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                ID: {data.consumerId}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Consumer Name</span>
                <span className="font-bold text-slate-900 text-sm block mt-0.5 truncate">{data.name}</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">CCC / Office</span>
                <span className="font-semibold text-slate-800 text-xs flex items-center gap-1 mt-0.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {data.office}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Connection Status</span>
                <Badge variant="secondary" className="text-xs px-2 py-0.5 font-semibold mt-1 bg-slate-200/80 text-slate-800">
                  {data.connectionStatus}
                </Badge>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Conn. Date</span>
                <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-0.5 font-mono">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {data.connDate}
                </span>
              </div>

              <div className="sm:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Service Location Address</span>
                <span className="font-medium text-slate-700 flex items-start gap-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{data.address}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
