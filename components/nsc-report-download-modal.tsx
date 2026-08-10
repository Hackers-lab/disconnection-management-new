"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { FileText, Download, Loader2, Sparkles, CheckCircle2 } from "lucide-react"
import type { NSCApplication } from "@/lib/nsc-types"
import { generateNSCInspectionReportPDF, fetchImageAsBase64 } from "@/lib/nsc-inspection-pdf"
import { detectDocumentCorners, warpPerspective } from "@/lib/document-scanner"

interface NscReportDownloadModalProps {
  isOpen: boolean
  app: NSCApplication | null
  onClose: () => void
}

export function NscReportDownloadModal({
  isOpen,
  app,
  onClose,
}: NscReportDownloadModalProps) {
  // Checkboxes UNTICKED by default as requested
  const [includeBooklet, setIncludeBooklet] = useState(false)
  const [includeInspectionForm, setIncludeInspectionForm] = useState(false)
  const [autoStraightenForm, setAutoStraightenForm] = useState(true)
  const [includeSitePhotos, setIncludeSitePhotos] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progressMsg, setProgressMsg] = useState("")

  if (!isOpen || !app) return null

  const hasBooklet = !!app.applicationFormUrl
  const hasInspectionForm = !!app.inspectionFormImg
  const hasSitePhotos = !!(app.siteImg || app.existingMeterImg || app.poleDrawingImg)

  const processAndDownload = async () => {
    setGenerating(true)
    setProgressMsg("Preparing PDF report layout...")

    try {
      let straightenedBase64: string | null = null

      // Client-side auto-straightening for uploaded Inspection Form Image
      if (includeInspectionForm && autoStraightenForm && app.inspectionFormImg) {
        setProgressMsg("Auto-detecting paper borders & straightening Inspection Form...")
        try {
          const rawBase64 = await fetchImageAsBase64(app.inspectionFormImg)
          if (rawBase64) {
            straightenedBase64 = await new Promise<string | null>((resolve) => {
              const img = new Image()
              img.crossOrigin = "anonymous"
              img.onload = () => {
                try {
                  const canvas = document.createElement("canvas")
                  canvas.width = img.width
                  canvas.height = img.height
                  const ctx = canvas.getContext("2d")
                  if (!ctx) return resolve(null)

                  ctx.drawImage(img, 0, 0)
                  const isLandscape = img.width > img.height
                  const corners = detectDocumentCorners(canvas)
                  const warpedCanvas = warpPerspective(canvas, corners, isLandscape)
                  const dataUrl = warpedCanvas.toDataURL("image/jpeg", 0.90)
                  resolve(dataUrl)
                } catch {
                  resolve(null)
                }
              }
              img.onerror = () => resolve(null)
              img.src = rawBase64
            })
          }
        } catch (e) {
          console.error("Auto-straightening failed, falling back to raw image:", e)
        }
      }

      setProgressMsg("Building PDF with Agency Signature Block & Attachments...")

      await generateNSCInspectionReportPDF({
        app,
        includeBooklet: includeBooklet && hasBooklet,
        includeInspectionForm: includeInspectionForm && hasInspectionForm,
        includeSitePhotos: includeSitePhotos && hasSitePhotos,
        straightenedInspectionFormBase64: straightenedBase64,
      })

      onClose()
    } catch (err) {
      console.error("PDF generation error:", err)
    } finally {
      setGenerating(false)
      setProgressMsg("")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full p-5 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
            <FileText className="h-5 w-5 text-indigo-600" />
            Download NSC Technical Inspection Report
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Receive No: <span className="font-mono font-bold text-indigo-600">{app.receiveNo}</span> ({app.applicantName})
          </p>
        </DialogHeader>

        {/* Checkbox Attachment Options */}
        <div className="space-y-4 my-3">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Select Attachments to Include in PDF Report
          </p>

          {/* Option 1: Inspection Form */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="inc-form"
                checked={includeInspectionForm && hasInspectionForm}
                disabled={!hasInspectionForm || generating}
                onCheckedChange={(checked) => setIncludeInspectionForm(!!checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <label htmlFor="inc-form" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                  Field Inspection Form Image
                  {!hasInspectionForm && <span className="text-[10px] text-amber-600 font-semibold">(Not Uploaded)</span>}
                </label>
                <p className="text-[11px] text-slate-500">
                  Includes the agency inspector&apos;s physical form submission.
                </p>
              </div>
            </div>

            {hasInspectionForm && includeInspectionForm && (
              <div className="ml-7 pt-1 flex items-center gap-2 border-t border-slate-200/60">
                <Checkbox
                  id="auto-straighten"
                  checked={autoStraightenForm}
                  disabled={generating}
                  onCheckedChange={(checked) => setAutoStraightenForm(!!checked)}
                />
                <label htmlFor="auto-straighten" className="text-[11px] font-semibold text-indigo-700 cursor-pointer flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-indigo-500" />
                  Auto-crop & straighten paper to A4 format (Client-side)
                </label>
              </div>
            )}
          </div>

          {/* Option 2: Application Booklet */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
            <Checkbox
              id="inc-booklet"
              checked={includeBooklet && hasBooklet}
              disabled={!hasBooklet || generating}
              onCheckedChange={(checked) => setIncludeBooklet(!!checked)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <label htmlFor="inc-booklet" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                NSC Application Booklet Scan
                {!hasBooklet && <span className="text-[10px] text-amber-600 font-semibold">(Not Uploaded)</span>}
              </label>
              <p className="text-[11px] text-slate-500">
                Appends applicant&apos;s original scanned booklet pages.
              </p>
            </div>
          </div>

          {/* Option 3: Site & Meter Photos */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
            <Checkbox
              id="inc-photos"
              checked={includeSitePhotos && hasSitePhotos}
              disabled={!hasSitePhotos || generating}
              onCheckedChange={(checked) => setIncludeSitePhotos(!!checked)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <label htmlFor="inc-photos" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                Site, Meter & Pole Route Photos
                {!hasSitePhotos && <span className="text-[10px] text-amber-600 font-semibold">(No Photos)</span>}
              </label>
              <p className="text-[11px] text-slate-500">
                Appends premises site photos, existing meter photo, and pole sketches.
              </p>
            </div>
          </div>
        </div>

        {/* Status Notification Box */}
        <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-100 flex items-center gap-2 text-xs text-indigo-900">
          <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>Includes Official Agency Signature & Stamp Block on Page 1.</span>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={generating}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={processAndDownload}
            disabled={generating}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-md flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[11px]">{progressMsg || "Generating PDF..."}</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Generate Inspection PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
