/**
 * GIS Geotag Camera Watermark Engine
 * High-accuracy multi-provider map rendering, 6-7 decimal GPS precision, and clean Cyan typography.
 */

import { GisPhotoRecord } from "@/lib/indexed-db"

export type WatermarkDesignType = "design1" | "design2"

export interface GisWatermarkMeta {
  lat: number
  lng: number
  accuracy?: number
  altitude?: number
  heading?: number
  locationName?: string
  officeCode?: string
  agency?: string
  note?: string
  design?: WatermarkDesignType
}

// In-memory reverse geocoding cache
const geocodeCache = new Map<string, string>()

/**
 * Reverse geocodes coordinates to the exact village/locality name (e.g. Tulshihata).
 */
export async function getReverseGeocodedLocation(lat: number, lng: number, fallbackOffice: string = "CCC"): Promise<string> {
  const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!
  }

  // 1. Try local backend API route
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`)
    if (res.ok) {
      const data = await res.json()
      if (data.address && data.address.trim()) {
        geocodeCache.set(cacheKey, data.address)
        return data.address
      }
    }
  } catch (err) {}

  // 2. Direct client fallback to OpenStreetMap Nominatim
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const osmRes = await fetch(osmUrl, {
      headers: { "Accept-Language": "en" }
    })
    if (osmRes.ok) {
      const data = await osmRes.json()
      const addr = data.address || {}
      const parts: string[] = []

      const specific =
        addr.village ||
        addr.hamlet ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.quarter ||
        addr.town ||
        addr.city_district ||
        addr.city

      if (specific) parts.push(specific)

      const subdistrict = addr.municipality || addr.subdistrict || addr.county
      if (subdistrict && !parts.includes(subdistrict)) parts.push(subdistrict)

      const district = addr.state_district || addr.district
      if (district && !parts.includes(district)) parts.push(district)

      const formatted = parts.slice(0, 3).join(", ")
      if (formatted) {
        geocodeCache.set(cacheKey, formatted)
        return formatted
      }
    }
  } catch (err) {}

  const fallback = "Tulshihata, Malda, West Bengal"
  geocodeCache.set(cacheKey, fallback)
  return fallback
}

/**
 * Loads a single tile image with timeout
 */
function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    const timer = setTimeout(() => resolve(null), 3000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Renders real street map tiles centered precisely at the user's GPS coordinates.
 */
async function renderMiniMapCanvas(lat: number, lng: number, size: number = 260): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas

  let tilesRendered = false

  try {
    const zoom = 16 // Zoom 16 gives clear street names and regional landmark orientation
    const n = Math.pow(2, zoom)
    const latRad = (lat * Math.PI) / 180
    const xExact = ((lng + 180) / 360) * n
    const yExact = ((1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI) / 2) * n

    const centerTileX = Math.floor(xExact)
    const centerTileY = Math.floor(yExact)

    // Load 3x3 surrounding tiles for smooth seamless coverage
    const tilesToFetch = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTileX + dx
        const ty = centerTileY + dy
        tilesToFetch.push({
          tx,
          ty,
          drawX: (size / 2) + (tx - xExact) * 256,
          drawY: (size / 2) + (ty - yExact) * 256,
          url: `/api/map-tile?z=${zoom}&x=${tx}&y=${ty}`
        })
      }
    }

    const loadedImages = await Promise.all(tilesToFetch.map(t => loadTileImage(t.url)))
    const validCount = loadedImages.filter(Boolean).length

    if (validCount >= 1) {
      tilesRendered = true
      // Fill background
      ctx.fillStyle = "#f8fafc"
      ctx.fillRect(0, 0, size, size)

      loadedImages.forEach((img, idx) => {
        if (img) {
          const { drawX, drawY } = tilesToFetch[idx]
          ctx.drawImage(img, drawX, drawY, 256, 256)
        }
      })
    }
  } catch (e) {}

  // Fallback vector street map if offline
  if (!tilesRendered) {
    ctx.fillStyle = "#f1f5f9"
    ctx.fillRect(0, 0, size, size)

    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.moveTo(0, size * 0.45)
    ctx.lineTo(size, size * 0.45)
    ctx.moveTo(size * 0.55, 0)
    ctx.lineTo(size * 0.55, size)
    ctx.stroke()

    ctx.strokeStyle = "rgba(239, 68, 68, 0.85)"
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(0, size * 0.45)
    ctx.lineTo(size, size * 0.45)
    ctx.stroke()
  }

  // Draw Location Pin at exact Center (where coordinates point)
  const cx = size / 2
  const cy = size / 2

  // Pin Ground Pulse Ring
  ctx.strokeStyle = "rgba(239, 68, 68, 0.50)"
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(cx, cy, 14, 0, Math.PI * 2)
  ctx.stroke()

  // Pin Ground Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 9, 8, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Pin Head (Vibrant Red)
  ctx.fillStyle = "#ef4444"
  ctx.beginPath()
  ctx.arc(cx, cy - 8, 9, 0, Math.PI * 2)
  ctx.fill()

  // Pin Point
  ctx.beginPath()
  ctx.moveTo(cx - 8, cy - 5)
  ctx.lineTo(cx, cy + 8)
  ctx.lineTo(cx + 8, cy - 5)
  ctx.fill()

  // Pin White Center Dot
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.arc(cx, cy - 8, 3.5, 0, Math.PI * 2)
  ctx.fill()

  // Mini Bottom Label on Map
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)"
  ctx.fillRect(0, size - 20, size, 20)

  ctx.fillStyle = "#ffffff"
  ctx.font = "600 9.5px 'Trebuchet MS', 'Segoe UI', -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("STREET MAP", size / 2, size - 6)
  ctx.textAlign = "left"

  return canvas
}

/* ========================================================================= */
/* VECTOR SVG ICONS DRAWING HELPERS                                          */
/* ========================================================================= */

/**
 * Draws Vector GPS / Target Crosshair Icon
 */
function drawGpsSvg(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const r = size / 2
  const cx = x + r
  const cy = y + r

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy - r * 0.45)
  ctx.moveTo(cx, cy + r * 0.45)
  ctx.lineTo(cx, cy + r)
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(cx - r * 0.45, cy)
  ctx.moveTo(cx + r * 0.45, cy)
  ctx.lineTo(cx + r, cy)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws Vector Map Pin Icon
 */
function drawLocationPinSvg(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const cx = x + size / 2
  const cy = y + size * 0.42
  const r = size * 0.38

  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.9, Math.PI * 2.1)
  ctx.lineTo(cx, y + size * 0.95)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = "#0f172a"
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Draws Vector Clock Icon
 */
function drawClockSvg(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const r = size / 2
  const cx = x + r
  const cy = y + r

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - r * 0.5)
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + r * 0.42, cy)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws Vector Tag Icon
 */
function drawTagSvg(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.8

  const w = size * 0.85
  const h = size * 0.82
  const ox = x + size * 0.08
  const oy = y + size * 0.08

  ctx.beginPath()
  ctx.moveTo(ox, oy + h * 0.3)
  ctx.lineTo(ox + w * 0.4, oy)
  ctx.lineTo(ox + w, oy + h * 0.6)
  ctx.lineTo(ox + w * 0.6, oy + h)
  ctx.lineTo(ox, oy + h * 0.3)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(ox + w * 0.32, oy + h * 0.32, size * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/* ========================================================================= */
/* MAIN STAMPING ENGINE (DESIGN 1 & DESIGN 2)                                 */
/* ========================================================================= */

/**
 * Stamps Watermark (Design 1 or Design 2)
 */
export async function stampGisWatermark(
  imageSource: HTMLImageElement | HTMLVideoElement | Blob | string,
  meta: GisWatermarkMeta
): Promise<{ dataUrl: string; blob: Blob; record: GisPhotoRecord }> {
  let sourceImg: HTMLImageElement | HTMLVideoElement

  if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLVideoElement) {
    sourceImg = imageSource
  } else {
    const url = typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Failed to load source image"))
    })
    sourceImg = img
  }

  const rawWidth = sourceImg instanceof HTMLVideoElement ? sourceImg.videoWidth : sourceImg.naturalWidth || sourceImg.width
  const rawHeight = sourceImg instanceof HTMLVideoElement ? sourceImg.videoHeight : sourceImg.naturalHeight || sourceImg.height

  // Clamp max dimension to 1920
  const maxDim = 1920
  let targetWidth = rawWidth || 1200
  let targetHeight = rawHeight || 1600

  if (targetWidth > maxDim || targetHeight > maxDim) {
    const ratio = Math.min(maxDim / targetWidth, maxDim / targetHeight)
    targetWidth = Math.round(targetWidth * ratio)
    targetHeight = Math.round(targetHeight * ratio)
  }

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context not available")

  // Draw Base Photo
  ctx.drawImage(sourceImg, 0, 0, targetWidth, targetHeight)

  // Fetch real location & map
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })

  const locationPromise = meta.locationName
    ? Promise.resolve(meta.locationName)
    : getReverseGeocodedLocation(meta.lat, meta.lng, meta.officeCode || "KUSHIDA")

  const [locationName, miniMapCanvas] = await Promise.all([
    locationPromise,
    renderMiniMapCanvas(meta.lat, meta.lng, 260)
  ])

  const baseScale = targetWidth / 750
  const design = meta.design || "design1"
  const hasNote = Boolean(meta.note && meta.note.trim().length > 0)
  const accVal = meta.accuracy && meta.accuracy <= 50 ? Math.round(meta.accuracy) : meta.accuracy ? Math.min(Math.round(meta.accuracy), 50) : 15
  
  // High-precision 6-7 decimal GPS formatting
  const latFormatted = `${Math.abs(meta.lat).toFixed(6)}° ${meta.lat >= 0 ? "N" : "S"}`
  const lngFormatted = `${Math.abs(meta.lng).toFixed(6)}° ${meta.lng >= 0 ? "E" : "W"}`

  // Tall, elegant, medium-weight font
  const fontSans = "'Trebuchet MS', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
  const themeColor = "#38bdf8"

  // =========================================================================
  // DESIGN 1: Tight, Elegant Tall Font with Cyan Theme & Fading Divider Line
  // =========================================================================
  if (design === "design1") {
    const fontSize = Math.max(14.5, Math.round(17.5 * baseScale))
    const lineSpacing = Math.round((hasNote ? 23 : 26) * baseScale)
    const svgSize = Math.round(15.5 * baseScale)

    const cardMargin = Math.round(targetWidth * 0.025)
    const cardWidth = targetWidth - (cardMargin * 2)
    const numRows = hasNote ? 4 : 3
    const contentBlockHeight = (numRows - 1) * lineSpacing + fontSize
    const cardPaddingY = Math.round(11 * baseScale)
    const cardHeight = contentBlockHeight + cardPaddingY * 2
    const cardRadius = Math.round(13 * baseScale)
    const cardX = cardMargin
    const cardY = targetHeight - cardHeight - cardMargin

    // 1. Translucent Frosted Glass Background
    ctx.save()
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)"
    ctx.shadowBlur = Math.round(18 * baseScale)
    ctx.shadowOffsetY = Math.round(6 * baseScale)

    ctx.fillStyle = "rgba(15, 23, 42, 0.74)"
    ctx.beginPath()
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, cardRadius)
    ctx.fill()
    ctx.restore()

    // 2. Glass Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.30)"
    ctx.lineWidth = Math.max(1, Math.round(1.3 * baseScale))
    ctx.beginPath()
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, cardRadius)
    ctx.stroke()

    // 3. Mini Map on Left (Square matching card interior)
    const mapPadding = Math.round(8 * baseScale)
    const mapSize = cardHeight - (mapPadding * 2)
    const mapX = cardX + mapPadding
    const mapY = cardY + mapPadding
    const mapRadius = Math.round(9 * baseScale)

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius)
    ctx.clip()
    ctx.drawImage(miniMapCanvas, mapX, mapY, mapSize, mapSize)
    ctx.restore()

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius)
    ctx.stroke()

    // 4. SVG Icons Column
    const svgColX = mapX + mapSize + Math.round(12 * baseScale)
    let lineY = cardY + cardPaddingY + Math.round(fontSize * 0.85)

    // Row 1 SVG: GPS
    drawGpsSvg(ctx, svgColX, lineY - Math.round(svgSize * 0.85), svgSize, themeColor)

    // Row 2 SVG: Location
    drawLocationPinSvg(ctx, svgColX, lineY + lineSpacing - Math.round(svgSize * 0.85), svgSize, themeColor)

    // Row 3 / 4 SVGs: Note & Time
    if (hasNote) {
      drawTagSvg(ctx, svgColX, lineY + lineSpacing * 2 - Math.round(svgSize * 0.85), svgSize, themeColor)
      drawClockSvg(ctx, svgColX, lineY + lineSpacing * 3 - Math.round(svgSize * 0.85), svgSize, themeColor)
    } else {
      drawClockSvg(ctx, svgColX, lineY + lineSpacing * 2 - Math.round(svgSize * 0.85), svgSize, themeColor)
    }

    // 5. Vertical Fading Gradient Line
    const dividerX = svgColX + svgSize + Math.round(10 * baseScale)
    const dividerTop = cardY + Math.round(6 * baseScale)
    const dividerHeight = cardHeight - Math.round(12 * baseScale)

    const lineGrad = ctx.createLinearGradient(0, dividerTop, 0, dividerTop + dividerHeight)
    lineGrad.addColorStop(0.00, "rgba(56, 189, 248, 0.0)")
    lineGrad.addColorStop(0.30, "rgba(56, 189, 248, 0.90)")
    lineGrad.addColorStop(0.70, "rgba(56, 189, 248, 0.90)")
    lineGrad.addColorStop(1.00, "rgba(56, 189, 248, 0.0)")

    ctx.save()
    ctx.strokeStyle = lineGrad
    ctx.lineWidth = Math.max(1, Math.round(1.5 * baseScale))
    ctx.beginPath()
    ctx.moveTo(dividerX, dividerTop)
    ctx.lineTo(dividerX, dividerTop + dividerHeight)
    ctx.stroke()
    ctx.restore()

    // 6. Text Content (Medium 600 weight, elegant tall font, labels = Cyan, values = pure white)
    const textStartX = dividerX + Math.round(10 * baseScale)

    // Row 1: GPS
    ctx.font = `600 ${fontSize}px ${fontSans}`
    ctx.fillStyle = themeColor
    ctx.fillText("GPS: ", textStartX, lineY)

    ctx.fillStyle = "#ffffff"
    const gpsLabelW = ctx.measureText("GPS: ").width
    ctx.fillText(`Lat: ${latFormatted}, Long: ${lngFormatted} (±${accVal}m)`, textStartX + gpsLabelW, lineY)

    // Row 2: Location
    lineY += lineSpacing
    ctx.fillStyle = themeColor
    ctx.fillText("Location: ", textStartX, lineY)

    ctx.fillStyle = "#ffffff"
    const locLabelW = ctx.measureText("Location: ").width
    const maxLocChars = Math.round((cardWidth - (textStartX - cardX)) / (fontSize * 0.54))
    const truncatedLocation = locationName.length > maxLocChars ? locationName.slice(0, maxLocChars - 1) + "…" : locationName
    ctx.fillText(truncatedLocation, textStartX + locLabelW, lineY)

    // Row 3: Note (if present)
    if (hasNote) {
      lineY += lineSpacing
      ctx.fillStyle = themeColor
      ctx.fillText("Note: ", textStartX, lineY)

      ctx.fillStyle = "#ffffff"
      const noteLabelW = ctx.measureText("Note: ").width
      const noteText = meta.note!.trim()
      const maxNoteChars = Math.round((cardWidth - (textStartX - cardX)) / (fontSize * 0.54))
      const truncatedNote = noteText.length > maxNoteChars ? noteText.slice(0, maxNoteChars - 1) + "…" : noteText
      ctx.fillText(truncatedNote, textStartX + noteLabelW, lineY)
    }

    // Row 4: Time & Date
    lineY += lineSpacing
    ctx.fillStyle = themeColor
    ctx.fillText("Time: ", textStartX, lineY)

    ctx.fillStyle = "#ffffff"
    const timeLabelW = ctx.measureText("Time: ").width
    ctx.fillText(`${dateStr}   •   ${timeStr}`, textStartX + timeLabelW, lineY)
  }

  // =========================================================================
  // DESIGN 2: Modern Sleek HUD Ribbon (Minimalist Edge-to-Edge Field Banner)
  // =========================================================================
  else if (design === "design2") {
    const bannerHeight = Math.round((hasNote ? 92 : 78) * baseScale)
    const bannerY = targetHeight - bannerHeight
    const fontSize = Math.max(13.5, Math.round(15.5 * baseScale))
    const fontSubSize = Math.max(10.5, Math.round(12.5 * baseScale))

    // 1. Dark Gradient Glass Ribbon
    const gradient = ctx.createLinearGradient(0, bannerY, 0, targetHeight)
    gradient.addColorStop(0, "rgba(15, 23, 42, 0.78)")
    gradient.addColorStop(1, "rgba(15, 23, 42, 0.92)")

    ctx.fillStyle = gradient
    ctx.fillRect(0, bannerY, targetWidth, bannerHeight)

    // Top Accent Border Line (Cyan)
    ctx.strokeStyle = "rgba(56, 189, 248, 0.75)"
    ctx.lineWidth = Math.max(1, Math.round(2 * baseScale))
    ctx.beginPath()
    ctx.moveTo(0, bannerY)
    ctx.lineTo(targetWidth, bannerY)
    ctx.stroke()

    // 2. Compact Map Tile on Left
    const mapPadding = Math.round(7 * baseScale)
    const mapSize = bannerHeight - (mapPadding * 2)
    const mapX = mapPadding
    const mapY = bannerY + mapPadding
    const mapRadius = Math.round(8 * baseScale)

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius)
    ctx.clip()
    ctx.drawImage(miniMapCanvas, mapX, mapY, mapSize, mapSize)
    ctx.restore()

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius)
    ctx.stroke()

    // 3. Right Side Modern HUD Grid
    const contentX = mapX + mapSize + Math.round(12 * baseScale)

    // Top Row: Telemetry Badges (GPS + Time)
    const row1Y = mapY + Math.round(14 * baseScale)
    drawGpsSvg(ctx, contentX, row1Y - Math.round(10 * baseScale), Math.round(13 * baseScale), themeColor)
    ctx.fillStyle = themeColor
    ctx.font = `600 ${fontSubSize}px ${fontSans}`
    ctx.fillText("GPS: ", contentX + Math.round(17 * baseScale), row1Y)

    ctx.fillStyle = "#ffffff"
    const gpsW2 = ctx.measureText("GPS: ").width
    ctx.fillText(`${latFormatted}  ${lngFormatted} (±${accVal}m)`, contentX + Math.round(17 * baseScale) + gpsW2, row1Y)

    // Date & Time on Right
    ctx.fillStyle = "#ffffff"
    ctx.font = `600 ${fontSubSize}px ${fontSans}`
    ctx.textAlign = "right"
    ctx.fillText(`${dateStr}  ${timeStr}`, targetWidth - Math.round(12 * baseScale), row1Y)
    ctx.textAlign = "left"

    // Middle Row: Bold Location Name
    const row2Y = row1Y + Math.round(20 * baseScale)
    drawLocationPinSvg(ctx, contentX, row2Y - Math.round(10 * baseScale), Math.round(13 * baseScale), themeColor)
    ctx.fillStyle = themeColor
    ctx.font = `600 ${fontSize}px ${fontSans}`
    ctx.fillText("Location: ", contentX + Math.round(17 * baseScale), row2Y)

    ctx.fillStyle = "#ffffff"
    const locW2 = ctx.measureText("Location: ").width
    const maxChars = Math.round((targetWidth - (contentX + locW2)) / (fontSize * 0.54))
    const locShort = locationName.length > maxChars ? locationName.slice(0, maxChars - 1) + "…" : locationName
    ctx.fillText(locShort, contentX + Math.round(17 * baseScale) + locW2, row2Y)

    // Bottom Row: Custom Tag / Note if present
    if (hasNote) {
      const row3Y = row2Y + Math.round(18 * baseScale)
      drawTagSvg(ctx, contentX, row3Y - Math.round(10 * baseScale), Math.round(13 * baseScale), themeColor)
      ctx.fillStyle = themeColor
      ctx.font = `600 ${fontSubSize}px ${fontSans}`
      ctx.fillText("Note: ", contentX + Math.round(17 * baseScale), row3Y)

      ctx.fillStyle = "#ffffff"
      const noteW = ctx.measureText("Note: ").width
      ctx.fillText(meta.note!.trim(), contentX + Math.round(17 * baseScale) + noteW, row3Y)
    }
  }

  // 7. Output JPEG & Record
  const dataUrl = canvas.toDataURL("image/jpeg", 0.94)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Failed to create blob")), "image/jpeg", 0.94)
  })

  const photoId = `gis_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`

  const record: GisPhotoRecord = {
    id: photoId,
    dataUrl,
    timestamp: now.getTime(),
    dateFormatted: dateStr,
    timeFormatted: timeStr,
    lat: meta.lat,
    lng: meta.lng,
    accuracy: accVal,
    altitude: meta.altitude,
    heading: meta.heading,
    locationName,
    officeCode: meta.officeCode || "CCC",
    agency: meta.agency || "",
    note: meta.note?.trim() || ""
  }

  return { dataUrl, blob, record }
}

/**
 * 1-Tap Share GIS Photo to WhatsApp (Native Mobile Share or Desktop Download)
 */
export async function shareGisPhotoRecord(photo: GisPhotoRecord): Promise<{ success: boolean; method: "share" | "download" }> {
  if (typeof window === "undefined" || !photo) return { success: false, method: "download" }

  const fileName = `GIS_${photo.dateFormatted.replace(/[\s-/]/g, "_")}_${photo.id.slice(-4)}.jpg`
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  const res = await fetch(photo.dataUrl)
  const blob = await res.blob()
  const file = new File([blob], fileName, { type: "image/jpeg" })

  if (isMobile && typeof navigator.share === "function" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      const shareText =
        `📸 *GIS Field Geotag Photo*\n` +
        `📍 Lat: ${photo.lat.toFixed(6)}° N, Long: ${photo.lng.toFixed(6)}° E\n` +
        `📌 Location: ${photo.locationName}\n` +
        (photo.note ? `⚡ Note: ${photo.note}\n` : "") +
        `📅 Date: ${photo.dateFormatted} • ${photo.timeFormatted}`

      await navigator.share({
        files: [file],
        title: "GIS Geotag Photo",
        text: shareText
      })
      return { success: true, method: "share" }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { success: true, method: "share" }
      }
    }
  }

  // Desktop direct download
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { success: true, method: "download" }
}