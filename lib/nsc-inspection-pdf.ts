import type { NSCApplication } from "./nsc-types"

export interface NSCReportPDFOptions {
  app: NSCApplication
  includeBooklet?: boolean
  includeInspectionForm?: boolean
  includeSitePhotos?: boolean
  straightenedInspectionFormBase64?: string | null
}

const CLASS_LABELS: Record<string, string> = {
  domestic: "LT Domestic",
  commercial: "LT Commercial",
  stw: "STW (Agri)",
  industrial: "LT Industrial",
}

/**
 * Asynchronously converts any image URL (HTTP/HTTPS/Data URL) into a JPEG Base64 Data URL for jsPDF embedding.
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url || typeof window === "undefined") return null
  if (url.startsWith("data:image")) return url

  return new Promise((resolve) => {
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.88)
        resolve(dataUrl)
      } catch (e) {
        console.error("Canvas toDataURL failed:", e)
        resolve(null)
      }
    }
    img.onerror = async () => {
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      } catch {
        resolve(null)
      }
    }
    img.src = url
  })
}

export async function generateNSCInspectionReportPDF(options: NSCReportPDFOptions): Promise<void> {
  const { app, includeBooklet, includeInspectionForm, includeSitePhotos, straightenedInspectionFormBase64 } = options
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // ─── Clean White Header Banner (Ink-Saving Print Optimized) ────────────────
  doc.setFillColor(255, 255, 255) // Pure White
  doc.rect(0, 0, pageWidth, 28, "F")

  // Top Accent Line
  doc.setFillColor(30, 41, 59) // Slate-900 line
  doc.rect(14, 8, pageWidth - 28, 1, "F")

  doc.setTextColor(15, 23, 42) // Dark Slate
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("NEW SERVICE CONNECTION (NSC) - TECHNICAL INSPECTION REPORT", 14, 15)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text("West Bengal State Electricity Distribution Company Limited (WBSEDCL)", 14, 20)

  // Top Right Meta Text
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text(`RECEIVE NO: ${app.receiveNo || "—"}`, pageWidth - 14, 15, { align: "right" })
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100, 116, 139)
  doc.text(`Date: ${app.inspectedAt || app.receivedDate || "—"}`, pageWidth - 14, 20, { align: "right" })

  // Bottom Line of Header
  doc.setDrawColor(226, 232, 240)
  doc.line(14, 24, pageWidth - 14, 24)

  let y = 30

  // ─── Section 1: Applicant & Location Overview ─────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("1. APPLICANT & LOCATION DETAILS", 14, y)
  doc.setDrawColor(203, 213, 225)
  doc.line(14, y + 2, pageWidth - 14, y + 2)

  y += 5

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35, textColor: [100, 116, 139] },
      1: { cellWidth: 58 },
      2: { fontStyle: "bold", cellWidth: 35, textColor: [100, 116, 139] },
      3: { cellWidth: 54 },
    },
    body: [
      [
        "Applicant Name:", app.applicantName || "—",
        "Receive No / Ref:", `${app.receiveNo || "—"}${app.officeRefNo ? ` (${app.officeRefNo})` : ""}`,
      ],
      [
        "C/O Name:", app.careOf || "—",
        "Received Date:", app.receivedDate || "—",
      ],
      [
        "Premises Address:", app.address || "—",
        "Applied Class & Phase:", `${CLASS_LABELS[app.appliedClass] || app.appliedClass || "—"} (${app.phase || "1P"})`,
      ],
      [
        "Mobile Number:", app.mobile || "—",
        "Assigned Agency:", app.agency || "—",
      ],
    ],
  })

  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Section 2: Verification & Technical Site Data ───────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("2. VERIFICATION & SITE TECHNICAL PARAMETERS", 14, y)
  doc.setDrawColor(203, 213, 225)
  doc.line(14, y + 2, pageWidth - 14, y + 2)

  y += 5

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    theme: "grid",
    headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 8, lineWidth: 0.2, lineColor: [203, 213, 225] },
    bodyStyles: { lineWidth: 0.1, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    styles: { fontSize: 8, cellPadding: 2.5 },
    head: [["Parameter", "Verification Status / Value", "Technical Item", "Recorded Measurement"]],
    body: [
      [
        "Name Verified", app.verifyName === "ok" ? "Confirmed" : (app.verifyName || "—"),
        "Applied Load (kW)", app.load ? `${app.load} kW` : "—",
      ],
      [
        "Address Verified", app.verifyAddress === "ok" ? "Confirmed" : (app.verifyAddress || "—"),
        "Service Length (m)", app.serviceLength ? `${app.serviceLength} meters` : "—",
      ],
      [
        "Class Verified", app.verifyClass === "ok" ? "Confirmed" : (app.verifyClass || "—"),
        "Pole Required", app.poleRequired === "yes" ? "YES (New Pole Needed)" : "NO (Direct Hook)",
      ],
      [
        "Existing Meter", app.existingMeter === "yes" ? `YES (Serial: ${app.existingMeterNo || "N/A"})` : "NO",
        "DTR Capacity (kVA)", app.dtrCapacity ? `${app.dtrCapacity} kVA` : "—",
      ],
      [
        "Valid Partition", app.validPartition === "yes" ? "Validated" : "NO / Unpartitioned",
        "DTR Total Load", app.dtrLoad ? `${app.dtrLoad} kVA` : "—",
      ],
      [
        "Dispute Noted", app.dispute ? `Dispute: ${app.dispute}` : "None (No Legal Dispute)",
        "Project Requirement", app.agencyDecision === "project_required" ? "YES (LT/HT Extension Required)" : "Direct Connection Possible",
      ],
    ],
  })

  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Section 3: Agency Inspection Decision & Remarks ─────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("3. AGENCY FIELD DECISION & REMARKS", 14, y)
  doc.setDrawColor(203, 213, 225)
  doc.line(14, y + 2, pageWidth - 14, y + 2)

  y += 6

  // Clean White Outline Decision Box
  const isApproved = (app.agencyDecision || "").toLowerCase().includes("approve")
  const isRejected = (app.agencyDecision || "").toLowerCase().includes("reject")
  const isDispute = (app.agencyDecision || "").toLowerCase().includes("dispute")

  let decBorder: [number, number, number] = [148, 163, 184]
  let decText: [number, number, number] = [30, 41, 59]

  if (isApproved) {
    decBorder = [34, 197, 94] // Green
    decText = [22, 101, 52]
  } else if (isRejected || isDispute) {
    decBorder = [239, 68, 68] // Red
    decText = [153, 27, 27]
  }

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...decBorder)
  doc.setLineWidth(0.4)
  doc.roundedRect(14, y, pageWidth - 28, 16, 1.5, 1.5, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...decText)
  doc.text(`INSPECTION DECISION: ${(app.agencyDecision || "COMPLETED").toUpperCase()}`, 18, y + 5)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  const remarksText = app.agencyRemarks ? `Remarks: ${app.agencyRemarks}` : "Remarks: Field inspection completed satisfactorily as per WBSEDCL technical guidelines."
  const splitRemarks = doc.splitTextToSize(remarksText, pageWidth - 36)
  doc.text(splitRemarks, 18, y + 10)

  y += 22

  // Inspector & Timestamps
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text(`Inspected By: ${app.inspectedBy || app.agency || "Authorized Agency Inspector"}`, 14, y)
  doc.text(`Inspected At: ${app.inspectedAt || "—"}`, pageWidth / 2, y)

  // ─── Bottom Right Agency Signature Block (Clean Print Style) ──────────────
  const sigBoxW = 75
  const sigBoxH = 34
  const sigBoxX = pageWidth - 14 - sigBoxW
  const sigBoxY = pageHeight - 14 - sigBoxH

  doc.setDrawColor(148, 163, 184) // Slate-400 border
  doc.setLineWidth(0.3)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 1.5, 1.5, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(15, 23, 42)
  doc.text("FOR & ON BEHALF OF AGENCY:", sigBoxX + 4, sigBoxY + 5)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(30, 41, 59)
  doc.text((app.agency || "AUTHORIZATION AGENCY").toUpperCase(), sigBoxX + 4, sigBoxY + 10)

  // Seal / Sign Line Placeholder
  doc.setDrawColor(203, 213, 225)
  doc.line(sigBoxX + 4, sigBoxY + 24, sigBoxX + sigBoxW - 4, sigBoxY + 24)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text("Authorized Inspection Officer / Representative", sigBoxX + 4, sigBoxY + 28)
  doc.text(`Date: ${app.inspectedAt?.split(" ")[0] || app.receivedDate || "—"}`, sigBoxX + sigBoxW - 4, sigBoxY + 28, { align: "right" })

  // ─── Attachments Pages ───────────────────────────────────────────────────

  const addImagePage = async (title: string, rawUrl: string) => {
    try {
      const base64Img = await fetchImageAsBase64(rawUrl)
      if (!base64Img) {
        console.warn(`Could not load base64 image for attachment: ${title}`)
        return
      }

      doc.addPage()

      // Header Banner on Attachment Page
      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, pageWidth, 18, "F")

      doc.setTextColor(15, 23, 42)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text(title.toUpperCase(), 14, 12)

      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      doc.text(`Receive No: ${app.receiveNo}`, pageWidth - 14, 12, { align: "right" })

      doc.setDrawColor(226, 232, 240)
      doc.line(14, 16, pageWidth - 14, 16)

      const maxImgW = pageWidth - 28
      const maxImgH = pageHeight - 26

      doc.addImage(base64Img, "JPEG", 14, 20, maxImgW, maxImgH, undefined, "FAST")
    } catch (e) {
      console.error(`Error embedding attachment "${title}":`, e)
    }
  }

  // 1. Straightened / Original Inspection Form
  const inspectionFormToEmbed = straightenedInspectionFormBase64 || app.inspectionFormImg
  if (includeInspectionForm && inspectionFormToEmbed) {
    await addImagePage(
      straightenedInspectionFormBase64
        ? "Attachment: Inspection Form (Auto-Straightened A4)"
        : "Attachment: Field Inspection Form Document",
      inspectionFormToEmbed
    )
  }

  // 2. Application Booklet
  if (includeBooklet && app.applicationFormUrl) {
    await addImagePage("Attachment: Application Booklet Document", app.applicationFormUrl)
  }

  // 3. Site & Meter Photos
  if (includeSitePhotos) {
    if (app.siteImg) {
      await addImagePage("Attachment: Field Site Inspection Photo", app.siteImg)
    }
    if (app.existingMeterImg) {
      await addImagePage("Attachment: Existing Consumer Meter Photo", app.existingMeterImg)
    }
    if (app.poleDrawingImg) {
      await addImagePage("Attachment: Pole Route & Technical Sketch", app.poleDrawingImg)
    }
  }

  // Save PDF
  const filename = `NSC_Inspection_Report_${(app.receiveNo || "document").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
  doc.save(filename)
}
