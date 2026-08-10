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
 * Checks if a string contains non-ASCII characters (e.g. Bengali, Hindi, Unicode symbols).
 */
export function hasNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str)
}

/**
 * Renders non-ASCII Unicode text (e.g. Bengaliবাংলা) onto an HTML5 Canvas using browser system fonts
 * and returns a PNG Data URL for embedding into jsPDF.
 */
export function renderUnicodeTextToPng(
  text: string,
  fontSizePx = 22,
  textColorHex = "#0f172a",
  isBold = false
): { dataUrl: string; widthMm: number; heightMm: number } | null {
  if (!text || typeof window === "undefined") return null

  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null

    const fontStyle = `${isBold ? "bold " : ""}${fontSizePx}px "Noto Sans Bengali", "Kohinoor Bangla", "SolaimanLipi", "Segoe UI", sans-serif`
    ctx.font = fontStyle

    const metrics = ctx.measureText(text)
    const padding = 6
    const width = Math.ceil(metrics.width) + padding * 2
    const height = Math.ceil(fontSizePx * 1.4)

    canvas.width = width
    canvas.height = height

    const ctx2 = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx2) return null

    ctx2.font = fontStyle
    ctx2.fillStyle = textColorHex
    ctx2.textBaseline = "middle"
    ctx2.fillText(text, padding, height / 2)

    const dataUrl = canvas.toDataURL("image/png")

    // Convert canvas px to mm (72dpi equivalent scale for PDF)
    const pxToMm = 0.264583
    const heightMm = (fontSizePx * 1.2) * pxToMm
    const widthMm = (width / (fontSizePx * 1.4)) * heightMm

    return { dataUrl, widthMm, heightMm }
  } catch (e) {
    console.error("renderUnicodeTextToPng error:", e)
    return null
  }
}

/**
 * Asynchronously converts any remote image or PDF attachment URL into printable Base64 Data URLs.
 * If the URL points to a PDF document, it uses PDF.js to render PDF pages onto canvases.
 */
export async function fetchAttachmentAsDataUrls(url: string): Promise<string[]> {
  if (!url || typeof window === "undefined") return []
  if (url.startsWith("data:image")) return [url]

  try {
    // Route remote URLs through our server proxy to bypass CORS & Google Drive auth blocks
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) {
      console.warn(`Proxy fetch failed for ${url}: status ${res.status}`)
      return []
    }

    const contentType = res.headers.get("content-type") || ""
    const arrayBuffer = await res.arrayBuffer()

    // Check if attachment is a PDF Document
    const isPdf = contentType.includes("pdf") || url.toLowerCase().includes(".pdf") || isPdfHeader(arrayBuffer)

    if (isPdf) {
      return await renderPdfPagesToDataUrls(arrayBuffer)
    }

    // Otherwise, treat as Image
    return new Promise((resolve) => {
      const blob = new Blob([arrayBuffer], { type: contentType || "image/jpeg" })
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        resolve(result ? [result] : [])
      }
      reader.onerror = () => resolve([])
      reader.readAsDataURL(blob)
    })
  } catch (e) {
    console.error("fetchAttachmentAsDataUrls error:", e)
    return []
  }
}

function isPdfHeader(buffer: ArrayBuffer): boolean {
  try {
    const arr = new Uint8Array(buffer.slice(0, 5))
    const header = String.fromCharCode(...arr)
    return header.startsWith("%PDF-")
  } catch {
    return false
  }
}

async function renderPdfPagesToDataUrls(arrayBuffer: ArrayBuffer): Promise<string[]> {
  try {
    const pdfjsLib = await import("pdfjs-dist")
    // Use unpkg worker fallback
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdfDoc = await loadingTask.promise
    const pageImages: string[] = []

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2.0 }) // High resolution render

      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      if (!context) continue

      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({ canvasContext: context, viewport }).promise
      pageImages.push(canvas.toDataURL("image/jpeg", 0.90))
    }

    return pageImages
  } catch (e) {
    console.error("Failed to render PDF pages via PDF.js:", e)
    return []
  }
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

  // ─── Clean White Header Banner ────────────────────────────────────────────
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, 30, "F")

  doc.setFillColor(30, 41, 59)
  doc.rect(14, 8, pageWidth - 28, 1, "F")

  doc.setTextColor(15, 23, 42)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("NEW SERVICE CONNECTION (NSC) - TECHNICAL INSPECTION REPORT", 14, 16)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text("West Bengal State Electricity Distribution Company Limited (WBSEDCL)", 14, 21)

  // Top Right Meta Text
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(`RECEIVE NO: ${app.receiveNo || "—"}`, pageWidth - 14, 16, { align: "right" })

  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100, 116, 139)
  doc.text(`Date: ${app.inspectedAt || app.receivedDate || "—"}`, pageWidth - 14, 21, { align: "right" })

  doc.setDrawColor(226, 232, 240)
  doc.line(14, 25, pageWidth - 14, 25)

  let y = 32

  // ─── Section 1: Applicant & Location Details ──────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text("1. APPLICANT & LOCATION DETAILS", 14, y)
  doc.setDrawColor(203, 213, 225)
  doc.line(14, y + 2, pageWidth - 14, y + 2)

  y += 5

  const appNameText = app.applicantName || "—"
  const careOfText = app.careOf || "—"
  const addressText = app.address || "—"

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
        "Applicant Name:", hasNonAscii(appNameText) ? "" : appNameText,
        "Receive No / Ref:", `${app.receiveNo || "—"}${app.officeRefNo ? ` (${app.officeRefNo})` : ""}`,
      ],
      [
        "C/O Name:", hasNonAscii(careOfText) ? "" : careOfText,
        "Received Date:", app.receivedDate || "—",
      ],
      [
        "Premises Address:", hasNonAscii(addressText) ? "" : addressText,
        "Applied Class & Phase:", `${CLASS_LABELS[app.appliedClass] || app.appliedClass || "—"} (${app.phase || "1P"})`,
      ],
      [
        "Mobile Number:", app.mobile || "—",
        "Assigned Agency:", app.agency || "—",
      ],
    ],
    didDrawCell: (data) => {
      // Custom Canvas Image snippet rendering for Bengali / Unicode cells
      if (data.section === "body") {
        let textToRender = ""
        if (data.column.index === 1 && data.row.index === 0 && hasNonAscii(appNameText)) textToRender = appNameText
        if (data.column.index === 1 && data.row.index === 1 && hasNonAscii(careOfText)) textToRender = careOfText
        if (data.column.index === 1 && data.row.index === 2 && hasNonAscii(addressText)) textToRender = addressText

        if (textToRender) {
          const png = renderUnicodeTextToPng(textToRender, 20, "#1e293b", true)
          if (png) {
            doc.addImage(png.dataUrl, "PNG", data.cell.x + 2, data.cell.y + 1, png.widthMm, png.heightMm)
          }
        }
      }
    },
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

  const disputeText = app.dispute ? `Dispute: ${app.dispute}` : "None (No Legal Dispute)"

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
        "Dispute Noted", hasNonAscii(disputeText) ? "" : disputeText,
        "Project Requirement", app.agencyDecision === "project_required" ? "YES (LT/HT Extension Required)" : "Direct Connection Possible",
      ],
    ],
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && data.row.index === 5 && hasNonAscii(disputeText)) {
        const png = renderUnicodeTextToPng(disputeText, 20, "#1e293b", false)
        if (png) {
          doc.addImage(png.dataUrl, "PNG", data.cell.x + 2.5, data.cell.y + 1.5, png.widthMm, png.heightMm)
        }
      }
    },
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

  const isApproved = (app.agencyDecision || "").toLowerCase().includes("approve")
  const isRejected = (app.agencyDecision || "").toLowerCase().includes("reject")
  const isDispute = (app.agencyDecision || "").toLowerCase().includes("dispute")

  let decBorder: [number, number, number] = [148, 163, 184]
  let decText: [number, number, number] = [30, 41, 59]

  if (isApproved) {
    decBorder = [34, 197, 94]
    decText = [22, 101, 52]
  } else if (isRejected || isDispute) {
    decBorder = [239, 68, 68]
    decText = [153, 27, 27]
  }

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...decBorder)
  doc.setLineWidth(0.4)
  doc.roundedRect(14, y, pageWidth - 28, 18, 1.5, 1.5, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...decText)
  doc.text(`INSPECTION DECISION: ${(app.agencyDecision || "COMPLETED").toUpperCase()}`, 18, y + 5)

  const remarksText = app.agencyRemarks ? `Remarks: ${app.agencyRemarks}` : "Remarks: Field inspection completed satisfactorily as per WBSEDCL technical guidelines."

  if (hasNonAscii(remarksText)) {
    // Render Bengali / Unicode remarks using Canvas PNG
    const png = renderUnicodeTextToPng(remarksText, 20, "#334155", false)
    if (png) {
      doc.addImage(png.dataUrl, "PNG", 18, y + 8, Math.min(png.widthMm, pageWidth - 36), png.heightMm)
    }
  } else {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(51, 65, 85)
    const splitRemarks = doc.splitTextToSize(remarksText, pageWidth - 36)
    doc.text(splitRemarks, 18, y + 10)
  }

  y += 24

  // Inspector & Timestamps
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  const inspectorText = `Inspected By: ${app.inspectedBy || app.agency || "Authorized Agency Inspector"}`
  if (hasNonAscii(inspectorText)) {
    const png = renderUnicodeTextToPng(inspectorText, 18, "#475569", true)
    if (png) doc.addImage(png.dataUrl, "PNG", 14, y - 2, png.widthMm, png.heightMm)
  } else {
    doc.text(inspectorText, 14, y)
  }

  doc.text(`Inspected At: ${app.inspectedAt || "—"}`, pageWidth / 2 + 10, y)

  // ─── Bottom Right Agency Signature Block ──────────────────────────────────
  const sigBoxW = 75
  const sigBoxH = 34
  const sigBoxX = pageWidth - 14 - sigBoxW
  const sigBoxY = pageHeight - 14 - sigBoxH

  doc.setDrawColor(148, 163, 184)
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
  const agencyNameText = (app.agency || "AUTHORIZATION AGENCY").toUpperCase()
  if (hasNonAscii(agencyNameText)) {
    const png = renderUnicodeTextToPng(agencyNameText, 18, "#1e293b", true)
    if (png) doc.addImage(png.dataUrl, "PNG", sigBoxX + 4, sigBoxY + 7, png.widthMm, png.heightMm)
  } else {
    doc.text(agencyNameText, sigBoxX + 4, sigBoxY + 10)
  }

  // Seal / Sign Line Placeholder
  doc.setDrawColor(203, 213, 225)
  doc.line(sigBoxX + 4, sigBoxY + 24, sigBoxX + sigBoxW - 4, sigBoxY + 24)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text("Authorized Inspection Officer / Representative", sigBoxX + 4, sigBoxY + 28)
  doc.text(`Date: ${app.inspectedAt?.split(" ")[0] || app.receivedDate || "—"}`, sigBoxX + sigBoxW - 4, sigBoxY + 28, { align: "right" })

  // ─── Attachments Rendering (Full Page Uncropped Images & PDF Pages) ──────

  const addAttachmentPages = async (title: string, rawUrl: string) => {
    try {
      const dataUrls = await fetchAttachmentAsDataUrls(rawUrl)
      if (dataUrls.length === 0) {
        console.warn(`Could not load attachment content for: ${title}`)
        return
      }

      for (let idx = 0; idx < dataUrls.length; idx++) {
        const dataUrl = dataUrls[idx]

        // Load image to determine natural orientation & aspect ratio
        let isLandscape = false
        let naturalW = 1000
        let naturalH = 1414

        try {
          await new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => {
              naturalW = img.width || 1000
              naturalH = img.height || 1414
              isLandscape = naturalW > naturalH
              resolve()
            }
            img.onerror = () => resolve()
            img.src = dataUrl
          })
        } catch {}

        // Dynamically set page orientation (landscape vs portrait) based on image aspect ratio
        doc.addPage("a4", isLandscape ? "landscape" : "portrait")

        const curPageW = doc.internal.pageSize.getWidth()
        const curPageH = doc.internal.pageSize.getHeight()

        // Header Banner on Attachment Page
        doc.setFillColor(255, 255, 255)
        doc.rect(0, 0, curPageW, 22, "F")

        doc.setTextColor(15, 23, 42)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        const pageSuffix = dataUrls.length > 1 ? ` (Page ${idx + 1}/${dataUrls.length})` : ""
        doc.text(`${title.toUpperCase()}${pageSuffix}`, 14, 14)

        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(100, 116, 139)
        doc.text(`Receive No: ${app.receiveNo}`, curPageW - 14, 14, { align: "right" })

        doc.setDrawColor(226, 232, 240)
        doc.line(14, 18, curPageW - 14, 18)

        // Full Page Bounds with exact aspect ratio scaling (No Squeezing)
        const imgX = 14
        const imgY = 22
        const maxImgW = curPageW - 28
        const maxImgH = curPageH - 32

        let imgW = maxImgW
        let imgH = maxImgH

        const ratio = naturalH / naturalW
        if (ratio * maxImgW <= maxImgH) {
          imgW = maxImgW
          imgH = ratio * maxImgW
        } else {
          imgH = maxImgH
          imgW = maxImgH / ratio
        }

        // Center image on the page
        const posX = imgX + (maxImgW - imgW) / 2
        const posY = imgY + (maxImgH - imgH) / 2

        doc.addImage(dataUrl, "JPEG", posX, posY, imgW, imgH, undefined, "FAST")
      }
    } catch (e) {
      console.error(`Error embedding attachment "${title}":`, e)
    }
  }

  // 1. Full Uncropped Inspection Form
  const inspectionFormToEmbed = straightenedInspectionFormBase64 || app.inspectionFormImg
  if (includeInspectionForm && inspectionFormToEmbed) {
    await addAttachmentPages(
      straightenedInspectionFormBase64
        ? "Attachment: Inspection Form (Auto-Straightened A4)"
        : "Attachment: Field Inspection Form Document",
      inspectionFormToEmbed
    )
  }

  // 2. Application Booklet (Supports both PDF files & Images)
  if (includeBooklet && app.applicationFormUrl) {
    await addAttachmentPages("Attachment: Application Booklet Document", app.applicationFormUrl)
  }

  // 3. Site & Meter Photos
  if (includeSitePhotos) {
    if (app.siteImg) {
      await addAttachmentPages("Attachment: Field Site Inspection Photo", app.siteImg)
    }
    if (app.existingMeterImg) {
      await addAttachmentPages("Attachment: Existing Consumer Meter Photo", app.existingMeterImg)
    }
    if (app.poleDrawingImg) {
      await addAttachmentPages("Attachment: Pole Route & Technical Sketch", app.poleDrawingImg)
    }
  }

  // Save PDF
  const filename = `NSC_Inspection_Report_${(app.receiveNo || "document").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
  doc.save(filename)
}
