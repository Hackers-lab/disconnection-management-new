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

// ─────────────────────────────────────────────────────────────────────────────
// Premium Consumer Status Card (No WBSEDCL branding, quick view + photo)
// ─────────────────────────────────────────────────────────────────────────────

interface ShareConsumerResult {
  success: boolean
  method: "share" | "download"
  message?: string
}

function loadImageSafely(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || src === "#") {
      resolve(null)
      return
    }

    // Google Drive direct export link
    let cleanSrc = src.trim()
    const dMatch = cleanSrc.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || cleanSrc.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
    if (dMatch && dMatch[1]) {
      cleanSrc = `https://lh3.googleusercontent.com/d/${dMatch[1]}=s1000`
    }

    const img = new Image()
    img.crossOrigin = "anonymous"
    let retried = false

    img.onload = () => resolve(img)
    img.onerror = () => {
      if (!retried && !cleanSrc.includes("/api/image-proxy")) {
        retried = true
        img.src = `/api/image-proxy?url=${encodeURIComponent(cleanSrc)}`
      } else {
        resolve(null)
      }
    }

    img.src = cleanSrc
  })
}

function getStatusTheme(status: string) {
  const s = (status || "").toLowerCase()
  if (s === "disconnected" || s.includes("disconnect")) {
    return { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5", label: (status || "DISCONNECTED").toUpperCase() }
  }
  if (s === "paid" || s === "agency paid") {
    return { bg: "#dcfce7", text: "#15803d", border: "#86efac", label: (status || "PAID").toUpperCase() }
  }
  if (s === "reconnected" || s.includes("reconnect")) {
    return { bg: "#ecfdf5", text: "#047857", border: "#6ee7b7", label: (status || "RECONNECTED").toUpperCase() }
  }
  if (s === "visited" || s === "door locked" || s === "not found" || s.includes("lock")) {
    return { bg: "#fef3c7", text: "#b45309", border: "#fcd34d", label: (status || "VISITED").toUpperCase() }
  }
  if (s === "connected") {
    return { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd", label: "CONNECTED" }
  }
  return { bg: "#f1f5f9", text: "#334155", border: "#cbd5e1", label: (status || "UPDATED").toUpperCase() }
}

export async function shareConsumerStatusCard(
  consumer: any,
  officeCode?: string
): Promise<ShareConsumerResult> {
  if (typeof window === "undefined" || !consumer) {
    return { success: false, method: "download", message: "No consumer data" }
  }

  const rawImgUrl = consumer.imageUrl || consumer.image
  const photoImg = rawImgUrl ? await loadImageSafely(rawImgUrl) : null

  const scale = 2
  const width = 560
  const padX = 26
  const padY = 24

  const hasPhoto = Boolean(photoImg)
  const photoHeight = hasPhoto ? 340 : 0
  const photoGap = hasPhoto ? 18 : 0

  let totalHeight = padY * 2 + 104 // Header + Identity
  totalHeight += 78 // Metric cards row
  if (hasPhoto) {
    totalHeight += photoHeight + photoGap
  }
  totalHeight += 38 // Footer

  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = totalHeight * scale
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return { success: false, method: "download", message: "Canvas context not available" }
  }

  ctx.scale(scale, scale)

  // 1. Dark Modern Studio Gradient Background
  const gradientBg = ctx.createLinearGradient(0, 0, width, totalHeight)
  gradientBg.addColorStop(0, "#090d16")
  gradientBg.addColorStop(1, "#0f172a")
  ctx.fillStyle = gradientBg
  ctx.fillRect(0, 0, width, totalHeight)

  // Subtle radial glow
  const glow = ctx.createRadialGradient(width * 0.82, 36, 0, width * 0.82, 36, 220)
  glow.addColorStop(0, "rgba(59, 130, 246, 0.16)")
  glow.addColorStop(1, "rgba(59, 130, 246, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, totalHeight)

  // 2. Glassmorphic Main Card Container
  const cardX = 14
  const cardY = 14
  const cardW = width - 28
  const cardH = totalHeight - 28

  ctx.fillStyle = "rgba(15, 23, 42, 0.88)"
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, 20)
  ctx.fill()

  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)"
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, 20)
  ctx.stroke()

  const contentX = cardX + padX
  const contentW = cardW - (padX * 2)
  let curY = cardY + padY

  // 3. Header: Status Tag Pill & Date
  const statusTheme = getStatusTheme(consumer.disconStatus)
  const officeText = (officeCode || consumer.offCode || "").trim()

  ctx.font = "bold 11px system-ui, -apple-system, sans-serif"
  const statusText = statusTheme.label
  const badgeW = ctx.measureText(statusText).width + 20
  const badgeH = 26
  
  ctx.fillStyle = statusTheme.bg
  ctx.beginPath()
  ctx.roundRect(contentX, curY, badgeW, badgeH, 13)
  ctx.fill()

  ctx.strokeStyle = statusTheme.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(contentX, curY, badgeW, badgeH, 13)
  ctx.stroke()

  ctx.fillStyle = statusTheme.text
  ctx.textAlign = "center"
  ctx.fillText(statusText, contentX + (badgeW / 2), curY + 17)
  ctx.textAlign = "left"

  // Right-aligned Date
  const dateStr = consumer.disconDate || consumer.lastUpdated || new Date().toISOString().split("T")[0]
  ctx.fillStyle = "#94a3b8"
  ctx.font = "500 11px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "right"
  ctx.fillText(dateStr, contentX + contentW, curY + 17)
  ctx.textAlign = "left"

  curY += badgeH + 18

  // 4. Consumer Identity (Name & Consumer ID)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif"
  
  let displayName = consumer.name || "Consumer"
  if (ctx.measureText(displayName).width > contentW) {
    while (displayName.length > 5 && ctx.measureText(displayName + "…").width > contentW) {
      displayName = displayName.slice(0, -1)
    }
    displayName += "…"
  }
  ctx.fillText(displayName, contentX, curY)
  curY += 22

  // Consumer ID + Address Subtitle
  ctx.fillStyle = "#38bdf8"
  ctx.font = "bold 13px ui-monospace, monospace"
  const idPrefix = `ID: ${consumer.consumerId}`
  ctx.fillText(idPrefix, contentX, curY)

  if (consumer.address) {
    ctx.fillStyle = "#94a3b8"
    ctx.font = "normal 12px system-ui, -apple-system, sans-serif"
    const idW = ctx.measureText(idPrefix + "   •   ").width
    let addrText = consumer.address
    const maxAddrW = contentW - idW
    if (ctx.measureText(addrText).width > maxAddrW) {
      while (addrText.length > 5 && ctx.measureText(addrText + "…").width > maxAddrW) {
        addrText = addrText.slice(0, -1)
      }
      addrText += "…"
    }
    ctx.fillText(`   •   ${addrText}`, contentX + ctx.measureText(idPrefix).width + 6, curY)
  }

  curY += 20

  // 5. Quick Metric Cards Row
  const boxGap = 10
  const boxW = (contentW - boxGap * 2) / 3
  const boxH = 60

  const drawMetricBox = (bx: number, label: string, val: string, valColor = "#ffffff") => {
    ctx.fillStyle = "rgba(30, 41, 59, 0.7)"
    ctx.beginPath()
    ctx.roundRect(bx, curY, boxW, boxH, 12)
    ctx.fill()

    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(bx, curY, boxW, boxH, 12)
    ctx.stroke()

    ctx.fillStyle = "#94a3b8"
    ctx.font = "600 10px system-ui, -apple-system, sans-serif"
    ctx.fillText(label.toUpperCase(), bx + 12, curY + 20)

    ctx.fillStyle = valColor
    ctx.font = "bold 15px system-ui, -apple-system, sans-serif"
    ctx.fillText(val, bx + 12, curY + 42)
  }

  // Box 1: Dues / OSD
  const duesNum = Number.parseFloat(consumer.d2NetOS || "0")
  const duesText = !isNaN(duesNum) && duesNum > 0 ? `₹${Math.round(duesNum).toLocaleString()}` : "₹0"
  drawMetricBox(contentX, "Outstanding", duesText, "#f87171")

  // Box 2: Agency
  let agencyText = consumer.agency || "Assigned Team"
  if (agencyText.length > 13) agencyText = agencyText.slice(0, 11) + "…"
  drawMetricBox(contentX + boxW + boxGap, "Agency", agencyText, "#e2e8f0")

  // Box 3: MRU / Unit
  const mruText = consumer.mru || consumer.baseClass || (officeText ? `CCC ${officeText}` : "Field Unit")
  drawMetricBox(contentX + (boxW + boxGap) * 2, "MRU / Book", mruText, "#38bdf8")

  curY += boxH + 18

  // 6. Uploaded Field Photo (if available)
  if (photoImg) {
    const pX = contentX
    const pY = curY
    const pW = contentW
    const pH = photoHeight

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(pX, pY, pW, pH, 16)
    ctx.clip()

    const imgAspect = photoImg.width / photoImg.height
    const cardAspect = pW / pH

    let drawW = pW
    let drawH = pH
    let offsetX = pX
    let offsetY = pY

    if (imgAspect > cardAspect) {
      drawW = pH * imgAspect
      offsetX = pX - (drawW - pW) / 2
    } else {
      drawH = pW / imgAspect
      offsetY = pY - (drawH - pH) / 2
    }

    ctx.drawImage(photoImg, offsetX, offsetY, drawW, drawH)

    // Bottom gradient overlay for photo caption
    const photoGrad = ctx.createLinearGradient(0, pY + pH - 60, 0, pY + pH)
    photoGrad.addColorStop(0, "rgba(0, 0, 0, 0)")
    photoGrad.addColorStop(1, "rgba(0, 0, 0, 0.75)")
    ctx.fillStyle = photoGrad
    ctx.fillRect(pX, pY + pH - 60, pW, 60)

    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif"
    ctx.fillText("📷 Uploaded Verification Photo", pX + 14, pY + pH - 18)

    ctx.restore()

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(pX, pY, pW, pH, 16)
    ctx.stroke()

    curY += pH + photoGap
  }

  // 7. Minimalist Footer
  ctx.fillStyle = "#64748b"
  ctx.font = "500 11px system-ui, -apple-system, sans-serif"
  ctx.fillText("Status Verification Slip", contentX, cardY + cardH - 16)

  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  ctx.textAlign = "right"
  ctx.fillText(`Generated at ${timeStr}`, contentX + contentW, cardY + cardH - 16)
  ctx.textAlign = "left"

  // 8. Output as High Quality JPEG & Share / Download
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve({ success: false, method: "download", message: "Failed to generate image" })
        return
      }

      const fileName = `Status_${consumer.consumerId}_${consumer.disconStatus || "update"}.jpg`
      const file = new File([blob], fileName, { type: "image/jpeg" })

      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

      if (isMobile && typeof navigator.share === "function" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Consumer ${consumer.consumerId} - ${consumer.disconStatus}`,
            text: `Consumer: ${consumer.consumerId} (${consumer.name}) | Status: ${consumer.disconStatus}`,
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

      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)

      resolve({ success: true, method: "download" })
    }, "image/jpeg", 0.92)
  })
}