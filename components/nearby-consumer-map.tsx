"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  MapPin,
  Navigation,
  ArrowLeft,
  RefreshCw,
  Crosshair,
  Layers,
  Filter,
  Compass,
} from "lucide-react"
import type { ConsumerData } from "@/lib/google-sheets"
import { toast } from "@/hooks/use-toast"

interface Props {
  consumers: ConsumerData[]
  onClose: () => void
  onGoToConsumer: (consumer: ConsumerData) => void
  defaultRange?: number
  minRange?: number
  maxRange?: number
  stepRange?: number
  defaultFilterPending?: boolean
  isMasterMode?: boolean
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getStatusColor(status: string): string {
  const s = (status || "").toLowerCase()
  if (s === "master record") return "#3b82f6"
  if (s === "connected") return "#ef4444"
  if (s === "disconnected") return "#22c55e"
  if (s === "paid" || s === "agency paid") return "#16a34a"
  if (s === "visited") return "#f97316"
  if (s === "not found") return "#8b5cf6"
  if (s === "bill dispute" || s === "office team") return "#0ea5e9"
  return "#64748b"
}

function formatOsdValue(value: string | number | undefined): string {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"))
  if (!Number.isFinite(numeric)) return "₹0"
  return `₹${numeric.toLocaleString("en-IN")}`
}

function formatOsdMarkerLabel(value: string | number | undefined): string {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"))
  if (!Number.isFinite(numeric)) return "₹0"
  if (numeric >= 100000) return `₹${(numeric / 100000).toFixed(1)}L`
  if (numeric >= 1000) return `₹${(numeric / 1000).toFixed(1)}k`
  return `₹${Math.round(numeric)}`
}

function formatRangeLabel(val: number): string {
  return val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)} km` : `${val}m`
}

export function NearbyConsumerMap({
  consumers,
  onClose,
  onGoToConsumer,
  defaultRange = 500,
  minRange = 500,
  maxRange = 5000,
  stepRange = 500,
  defaultFilterPending = false,
  isMasterMode = false,
}: Props) {
  const [range, setRange] = useState<number>(defaultRange)
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(true)
  const [filterPending, setFilterPending] = useState(defaultFilterPending)
  const [mapType, setMapType] = useState<"roadmap" | "hybrid">("roadmap")
  const [mounted, setMounted] = useState(false)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const nearestMarkerRef = useRef<any>(null)
  const goToRef = useRef(onGoToConsumer)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    goToRef.current = onGoToConsumer
  }, [onGoToConsumer])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Mount portal, lock background page scroll, and support Escape to return
  useEffect(() => {
    setMounted(true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  // Expose global bridges so Leaflet popup buttons trigger navigation or Google Maps directions
  useEffect(() => {
    ;(window as any).__nearbyConsumerGo = (consumerId: string) => {
      const consumer = consumers.find((c) => c.consumerId === consumerId)
      if (consumer) goToRef.current(consumer)
    }
    ;(window as any).__nearbyConsumerOpenDirections = (lat: number, lng: number) => {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      window.open(url, "_blank", "noopener,noreferrer")
    }
    return () => {
      delete (window as any).__nearbyConsumerGo
      delete (window as any).__nearbyConsumerOpenDirections
    }
  }, [consumers])

  // Load Leaflet once via shared loader
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const mod = await import("@/lib/leaflet-loader")
        await mod.ensureLeafletLoaded()
        if (active) setLeafletLoaded(true)
      } catch (err) {
        console.error("Failed to load Leaflet:", err)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // GPS Location
  const fetchLocation = () => {
    setLoadingLocation(true)
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "GPS unavailable",
        description: "Geolocation is not supported by your browser.",
      })
      setUserCoords([25.452202, 88.02109])
      setLoadingLocation(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords([pos.coords.latitude, pos.coords.longitude])
        setLoadingLocation(false)
      },
      () => {
        toast({
          title: "Location access denied",
          description: "Centering GPS radar on default office coordinates.",
        })
        setUserCoords([25.452202, 88.02109])
        setLoadingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  useEffect(() => {
    if (leafletLoaded) fetchLocation()
  }, [leafletLoaded])

  const nearbyConsumers = useMemo(() => {
    if (!userCoords) return [] as Array<{ consumer: ConsumerData; lat: number; lng: number; dist: number }>

    return consumers
      .map((consumer) => {
        const lat = Number.parseFloat(consumer.latitude || "")
        const lng = Number.parseFloat(consumer.longitude || "")
        if (Number.isNaN(lat) || Number.isNaN(lng) || lat === 0 || lng === 0) return null

        const dist = getDistanceMeters(userCoords[0], userCoords[1], lat, lng)
        if (dist > range) return null

        const rawStatus = (consumer.disconStatus || "").trim().toLowerCase()
        const status = rawStatus || "connected"
        const isPending =
          status === "connected" ||
          status.includes("connected") ||
          status === "visited" ||
          status === "not found" ||
          status === "bill dispute" ||
          status === "office team"
        if (filterPending && !isPending) return null

        return { consumer, lat, lng, dist }
      })
      .filter(Boolean) as Array<{ consumer: ConsumerData; lat: number; lng: number; dist: number }>
  }, [consumers, userCoords, range, filterPending])

  const nearestItem = useMemo(() => {
    if (nearbyConsumers.length === 0) return null
    return nearbyConsumers.reduce((best, item) => (item.dist < best.dist ? item : best), nearbyConsumers[0])
  }, [nearbyConsumers])

  const totalNearbyOsd = useMemo(
    () => nearbyConsumers.reduce((sum, item) => sum + (Number.parseFloat(item.consumer.d2NetOS || "0") || 0), 0),
    [nearbyConsumers]
  )

  const rangePresets = useMemo(() => {
    if (maxRange <= 500) {
      return [100, 200, 350, 500].filter((v) => v >= minRange && v <= maxRange)
    }
    return [500, 1000, 2000, 5000].filter((v) => v >= minRange && v <= maxRange)
  }, [minRange, maxRange])

  const handleRecenterOnUser = () => {
    if (mapInstanceRef.current && userCoords) {
      mapInstanceRef.current.flyTo(userCoords, mapInstanceRef.current.getZoom(), { duration: 0.45 })
    }
  }

  const handleFocusNearest = () => {
    if (mapInstanceRef.current && nearestItem) {
      mapInstanceRef.current.flyTo([nearestItem.lat, nearestItem.lng], Math.max(17, mapInstanceRef.current.getZoom()), {
        duration: 0.55,
      })
      if (nearestMarkerRef.current) {
        setTimeout(() => {
          nearestMarkerRef.current?.openPopup?.()
        }, 420)
      }
    }
  }

  // Render Leaflet map into full-screen container
  useEffect(() => {
    if (!mounted || !userCoords || !leafletLoaded || !mapContainerRef.current) return

    const L = (window as any).L
    if (!L) return

    let zoom = 16
    if (maxRange <= 1000) {
      if (range <= 100) zoom = 19
      else if (range <= 250) zoom = 18
      else if (range <= 400) zoom = 17
      else zoom = 16
    } else {
      if (range >= 5000) zoom = 13
      else if (range >= 3000) zoom = 14
      else if (range >= 1500) zoom = 15
      else if (range >= 1000) zoom = 15
    }

    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(userCoords, zoom)
    mapInstanceRef.current = map
    nearestMarkerRef.current = null

    const googleTileUrl =
      mapType === "roadmap"
        ? "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        : "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"

    L.tileLayer(googleTileUrl, {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
    }).addTo(map)

    // Range circle
    L.circle(userCoords, {
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.08,
      radius: range,
      weight: 1.5,
    }).addTo(map)

    // User location pulsing marker
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
        iconAnchor: [10, 10],
      }),
    })
      .addTo(map)
      .bindTooltip("You are here", { permanent: false, direction: "top" })

    let nearestConsumer: { consumer: ConsumerData; lat: number; lng: number; dist: number } | null = null

    nearbyConsumers.forEach(({ consumer, lat, lng, dist }) => {
      const isNewNearest = !nearestConsumer || dist < nearestConsumer.dist
      if (isNewNearest) {
        nearestConsumer = { consumer, lat, lng, dist }
      }

      const color = getStatusColor(consumer.disconStatus)
      const osd = Number.parseFloat(consumer.d2NetOS || "0").toLocaleString("en-IN")
      const markerLabel = isMasterMode
        ? consumer.baseClass || consumer.class || "—"
        : formatOsdMarkerLabel(consumer.d2NetOS)

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "custom-consumer-marker",
          html: `
            <div style="
              padding: 2px 7px;
              background: ${color};
              border: 2px solid rgba(255,255,255,0.85);
              border-radius: 999px;
              font-size: 9px;
              font-weight: 800;
              font-family: monospace;
              color: white;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(15,23,42,0.3);
              letter-spacing: 0.03em;
            ">
              ${markerLabel}
            </div>
          `,
          iconAnchor: [20, 10],
        }),
      }).addTo(map)

      const safeId = (consumer.consumerId || "").replace(/"/g, "&quot;")
      const safeName = (consumer.name || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
      const safeAddress = (consumer.address || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")

      const popupHtml = isMasterMode
        ? `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 6px 8px; line-height: 1.6; color: #1e293b; min-width: 210px; max-width: 250px;">
          <p style="margin: 0 0 6px 0; font-weight: 800; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">
            ${safeName}
          </p>
          <p style="margin: 2px 0; color: #475569;">Class: <strong style="color:#0f172a;">${consumer.baseClass || consumer.class || "—"}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Address: <strong style="color:#0f172a; font-weight:600;">${safeAddress}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Distance: <strong style="color:#0f172a;">${Math.round(dist)} m</strong></p>
          ${consumer.mobileNumber ? `<p style="margin: 2px 0; color: #475569;">Mobile: <a href="tel:${consumer.mobileNumber}" style="color:#2563eb;">${consumer.mobileNumber}</a></p>` : ""}
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button
              type="button"
              style="flex: 1; padding: 7px 0; background: #0f766e; color: #fff; font-weight: 700; font-size: 11px; border-radius: 8px; border: none; cursor: pointer;"
              onclick="window.__nearbyConsumerOpenDirections && window.__nearbyConsumerOpenDirections(${lat}, ${lng})"
            >
              Directions
            </button>
            <button
              type="button"
              style="flex: 1; padding: 7px 0; background: #2563eb; color: #fff; font-weight: 700; font-size: 11px; border-radius: 8px; border: none; cursor: pointer;"
              onclick="window.__nearbyConsumerGo && window.__nearbyConsumerGo('${safeId}')"
            >
              Details
            </button>
          </div>
        </div>
        `
        : `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 6px 8px; line-height: 1.6; color: #1e293b; min-width: 210px; max-width: 250px;">
          <p style="margin: 0 0 6px 0; font-weight: 800; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">
            ${safeName}
          </p>
          <p style="margin: 2px 0; color: #475569;">OSD: <strong style="color:#dc2626;">₹${osd}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Class: <strong style="color:#0f172a;">${consumer.baseClass || consumer.class || "—"}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Address: <strong style="color:#0f172a; font-weight:600;">${safeAddress}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Status: <strong style="color:${color}; text-transform:capitalize;">${consumer.disconStatus || "—"}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Distance: <strong style="color:#0f172a;">${Math.round(dist)} m</strong></p>
          ${consumer.mobileNumber ? `<p style="margin: 2px 0; color: #475569;">Mobile: <a href="tel:${consumer.mobileNumber}" style="color:#2563eb;">${consumer.mobileNumber}</a></p>` : ""}
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button
              type="button"
              style="flex: 1; padding: 7px 0; background: #0f766e; color: #fff; font-weight: 700; font-size: 11px; border-radius: 8px; border: none; cursor: pointer;"
              onclick="window.__nearbyConsumerOpenDirections && window.__nearbyConsumerOpenDirections(${lat}, ${lng})"
            >
              Directions
            </button>
            <button
              type="button"
              style="flex: 1; padding: 7px 0; background: #2563eb; color: #fff; font-weight: 700; font-size: 11px; border-radius: 8px; border: none; cursor: pointer;"
              onclick="window.__nearbyConsumerGo && window.__nearbyConsumerGo('${safeId}')"
            >
              Update
            </button>
          </div>
        </div>
        `

      marker.bindPopup(popupHtml, { maxWidth: 270 })

      if (isNewNearest) {
        nearestMarkerRef.current = marker
      }
    })

    // Nearest consumer dashed line + arrow
    if (nearestConsumer) {
      const nc = nearestConsumer as { consumer: ConsumerData; lat: number; lng: number; dist: number }
      L.polyline([userCoords, [nc.lat, nc.lng]], {
        color: "#ef4444",
        weight: 2,
        dashArray: "5,5",
        opacity: 0.85,
      }).addTo(map)

      const midLat = (userCoords[0] + nc.lat) / 2
      const midLng = (userCoords[1] + nc.lng) / 2
      const dy = nc.lat - userCoords[0]
      const dx = Math.cos((Math.PI / 180) * userCoords[0]) * (nc.lng - userCoords[1])
      const angle = (Math.atan2(dx, dy) * 180) / Math.PI

      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "direction-arrow-marker",
          html: `<div style="transform: rotate(${angle}deg); font-size: 15px; color: #ef4444; font-weight: bold; line-height: 1; text-shadow: 0 0 3px #fff;">▲</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      })
        .addTo(map)
        .bindTooltip(
          isMasterMode
            ? `Nearest: ${nc.consumer.baseClass || nc.consumer.class || "—"} (${Math.round(nc.dist)}m)`
            : `Nearest: ${formatOsdMarkerLabel(nc.consumer.d2NetOS)} (${Math.round(nc.dist)}m)`,
          {
            permanent: true,
            direction: "top",
            className: "px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[9px] font-bold border-none shadow-md",
          }
        )
    }

    // Ensure full-viewport tiles size accurately right after portal mount & viewport resizes
    const invalidate1 = setTimeout(() => map.invalidateSize(), 80)
    const invalidate2 = setTimeout(() => map.invalidateSize(), 320)
    const handleResize = () => map.invalidateSize()
    window.addEventListener("resize", handleResize)

    return () => {
      clearTimeout(invalidate1)
      clearTimeout(invalidate2)
      window.removeEventListener("resize", handleResize)
      mapInstanceRef.current = null
      nearestMarkerRef.current = null
      map.remove()
    }
  }, [mounted, userCoords, range, nearbyConsumers, leafletLoaded, filterPending, mapType, isMasterMode, maxRange])

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[90] w-screen h-[100dvh] bg-white flex flex-col overflow-hidden animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Locate Consumer GPS Radar"
    >
      {/* Dedicated Full-Screen Page Header */}
      <header className="bg-slate-950 text-white px-3 sm:px-5 h-14 flex items-center justify-between gap-2 shrink-0 border-b border-slate-800 shadow-sm z-40">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-semibold text-xs gap-1.5 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>

          <div className="h-8 w-8 rounded-xl bg-blue-600/20 border border-blue-500/30 hidden sm:flex items-center justify-center shrink-0">
            <Navigation className="h-4 w-4 text-blue-400" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight truncate">
                {isMasterMode ? "Consumer Master GPS Radar" : "Locate Consumer — GPS Radar"}
              </h1>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                {nearbyConsumers.length} in range
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block truncate">
              Tap any marker to inspect details, launch Google Maps directions, or update status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMapType((prev) => (prev === "roadmap" ? "hybrid" : "roadmap"))}
            className="h-8 px-2.5 text-[11px] font-semibold rounded-lg border border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700 hover:text-white gap-1.5 cursor-pointer"
            title="Switch between Street and Satellite view"
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden sm:inline">{mapType === "roadmap" ? "Satellite" : "Street"}</span>
          </Button>

          {!isMasterMode && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilterPending(!filterPending)}
              className={`h-8 px-2.5 text-[11px] font-semibold rounded-lg border gap-1.5 cursor-pointer transition-colors ${
                filterPending
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 hover:text-amber-200"
                  : "bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white"
              }`}
              title="Toggle pending consumers only"
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{filterPending ? "Pending Only" : "All Status"}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={fetchLocation}
            disabled={loadingLocation}
            className="h-8 w-8 rounded-lg border border-slate-700 bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
            title="Refresh Live GPS Location"
            aria-label="Refresh GPS Location"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingLocation ? "animate-spin text-blue-400" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Compact Legend Strip */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-3 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-x-3.5 gap-y-1 shrink-0">
          {isMasterMode ? (
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-[#3b82f6] ring-2 ring-blue-400/30" />
              <span className="text-[11px] text-slate-300 font-medium">
                Consumer Master Records (Marker badge shows Tariff Class)
              </span>
            </div>
          ) : (
            [
              { color: "#ef4444", label: "Connected" },
              { color: "#f97316", label: "Visited" },
              { color: "#22c55e", label: "Disconnected" },
              { color: "#16a34a", label: "Paid" },
              { color: "#8b5cf6", label: "Not Found" },
              { color: "#0ea5e9", label: "Dispute/Office" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 shrink-0">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-slate-300 font-medium">{label}</span>
              </div>
            ))
          )}
        </div>

        <div className="hidden lg:flex items-center gap-2 shrink-0">
          {nearestItem && (
            <button
              type="button"
              onClick={handleFocusNearest}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300 hover:text-rose-200 bg-rose-500/15 border border-rose-500/30 rounded-md px-2 py-0.5 transition-colors cursor-pointer"
            >
              <Compass className="h-3 w-3" />
              Nearest: {Math.round(nearestItem.dist)}m
            </button>
          )}
          <button
            type="button"
            onClick={handleRecenterOnUser}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 bg-sky-500/15 border border-sky-500/30 rounded-md px-2 py-0.5 transition-colors cursor-pointer"
          >
            <Crosshair className="h-3 w-3" />
            My Location
          </button>
        </div>
      </div>

      {/* Full-Viewport Edge-to-Edge Map Canvas */}
      <div className="flex-1 relative min-h-0 w-full bg-slate-100">
        {(!leafletLoaded || loadingLocation) && (
          <div className="absolute inset-0 bg-slate-50/95 flex flex-col items-center justify-center text-slate-600 text-sm gap-3 z-50">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shadow-xs">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="font-bold text-slate-800 text-sm">Acquiring GPS signal...</p>
              <p className="text-xs text-slate-500">Centering radar and loading map tiles</p>
            </div>
          </div>
        )}

        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

        {/* Floating Quick Action Buttons on Mobile/Tablet */}
        {!loadingLocation && leafletLoaded && (
          <div className="lg:hidden absolute right-3 bottom-3 z-[400] flex flex-col gap-2">
            {nearestItem && (
              <Button
                type="button"
                size="sm"
                onClick={handleFocusNearest}
                className="h-9 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg text-xs font-bold gap-1.5 cursor-pointer"
                title="Focus nearest consumer"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>{Math.round(nearestItem.dist)}m</span>
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              onClick={handleRecenterOnUser}
              className="h-10 w-10 rounded-xl bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 shadow-lg self-end cursor-pointer"
              title="Recenter on my location"
              aria-label="Recenter on my location"
            >
              <Crosshair className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Telemetry & Range Dock */}
      <footer className="bg-white border-t border-slate-200 px-3 sm:px-5 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 z-40 shrink-0 shadow-[0_-4px_16px_-6px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-600">
              Radius:{" "}
              <span className="text-blue-700 font-mono font-extrabold">{formatRangeLabel(range)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 rounded-lg px-2.5 py-1">
            <span>
              Nearby: <strong className="font-mono text-slate-900">{nearbyConsumers.length}</strong>
            </span>
            {!isMasterMode && (
              <>
                <span className="text-slate-300">|</span>
                <span>
                  OSD: <strong className="font-mono text-rose-700">{formatOsdValue(totalNearbyOsd)}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 sm:max-w-lg justify-end">
          {/* Quick range preset pills */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {rangePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRange(preset)}
                disabled={loadingLocation}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                  range === preset
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {formatRangeLabel(preset)}
              </button>
            ))}
          </div>

          <input
            type="range"
            min={minRange}
            max={maxRange}
            step={stepRange}
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            aria-label="Search radius in meters"
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
            disabled={loadingLocation}
          />
        </div>
      </footer>
    </div>,
    document.body
  )
}
