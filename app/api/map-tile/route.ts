import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const z = searchParams.get("z") || "16"
  const x = searchParams.get("x")
  const y = searchParams.get("y")

  if (!x || !y) {
    return NextResponse.json({ error: "x and y tile coordinates required" }, { status: 400 })
  }

  // Multi-provider fallback list (Google Street Maps -> OpenStreetMap -> CartoDB)
  const tileUrls = [
    `https://mt1.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`,
    `https://mt0.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`,
    `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`
  ]

  for (const url of tileUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "image/png,image/webp,image/*;q=0.8"
        },
        next: { revalidate: 86400 }
      })

      if (res.ok) {
        const buffer = await res.arrayBuffer()
        const contentType = res.headers.get("content-type") || "image/png"
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
            "Access-Control-Allow-Origin": "*"
          }
        })
      }
    } catch (err) {}
  }

  return NextResponse.json({ error: "Failed to fetch map tile" }, { status: 502 })
}