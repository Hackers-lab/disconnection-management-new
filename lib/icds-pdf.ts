import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { IcdsRecord, IcdsAgencyMetrics } from "./icds-types"

/**
 * Generates the official WBSEDCL SERVICE CERTIFICATION (Page 4 of Order EDD/49).
 */
export function generateIcdsServiceCertificatePDF(record: IcdsRecord): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  // Title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("SERVICE CERTIFICATION", 105, 30, { align: "center" })

  // Underline Title
  doc.setLineWidth(0.5)
  doc.line(70, 32, 140, 32)

  // Body Content
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)

  const signatory = record.certificateSignatory || "..................................................."
  const designation = record.certificateSignatoryDesignation || "an authorized representative"
  const awcName = record.awcName || "..................................................."
  const awcAddress = record.awcAddress || "..................................................."
  const blockName = record.blockName || "........................"
  const agencyName = record.assignedAgency || record.equipmentAgency || "..................................................."
  const lightsCount = record.equipmentChecklist?.ledBulbsCount || 3
  const fanCount = record.equipmentChecklist?.fan80WCount || 1
  const certDate = record.certificateDate || record.equipmentInstallDate || new Date().toLocaleDateString("en-IN")

  const paragraph1 = `I Sri/Smt. ${signatory} in the capacity of ${designation}, an authorized representative of ${awcName} ICDS Centre situated at ${awcAddress} under ${blockName} Block, am pleased to confirm that ${agencyName} (name of the agency of WBSEDCL) has performed the work of internal wiring, earthing, installation of main-switch, switch board, switches, regulator and fixing of ${lightsCount} numbers of lights and ${fanCount} number of fan on ${certDate} at the ICDS centre as mentioned above and these accessories are fully functional.`

  const splitText = doc.splitTextToSize(paragraph1, 165)
  doc.text(splitText, 22, 50, { lineHeightFactor: 1.6 })

  // Standard Equipment Bill / Rates Breakdown Table (WBSEDCL EDD/49 Standard)
  const startY = 115
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("Summary of Standard Package Executed (WBSEDCL Order EDD/49):", 22, startY)

  autoTable(doc, {
    startY: startY + 4,
    margin: { left: 22, right: 22 },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    head: [["Sl", "Item Description", "Qty / Unit", "Status"]],
    body: [
      ["1", "16A-DP Main Switch", "1 No.", "Installed & Tested"],
      ["2", "Switch Board (5 Switches, 1 Step Regulator, 1 Indicator, 1 3-Pin Plug)", "1 No.", "Installed & Tested"],
      ["3", "Internal Wiring (2.5 sq mm + 1.5 sq mm FRLS Cu with PVC Conduit)", "1 LS", "Completed"],
      ["4", "Earthing Arrangement (Earth spike & 8 SWG GI wire)", "1 LS", "Completed"],
      ["5", "LED Bulbs (20W x 2 + 9W x 1)", `${lightsCount} Nos.`, "Functional"],
      ["6", "80W Ceiling Fan (Make: CGL/Phillips/Orient/equivalent)", `${fanCount} No.`, "Functional"],
      ["7", "Smart Meter & Service Connection (Load 0.2 kW Govt Category)", "1 No.", `Meter No: ${record.smartMeterNo || "Installed"}`],
    ],
  })

  // Signatures section
  const endY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 30 : 210

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("(Signature)", 150, endY, { align: "center" })

  doc.setFont("helvetica", "bold")
  doc.text("Name of the authorized Representative of the ICDS Centre:", 22, endY + 12)
  doc.setFont("helvetica", "normal")
  doc.text(signatory, 125, endY + 12)

  doc.setFont("helvetica", "bold")
  doc.text("Mobile No / Contact No:", 22, endY + 20)
  doc.setFont("helvetica", "normal")
  doc.text(record.awwMobile || "...................................................", 125, endY + 20)

  doc.setFont("helvetica", "bold")
  doc.text("Address of the ICDS Centre:", 22, endY + 28)
  doc.setFont("helvetica", "normal")
  doc.text(awcAddress, 125, endY + 28)

  // Footer Note
  doc.setFont("helvetica", "italic")
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Reference: WBSEDCL Office Order No: EDD/49 Dated 20.08.2026 | Generated on ${new Date().toLocaleString("en-IN")}`,
    105,
    285,
    { align: "center" }
  )

  return doc
}

/**
 * Generates an Agency Progress Summary Report PDF.
 */
export function generateAgencyReportPDF(agencyMetrics: IcdsAgencyMetrics[], totalCenters: number): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("WBSEDCL - ICDS ELECTRIFICATION AGENCY PERFORMANCE REPORT", 148, 18, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Total Centers: ${totalCenters} | Generated: ${new Date().toLocaleString("en-IN")}`, 148, 24, { align: "center" })

  const tableRows = agencyMetrics.map((m, idx) => [
    idx + 1,
    m.agency,
    m.totalAllocated,
    m.inspected,
    m.bookletsReceived,
    m.workOrdersIssued,
    m.metersInstalled,
    m.equipmentInstalled,
    m.completed,
    `${m.completionRate.toFixed(1)}%`,
  ])

  autoTable(doc, {
    startY: 28,
    margin: { left: 14, right: 14 },
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    head: [
      [
        "#",
        "Agency Name",
        "Total Assigned",
        "Inspected",
        "Booklets Recv",
        "W.O. Issued",
        "Meters Done",
        "Wiring Done",
        "Certified / Done",
        "Progress %",
      ],
    ],
    body: tableRows,
  })

  return doc
}
