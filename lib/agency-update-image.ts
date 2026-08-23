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

  // Sort agencies: latest date first, then highest count
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
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const beforeYesterdayStart = todayStart - 48 * 60 * 60 * 1000

  // Dimensions: Reduced width (560px) and taller rows (54px) for bold readability
  const scale = 2
  const width = 560
  const rowHeight = 54
  const headerHeight = 135
  const tableHeaderHeight = 36
  const footerHeight = 44
  const totalHeight = headerHeight + tableHeaderHeight + (sorted.length * rowHeight) + footerHeight

  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = totalHeight * scale
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return { success: false, method: "download", message: "Canvas context not available" }
  }

  ctx.scale(scale, scale)

  // 1. White Canvas Background
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, totalHeight)

  // 2. Header Banner (Deep Navy Gradient)
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, "#0b132b")
  gradient.addColorStop(1, "#1c2541")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, headerHeight)

  // Top Small Tracker Label
  ctx.fillStyle = "#60a5fa"
  ctx.font = "bold 11px sans-serif"
  ctx.fillText("DISCONNECTION MANAGEMENT", 24, 28)

  // Large Bold Title
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 22px sans-serif"
  ctx.fillText("AGENCY LAST UPDATES", 24, 58)

  // Subtitle / Office details
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

  ctx.fillStyle = "#94a3b8"
  ctx.font = "600 12px sans-serif"
  ctx.fillText(`OFFICE: ${cccCode.toUpperCase()} CCC`, 24, 86)
  ctx.fillText(`AS OF: ${todayFormatted}, ${timeFormatted}`, 24, 106)

  // Right Total Count Badge in Header
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)"
  ctx.beginPath()
  ctx.roundRect(width - 134, 30, 110, 68, 12)
  ctx.fill()

  ctx.fillStyle = "#93c5fd"
  ctx.font = "600 10px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("TOTAL AGENCIES", width - 79, 52)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 26px sans-serif"
  ctx.fillText(String(sorted.length), width - 79, 82)
  ctx.textAlign = "left"

  // 3. Table Header
  const tableHeaderY = headerHeight
  ctx.fillStyle = "#0f172a"
  ctx.fillRect(0, tableHeaderY, width, tableHeaderHeight)

  ctx.fillStyle = "#f8fafc"
  ctx.font = "bold 11px sans-serif"
  ctx.fillText("#", 20, tableHeaderY + 22)
  ctx.fillText("AGENCY NAME", 48, tableHeaderY + 22)
  ctx.fillText("LAST UPDATE", width - 210, tableHeaderY + 22)
  ctx.fillText("UPDATES", width - 85, tableHeaderY + 22)

  // 4. Agency Rows
  let currentY = tableHeaderY + tableHeaderHeight

  sorted.forEach((agency, index) => {
    const isEven = index % 2 === 0
    ctx.fillStyle = isEven ? "#ffffff" : "#f8fafc"
    ctx.fillRect(0, currentY, width, rowHeight)

    // Bottom border
    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(16, currentY + rowHeight)
    ctx.lineTo(width - 16, currentY + rowHeight)
    ctx.stroke()

    // Determine status & color coding (Today, Yesterday, Before Yesterday, Older/None)
    const d = parseDateHelper(agency.lastUpdate)
    let dotColor = "#94a3b8"
    let statusBg = "#f1f5f9"
    let statusTextColor = "#475569"
    let statusLabel = agency.lastUpdate || "No updates"

    if (!d || d.getTime() === 0) {
      dotColor = "#ef4444"
      statusBg = "#fee2e2"
      statusTextColor = "#991b1b"
      statusLabel = "No updates"
    } else if (d.getTime() >= todayStart) {
      // TODAY -> Green
      dotColor = "#10b981"
      statusBg = "#d1fae5"
      statusTextColor = "#065f46"
    } else if (d.getTime() >= yesterdayStart) {
      // YESTERDAY -> Blue
      dotColor = "#3b82f6"
      statusBg = "#dbeafe"
      statusTextColor = "#1e40af"
    } else if (d.getTime() >= beforeYesterdayStart) {
      // 2 DAYS AGO -> Amber
      dotColor = "#f59e0b"
      statusBg = "#fef3c7"
      statusTextColor = "#92400e"
    } else {
      // OLDER -> Red / Slate
      dotColor = "#ef4444"
      statusBg = "#fee2e2"
      statusTextColor = "#991b1b"
    }

    // Index Number
    ctx.fillStyle = "#64748b"
    ctx.font = "bold 13px sans-serif"
    ctx.fillText(`${index + 1}`, 20, currentY + 33)

    // Status Dot (Accent)
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(42, currentY + 28, 4.5, 0, Math.PI * 2)
    ctx.fill()

    // Agency Name (Larger font: 15px bold)
    ctx.fillStyle = "#0f172a"
    ctx.font = "bold 15px sans-serif"
    const truncatedName = agency.name.length > 20 ? agency.name.slice(0, 19) + "…" : agency.name
    ctx.fillText(truncatedName, 54, currentY + 33)

    // Last Update Date (13px medium)
    ctx.fillStyle = "#334155"
    ctx.font = "600 13px sans-serif"
    ctx.fillText(statusLabel, width - 210, currentY + 33)

    // Updates Count Badge (Only count number, larger bold font)
    const count = agency.lastUpdateCount || 0
    if (agency.lastUpdate && count > 0) {
      const badgeText = String(count)
      ctx.font = "bold 13px sans-serif"
      const textWidth = ctx.measureText(badgeText).width
      const badgeWidth = Math.max(textWidth + 18, 36)
      const badgeHeight = 24
      const badgeX = width - 85
      const badgeY = currentY + 15

      ctx.fillStyle = statusBg
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 12)
      ctx.fill()

      ctx.fillStyle = statusTextColor
      ctx.textAlign = "center"
      ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + 17)
      ctx.textAlign = "left"
    } else {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "bold 14px sans-serif"
      ctx.fillText("-", width - 70, currentY + 33)
    }

    currentY += rowHeight
  })

  // 5. Footer Bar
  ctx.fillStyle = "#f8fafc"
  ctx.fillRect(0, totalHeight - footerHeight, width, footerHeight)
  ctx.strokeStyle = "#e2e8f0"
  ctx.beginPath()
  ctx.moveTo(0, totalHeight - footerHeight)
  ctx.lineTo(width, totalHeight - footerHeight)
  ctx.stroke()

  ctx.fillStyle = "#64748b"
  ctx.font = "600 11px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("Disconnection Management System • Field Status Report", width / 2, totalHeight - 18)
  ctx.textAlign = "left"

  // 6. Output to Blob and Trigger Native Share or Clean Download
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve({ success: false, method: "download", message: "Failed to create image blob" })
        return
      }

      const fileName = `Agency_Updates_${cccCode}_${now.toISOString().split("T")[0]}.jpg`
      const file = new File([blob], fileName, { type: "image/jpeg" })

      // If Web Share with files is supported (Mobile Chrome, Safari iOS, etc.)
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
          console.warn("Native Web Share failed, falling back to download:", err)
        }
      }

      // Desktop Fallback: Trigger direct JPEG download without opening blank windows
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      resolve({ success: true, method: "download" })
    }, "image/jpeg", 0.95)
  })
}