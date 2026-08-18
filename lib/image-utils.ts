export function extractDriveFileId(url: string | undefined): string | null {
  if (!url || typeof url !== "string") return null
  const clean = url.trim()

  const dMatch = clean.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
  if (dMatch && dMatch[1]) return dMatch[1]

  const idMatch = clean.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
  if (idMatch && idMatch[1]) return idMatch[1]

  if (/^[a-zA-Z0-9_-]{25,}$/.test(clean)) return clean

  return null
}

export function getGoogleDriveDirectLink(url: string | undefined, size = 800): string {
  if (!url || typeof url !== "string") return ""
  const clean = url.trim()
  if (!clean || clean === "#") return ""

  const httpMatch = clean.match(/https?:\/\/[^\s\]\),]+/)
  const targetUrl = httpMatch ? httpMatch[0] : clean

  const fileId = extractDriveFileId(targetUrl)
  if (fileId) {
    const cdnUrl = `https://lh3.googleusercontent.com/d/${fileId}=s${size}`
    if (typeof window !== "undefined") {
      console.log(`[Image Delivery] ⚡ Serving directly from Google CDN (0 Vercel Bandwidth): ${cdnUrl}`)
    }
    return cdnUrl
  }

  const fullUrl = targetUrl.startsWith("http://") || targetUrl.startsWith("https://")
    ? targetUrl
    : `https://${targetUrl}`

  if (typeof window !== "undefined") {
    console.log(`[Image Delivery] 🌐 Direct external image URL: ${fullUrl}`)
  }
  return fullUrl
}

export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  originalUrl?: string
) {
  const img = event.currentTarget
  if (!img) return

  if (img.dataset.hasRetried) {
    console.warn(`[Image Delivery] ❌ Image failed permanently:`, originalUrl || img.src)
    return
  }
  img.dataset.hasRetried = "true"

  const target = originalUrl || img.src
  if (target && !target.includes("/api/image-proxy")) {
    const fallbackProxy = `/api/image-proxy?url=${encodeURIComponent(target)}`
    console.warn(`[Image Delivery] 🔄 Google CDN load failed, falling back to /api/image-proxy:`, fallbackProxy)
    img.src = fallbackProxy
  }
}
