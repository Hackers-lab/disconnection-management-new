/**
 * CamScanner-Grade Document Scanner Engine
 * Provides:
 * 1. Automatic Document Edge / Contour Corner Detection (isolates paper from table)
 * 2. CamScanner "Magic Color" Auto-Enhance Filter:
 *    - Division normalization by local background luminance map
 *    - 100% pure white paper background (#FFFFFF) with zero dark borders/shadows
 *    - Dynamic text contrast darkening & saturation boost for blue pen/signatures/stamps
 * 3. Proportional A4 Perspective Warp Homography
 */

export interface Point {
  x: number
  y: number
}

// Standard A4 Aspect Ratio Dimensions (1 : 1.4142)
export const A4_PORTRAIT_WIDTH = 1200
export const A4_PORTRAIT_HEIGHT = 1697

/**
 * CamScanner-Grade "Magic Color" Document Enhancer
 * Divides image into local blocks to calculate background white level map,
 * normalizes pixels against local background to produce pure #FFFFFF paper tone,
 * sharpens dark text, and boosts blue pen/stamp color saturation.
 */
export function applyCamScannerMagicColor(imageData: ImageData): ImageData {
  const width = imageData.width
  const height = imageData.height
  const data = imageData.data

  // 1. Calculate downscaled local background white level grid
  const blockSize = Math.max(16, Math.floor(Math.min(width, height) / 32))
  const gridW = Math.ceil(width / blockSize)
  const gridH = Math.ceil(height / blockSize)
  const bgMap = new Float32Array(gridW * gridH)

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const startX = gx * blockSize
      const startY = gy * blockSize
      const endX = Math.min(startX + blockSize, width)
      const endY = Math.min(startY + blockSize, height)

      const blockLumas: number[] = []
      for (let y = startY; y < endY; y += 2) {
        const row = y * width
        for (let x = startX; x < endX; x += 2) {
          const idx = (row + x) * 4
          const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          blockLumas.push(luma)
        }
      }

      blockLumas.sort((a, b) => a - b)
      // Select 90th percentile brightness level as the local paper background level
      const p90 = blockLumas[Math.floor(blockLumas.length * 0.90)] || 220
      bgMap[gy * gridW + gx] = Math.max(130, p90)
    }
  }

  // 2. Bilinear interpolation of background map & CamScanner magic pixel correction
  for (let y = 0; y < height; y++) {
    const gy = y / blockSize
    const gy0 = Math.floor(gy)
    const gy1 = Math.min(gy0 + 1, gridH - 1)
    const fy = gy - gy0

    const row = y * width

    for (let x = 0; x < width; x++) {
      const gx = x / blockSize
      const gx0 = Math.floor(gx)
      const gx1 = Math.min(gx0 + 1, gridW - 1)
      const fx = gx - gx0

      const bg00 = bgMap[gy0 * gridW + gx0]
      const bg10 = bgMap[gy0 * gridW + gx1]
      const bg01 = bgMap[gy1 * gridW + gx0]
      const bg11 = bgMap[gy1 * gridW + gx1]

      const localBg = (1 - fx) * (1 - fy) * bg00 + fx * (1 - fy) * bg10 + (1 - fx) * fy * bg01 + fx * fy * bg11

      const idx = (row + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]

      // Division normalization against local paper background
      const normR = (r / localBg) * 255
      const normG = (g / localBg) * 255
      const normB = (b / localBg) * 255

      const normLuma = 0.299 * normR + 0.587 * normG + 0.114 * normB

      if (normLuma >= 210) {
        // Pure White paper background (#FFFFFF)
        data[idx] = 255
        data[idx + 1] = 255
        data[idx + 2] = 255
      } else {
        // Contrast curve for crisp text + saturation boost for pen ink / logos
        const factor = Math.pow(normLuma / 210, 1.35)

        let finalR = normR * factor
        let finalG = normG * factor
        let finalB = normB * factor

        // Saturation boost for colored ink (blue/red/green pen or stamps)
        const maxC = Math.max(finalR, finalG, finalB)
        const minC = Math.min(finalR, finalG, finalB)
        const chroma = maxC - minC
        if (chroma > 12) {
          const satBoost = 1.35
          const avgC = (finalR + finalG + finalB) / 3
          finalR = avgC + (finalR - avgC) * satBoost
          finalG = avgC + (finalG - avgC) * satBoost
          finalB = avgC + (finalB - avgC) * satBoost
        }

        data[idx] = Math.min(255, Math.max(0, Math.round(finalR)))
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(finalG)))
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(finalB)))
      }
    }
  }

  return imageData
}

/**
 * Automatic Document Contour Edge Detection
 * Scans image for paper boundaries against table backgrounds to locate 4 corner points.
 */
export function detectDocumentCorners(
  canvas: HTMLCanvasElement
): [Point, Point, Point, Point] {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return defaultInsetCorners(w, h)
  }

  try {
    const imgData = ctx.getImageData(0, 0, w, h)
    const data = imgData.data

    // Sample scan lines along 4 quadrants to detect paper brightness edge transition
    const step = 8
    let topL = { x: Math.round(w * 0.03), y: Math.round(h * 0.03) }
    let topR = { x: Math.round(w * 0.97), y: Math.round(h * 0.03) }
    let botR = { x: Math.round(w * 0.97), y: Math.round(h * 0.97) }
    let botL = { x: Math.round(w * 0.03), y: Math.round(h * 0.97) }

    // Top edge scan (downward from top)
    for (let y = 0; y < Math.floor(h * 0.35); y += step) {
      let lumaSum = 0
      const row = y * w
      for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += step) {
        const idx = (row + x) * 4
        lumaSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      }
      const avg = lumaSum / ((w * 0.6) / step)
      if (avg > 130) {
        topL.y = y
        topR.y = y
        break
      }
    }

    // Bottom edge scan (upward from bottom)
    for (let y = h - 1; y > Math.floor(h * 0.65); y -= step) {
      let lumaSum = 0
      const row = y * w
      for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += step) {
        const idx = (row + x) * 4
        lumaSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      }
      const avg = lumaSum / ((w * 0.6) / step)
      if (avg > 130) {
        botL.y = y
        botR.y = y
        break
      }
    }

    // Left edge scan (rightward from left)
    for (let x = 0; x < Math.floor(w * 0.35); x += step) {
      let lumaSum = 0
      for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y += step) {
        const idx = (y * w + x) * 4
        lumaSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      }
      const avg = lumaSum / ((h * 0.6) / step)
      if (avg > 130) {
        topL.x = x
        botL.x = x
        break
      }
    }

    // Right edge scan (leftward from right)
    for (let x = w - 1; x > Math.floor(w * 0.65); x -= step) {
      let lumaSum = 0
      for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y += step) {
        const idx = (y * w + x) * 4
        lumaSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      }
      const avg = lumaSum / ((h * 0.6) / step)
      if (avg > 130) {
        topR.x = x
        botR.x = x
        break
      }
    }

    return [topL, topR, botR, botL]
  } catch {
    return defaultInsetCorners(w, h)
  }
}

function defaultInsetCorners(w: number, h: number): [Point, Point, Point, Point] {
  const insetX = Math.round(w * 0.03)
  const insetY = Math.round(h * 0.03)
  return [
    { x: insetX, y: insetY },
    { x: w - insetX, y: insetY },
    { x: w - insetX, y: h - insetY },
    { x: insetX, y: h - insetY },
  ]
}

/**
 * Perspective Warp Homography (A4 Proportional Output)
 * Transforms arbitrary 4 corner quadrilateral into exact A4 aspect ratio canvas.
 */
export function warpPerspective(
  sourceCanvas: HTMLCanvasElement,
  corners: [Point, Point, Point, Point], // TL, TR, BR, BL
  isLandscape = false
): HTMLCanvasElement {
  const targetWidth = isLandscape ? A4_PORTRAIT_HEIGHT : A4_PORTRAIT_WIDTH
  const targetHeight = isLandscape ? A4_PORTRAIT_WIDTH : A4_PORTRAIT_HEIGHT

  const outputCanvas = document.createElement("canvas")
  outputCanvas.width = targetWidth
  outputCanvas.height = targetHeight

  const srcCtx = sourceCanvas.getContext("2d")
  const outCtx = outputCanvas.getContext("2d")
  if (!srcCtx || !outCtx) return sourceCanvas

  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const outData = outCtx.createImageData(targetWidth, targetHeight)

  const H = getHomographyMatrix(
    [
      { x: 0, y: 0 },
      { x: targetWidth, y: 0 },
      { x: targetWidth, y: targetHeight },
      { x: 0, y: targetHeight },
    ],
    corners
  )

  const sw = sourceCanvas.width
  const sh = sourceCanvas.height

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const denominator = H[6] * x + H[7] * y + H[8]
      const u = (H[0] * x + H[1] * y + H[2]) / denominator
      const v = (H[3] * x + H[4] * y + H[5]) / denominator

      const outIdx = (y * targetWidth + x) * 4

      if (u >= 0 && u < sw - 1 && v >= 0 && v < sh - 1) {
        const u0 = Math.floor(u)
        const u1 = u0 + 1
        const v0 = Math.floor(v)
        const v1 = v0 + 1

        const du = u - u0
        const dv = v - v0

        const i00 = (v0 * sw + u0) * 4
        const i10 = (v0 * sw + u1) * 4
        const i01 = (v1 * sw + u0) * 4
        const i11 = (v1 * sw + u1) * 4

        for (let c = 0; c < 3; c++) {
          const val =
            (1 - du) * (1 - dv) * srcData.data[i00 + c] +
            du * (1 - dv) * srcData.data[i10 + c] +
            (1 - du) * dv * srcData.data[i01 + c] +
            du * dv * srcData.data[i11 + c]

          outData.data[outIdx + c] = Math.round(val)
        }
        outData.data[outIdx + 3] = 255
      } else {
        outData.data[outIdx] = 255
        outData.data[outIdx + 1] = 255
        outData.data[outIdx + 2] = 255
        outData.data[outIdx + 3] = 255
      }
    }
  }

  outCtx.putImageData(outData, 0, 0)
  return outputCanvas
}

function getHomographyMatrix(src: Point[], dst: Point[]): number[] {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }

  for (let i = 0; i < 8; i++) {
    let pivot = i
    for (let j = i + 1; j < 8; j++) {
      if (Math.abs(A[j][i]) > Math.abs(A[pivot][i])) pivot = j
    }
    const temp = A[i]
    A[i] = A[pivot]
    A[pivot] = temp

    if (Math.abs(A[i][i]) < 1e-10) continue

    for (let j = i + 1; j < 8; j++) {
      const factor = A[j][i] / A[i][i]
      for (let k = i; k < 9; k++) {
        A[j][k] -= factor * A[i][k]
      }
    }
  }

  const h = new Array(9).fill(0)
  h[8] = 1
  for (let i = 7; i >= 0; i--) {
    let sum = A[i][8]
    for (let j = i + 1; j < 8; j++) {
      sum -= A[i][j] * h[j]
    }
    h[i] = sum / A[i][i]
  }

  return h
}
