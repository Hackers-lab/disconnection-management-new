"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { getFromCache, saveToCache, getCacheAgeMs, getCccPrefix } from "@/lib/indexed-db"
import { Search, X, User, MapPin, Phone, Monitor, Map, ChevronDown, ChevronUp, Upload, ExternalLink, Database, Smartphone, Gauge, ShieldCheck, AlertTriangle, Layers, Activity, ChevronRight } from "lucide-react"
import dynamic from "next/dynamic"

const NearbyConsumerMap = dynamic(
  () => import("./nearby-consumer-map").then((mod) => mod.NearbyConsumerMap),
  { ssr: false }
)

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ConsumerMasterRow {
  consumerId: string
  name:       string
  careOf:     string
  address:    string
  baseClass:  string
  meterNo:    string
  zone:       string
  mobile:     string
  latitude:   string
  longitude:  string
}

const CACHE_KEY  = "consumer_master_cache"
const CACHE_TTL  = 30 * 24 * 60 * 60 * 1000 // 30 days

const FIELD_LABELS: Record<keyof ConsumerMasterRow, string> = {
  consumerId: "Consumer ID",
  name:       "Name",
  careOf:     "C/O",
  address:    "Address",
  baseClass:  "Class",
  meterNo:    "Meter No",
  zone:       "Zone",
  mobile:     "Mobile",
  latitude:   "Latitude",
  longitude:  "Longitude",
}

const REQUIRED_FIELDS: (keyof ConsumerMasterRow)[] = ["consumerId", "name"]

// ── Lookup widget (used by other components as a picker) ──────────────────────
// ── Chunked Fetch Helper ──────────────────────────────────────────────────────
export async function fetchMasterInChunks(options?: {
  refresh?: boolean
  onProgress?: (loaded: number, total: number) => void
}): Promise<ConsumerMasterRow[]> {
  const refresh = options?.refresh ?? false
  const limit = 10000
  let offset = 0
  let allRows: ConsumerMasterRow[] = []
  let total = 0

  while (true) {
    const url = `/api/consumer-master?offset=${offset}&limit=${limit}${refresh && offset === 0 ? "&refresh=true" : ""}`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch chunk at offset ${offset}`)
    }
    
    const totalHeader = res.headers.get("x-total-count") || res.headers.get("X-Total-Count")
    if (totalHeader) {
      total = parseInt(totalHeader, 10)
    }

    const chunk: ConsumerMasterRow[] = await res.json()
    allRows = allRows.concat(chunk)

    if (options?.onProgress) {
      options.onProgress(allRows.length, total || allRows.length)
    }

    if (chunk.length < limit || (total > 0 && allRows.length >= total)) {
      break
    }
    offset += limit
  }

  return allRows
}

interface LookupProps {
  onSelect: (row: ConsumerMasterRow) => void
  placeholder?: string
}

export function ConsumerMasterLookup({ onSelect, placeholder = "Search by consumer ID or name…" }: LookupProps) {
  const [query, setQuery]       = useState("")
  const [results, setResults]   = useState<ConsumerMasterRow[]>([])
  const [data, setData]         = useState<ConsumerMasterRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [loadingProgress, setLoadingProgress] = useState("")
  const [fetched, setFetched]   = useState(false)
  const { toast }               = useToast()

  // Lazy-load from cache, then server
  useEffect(() => {
    if (fetched) return
    ;(async () => {
      setLoading(true)
      try {
        const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
        const age    = await getCacheAgeMs(CACHE_KEY)
        if (cached && Array.isArray(cached) && cached.length > 0 && typeof age === "number" && age < CACHE_TTL) {
          setData(cached)
          setFetched(true)
          return
        }
        const fresh = await fetchMasterInChunks({
          onProgress: (loaded, total) => {
            setLoadingProgress(`Syncing: ${loaded.toLocaleString()} / ${total.toLocaleString()}`)
          }
        })
        await saveToCache(CACHE_KEY, fresh)
        setData(fresh)
        setFetched(true)
      } catch (e: any) {
        toast({ title: "Consumer master unavailable", description: e.message, variant: "destructive" })
      } finally {
        setLoading(false)
        setLoadingProgress("")
      }
    })()
  }, [fetched, toast])

  // Debounced search
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleQuery = (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!q.trim()) { setResults([]); return }
      const lower = q.toLowerCase()
      setResults(
        data.filter(r =>
          r.consumerId.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower)
        ).slice(0, 50)
      )
    }, 200)
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={e => handleQuery(e.target.value)}
        disabled={loading}
      />
      {loading && <p className="text-xs text-muted-foreground">{loadingProgress || "Loading consumer master…"}</p>}
      {results.length > 0 && (
        <div className="border rounded-md max-h-52 overflow-y-auto divide-y text-sm">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
              onClick={() => { onSelect(r); setQuery(""); setResults([]) }}
            >
              <span className="font-medium">{r.consumerId}</span>
              <span className="mx-2 text-muted-foreground">{r.name}</span>
              {r.careOf && <span className="text-muted-foreground text-xs">C/O {r.careOf}</span>}
              <div className="text-xs text-muted-foreground truncate">{r.address}</div>
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && fetched && !loading && (
        <p className="text-xs text-muted-foreground">No match found. You can enter details manually.</p>
      )}
    </div>
  )
}

// ── Main consumer master page (admin upload + stats) ─────────────────────────
interface ConsumerMasterProps {
  role: string
  permissions?: Record<string, string[]>
}

type ColumnMapping = Partial<Record<keyof ConsumerMasterRow, number>>

export function ConsumerMaster({ role, permissions }: ConsumerMasterProps) {
  const { toast } = useToast()
  const isAdmin   = role === "admin" || !!(permissions && (permissions.consumer_master?.includes("create") || permissions.consumer_master?.includes("update")))

  // Upload state
  const [csvHeaders, setCsvHeaders]       = useState<string[]>([])
  const [csvRows, setCsvRows]             = useState<string[][]>([])
  const [fileName, setFileName]           = useState("")
  const [mapping, setMapping]             = useState<ColumnMapping>({})
  const [uploading, setUploading]         = useState(false)
  const [uploadProgress, setUploadProgress] = useState("") // e.g. "5000 / 15000"
  const [uploadResult, setUploadResult]   = useState<{ count: number } | null>(null)

  // Stats state
  const [count, setCount]                 = useState<number | null>(null)
  const [cacheAge, setCacheAge]           = useState<number | null>(null)
  const [loadingStats, setLoadingStats]   = useState(false)
  const [syncProgress, setSyncProgress]   = useState("")

  // Search / browse state (for non-admin or after upload)
  const [query, setQuery]                 = useState("")
  const [results, setResults]             = useState<ConsumerMasterRow[]>([])
  const [allData, setAllData]             = useState<ConsumerMasterRow[]>([])
  const [dataLoaded, setDataLoaded]       = useState(false)
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerMasterRow | null>(null)
  const [showUpload, setShowUpload]       = useState(false)
  const [showNearbyMap, setShowNearbyMap] = useState(false)
  const timerRef                          = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mapped consumers for NearbyConsumerMap radar component
  const consumersToMap = query.trim() ? results : allData
  const mappedConsumers = useMemo(() => {
    return consumersToMap.map(r => ({
      consumerId: r.consumerId,
      name: r.name,
      address: r.address,
      mobileNumber: r.mobile,
      latitude: r.latitude,
      longitude: r.longitude,
      baseClass: r.baseClass,
      class: r.baseClass,
      disconStatus: "Master Record",
      d2NetOS: "0",
      mru: r.zone,
      agency: r.zone,
    }))
  }, [consumersToMap])

  // ── Compute Dashboard Statistics ──────────────────────────────────────────
  const stats = useMemo(() => {
    if (!allData || allData.length === 0) return null

    let geotaggedCount = 0
    let mobileCount = 0
    let meterCount = 0
    const zoneMap: Record<string, number> = {}
    const classMap: Record<string, number> = {}

    for (const r of allData) {
      if (r.latitude && r.longitude && r.latitude.trim() && r.longitude.trim() && r.latitude !== "0" && r.longitude !== "0") {
        geotaggedCount++
      }
      if (r.mobile && r.mobile.trim() && r.mobile !== "0") {
        mobileCount++
      }
      if (r.meterNo && r.meterNo.trim()) {
        meterCount++
      }

      const zoneName = r.zone ? r.zone.trim() : "Unassigned"
      zoneMap[zoneName] = (zoneMap[zoneName] || 0) + 1

      const className = r.baseClass ? r.baseClass.trim() : "Unspecified"
      classMap[className] = (classMap[className] || 0) + 1
    }

    const sortedZones = Object.entries(zoneMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const sortedClasses = Object.entries(classMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const total = allData.length
    const geotagPct = total > 0 ? Math.round((geotaggedCount / total) * 100) : 0
    const mobilePct = total > 0 ? Math.round((mobileCount / total) * 100) : 0
    const meterPct = total > 0 ? Math.round((meterCount / total) * 100) : 0
    const completeness = Math.round((geotagPct + mobilePct + meterPct) / 3)

    return {
      total,
      geotagged: { count: geotaggedCount, percent: geotagPct },
      mobile: { count: mobileCount, percent: mobilePct },
      meter: { count: meterCount, percent: meterPct },
      completeness,
      zones: sortedZones,
      classes: sortedClasses,
    }
  }, [allData])

  useEffect(() => {
    loadMasterData(false)
  }, [])

  async function loadMasterData(force = false) {
    setLoadingStats(true)
    try {
      const age = await getCacheAgeMs(CACHE_KEY)
      setCacheAge(typeof age === "number" ? age : null)
      
      if (!force) {
        const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setCount(cached.length)
          setAllData(cached)
          setDataLoaded(true)
          setLoadingStats(false)
          return
        }
      }

      setDataLoaded(false)
      const data = await fetchMasterInChunks({
        refresh: force,
        onProgress: (loaded, total) => {
          setSyncProgress(`Syncing: ${loaded.toLocaleString()} / ${total.toLocaleString()}`)
        }
      })
      await saveToCache(CACHE_KEY, data)
      setCount(data.length)
      if (typeof window !== "undefined") {
        const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
        localStorage.setItem(`${prefix}consumer_master_row_count`, String(data.length))
      }
      setAllData(data)
      setDataLoaded(true)
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" })
    } finally {
      setLoadingStats(false)
      setSyncProgress("")
    }
  }

  const handleSearch = (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!q.trim()) { setResults([]); return }
      const lower = q.toLowerCase()
      setResults(
        allData.filter(r =>
          r.consumerId.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower) ||
          (r.meterNo && r.meterNo.toLowerCase().includes(lower)) ||
          (r.zone && r.zone.toLowerCase().includes(lower)) ||
          (r.baseClass && r.baseClass.toLowerCase().includes(lower))
        ).slice(0, 100)
      )
    }, 200)
  }

  // ── CSV upload flow ─────────────────────────────────────────────────────────
  const handleFileDrop = useCallback((file: File) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res: Papa.ParseResult<string[]>) => {
        const rows = res.data as string[][]
        if (rows.length < 2) { toast({ title: "File has no data rows", variant: "destructive" }); return }
        const headers = rows[0].map(h => String(h).trim())
        const data    = rows.slice(1)
        setCsvHeaders(headers)
        setCsvRows(data)
        setFileName(file.name)
        setMapping({})
        setUploadResult(null)
        // Auto-detect common column names
        const auto: ColumnMapping = {}
        headers.forEach((h, i) => {
          const lower = h.toLowerCase().replace(/[\s_-]/g, "")
          if (lower.includes("consumerid") || lower === "id" || lower === "slno" || lower === "accountno") auto.consumerId = i
          else if (lower === "name" || lower.includes("consumername")) auto.name = i
          else if (lower.includes("co") || lower.includes("careof") || lower.includes("fathername")) auto.careOf = i
          else if (lower.includes("address")) auto.address = i
          else if (lower.includes("class") || lower.includes("category") || lower.includes("tariff")) auto.baseClass = i
          else if (lower.includes("meterno") || lower.includes("meter")) auto.meterNo = i
          else if (lower.includes("zone") || lower.includes("divison") || lower.includes("division")) auto.zone = i
          else if (lower.includes("mobile") || lower.includes("phone") || lower.includes("contact")) auto.mobile = i
          else if (lower.includes("lat")) auto.latitude = i
          else if (lower.includes("lon") || lower.includes("lng")) auto.longitude = i
        })
        setMapping(auto)
      },
    })
  }, [toast])

  const handleUpload = async () => {
    const missing = REQUIRED_FIELDS.filter(f => mapping[f] === undefined)
    if (missing.length > 0) {
      toast({ title: `Map required fields: ${missing.map(f => FIELD_LABELS[f]).join(", ")}`, variant: "destructive" })
      return
    }
    setUploading(true)
    setUploadProgress("")
    try {
      const rows: ConsumerMasterRow[] = csvRows.map(r => ({
        consumerId: String(r[mapping.consumerId!] ?? "").trim(),
        name:       String(r[mapping.name!]       ?? "").trim(),
        careOf:     String(r[mapping.careOf   ?? -1] ?? "").trim(),
        address:    String(r[mapping.address  ?? -1] ?? "").trim(),
        baseClass:  String(r[mapping.baseClass ?? -1] ?? "").trim(),
        meterNo:    String(r[mapping.meterNo  ?? -1] ?? "").trim(),
        zone:       String(r[mapping.zone     ?? -1] ?? "").trim(),
        mobile:     String(r[mapping.mobile   ?? -1] ?? "").trim(),
        latitude:   String(r[mapping.latitude ?? -1] ?? "").trim(),
        longitude:  String(r[mapping.longitude ?? -1] ?? "").trim(),
      })).filter(r => r.consumerId && r.name)

      // Upload in chunks of 5000 to match server batch size and reduce
      // round-trips. Each POST call writes its chunk to the sheet.
      const CHUNK = 5000
      let serverConfirmed = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        setUploadProgress(`${Math.min(i + chunk.length, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`)
        const res = await fetch("/api/consumer-master", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunk,
            clearExisting: i === 0,
          }),
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Upload failed") }
        const result = await res.json()
        // Use the server-confirmed count (actual rows written to sheet)
        serverConfirmed += result.count ?? chunk.length
      }
      setUploadResult({ count: serverConfirmed })
      setCount(serverConfirmed)
      // Refresh IndexedDB cache
      setUploadProgress("Refreshing cache…")
      const fresh = await fetchMasterInChunks({
        refresh: true,
        onProgress: (loaded, total) => {
          setUploadProgress(`Refreshing cache: ${loaded.toLocaleString()} / ${total.toLocaleString()}`)
        }
      })
      await saveToCache(CACHE_KEY, fresh)
      if (typeof window !== "undefined") {
        const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
        localStorage.setItem(`${prefix}consumer_master_row_count`, String(fresh.length))
      }
      setAllData(fresh)
      setDataLoaded(true)
      setCsvHeaders([])
      setCsvRows([])
      setFileName("")
      if (serverConfirmed < rows.length) {
        toast({
          title: `Partial upload: ${serverConfirmed.toLocaleString()} of ${rows.length.toLocaleString()} written`,
          description: "Some batches may have failed due to rate limiting. Try uploading the remaining rows again.",
          variant: "destructive",
        })
      } else {
        toast({ title: `Uploaded ${serverConfirmed.toLocaleString()} consumers successfully` })
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
      setUploadProgress("")
    }
  }

  const formatAge = (ms: number) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (h > 0) return `${h}h ${m}m ago`
    return `${m}m ago`
  }

  return (
    <div className="space-y-4">
      {/* Nearby Consumer Radar overlay */}
      {showNearbyMap && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-4xl h-full max-h-[90vh]">
            <NearbyConsumerMap
              consumers={mappedConsumers}
              defaultRange={500}
              minRange={50}
              maxRange={500}
              stepRange={50}
              defaultFilterPending={false}
              onClose={() => setShowNearbyMap(false)}
              onGoToConsumer={(consumer) => {
                setShowNearbyMap(false)
                const found = allData.find(c => c.consumerId === consumer.consumerId)
                if (found) {
                  setSelectedConsumer(found)
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Header + stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Consumer Master</h2>
          <p className="text-sm text-muted-foreground">
            {loadingStats 
              ? (syncProgress || "Loading…")
              : count !== null ? `${count.toLocaleString()} consumers loaded${cacheAge !== null ? " · cached " + formatAge(cacheAge) : ""}`
              : "No data yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadMasterData(true) }} disabled={loadingStats}>
            Refresh Cache
          </Button>
        </div>
      </div>

      {/* Search section — always on top */}
      <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by consumer ID, name, or meter number…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            className="pl-10 pr-8 rounded-xl h-11 text-base"
          />
          {query && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => { setQuery(""); setResults([]) }} />}
        </div>
        
        {dataLoaded && (
          <Button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
              setShowNearbyMap(v => !v)
            }}
            className="w-full h-11 rounded-xl font-extrabold flex items-center justify-center gap-2 text-sm shadow-sm transition-all duration-300 transform hover:scale-[1.01] bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-750 text-white"
          >
            <MapPin className="h-4 w-4 animate-bounce" />
            {showNearbyMap ? "Hide Navigation Radar" : "Locate Nearby Consumers"}
          </Button>
        )}
        {results.length > 0 && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i}
                className="border rounded-xl p-3 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all duration-200 bg-white"
                onClick={() => setSelectedConsumer(r)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="font-semibold text-gray-900 truncate">{r.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 ml-6">
                      <span className="text-xs font-mono text-gray-500">{r.consumerId}</span>
                      {r.meterNo && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Monitor className="h-3 w-3" />{r.meterNo}
                        </span>
                      )}
                      {r.mobile && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Phone className="h-3 w-3" />{r.mobile}
                        </span>
                      )}
                    </div>
                    {r.address && (
                      <div className="flex items-start gap-1.5 mt-1 ml-6">
                        <MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                        <span className="text-xs text-gray-500 line-clamp-1">{r.address}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {r.baseClass && <Badge variant="outline" className="text-[10px] rounded-full">{r.baseClass}</Badge>}
                    {r.zone && <Badge variant="secondary" className="text-[10px] rounded-full">{r.zone}</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {query && results.length === 0 && dataLoaded && (
          <p className="text-sm text-muted-foreground text-center py-4">No consumers matched &quot;{query}&quot;.</p>
        )}
        {!dataLoaded && (
          <p className="text-sm text-muted-foreground text-center py-2">Loading data…</p>
        )}
      </div>

      {/* Stats Dashboard — visible when query is empty and data is loaded */}
      {!query.trim() && dataLoaded && stats && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* KPI Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Total Consumers */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-indigo-500 text-white rounded-xl">
                  <Database className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-100/60 px-2 py-0.5 rounded-full">
                  Total
                </span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-4">
                {stats.total.toLocaleString()}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Active Consumers</p>
            </div>

            {/* Mobile Registry */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-emerald-500 text-white rounded-xl">
                  <Smartphone className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                  {stats.mobile.percent}%
                </span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-4">
                {stats.mobile.count.toLocaleString()}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Mobile Registered</p>
            </div>

            {/* Geotagged */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-blue-500 text-white rounded-xl">
                  <MapPin className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">
                  {stats.geotagged.percent}%
                </span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-4">
                {stats.geotagged.count.toLocaleString()}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Geotagged Locations</p>
            </div>

            {/* Meters Linked */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-amber-500 text-white rounded-xl">
                  <Gauge className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded-full">
                  {stats.meter.percent}%
                </span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-4">
                {stats.meter.count.toLocaleString()}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Meters Linked</p>
            </div>

          </div>

          {/* Database Health & Data Completeness Scorecard */}
          <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Database Completeness Score</h4>
                  <p className="text-xs text-muted-foreground">Overall health score based on key attribute fields completeness</p>
                </div>
              </div>
              <div className="flex items-baseline gap-1 self-start sm:self-auto">
                <span className="text-3xl font-black text-indigo-600">{stats.completeness}%</span>
                <span className="text-xs text-muted-foreground font-semibold">health</span>
              </div>
            </div>

            {/* Visual health score indicator */}
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${stats.completeness}%` }}
              />
            </div>

            {/* Progress indicators for each KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Mobile Coverage</span>
                  <span className="text-slate-850">{stats.mobile.percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${stats.mobile.percent}%` }} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Geotagging Rate</span>
                  <span className="text-slate-850">{stats.geotagged.percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${stats.geotagged.percent}%` }} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Meter Linkage</span>
                  <span className="text-slate-850">{stats.meter.percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${stats.meter.percent}%` }} />
                </div>
              </div>
            </div>

            {/* Help Callout */}
            {stats.completeness < 90 && (
              <div className="flex items-start gap-2.5 bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold">Improving Completeness Score:</span>
                  <p className="text-amber-700 leading-normal">
                    To boost this score, upload consumer updates with complete data. Key missing fields include:
                    {stats.mobile.percent < 90 && ` phone numbers (${(stats.total - stats.mobile.count).toLocaleString()} missing)`}
                    {stats.geotagged.percent < 90 && `${stats.mobile.percent < 90 ? ',' : ''} GPS coordinates (${(stats.total - stats.geotagged.count).toLocaleString()} missing)`}
                    {stats.meter.percent < 90 && `${(stats.mobile.percent < 90 || stats.geotagged.percent < 90) ? ',' : ''} meters (${(stats.total - stats.meter.count).toLocaleString()} missing)`}.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Breakdown Distributions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Zone Breakdown */}
            <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Layers className="h-4 w-4 text-indigo-500" />
                <h4 className="font-bold text-slate-800 text-sm">Zone Distribution</h4>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {stats.zones.length} Zones
                </Badge>
              </div>
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                {stats.zones.map((zone, idx) => {
                  const pct = Math.round((zone.count / stats.total) * 100)
                  return (
                    <div 
                      key={idx} 
                      className="group cursor-pointer space-y-1"
                      onClick={() => handleSearch(zone.name)}
                      title={`Click to filter by ${zone.name}`}
                    >
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-slate-700 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                          {zone.name}
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500 transition-all" />
                        </span>
                        <span className="text-slate-500">
                          {zone.count.toLocaleString()} <span className="text-[10px] text-slate-450 font-normal font-sans">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-full rounded-full transition-all group-hover:bg-indigo-600" 
                          style={{ width: `${pct || 1}%` }} 
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Activity className="h-4 w-4 text-indigo-500" />
                <h4 className="font-bold text-slate-800 text-sm">Tariff Class Breakdown</h4>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {stats.classes.length} Classes
                </Badge>
              </div>
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                {stats.classes.map((cls, idx) => {
                  const pct = Math.round((cls.count / stats.total) * 100)
                  return (
                    <div 
                      key={idx} 
                      className="group cursor-pointer space-y-1"
                      onClick={() => handleSearch(cls.name)}
                      title={`Click to filter by ${cls.name}`}
                    >
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-slate-700 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                          {cls.name}
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-indigo-500 transition-all" />
                        </span>
                        <span className="text-slate-500">
                          {cls.count.toLocaleString()} <span className="text-[10px] text-slate-450 font-normal font-sans">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-indigo-400 h-full rounded-full transition-all group-hover:bg-indigo-500" 
                          style={{ width: `${pct || 1}%` }} 
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Upload section (admin only) — collapsible */}
      {isAdmin && (
        <div className="border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            onClick={() => setShowUpload(!showUpload)}
          >
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" />Upload Consumer Data (CSV)</span>
            {showUpload ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showUpload && (
            <div className="p-4 space-y-4 border-t bg-white">
              <div className="flex justify-end">
                <Button
                  size="sm" variant="outline"
                  onClick={() => {
                    const headers = ["Consumer ID", "Name", "C/O", "Address", "Class", "Meter No", "Zone", "Mobile", "Latitude", "Longitude"]
                    const sample  = ["100000001", "John Doe", "Father Name", "Village / Ward / Block / District", "LT Domestic", "OLDMTR001", "Zone A", "9876543210", "25.123456", "88.654321"]
                    const csv     = [headers, sample].map(r => r.join(",")).join("\n")
                    const blob    = new Blob([csv], { type: "text/csv" })
                    const url     = URL.createObjectURL(blob)
                    const a       = document.createElement("a")
                    a.href        = url
                    a.download    = "consumer_master_template.csv"
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Download Template
                </Button>
              </div>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById("cm-file-input")?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f) }}
              >
                <input
                  id="cm-file-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f) }}
                />
                {fileName
                  ? <p className="font-medium">{fileName} <span className="text-muted-foreground text-sm">— {csvRows.length.toLocaleString()} rows</span></p>
                  : <p className="text-muted-foreground">Drop a CSV here or click to choose</p>}
              </div>

              {/* Column mapping */}
              {csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Map CSV columns to fields (<span className="text-red-500">*</span> required)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(Object.keys(FIELD_LABELS) as (keyof ConsumerMasterRow)[]).map(field => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs">
                          {FIELD_LABELS[field]}
                          {REQUIRED_FIELDS.includes(field) && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Select
                          value={mapping[field] !== undefined ? String(mapping[field]) : "__none"}
                          onValueChange={v => setMapping(prev => {
                            const next = { ...prev }
                            if (v === "__none") delete next[field]
                            else next[field] = Number(v)
                            return next
                          })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="— skip —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">— skip —</SelectItem>
                            {csvHeaders.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  {/* Preview */}
                  {csvRows.length > 0 && mapping.consumerId !== undefined && mapping.name !== undefined && (
                    <div className="text-xs border rounded p-2 bg-muted space-y-1">
                      <p className="font-medium">Preview (first 3 rows):</p>
                      {csvRows.slice(0, 3).map((r, i) => (
                        <p key={i} className="text-muted-foreground truncate">
                          {String(r[mapping.consumerId!] ?? "").trim()} — {String(r[mapping.name!] ?? "").trim()}
                          {mapping.address !== undefined && ` — ${String(r[mapping.address] ?? "").trim()}`}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Button onClick={handleUpload} disabled={uploading}>
                      {uploading
                        ? (uploadProgress ? `Uploading ${uploadProgress}…` : "Preparing…")
                        : `Upload ${csvRows.length.toLocaleString()} rows`}
                    </Button>
                    {uploadResult && (
                      <Badge variant="default">{uploadResult.count.toLocaleString()} uploaded</Badge>
                    )}
                    <p className="text-xs text-muted-foreground">This replaces all existing consumer data.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Consumer detail popup ─────────────────────────────────────── */}
      {selectedConsumer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedConsumer(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200 m-0 sm:m-4"
            onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              onClick={() => setSelectedConsumer(null)}>
              <X className="h-4 w-4 text-gray-600" />
            </button>

            {/* Header */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 rounded-t-2xl">
              <p className="text-lg font-bold">{selectedConsumer.name}</p>
              {selectedConsumer.careOf && <p className="text-blue-200 text-sm mt-0.5">C/O {selectedConsumer.careOf}</p>}
              <p className="text-blue-200 text-xs font-mono mt-1">{selectedConsumer.consumerId}</p>
            </div>

            {/* Details */}
            <div className="p-5 space-y-4">
              {/* Quick action buttons */}
              <div className="flex gap-2">
                {selectedConsumer.mobile && (
                  <a href={`tel:${selectedConsumer.mobile}`}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-semibold border border-green-200 hover:bg-green-100 transition-colors">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                )}
                {selectedConsumer.latitude && selectedConsumer.longitude && (
                  <a href={`https://www.google.com/maps?q=${selectedConsumer.latitude},${selectedConsumer.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold border border-blue-200 hover:bg-blue-100 transition-colors">
                    <Map className="h-4 w-4" /> Map
                  </a>
                )}
              </div>

              {/* Info rows */}
              <div className="space-y-3">
                {[
                  { icon: <MapPin className="h-4 w-4" />, label: "Address", value: selectedConsumer.address },
                  { icon: <Monitor className="h-4 w-4" />, label: "Meter No", value: selectedConsumer.meterNo },
                  { icon: <Phone className="h-4 w-4" />, label: "Mobile", value: selectedConsumer.mobile },
                ].filter(row => row.value).map(row => (
                  <div key={row.label} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">{row.icon}</div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{row.label}</p>
                      <p className="text-sm text-gray-900 font-medium break-words">{row.value}</p>
                    </div>
                  </div>
                ))}
                {/* Badges row */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedConsumer.baseClass && <Badge variant="outline" className="rounded-full">{selectedConsumer.baseClass}</Badge>}
                  {selectedConsumer.zone && <Badge variant="secondary" className="rounded-full">{selectedConsumer.zone}</Badge>}
                </div>
                {/* Lat/Long */}
                {selectedConsumer.latitude && selectedConsumer.longitude && (
                  <div className="flex items-start gap-3 py-2">
                    <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><Map className="h-4 w-4" /></div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Coordinates</p>
                      <p className="text-sm text-gray-900 font-mono">{selectedConsumer.latitude}, {selectedConsumer.longitude}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom close */}
            <div className="p-4 border-t">
              <Button variant="outline" className="w-full rounded-xl" onClick={() => setSelectedConsumer(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

