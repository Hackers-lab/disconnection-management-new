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

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  // Aesthetic Portrait Canvas Layout
  const scale = 2
  const width = 580
  const paddingX = 24
  const paddingY = 24
  const headerHeight = 84
  const tableHeaderHeight = 32
  const rowHeight = 46
  const rowGap = 5
  const footerHeight = 36
  const totalRowsHeight = sorted.length * (rowHeight + rowGap)
  const totalHeight = paddingY * 2 + headerHeight + tableHeaderHeight + totalRowsHeight + footerHeight

  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = totalHeight * scale
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return { success: false, method: "download", message: "Canvas context not available" }
  }

  ctx.scale(scale, scale)

  // 1. Background (Subtle Modern Studio Gray)
  ctx.fillStyle = "#f8fafc"
  ctx.fillRect(0, 0, width, totalHeight)

  // 2. Floating Main Card Container
  const cardX = 14
  const cardY = 14
  const cardWidth = width - 28
  const cardHeight = totalHeight - 28

  // Card Outer Shadow
  ctx.shadowColor = "rgba(15, 23, 42, 0.06)"
  ctx.shadowBlur = 16
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 4

  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 18)
  ctx.fill()

  // Card Border
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 18)
  ctx.stroke()

  // 3. Aesthetic Minimalist Header
  const contentX = cardX + paddingX
  const contentWidth = cardWidth - (paddingX * 2)
  const headerCenterY = cardY + 38

  // Centered Title
  ctx.fillStyle = "#0f172a"
  ctx.font = "bold 19px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("AGENCY LAST UPDATES", width / 2, headerCenterY)

  // Office Badge below title
  const officeText = `${cccCode.toUpperCase()} CCC`
  ctx.font = "600 11px system-ui, -apple-system, sans-serif"
  const badgeWidth = ctx.measureText(officeText).width + 18
  const badgeHeight = 22
  const badgeX = (width - badgeWidth) / 2
  const badgeY = headerCenterY + 12

  ctx.fillStyle = "#f1f5f9"
  ctx.beginPath()
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 11)
  ctx.fill()
  ctx.strokeStyle = "#e2e8f0"
  ctx.stroke()

  ctx.fillStyle = "#475569"
  ctx.fillText(officeText, width / 2, badgeY + 15)

  // Subtle Header Divider
  const dividerY = cardY + headerHeight + 10
  ctx.strokeStyle = "#f1f5f9"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(contentX, dividerY)
  ctx.lineTo(contentX + contentWidth, dividerY)
  ctx.stroke()

  // 4. Table Header (Minimalist & Clean)
  const tableHeaderY = dividerY + 6
  ctx.fillStyle = "#94a3b8"
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "left"
  ctx.fillText("#", contentX + 10, tableHeaderY + 18)
  ctx.fillText("AGENCY", contentX + 38, tableHeaderY + 18)
  ctx.fillText("LAST UPDATE", contentX + contentWidth - 170, tableHeaderY + 18)
  ctx.fillText("UPDATES", contentX + contentWidth - 62, tableHeaderY + 18)

  // 5. Agency Rows (Floating Soft Pills with Aesthetic Color Codes)
  let currentY = tableHeaderY + tableHeaderHeight

  sorted.forEach((agency, index) => {
    const d = parseDateHelper(agency.lastUpdate)
    let rowBg = "#f8fafc"
    let rowBorder = "#f1f5f9"
    let dotColor = "#94a3b8"
    let badgeBg = "#f1f5f9"
    let badgeBorder = "#e2e8f0"
    let badgeTextColor = "#475569"
    let dateText = agency.lastUpdate || "No updates"

    if (!d || !agency.lastUpdate) {
      // Gray (No updates)
      rowBg = "#ffffff"
      rowBorder = "#f1f5f9"
      dotColor = "#cbd5e1"
      badgeBg = "#f8fafc"
      badgeBorder = "#e2e8f0"
      badgeTextColor = "#94a3b8"
    } else if (sameDay(d, today)) {
      // Soft Mint Green (Today)
      rowBg = "#f0fdf4"
      rowBorder = "#bbf7d0"
      dotColor = "#16a34a"
      badgeBg = "#dcfce7"
      badgeBorder = "#86efac"
      badgeTextColor = "#15803d"
    } else if (sameDay(d, yesterday)) {
      // Soft Warm Yellow/Amber (Yesterday)
      rowBg = "#fefce8"
      rowBorder = "#fef08a"
      dotColor = "#ca8a04"
      badgeBg = "#fef9c3"
      badgeBorder = "#fde047"
      badgeTextColor = "#a16207"
    } else {
      // Soft Rose Red (Older)
      rowBg = "#fff1f2"
      rowBorder = "#fecdd3"
      dotColor = "#e11d48"
      badgeBg = "#ffe4e6"
      badgeBorder = "#fda4af"
      badgeTextColor = "#be123c"
    }

    // Row Pill Box
    ctx.fillStyle = rowBg
    ctx.beginPath()
    ctx.roundRect(contentX, currentY, contentWidth, rowHeight, 10)
    ctx.fill()

    ctx.strokeStyle = rowBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(contentX, currentY, contentWidth, rowHeight, 10)
    ctx.stroke()

    // Index Number
    ctx.fillStyle = "#94a3b8"
    ctx.font = "600 11px system-ui, -apple-system, sans-serif"
    ctx.textAlign = "left"
    ctx.fillText(String(index + 1), contentX + 10, currentY + 27)

    // Status Indicator Dot
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(contentX + 32, currentY + 23, 4, 0, Math.PI * 2)
    ctx.fill()

    // Agency Name (Bold Slate 900)
    ctx.fillStyle = "#0f172a"
    ctx.font = "bold 13.5px system-ui, -apple-system, sans-serif"
    const truncatedName = agency.name.length > 22 ? agency.name.slice(0, 21) + "…" : agency.name
    ctx.fillText(truncatedName, contentX + 44, currentY + 28)

    // Last Update Date (Medium Slate 700)
    ctx.fillStyle = "#334155"
    ctx.font = "600 12px system-ui, -apple-system, sans-serif"
    ctx.fillText(dateText, contentX + contentWidth - 170, currentY + 28)

    // Updates Pill Badge (Only number count)
    const count = agency.lastUpdateCount || 0
    if (agency.lastUpdate && count > 0) {
      const countText = String(count)
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif"
      const textW = ctx.measureText(countText).width
      const pWidth = Math.max(textW + 16, 32)
      const pHeight = 22
      const pX = contentX + contentWidth - 62
      const pY = currentY + 12

      ctx.fillStyle = badgeBg
      ctx.beginPath()
      ctx.roundRect(pX, pY, pWidth, pHeight, 11)
      ctx.fill()

      ctx.strokeStyle = badgeBorder
      ctx.stroke()

      ctx.fillStyle = badgeTextColor
      ctx.textAlign = "center"
      ctx.fillText(countText, pX + pWidth / 2, pY + 15)
      ctx.textAlign = "left"
    } else {
      ctx.fillStyle = "#cbd5e1"
      ctx.font = "bold 13px system-ui, -apple-system, sans-serif"
      ctx.fillText("-", contentX + contentWidth - 48, currentY + 28)
    }

    currentY += rowHeight + rowGap
  })

  // 6. Aesthetic Minimalist Footer
  const footerY = cardY + cardHeight - 20
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

  // Left Tag
  ctx.fillStyle = "#94a3b8"
  ctx.font = "500 10px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "left"
  ctx.fillText("Disconnection Management", contentX, footerY)

  // Right Date Timestamp
  ctx.textAlign = "right"
  ctx.fillText(`${todayFormatted}, ${timeFormatted}`, contentX + contentWidth, footerY)
  ctx.textAlign = "left"

  // 7. Render High Quality JPEG Blob
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve({ success: false, method: "download", message: "Failed to create image blob" })
        return
      }

      const fileName = `Agency_Updates_${cccCode}_${now.toISOString().split("T")[0]}.jpg`
      const file = new File([blob], fileName, { type: "image/jpeg" })

      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

      // Mobile: Native Web Share
      if (isMobile && typeof navigator.share === "function" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Agency Updates - ${cccCode.toUpperCase()}`,
            text: `Agency Last Updates (${cccCode.toUpperCase()} CCC) - ${todayFormatted}`,
          })
          resolve({ success: true, method: "share" })
          return
        } catch (err: any) {
          if (err?.name === "AbortError") {
            resolve({ success: true, method: "share" })
            return
          }
        }
      }

      // Desktop: Instant clean file download
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      resolve({ success: true, method: "download" })
    }, "image/jpeg", 0.96)
  })
}