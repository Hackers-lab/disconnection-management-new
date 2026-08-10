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

  // ─── Header Banner ────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59) // Slate-900
  doc.rect(0, 0, pageWidth, 26, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("NEW SERVICE CONNECTION (NSC) - INSPECTION REPORT", 14, 12)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(203, 213, 225)
  doc.text("Technical Verification & Site Field Assessment Document", 14, 18)

  // Top Right Meta Box
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(`NO: ${app.receiveNo || "—"}`, pageWidth - 14, 12, { align: "right" })
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Date: ${app.inspectedAt || app.receivedDate || "—"}`, pageWidth - 14, 18, { align: "right" })

  let y = 32

  // ─── Section 1: Applicant & Location Overview ─────────────────────────────
  doc.setFillColor(241, 245, 249) // Slate-100
  doc.rect(14, y, pageWidth - 28, 6, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("1. APPLICANT & LOCATION DETAILS", 16, y + 4.5)

  y += 8

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
  doc.setFillColor(241, 245, 249)
  doc.rect(14, y, pageWidth - 28, 6, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("2. VERIFICATION & SITE TECHNICAL PARAMETERS", 16, y + 4.5)

  y += 8

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    head: [["Parameter", "Verification Status / Value", "Technical Item", "Recorded Measurement"]],
    body: [
      [
        "Name Verified", app.verifyName === "ok" ? "✓ Confirmed" : (app.verifyName || "—"),
        "Applied Load (kW)", app.load ? `${app.load} kW` : "—",
      ],
      [
        "Address Verified", app.verifyAddress === "ok" ? "✓ Confirmed" : (app.verifyAddress || "—"),
        "Service Length (m)", app.serviceLength ? `${app.serviceLength} meters` : "—",
      ],
      [
        "Class Verified", app.verifyClass === "ok" ? "✓ Confirmed" : (app.verifyClass || "—"),
        "Pole Required", app.poleRequired === "yes" ? "YES (New Pole Needed)" : "NO (Direct Hook)",
      ],
      [
        "Existing Meter", app.existingMeter === "yes" ? `YES (Serial: ${app.existingMeterNo || "N/A"})` : "NO",
        "DTR Capacity (kVA)", app.dtrCapacity ? `${app.dtrCapacity} kVA` : "—",
      ],
      [
        "Valid Partition", app.validPartition === "yes" ? "✓ Validated" : "NO / Unpartitioned",
        "DTR Total Load", app.dtrLoad ? `${app.dtrLoad} kVA` : "—",
      ],
      [
        "Dispute Noted", app.dispute ? `⚠️ ${app.dispute}` : "None (No Legal Dispute)",
        "Project Requirement", app.agencyDecision === "project_required" ? "YES (LT/HT Extension Required)" : "Direct Connection Possible",
      ],
    ],
  })

  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Section 3: Agency Inspection Decision & Remarks ─────────────────────
  doc.setFillColor(241, 245, 249)
  doc.rect(14, y, pageWidth - 28, 6, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("3. AGENCY FIELD DECISION & REMARKS", 16, y + 4.5)

  y += 8

  // Decision Callout Box
  const isApproved = (app.agencyDecision || "").toLowerCase().includes("approve")
  const isRejected = (app.agencyDecision || "").toLowerCase().includes("reject")
  const isDispute = (app.agencyDecision || "").toLowerCase().includes("dispute")

  let decBg: [number, number, number] = [239, 246, 255] // Blue
  let decBorder: [number, number, number] = [147, 197, 253]
  let decText: [number, number, number] = [30, 58, 138]

  if (isApproved) {
    decBg = [240, 253, 244]
    decBorder = [134, 239, 172]
    decText = [22, 101, 52]
  } else if (isRejected || isDispute) {
    decBg = [254, 242, 242]
    decBorder = [252, 165, 165]
    decText = [153, 27, 27]
  }

  doc.setFillColor(...decBg)
  doc.setDrawColor(...decBorder)
  doc.roundedRect(14, y, pageWidth - 28, 16, 2, 2, "FD")

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

  y += 8

  // ─── Bottom Right Agency Signature Block ──────────────────────────────────
  const sigBoxW = 75
  const sigBoxH = 36
  const sigBoxX = pageWidth - 14 - sigBoxW
  const sigBoxY = pageHeight - 16 - sigBoxH

  doc.setDrawColor(203, 213, 225) // Slate-300
  doc.setFillColor(250, 250, 250)
  doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 2, 2, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(15, 23, 42)
  doc.text("FOR & ON BEHALF OF AGENCY:", sigBoxX + 4, sigBoxY + 5)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(30, 41, 59)
  doc.text((app.agency || "AUTHORIZATION AGENCY").toUpperCase(), sigBoxX + 4, sigBoxY + 10)

  // Seal / Sign Line Placeholder
  doc.setDrawColor(148, 163, 184)
  doc.line(sigBoxX + 4, sigBoxY + 26, sigBoxX + sigBoxW - 4, sigBoxY + 26)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text("Authorized Signatory / Field Officer", sigBoxX + 4, sigBoxY + 30)
  doc.text(`Date: ${app.inspectedAt?.split(" ")[0] || app.receivedDate || "—"}`, sigBoxX + sigBoxW - 4, sigBoxY + 30, { align: "right" })

  // ─── Attachments Pages ───────────────────────────────────────────────────

  // Helper to append image page
  const addImagePage = (title: string, imgDataUrl: string) => {
    try {
      doc.addPage()
      doc.setFillColor(30, 41, 59)
      doc.rect(0, 0, pageWidth, 18, "F")

      doc.setTextColor(255, 255, 255)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text(title.toUpperCase(), 14, 12)

      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.text(`Application Receive No: ${app.receiveNo}`, pageWidth - 14, 12, { align: "right" })

      const maxImgW = pageWidth - 28
      const maxImgH = pageHeight - 34

      doc.addImage(imgDataUrl, "JPEG", 14, 24, maxImgW, maxImgH, undefined, "FAST")
    } catch (e) {
      console.error("Error adding PDF image attachment:", e)
    }
  }

  // 1. Straightened / Original Inspection Form
  const inspectionFormToEmbed = straightenedInspectionFormBase64 || app.inspectionFormImg
  if (includeInspectionForm && inspectionFormToEmbed && inspectionFormToEmbed.startsWith("data:image")) {
    addImagePage(
      straightenedInspectionFormBase64
        ? "Attachment: Inspection Form (Auto-Straightened A4)"
        : "Attachment: Uploaded Field Inspection Form",
      inspectionFormToEmbed
    )
  }

  // 2. Application Booklet
  if (includeBooklet && app.applicationFormUrl && app.applicationFormUrl.startsWith("data:image")) {
    addImagePage("Attachment: Application Booklet Document", app.applicationFormUrl)
  }

  // 3. Site & Meter Photos
  if (includeSitePhotos) {
    if (app.siteImg && app.siteImg.startsWith("data:image")) {
      addImagePage("Attachment: Field Site Inspection Photo", app.siteImg)
    }
    if (app.existingMeterImg && app.existingMeterImg.startsWith("data:image")) {
      addImagePage("Attachment: Existing Consumer Meter Photo", app.existingMeterImg)
    }
    if (app.poleDrawingImg && app.poleDrawingImg.startsWith("data:image")) {
      addImagePage("Attachment: Pole Route & Technical Sketch", app.poleDrawingImg)
    }
  }

  // Save PDF
  const filename = `NSC_Inspection_Report_${(app.receiveNo || "document").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
  doc.save(filename)
}
