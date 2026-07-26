"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, Navigation, ArrowLeft, RefreshCw, X, ShieldAlert, CheckCircle2 } from "lucide-react"
import type { SafetyTicket } from "@/lib/safety-service"

interface Props {
  tickets: SafetyTicket[]
  onClose: () => void
  onGoToTicket?: (ticket: SafetyTicket) => void
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const deltaPhi = (lat2 - lat1) * Math.PI / 180
  const deltaLambda = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function NearbySafetyMap({ tickets, onClose, onGoToTicket }: Props) {
  const [range, setRange] = useState<number>(2000) // Default 2km
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(true)
  const [filterOpenOnly, setFilterOpenOnly] = useState(false)
  const [mapType, setMapType] = useState<"roadmap" | "hybrid">("roadmap")

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  const goToRef = useRef(onGoToTicket)
  useEffect(() => { goToRef.current = onGoToTicket }, [onGoToTicket])

  // Get User GPS Location
  const getUserLocation = () => {
    setLoadingLocation(true)
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      setLoadingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserCoords(coords)
        setLoadingLocation(false)
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView(coords, 14)
        }
      },
      (err) => {
        console.warn("Location fetch error:", err)
        // Fallback to center of tickets or Kolkata default
        const validWithCoords = tickets.filter(t => t.latitude && t.longitude)
        if (validWithCoords.length > 0) {
          const avgLat = validWithCoords.reduce((sum, t) => sum + t.latitude, 0) / validWithCoords.length
          const avgLng = validWithCoords.reduce((sum, t) => sum + t.longitude, 0) / validWithCoords.length
          setUserCoords([avgLat, avgLng])
        } else {
          setUserCoords([22.5726, 88.3639])
        }
        setLoadingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  useEffect(() => {
    getUserLocation()
  }, [])

  // Dynamically load Leaflet & Google Maps tiles
  useEffect(() => {
    if (typeof window === "undefined") return

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link")
      link.id = "leaflet-css"
      link.rel = "stylesheet"
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      document.head.appendChild(link)
    }

    if (!(window as any).L) {
      const script = document.createElement("script")
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      script.onload = () => setLeafletLoaded(true)
      document.head.appendChild(script)
    } else {
      setLeafletLoaded(true)
    }
  }, [])

  // Filter Safety Tickets based on GPS coordinates and range
  const nearbyTickets = useMemo(() => {
    return tickets.filter(t => {
      if (!t.latitude || !t.longitude || isNaN(t.latitude) || isNaN(t.longitude)) return false

      if (filterOpenOnly && t.physicalStatus === "rectified") return false

      if (!userCoords || range >= 999000) return true // 999km = show all

      const distMeters = getDistanceMeters(userCoords[0], userCoords[1], t.latitude, t.longitude)
      return distMeters <= range
    })
  }, [tickets, userCoords, range, filterOpenOnly])

  const stats = useMemo(() => {
    const total = nearbyTickets.length
    const openCount = nearbyTickets.filter(t => t.physicalStatus === "pending").length
    const rectifiedCount = nearbyTickets.filter(t => t.physicalStatus === "rectified").length
    return { total, openCount, rectifiedCount }
  }, [nearbyTickets])

  // Initialize and Render Map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || !userCoords) return
    const L = (window as any).L
    if (!L) return

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView(userCoords, range >= 999000 ? 11 : 14)

    L.control.zoom({ position: "bottomright" }).addTo(map)

    // Base Layers (Google Maps Roadmap vs Hybrid)
    const roadmapLayer = L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution: "&copy; Google Maps"
    })

    const hybridLayer = L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution: "&copy; Google Maps"
    })

    if (mapType === "hybrid") {
      hybridLayer.addTo(map)
    } else {
      roadmapLayer.addTo(map)
    }

    // User Position Marker & Range Circle
    if (userCoords) {
      const userPulseIcon = L.divIcon({
        className: "custom-user-marker",
        html: `
          <div style="position:relative; width:24px; height:24px;">
            <div style="position:absolute; width:24px; height:24px; border-radius:50%; background:rgba(59,130,246,0.3); animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="position:absolute; top:4px; left:4px; width:16px; height:16px; border-radius:50%; background:#2563eb; border:2.5px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })

      L.marker(userCoords, { icon: userPulseIcon })
        .addTo(map)
        .bindPopup("<div style='font-weight:bold; font-size:12px;'>📍 Your Current GPS Location</div>")

      if (range < 999000) {
        L.circle(userCoords, {
          radius: range,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: "4, 4"
        }).addTo(map)
      }
    }

    // Render Safety Hazard Markers
    nearbyTickets.forEach(t => {
      const isOpen = t.physicalStatus === "pending"
      const markerColor = isOpen ? "#ef4444" : "#10b981" // Red for open, Green for rectified
      const badgeText = isOpen ? "OPEN HAZARD" : "RECTIFIED"

      const markerHtml = `
        <div style="
          position: relative;
          background: ${markerColor};
          color: white;
          border-radius: 20px;
          padding: 3px 8px;
          font-size: 10px;
          font-weight: bold;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          border: 1.5px solid white;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <span>${isOpen ? "🔴" : "🟢"}</span>
          <span>${t.safetyId}</span>
        </div>
      `

      const customIcon = L.divIcon({
        className: "custom-safety-marker",
        html: markerHtml,
        iconSize: [80, 24],
        iconAnchor: [40, 12]
      })

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; padding: 2px; max-width: 220px;">
          <div style="display:flex; justify-between; align-items:center; margin-bottom: 4px;">
            <span style="font-family:monospace; font-weight:bold; font-size:12px; color:#0f172a;">${t.safetyId}</span>
            <span style="background:${isOpen ? '#fee2e2' : '#d1fae5'}; color:${isOpen ? '#991b1b' : '#065f46'}; font-size:9px; font-weight:bold; padding: 1px 6px; border-radius: 4px; uppercase">${badgeText}</span>
          </div>
          <p style="font-size:11px; font-weight:bold; color:#b45309; margin: 2px 0;">${(t.hazardCategories || []).join(", ")}</p>
          <p style="font-size:10px; color:#475569; margin:2px 0; line-clamp: 2;">📍 ${t.address}</p>
          <p style="font-size:10px; color:#64748b; margin:2px 0;">🏢 Agency: <strong>${t.agency || "Unassigned"}</strong></p>
          <div style="margin-top: 8px; pt: 4px; border-top: 1px solid #e2e8f0; display: flex; gap: 4px;">
            <a href="https://www.google.com/maps/search/?api=1&query=${t.latitude},${t.longitude}" target="_blank" style="flex:1; text-align:center; background:#2563eb; color:white; padding:4px; border-radius:6px; font-weight:bold; font-size:10px; text-decoration:none;">Navigate ↗</a>
          </div>
        </div>
      `

      L.marker([t.latitude, t.longitude], { icon: customIcon })
        .addTo(map)
        .bindPopup(popupHtml)
    })

    mapInstanceRef.current = map
  }, [leafletLoaded, userCoords, nearbyTickets, range, mapType])

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-2xl">
      {/* Header */}
      <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold leading-none">Safety Hazards Radar Map</h2>
            <p className="text-[10px] text-slate-400 mt-1">Live Map of Site Hazards & Rectified Points</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={getUserLocation} className="h-8 w-8 text-white hover:bg-slate-800" title="Refresh GPS">
            {loadingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-white hover:bg-slate-800">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Control Bar: Range Selector & Filter */}
      <div className="bg-slate-50 p-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs font-semibold">
        {/* Distance Range Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-500 font-bold text-[10px] uppercase shrink-0">Radar Range:</span>
          {[
            { label: "0.5 km", value: 500 },
            { label: "1 km",   value: 1000 },
            { label: "2 km",   value: 2000 },
            { label: "5 km",   value: 5000 },
            { label: "10 km",  value: 10000 },
            { label: "All",    value: 999999 },
          ].map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                range === r.value ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Status Filters & Map Layer Switch */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFilterOpenOnly(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
              filterOpenOnly ? "bg-red-600 text-white border-red-600" : "bg-white text-red-700 border-red-200 hover:bg-red-50"
            }`}
          >
            <span>🔴 Open Only ({stats.openCount})</span>
          </button>

          <select
            value={mapType}
            onChange={e => setMapType(e.target.value as any)}
            className="p-1 border border-slate-200 rounded-lg text-[11px] font-bold bg-white"
          >
            <option value="roadmap">Roadmap</option>
            <option value="hybrid">Satellite</option>
          </select>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative flex-1 min-h-[350px]">
        {loadingLocation && (
          <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            <span>Fetching GPS Location...</span>
          </div>
        )}

        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* Map Footer Summary Pill */}
      <div className="bg-slate-900 text-white p-2.5 flex items-center justify-between text-xs font-bold shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-amber-400">Total Hazards: {stats.total}</span>
          <span className="text-red-400">🔴 Open: {stats.openCount}</span>
          <span className="text-emerald-400">🟢 Rectified: {stats.rectifiedCount}</span>
        </div>
        <span className="text-[10px] text-slate-400 hidden sm:inline">Tap any pin to view hazard details</span>
      </div>
    </div>
  )
}
