import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 })
  }

  const googleApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.GOOGLE_API_KEY

  // 1. Prioritize Google Maps Geocoding API for highest accuracy
  if (googleApiKey) {
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}`
      const googleRes = await fetch(googleUrl, { next: { revalidate: 3600 } })
      if (googleRes.ok) {
        const data = await googleRes.json()
        if (data.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
          // Find the most granular result or the first good result
          const primaryResult = data.results[0]
          const components = primaryResult.address_components || []

          const getComp = (types: string[]) => {
            const match = components.find((c: any) =>
              types.some((t) => c.types?.includes(t))
            )
            return match ? match.long_name : ""
          }

          const premise = getComp(["premise", "subpremise", "point_of_interest", "landmark"])
          const neighborhood = getComp(["neighborhood", "sublocality_level_2", "sublocality_level_3"])
          const sublocality = getComp(["sublocality", "sublocality_level_1"])
          const locality = getComp(["locality"])
          const subdistrict = getComp(["administrative_area_level_3"])
          const district = getComp(["administrative_area_level_2"])
          const state = getComp(["administrative_area_level_1"])

          const parts: string[] = []

          // Specific place or village/locality
          const place = sublocality || neighborhood || premise || locality
          if (place) parts.push(place)

          if (locality && locality !== place && !parts.includes(locality)) {
            parts.push(locality)
          }

          if (subdistrict && !parts.includes(subdistrict)) {
            parts.push(subdistrict)
          }

          if (district && !parts.includes(district)) {
            parts.push(district)
          }

          if (state && !parts.includes(state)) {
            parts.push(state)
          }

          let formatted = parts.slice(0, 3).join(", ")

          if (!formatted && primaryResult.formatted_address) {
            // Strip plus codes (e.g., 'F98C+6J Tulshihata...')
            formatted = primaryResult.formatted_address.replace(/^[A-Z0-9+]+\s*,\s*/, "")
          }

          if (formatted) {
            return NextResponse.json({
              address: formatted,
              source: "google",
              raw: primaryResult
            })
          }
        }
      }
    } catch (err) {
      console.warn("Google Maps reverse geocoding request error:", err)
    }
  }

  // 2. Secondary fallback: OpenStreetMap Nominatim
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

      const subdistrict = addr.municipality || addr.subdistrict || addr.county
      if (subdistrict && !parts.includes(subdistrict)) {
        parts.push(subdistrict)
      }

      const district = addr.state_district || addr.district
      if (district && !parts.includes(district)) {
        parts.push(district)
      }

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

  // 3. Fallback to BigDataCloud
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