import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 })
  }

  // 1. Try OpenStreetMap Nominatim first with zoom=18 for highest granularity (village/locality)
  try {
    const osmUrl = "https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lng + "&zoom=18&addressdetails=1"
    const osmRes = await fetch(osmUrl, {
      headers: {
        "User-Agent": "DisconnectionGISApp/2.0 (wb-disconnection@wbsedcl.in)",
        "Accept-Language": "en"
      },
      next: { revalidate: 3600 }
    })

    if (osmRes.ok) {
      const data = await osmRes.json()
      const addr = data.address || {}
      const parts: string[] = []

      // Most specific locality / village / hamlet / quarter
      const specific =
        addr.village ||
        addr.hamlet ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.quarter ||
        addr.residential ||
        addr.isolated_dwelling ||
        addr.town ||
        addr.city_district ||
        addr.city

      if (specific) parts.push(specific)

      // Sub-district / Block / Tehsil (e.g. Harishchandrapur)
      const subdistrict = addr.municipality || addr.subdistrict || addr.county
      if (subdistrict && !parts.includes(subdistrict)) {
        parts.push(subdistrict)
      }

      // District (e.g. Malda)
      const district = addr.state_district || addr.district
      if (district && !parts.includes(district)) {
        parts.push(district)
      }

      // State (e.g. West Bengal)
      const state = addr.state || "West Bengal"
      if (state && !parts.includes(state)) {
        parts.push(state)
      }

      const formatted = parts.slice(0, 3).join(", ")
      if (formatted) {
        return NextResponse.json({ address: formatted, raw: addr })
      }
    }
  } catch (err) {}

  // 2. Fallback to BigDataCloud
  try {
    const bdcUrl = "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat + "&longitude=" + lng + "&localityLanguage=en"
    const bdcRes = await fetch(bdcUrl)
    if (bdcRes.ok) {
      const data = await bdcRes.json()
      const parts: string[] = []

      const specific =
        data.locality ||
        data.village ||
        data.localityInfo?.administrative?.[3]?.name ||
        data.localityInfo?.administrative?.[4]?.name ||
        data.city

      if (specific) parts.push(specific)

      const sub = data.localityInfo?.administrative?.[2]?.name
      if (sub && !parts.includes(sub)) parts.push(sub)

      const dist = data.principalSubdivisionDistrict
      if (dist && !parts.includes(dist)) parts.push(dist)

      const state = data.principalSubdivision || "West Bengal"
      if (state && !parts.includes(state)) parts.push(state)

      const formatted = parts.slice(0, 3).join(", ")
      if (formatted) {
        return NextResponse.json({ address: formatted, raw: data })
      }
    }
  } catch (err) {}

  return NextResponse.json({ address: "Tulshihata, Malda, West Bengal" })
}