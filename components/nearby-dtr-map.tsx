"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, Navigation, ArrowLeft, RefreshCw } from "lucide-react"
import type { DTRRecord } from "@/lib/dtr-service"

interface Props {
  records: DTRRecord[]
  onClose: () => void
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const deltaPhi = (lat2 - lat1) * Math.PI / 180
  const deltaLambda = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

export function NearbyDtrMap({ records, onClose }: Props) {
  const [range, setRange] = useState<number>(500) // Default range 500m
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(true)
  const [filterPending, setFilterPending] = useState(true) // Toggle to show all or pending
  const [mapType, setMapType] = useState<"roadmap" | "hybrid">("roadmap")

  // ── Load Leaflet once using shared loader (keeps scripts/styles for reuse) ─
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const mod = await import("@/lib/leaflet-loader")
        await mod.ensureLeafletLoaded()
        if (mounted) setLeafletLoaded(true)
      } catch (err) {
        console.error("Failed to load Leaflet:", err)
      }
    })()
    return () => { mounted = false }
  }, [])

  // ── Retrieve User Geolocation ──────────────────────────────────────────────
  const fetchLocation = () => {
    setLoadingLocation(true)
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      setUserCoords([25.452202, 88.021090])
      setLoadingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords([pos.coords.latitude, pos.coords.longitude])
        setLoadingLocation(false)
      },
      () => {
        alert("GPS location access denied. Centering on default coordinate.")
        setUserCoords([25.452202, 88.021090])
        setLoadingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  useEffect(() => {
    if (leafletLoaded) {
      fetchLocation()
    }
  }, [leafletLoaded])

  // ── Map Render Hook ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userCoords || !leafletLoaded) return

    const L = (window as any).L
    if (!L) return

    // Determine dynamic zoom level based on range
    let zoom = 16
    if (range >= 5000) zoom = 12
    else if (range >= 3000) zoom = 13
    else if (range >= 1500) zoom = 14
    else if (range >= 1000) zoom = 15

    // Create Map Instance
    const map = L.map("nearby-map-container").setView(userCoords, zoom)
    
    const googleTileUrl = mapType === "roadmap"
      ? "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
      : "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"

    L.tileLayer(googleTileUrl, {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>'
    }).addTo(map)

    // Draw range search circle
    L.circle(userCoords, {
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.08,
      radius: range,
      weight: 1.5
    }).addTo(map)

    // Renders custom styled user location marker
    L.marker(userCoords, {
      icon: L.divIcon({
        className: "custom-user-marker",
        html: `
          <div class="relative flex items-center justify-center h-5 w-5">
            <div class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></div>
            <div class="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border-2 border-white shadow-md"></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map)

    // Track the nearest DTR info
    let nearestDtr: any = null
    let minDistance = Infinity

    // Filter and plot DTR markers
    records.forEach(r => {
      if (!r.latlong) return
      const parts = r.latlong.split(",").map(Number)
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return
      const [lat, lng] = parts

      const distance = getDistanceMeters(userCoords[0], userCoords[1], lat, lng)
      if (distance <= range) {
        const isPainted = (r.painting || "").toLowerCase() === "done"
        
        // Skip completed ones if filtering for pending only
        if (filterPending && isPainted) return

        // Check if this is the nearest DTR
        if (distance < minDistance) {
          minDistance = distance
          nearestDtr = { record: r, lat, lng }
        }

        // Add Marker
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "custom-dtr-marker",
            html: `
              <div class="px-2 py-1 shadow-lg border rounded-full font-mono text-[10px] font-bold text-white whitespace-nowrap tracking-tight ${
                isPainted 
                  ? "bg-green-600 border-green-700 hover:bg-green-700" 
                  : "bg-orange-500 border-orange-600 hover:bg-orange-600"
              }">
                ${r.dtrCode}
              </div>
            `,
            iconAnchor: [15, 12]
          })
        }).addTo(map)

        // Bind Leaflet popup with FULL parameters
        marker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 4px 6px; line-height: 1.5; color: #1e293b; min-width: 180px;">
            <p style="margin: 0; font-weight: 850; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">DTR: ${r.dtrCode}</p>
            <p style="margin: 5px 0 0 0; color: #475569;">Feeder: <strong style="color: #0f172a;">${r.feederName}</strong></p>
            <p style="margin: 2px 0 0 0; color: #475569;">Capacity: <strong style="color: #0f172a;">${r.kvCapacity || "—"} kVA</strong></p>
            <p style="margin: 2px 0 0 0; color: #475569;">Location: <strong style="color: #0f172a;">${r.locationName || "—"}</strong></p>
            <p style="margin: 2px 0 0 0; color: #475569;">Painting: <span style="font-weight: bold; color: ${isPainted ? '#16a34a' : '#ea580c'};">${isPainted ? 'Completed' : 'Pending'}</span></p>
            <p style="margin: 2px 0 0 0; color: #475569;">Distance: <strong style="color: #0f172a;">${Math.round(distance)} meters</strong></p>
            <button 
              type="button" 
              style="margin-top: 8px; width: 100%; height: 32px; background-color: #2563eb; color: #ffffff; font-weight: bold; font-size: 11px; border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;"
              onclick="window.open('https://www.google.com/maps/dir/?api=1&origin=${userCoords[0]},${userCoords[1]}&destination=${lat},${lng}', '_blank')"
            >
              Get Directions →
            </button>
          </div>
        `)
      }
    })

    // Renders direction arrow/line pointing to the closest DTR
    if (nearestDtr) {
      // 1. Draw Polyline
      L.polyline([userCoords, [nearestDtr.lat, nearestDtr.lng]], {
        color: "#ef4444",
        weight: 2,
        dashArray: "5, 5",
        opacity: 0.85
      }).addTo(map)

      // 2. Midpoint Arrow Marker pointing to nearest DTR
      const midLat = (userCoords[0] + nearestDtr.lat) / 2
      const midLng = (userCoords[1] + nearestDtr.lng) / 2

      const dy = nearestDtr.lat - userCoords[0]
      const dx = Math.cos(Math.PI / 180 * userCoords[0]) * (nearestDtr.lng - userCoords[1])
      const angle = Math.atan2(dx, dy) * 180 / Math.PI

      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "direction-arrow-marker",
          html: `<div style="transform: rotate(${angle}deg); font-size: 15px; color: #ef4444; font-weight: bold; line-height: 1; text-shadow: 0 0 3px #fff;">▲</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      }).addTo(map).bindTooltip(`Nearest DTR: ${nearestDtr.record.dtrCode} (${Math.round(minDistance)}m)`, {
        permanent: true,
        direction: "top",
        className: "px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[9px] font-bold border-none shadow-md"
      })
    }

    return () => {
      map.remove()
    }
  }, [userCoords, range, records, leafletLoaded, filterPending, mapType])

  return (
    <div className="flex flex-col h-[75vh] w-full border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-xl relative animate-in fade-in duration-300">
      
      {/* Compact Header controls bar */}
      <div className="bg-slate-900 text-white px-3 py-2 flex justify-between items-center z-45 gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8 hover:bg-slate-800 text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold tracking-tight">Nearby DTR Radar</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Map Type Toggle */}
          <Button
            variant="ghost"
            onClick={() => setMapType(prev => prev === "roadmap" ? "hybrid" : "roadmap")}
            className="h-7 px-2.5 text-[10px] font-bold rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
          >
            {mapType === "roadmap" ? "Satellite View" : "Street View"}
          </Button>

          {/* Toggle All vs Pending DTRs */}
          <Button
            variant="ghost"
            onClick={() => setFilterPending(!filterPending)}
            className={`h-7 px-2.5 text-[10px] font-bold rounded-lg border transition-all duration-200 ${
              filterPending 
                ? "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30 hover:text-orange-400" 
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {filterPending ? "Pending Only" : "Showing All"}
          </Button>

          {loadingLocation && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={fetchLocation} 
            className="rounded-full h-8 w-8 text-slate-400 hover:text-white"
            title="Refresh GPS Location"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Map body container - Stretched to occupy all remaining vertical space */}
      <div className="flex-grow relative min-h-0 w-full bg-slate-100">
        {!leafletLoaded || loadingLocation ? (
          <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center text-slate-500 text-sm gap-2.5 z-50">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="font-semibold text-xs">Retrieving GPS location & downloading maps...</p>
          </div>
        ) : null}
        
        <div id="nearby-map-container" className="absolute inset-0 w-full h-full z-10" />
      </div>

      {/* Ultra Compact Range controls footbar */}
      <div className="bg-slate-50 border-t px-4 py-3 flex items-center justify-between gap-4 z-40 w-full shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <MapPin className="h-4 w-4 text-red-500" />
          <span className="text-xs font-bold text-slate-700">
            Range: <span className="text-blue-600 font-mono font-extrabold">{range >= 1000 ? `${(range / 1000).toFixed(1)} km` : `${range}m`}</span>
          </span>
        </div>
        
        <div className="flex-grow max-w-xs sm:max-w-md">
          <input
            type="range"
            min="500"
            max="5000"
            step="500"
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
            disabled={loadingLocation}
          />
        </div>
      </div>

    </div>
  )
}
