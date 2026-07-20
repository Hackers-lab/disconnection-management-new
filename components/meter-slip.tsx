"use client"

import type { MeterIssue } from "@/lib/meter-types"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "Faulty/Defective Replacement",
  burnt_replacement:  "Burnt Meter Replacement",
  slow_fast:          "Slow/Fast Meter",
  nsc:                "New Service Connection",
}

export function printMeterSlip(issues: MeterIssue[]) {
  const win = window.open("", "_blank")
  if (!win) { alert("Pop-up blocked. Please allow pop-ups."); return }

  const rows = issues.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${item.issueId}</strong></td>
      <td>${item.issueDate}</td>
      <td>${item.consumerId || item.nscReceiveNo || "—"}</td>
      <td>${item.consumerName || "—"}</td>
      <td><strong>${item.serialNo}</strong></td>
      <td>${item.meterType}</td>
      <td>${PURPOSE_LABELS[item.purpose] || item.purpose}</td>
      <td>${item.agency}</td>
    </tr>
  `).join("")

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Meter Requisition Slip</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; padding: 24px; font-size: 11px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px; }
        .header h1 { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
        .header h2 { font-size: 11px; color: #555; margin-top: 4px; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 10px; color: #444; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #000; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
        td { border-bottom: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
        tr:nth-child(even) td { background: #f9f9f9; }
        .footer { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 16px; border-top: 1px solid #ccc; }
        .sign-box { text-align: center; }
        .sign-line { width: 160px; border-top: 1px solid #000; margin: 40px auto 4px; }
        .note { background: #fff8e1; border: 1px solid #ffc107; padding: 8px 12px; font-size: 10px; margin-bottom: 16px; border-radius: 4px; }
        @media print { @page { size: A4 landscape; margin: 10mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Meter Requisition Slip</h1>
        <h2>Generated: ${new Date().toLocaleString("en-IN")}</h2>
      </div>
      <div class="meta">
        <span><strong>Total Meters:</strong> ${issues.length}</span>
        <span><strong>Slip Date:</strong> ${new Date().toLocaleDateString("en-IN")}</span>
      </div>
      <div class="note">
        ⚠ This slip must be presented to the Store / Security for meter issue. One slip per requisition. Retain this copy.
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Issue ID</th>
            <th>Date</th>
            <th>Consumer / NSC No</th>
            <th>Name</th>
            <th>Serial No</th>
            <th>Meter Type</th>
            <th>Purpose</th>
            <th>Agency</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">
        <div class="sign-box">
          <div class="sign-line"></div>
          <div>Issued By (Store)</div>
        </div>
        <div class="sign-box">
          <div class="sign-line"></div>
          <div>Received By (Agency)</div>
        </div>
        <div class="sign-box">
          <div class="sign-line"></div>
          <div>Authorised Signatory</div>
        </div>
      </div>
      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}
