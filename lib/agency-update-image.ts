export interface AgencyUpdateItem {
  name: string
  lastUpdate: string
  lastUpdateCount: number
}

function parseDateHelper(dateStr: string): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split(/[-/]/)
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10)
    let month = parseInt(parts[1], 10) - 1
    let year = parseInt(parts[2], 10)
    if (year < 100) year += 2000
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day)
    }
  }
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

export async function generateAndShareAgencyUpdatesJPEG(
  agencyList: AgencyUpdateItem[],
  cccCode: string = "CCC"
): Promise<{ success: boolean; method: "share" | "download"; message?: string }> {
  if (typeof window === "undefined" || !agencyList || agencyList.length === 0) {
    return { success: false, method: "download", message: "No data available to share" }
  }

  const sorted = [...agencyList].sort((a, b) => {
    const dateA = parseDateHelper(a.lastUpdate) || new Date(0)
    const dateB = parseDateHelper(b.lastUpdate) || new Date(0)
    if (dateB.getTime() !== dateA.getTime()) {
      return dateB.getTime() - dateA.getTime()
    }
    return (b.lastUpdateCount || 0) - (a.lastUpdateCount || 0)
  })

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const threeDaysAgo = todayStart - 3 * 24 * 60 * 60 * 1000

  let countToday = 0
  let countThisWeek = 0
  let countInactive = 0

  sorted.forEach(ag => {
    const d = parseDateHelper(ag.lastUpdate)
    if (!d || d.getTime() === 0) {
      countInactive++
    } else if (d.getTime() >= todayStart) {
      countToday++
    } else if (d.getTime() >= threeDaysAgo) {
      countThisWeek++
    } else {
      countInactive++
    }
  })

  const scale = 2
  const width = 760
  const rowHeight = 44
  const headerHeight = 180
  const summaryHeight = 60
  const footerHeight = 50
  const totalHeight = headerHeight + summaryHeight + (sorted.length * rowHeight) + footerHeight

  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = totalHeight * scale
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return { success: false, method: "download", message: "Canvas context not available" }
  }

  ctx.scale(scale, scale)

  // 1. Background
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, totalHeight)

  // 2. Header Gradient Banner
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, "#0f172a")
  gradient.addColorStop(1, "#1e3a8a")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, headerHeight - 20)

  // Header Title
  ctx.fillStyle = "#93c5fd"
  ctx.font = "bold 12px sans-serif"
  ctx.fillText("WBSEDCL - DISCONNECTION MANAGEMENT SYSTEM", 32, 38)

  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 24px sans-serif"
  ctx.fillText("AGENCY LAST UPDATES REPORT", 32, 72)

  const todayFormatted = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  })
  const timeFormatted = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  })

  ctx.fillStyle = "#cbd5e1"
  ctx.font = "500 13px sans-serif"
  ctx.fillText(`OFFICE: ${cccCode.toUpperCase()} CCC`, 32, 102)
  ctx.fillText(`REPORT AS OF: ${todayFormatted}, ${timeFormatted}`, 32, 122)

  // Total Agencies badge
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)"
  ctx.beginPath()
  ctx.roundRect(width - 170, 45, 138, 70, 12)
  ctx.fill()

  ctx.fillStyle = "#93c5fd"
  ctx.font = "600 11px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("TOTAL AGENCIES", width - 101, 70)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 26px sans-serif"
  ctx.fillText(String(sorted.length), width - 101, 100)
  ctx.textAlign = "left"

  // 3. Summary KPI Chips
  const chipY = headerHeight - 10
  const chipWidth = (width - 64 - 24) / 3

  drawKPIChip(ctx, 32, chipY, chipWidth, 48, "#ecfdf5", "#059669", "Updated Today", `${countToday} Agencies`)
  drawKPIChip(ctx, 32 + chipWidth + 12, chipY, chipWidth, 48, "#fffbeb", "#d97706", "Recent (1-3 Days)", `${countThisWeek} Agencies`)
  drawKPIChip(ctx, 32 + (chipWidth + 12) * 2, chipY, chipWidth, 48, "#fef2f2", "#dc2626", "Inactive / None", `${countInactive} Agencies`)

  // 4. Table Header
  const tableHeaderY = headerHeight + summaryHeight + 10
  ctx.fillStyle = "#f1f5f9"
  ctx.fillRect(32, tableHeaderY, width - 64, 30)

  ctx.fillStyle = "#475569"
  ctx.font = "bold 11px sans-serif"
  ctx.fillText("NO.", 44, tableHeaderY + 19)
  ctx.fillText("AGENCY NAME", 84, tableHeaderY + 19)
  ctx.fillText("LAST UPDATED", width - 290, tableHeaderY + 19)
  ctx.fillText("DISCONNECTIONS", width - 150, tableHeaderY + 19)

  // 5. Agency Rows
  let currentY = tableHeaderY + 30
  sorted.forEach((agency, index) => {
    const isEven = index % 2 === 0
    ctx.fillStyle = isEven ? "#ffffff" : "#f8fafc"
    ctx.fillRect(32, currentY, width - 64, rowHeight)

    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(32, currentY + rowHeight)
    ctx.lineTo(width - 32, currentY + rowHeight)
    ctx.stroke()

    const d = parseDateHelper(agency.lastUpdate)
    let dotColor = "#94a3b8"
    let statusBg = "#f1f5f9"
    let statusTextColor = "#475569"

    if (!d || d.getTime() === 0) {
      dotColor = "#ef4444"
      statusBg = "#fee2e2"
      statusTextColor = "#991b1b"
    } else if (d.getTime() >= todayStart) {
      dotColor = "#10b981"
      statusBg = "#d1fae5"
      statusTextColor = "#065f46"
    } else if (d.getTime() >= threeDaysAgo) {
      dotColor = "#f59e0b"
      statusBg = "#fef3c7"
      statusTextColor = "#92400e"
    } else {
      dotColor = "#ef4444"
      statusBg = "#fee2e2"
      statusTextColor = "#991b1b"
    }

    ctx.fillStyle = "#64748b"
    ctx.font = "600 12px sans-serif"
    ctx.fillText(`${index + 1}.`, 44, currentY + 27)

    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(88, currentY + 22, 4.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#0f172a"
    ctx.font = "bold 13px sans-serif"
    ctx.fillText(agency.name, 102, currentY + 27)

    ctx.fillStyle = "#334155"
    ctx.font = "500 12px sans-serif"
    ctx.fillText(agency.lastUpdate || "No updates", width - 290, currentY + 27)

    const count = agency.lastUpdateCount || 0
    if (agency.lastUpdate && count > 0) {
      const badgeText = `${count} done`
      ctx.font = "bold 11px sans-serif"
      const textWidth = ctx.measureText(badgeText).width
      const badgeWidth = textWidth + 16
      const badgeHeight = 22
      const badgeX = width - 150
      const badgeY = currentY + 11

      ctx.fillStyle = statusBg
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 11)
      ctx.fill()

      ctx.fillStyle = statusTextColor
      ctx.fillText(badgeText, badgeX + 8, badgeY + 15)
    } else {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "500 12px sans-serif"
      ctx.fillText("-", width - 130, currentY + 27)
    }

    currentY += rowHeight
  })

  // 6. Footer
  ctx.fillStyle = "#f8fafc"
  ctx.fillRect(0, totalHeight - footerHeight, width, footerHeight)
  ctx.strokeStyle = "#e2e8f0"
  ctx.beginPath()
  ctx.moveTo(0, totalHeight - footerHeight)
  ctx.lineTo(width, totalHeight - footerHeight)
  ctx.stroke()

  ctx.fillStyle = "#64748b"
  ctx.font = "500 11px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("Generated from Disconnection Management System - Official Field Monitoring Report", width / 2, totalHeight - 20)
  ctx.textAlign = "left"

  // 7. Convert Canvas to JPEG Blob
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve({ success: false, method: "download", message: "Failed to create image blob" })
        return
      }

      const fileName = `Agency_Updates_${cccCode}_${now.toISOString().split("T")[0]}.jpg`
      const file = new File([blob], fileName, { type: "image/jpeg" })

      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Agency Updates - ${cccCode.toUpperCase()}`,
            text: `Agency Last Updates Report (${cccCode.toUpperCase()} CCC) - ${todayFormatted}`,
          })
          resolve({ success: true, method: "share" })
          return
        } catch (err: any) {
          if (err?.name === "AbortError") {
            resolve({ success: true, method: "share", message: "Share cancelled" })
            return
          }
          console.warn("Web Share failed, falling back to download:", err)
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const summaryText = encodeURIComponent(
        `*Agency Last Updates Report (${cccCode.toUpperCase()} CCC)*\n` +
        `Date: ${todayFormatted}\n\n` +
        `Updated Today: ${countToday}\n` +
        `Recent (1-3 Days): ${countThisWeek}\n` +
        `Inactive/None: ${countInactive}\n\n` +
        `Report image has been downloaded to attach in chat.`
      )
      window.open(`https://api.whatsapp.com/send?text=${summaryText}`, "_blank")

      resolve({ success: true, method: "download" })
    }, "image/jpeg", 0.95)
  })
}

function drawKPIChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: string,
  accentColor: string,
  title: string,
  value: string
) {
  ctx.fillStyle = bgColor
  ctx.strokeStyle = accentColor + "33"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 10)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = "#64748b"
  ctx.font = "600 10px sans-serif"
  ctx.fillText(title, x + 12, y + 18)

  ctx.fillStyle = accentColor
  ctx.font = "bold 13px sans-serif"
  ctx.fillText(value, x + 12, y + 36)
}