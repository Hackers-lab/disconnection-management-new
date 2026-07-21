"use client"

import React, { useState, useEffect, useMemo, useTransition, useRef } from "react"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search, MapPin, Phone, IndianRupee, RefreshCw, AlertCircle, X, Filter,
  CheckCircle2, Power, Clock, HelpCircle, Edit, LayoutGrid, List,
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, UserX, Image as ImageIcon,
  Check, Loader2, DownloadCloud, Activity,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getFromCache, saveToCache, clearAllCache, getCccPrefix } from "@/lib/indexed-db"
import type { DeemedVisitData } from "@/lib/dd-service"
import { DDStats } from "./dd-stats"
import { DDForm } from "./dd-form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"

function useBackNavigation(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const isBackRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      isBackRef.current = false
      window.history.pushState(null, "", window.location.href)
      const onPopState = () => { isBackRef.current = true; onCloseRef.current() }
      window.addEventListener("popstate", onPopState)
      return () => {
        window.removeEventListener("popstate", onPopState)
        if (!isBackRef.current) window.history.back()
      }
    }
  }, [isOpen])
}

interface DDListProps {
  userRole: string
  userAgencies: string[]
}

export function DDList({ userRole, userAgencies }: DDListProps) {
  const { toast } = useToast()
  const [consumers, setConsumers] = useState<DeemedVisitData[]>([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'found' | 'syncing' | 'updated'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedConsumer, setSelectedConsumer] = useState<DeemedVisitData | null>(null)
  const [baseClasses, setBaseClasses] = useState<string[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [dateFilter, setDateFilter] = useState<{
    from: Date | null
    to: Date | null
    isActive: boolean
  }>({ from: null, to: null, isActive: false })

  const [filters, setFilters] = useState({
    agency: "All Agencies",
    status: "All Status",
    baseClass: "All Classes",
  })

  const consumersRef = useRef<DeemedVisitData[]>([])

  useBackNavigation(isFilterOpen, () => setIsFilterOpen(false))
  useBackNavigation(!!selectedConsumer, () => setSelectedConsumer(null))

  // Persist view mode preference
  useEffect(() => {
    const saved = localStorage.getItem("ddListViewMode") as "card" | "list"
    if (saved === "card" || saved === "list") setViewMode(saved)
  }, [])

  // --- Data Loading ---
  useEffect(() => {
    const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
    const CACHE_KEY = "dd_data_cache"
    const BASE_DATE_KEY = "dd_base_date"
    const ROW_COUNT_KEY = `${prefix}dd_row_count`
    const VERSION_KEY = `${prefix}dd_version_hash`

    async function loadData() {
      let finalStatus = 'idle'
      setError(null)
      try {
        // 1. Instant cache hit
        const cachedData = await getFromCache<DeemedVisitData[]>(CACHE_KEY)
        if (cachedData && cachedData.length > 0) {
          setConsumers(cachedData)
          consumersRef.current = cachedData
          setBaseClasses(extractBaseClasses(cachedData))
          setLoading(false)
        }

        // 2. Check server version
        setSyncStatus('checking')
        const countRes = await fetch("/api/system/row-count?type=dd")
        if (!countRes.ok) throw new Error(`Row count fetch failed: ${countRes.status}`)

        const countData = await countRes.json().catch(() => ({ count: 0, version: null }))
        const serverCount = countData?.count ?? 0
        const serverVersion = countData?.version ?? null
        const localCount = parseInt(localStorage.getItem(ROW_COUNT_KEY) || "0")
        const localVersion = localStorage.getItem(VERSION_KEY) || null

        const isCacheEmpty = !cachedData || cachedData.length === 0
        const isMismatch = serverCount !== localCount || serverVersion !== localVersion

        if (isCacheEmpty || isMismatch) {
          if (isMismatch) setSyncStatus('found')
          setSyncStatus('syncing')

          const res = await fetch(`/api/dd/base?t=${serverCount}`)
          if (!res.ok) throw new Error("Failed to fetch base data")
          const baseData: DeemedVisitData[] = await res.json().catch(() => [])

          // Preserve local edits (syncing/error + 30s stale-write window)
          const LOCAL_WIN_MS = 30_000
          const now = Date.now()
          const merged = baseData.map(newC => {
            const existing = consumersRef.current.find(c => c.consumerId === newC.consumerId)
            if (!existing) return newC
            const recentLocal = existing._localEditedAt && now - existing._localEditedAt < LOCAL_WIN_MS
            if (existing._syncStatus === 'syncing' || existing._syncStatus === 'error' || recentLocal) return existing
            return newC
          })

          await saveToCache(CACHE_KEY, merged)
          await saveToCache(BASE_DATE_KEY, new Date().toISOString().split("T")[0])
          localStorage.setItem(ROW_COUNT_KEY, serverCount.toString())
          if (serverVersion) localStorage.setItem(VERSION_KEY, serverVersion)

          setConsumers(merged)
          consumersRef.current = merged
          setBaseClasses(extractBaseClasses(merged))
          setSyncStatus('updated')
          finalStatus = 'updated'
        } else {
          // 3. Counts match — check for recent patches
          const patchRes = await fetch("/api/dd/patch")
          if (patchRes.ok) {
            const patchData: DeemedVisitData[] = await patchRes.json().catch(() => [])
            if (patchData.length > 0) {
              setSyncStatus('syncing')
              const LOCAL_WIN_MS = 30_000
              const now = Date.now()
              const current = consumersRef.current.length > 0 ? consumersRef.current : (cachedData || [])
              const dataMap = new Map(current.map(c => [c.consumerId, c]))
              patchData.forEach(p => {
                const existing = dataMap.get(p.consumerId)
                const recentLocal = existing?._localEditedAt && now - existing._localEditedAt < LOCAL_WIN_MS
                if (recentLocal || existing?._syncStatus === 'syncing' || existing?._syncStatus === 'error') return
                dataMap.set(p.consumerId, p)
              })
              const merged = Array.from(dataMap.values())
              await saveToCache(CACHE_KEY, merged)
              setConsumers(merged)
              consumersRef.current = merged
              setSyncStatus('updated')
              finalStatus = 'updated'
            }
          }
        }
      } catch (err) {
        console.error(err)
        if (consumersRef.current.length === 0) setError("Failed to load Deemed Visit data")
      } finally {
        setLoading(false)
        if (finalStatus !== 'updated') {
          setTimeout(() => setSyncStatus('idle'), 2000)
        } else {
          setTimeout(() => setSyncStatus('idle'), 4000)
        }
      }
    }

    loadData()
  }, [refreshKey])

  function extractBaseClasses(data: DeemedVisitData[]) {
    return Array.from(new Set(data.map(c => (c.baseClass || "").toUpperCase().trim()).filter(Boolean))).sort()
  }

  // --- Filtering ---
  const filteredConsumers = useMemo(() => {
    return consumers.filter(c => {
      if (userRole !== "admin" && userRole !== "viewer") {
        const myAgencies = userAgencies.map(a => a.toUpperCase())
        if (!myAgencies.includes((c.agency || "").toUpperCase())) return false
      }

      const searchLower = searchTerm.toLowerCase()
      const matchesSearch = !searchTerm ||
        c.name.toLowerCase().includes(searchLower) ||
        c.consumerId.toLowerCase().includes(searchLower) ||
        c.address.toLowerCase().includes(searchLower) ||
        (c.agency || "").toLowerCase().includes(searchLower)

      const matchesAgency = filters.agency === "All Agencies" || c.agency === filters.agency
      const matchesStatus = filters.status === "All Status" || c.disconStatus === filters.status
      const matchesBaseClass = filters.baseClass === "All Classes" || (c.baseClass || "").toUpperCase() === filters.baseClass.toUpperCase()

      const matchesDate = !dateFilter.isActive || (() => {
        if (!c.disconDate) return false
        let dateStr = c.disconDate
        if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [d, m, y] = dateStr.split("-")
          dateStr = `${y}-${m}-${d}`
        }
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return false
        if (dateFilter.from && d < dateFilter.from) return false
        if (dateFilter.to && d > dateFilter.to) return false
        return true
      })()

      return matchesSearch && matchesAgency && matchesStatus && matchesBaseClass && matchesDate
    })
  }, [consumers, searchTerm, filters, userRole, userAgencies, dateFilter])

  const uniqueAgencies = useMemo(() =>
    Array.from(new Set(consumers.map(c => c.agency).filter(Boolean))).sort(),
  [consumers])

  const uniqueStatuses = useMemo(() =>
    Array.from(new Set(consumers.map(c => c.disconStatus).filter(Boolean))).sort(),
  [consumers])

  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase()
    if (s === "deemed disconnected") return "bg-red-100 text-red-800"
    if (s === "connected (meter running)" || s === "physically live") return "bg-yellow-100 text-yellow-800"
    if (s === "disconnected (using neighbor source)" || s.includes("enjoying power")) return "bg-orange-100 text-orange-800"
    if (s === "permanently disconnected" || s === "disconnected") return "bg-green-100 text-green-800"
    if (s === "premises locked") return "bg-blue-100 text-blue-800"
    if (s === "consumer not found" || s === "not found") return "bg-gray-100 text-gray-800"
    return "bg-blue-50 text-blue-800"
  }

  const itemsPerPage = viewMode === "list" ? 100 : 12
  const totalPages = Math.ceil(filteredConsumers.length / itemsPerPage)
  const paginatedConsumers = filteredConsumers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  useEffect(() => { setCurrentPage(1) }, [filters, searchTerm, viewMode])

  const isRowLocked = (consumer: DeemedVisitData) => {
    if (userRole === "admin" || userRole === "executive") return false
    return (consumer.disconStatus || "").trim().toLowerCase() !== "deemed disconnected"
  }

  const getValidUrl = (url: string | undefined) => {
    if (!url) return "#"
    const clean = url.trim()
    return clean.startsWith("http://") || clean.startsWith("https://") ? clean : `https://${clean}`
  }

  const handleUpdateConsumer = async (updatedConsumer: DeemedVisitData) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)

    const syncingConsumer: DeemedVisitData = {
      ...updatedConsumer,
      _syncStatus: 'syncing',
      _localEditedAt: Date.now(),
    }

    setConsumers(prev => {
      const next = prev.map(c => c.consumerId === updatedConsumer.consumerId ? syncingConsumer : c)
      saveToCache("dd_data_cache", next)
      consumersRef.current = next
      return next
    })
    setSelectedConsumer(null)

    const attemptSync = async (data: DeemedVisitData, retriesLeft: number) => {
      try {
        const res = await fetch("/api/dd/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error("Update failed")

        const saved: DeemedVisitData = { ...data, _syncStatus: undefined, _localEditedAt: Date.now() }
        setConsumers(prev => {
          const next = prev.map(c => c.consumerId === data.consumerId ? saved : c)
          saveToCache("dd_data_cache", next)
          consumersRef.current = next
          return next
        })
        toast({ title: "Saved", description: "Record updated successfully." })
      } catch (e) {
        if (retriesLeft > 0) {
          setTimeout(() => attemptSync(data, retriesLeft - 1), 5000)
        } else {
          const errConsumer: DeemedVisitData = { ...data, _syncStatus: 'error' }
          setConsumers(prev => {
            const next = prev.map(c => c.consumerId === data.consumerId ? errConsumer : c)
            saveToCache("dd_data_cache", next)
            consumersRef.current = next
            return next
          })
          toast({ title: "Sync Failed", description: "Saved locally. Will retry on next load.", variant: "destructive" })
        }
      }
    }

    attemptSync(updatedConsumer, 3)
  }

  const handleManualRefresh = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    await clearAllCache()
    const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
    localStorage.removeItem(`${prefix}dd_row_count`)
    localStorage.removeItem(`${prefix}dd_version_hash`)
    setLoading(true)
    setRefreshKey(k => k + 1)
  }

  if (loading && consumers.length === 0) {
    return (
      <div className="space-y-6">
        <DDStats consumers={[]} loading={true} />
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (selectedConsumer) {
    return (
      <DDForm
        consumer={selectedConsumer}
        onSave={handleUpdateConsumer}
        onCancel={() => setSelectedConsumer(null)}
        userRole={userRole}
      />
    )
  }

  return (
    <div className="space-y-6">
      <DDStats consumers={filteredConsumers} />

      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border sticky top-[64px] z-30">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search Deemed Visits..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-8"
            />
            {searchTerm && (
              <X
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer"
                onClick={() => setSearchTerm("")}
              />
            )}
          </div>

          {/* Filter Sheet */}
          <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Filter Deemed Visit list</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Agency</label>
                  <Select value={filters.agency} onValueChange={v => setFilters(p => ({ ...p, agency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Agencies">All Agencies</SelectItem>
                      {uniqueAgencies.map(a => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Status">All Status</SelectItem>
                      {uniqueStatuses.map(s => <SelectItem key={s} value={s!}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base Class</label>
                  <Select value={filters.baseClass} onValueChange={v => setFilters(p => ({ ...p, baseClass: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Classes">All Classes</SelectItem>
                      {baseClasses.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-medium">Disconnection Date</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">From</span>
                      <Input
                        type="date"
                        value={dateFilter.from ? format(dateFilter.from, 'yyyy-MM-dd') : ''}
                        onChange={e => setDateFilter(p => ({ ...p, from: e.target.value ? new Date(e.target.value) : null, isActive: true }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">To</span>
                      <Input
                        type="date"
                        value={dateFilter.to ? format(dateFilter.to, 'yyyy-MM-dd') : ''}
                        onChange={e => setDateFilter(p => ({ ...p, to: e.target.value ? new Date(e.target.value) : null, isActive: true }))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDateFilter({ from: null, to: null, isActive: false })}>
                      Clear Date
                    </Button>
                  </div>
                </div>
                <Button variant="destructive" className="w-full" onClick={() => { setFilters({ agency: "All Agencies", status: "All Status", baseClass: "All Classes" }); setDateFilter({ from: null, to: null, isActive: false }) }}>
                  Clear Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* View mode toggle */}
          <div className="flex items-center border rounded-md bg-white ml-2 shrink-0">
            <Button
              variant="ghost" size="icon"
              className={`h-9 w-9 rounded-none rounded-l-md ${viewMode === "card" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => { setViewMode("card"); localStorage.setItem("ddListViewMode", "card") }}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-gray-200" />
            <Button
              variant="ghost" size="icon"
              className={`h-9 w-9 rounded-none rounded-r-md ${viewMode === "list" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => { setViewMode("list"); localStorage.setItem("ddListViewMode", "list") }}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Refresh button */}
          <Button variant="ghost" size="icon" onClick={handleManualRefresh} title="Force refresh">
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </Button>
        </div>

        <div className="mt-2 flex justify-start items-center gap-4 text-xs text-gray-500">
          <span>{filteredConsumers.length} records found</span>

          {syncStatus === 'checking' ? (
            <div className="flex items-center gap-1 text-yellow-600 font-medium animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Checking Updates...</span>
            </div>
          ) : syncStatus === 'found' ? (
            <div className="flex items-center gap-1 text-orange-600 font-medium animate-pulse">
              <DownloadCloud className="h-3 w-3" />
              <span>Update Found</span>
            </div>
          ) : syncStatus === 'syncing' ? (
            <div className="flex items-center gap-1 text-red-600 animate-pulse font-medium">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Downloading...</span>
            </div>
          ) : syncStatus === 'updated' ? (
            <div className="flex items-center gap-1 text-green-600 font-medium animate-in fade-in duration-500">
              <Check className="h-3 w-3" />
              <span>Updated</span>
            </div>
          ) : (
            <div className="text-green-600/70" title="Data is up to date">
              <Check className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>

      {/* Card View */}
      {viewMode === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedConsumers.map(consumer => (
            <Card
              key={consumer.consumerId}
              className={`shadow-md hover:shadow-lg transition-shadow overflow-hidden max-w-full ${
                consumer._syncStatus === 'error' ? "border-red-400 border-2" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{consumer.name}</CardTitle>
                    <p className="text-sm text-gray-600">{consumer.consumerId}</p>
                    {consumer.mru ? (
                      <Badge variant="outline" className="mt-2 text-xs uppercase tracking-[0.08em]">
                        {consumer.mru}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      {consumer._syncStatus === 'syncing' && (
                        <RefreshCw className="h-3 w-3 animate-spin text-blue-500" title="Syncing..." />
                      )}
                      {consumer._syncStatus === 'error' && (
                        <AlertCircle className="h-3 w-3 text-red-500" title="Sync failed — saved locally" />
                      )}
                      <Badge className={getStatusColor(consumer.disconStatus)}>{consumer.disconStatus}</Badge>
                    </div>
                    <Badge variant="outline" className="text-xs max-w-[120px] truncate block">{consumer.agency}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-600 line-clamp-2">{consumer.address}</p>
                </div>

                {consumer.mobileNumber && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${consumer.mobileNumber}`} className="text-sm text-blue-600 hover:underline">
                      {consumer.mobileNumber}
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-red-600">₹{Number(consumer.totalArrears || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Outstanding Dues</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  <div><span className="font-medium">Class:</span> {consumer.baseClass || "-"}</div>
                  <div><span className="font-medium">Device:</span> {consumer.device || "-"}</div>
                </div>

                <div className="flex items-center justify-between">
                  {consumer.disconDate ? (
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-600">{consumer.disconDate}</p>
                        <p className="text-xs text-gray-500">Disconnection Date</p>
                      </div>
                    </div>
                  ) : <div />}

                  {consumer.visitDate && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">{consumer.visitDate}</p>
                      <p className="text-xs text-green-600/80">Visit Date</p>
                    </div>
                  )}
                </div>

                {consumer.imageUrl && (
                  <div className="pt-2 pb-1 relative z-10">
                    <a
                      href={getValidUrl(consumer.imageUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                      onClick={e => e.stopPropagation()}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>View Uploaded Image</span>
                    </a>
                  </div>
                )}

                <Button
                  className="w-full mt-2"
                  size="sm"
                  disabled={isRowLocked(consumer)}
                  onClick={() => setSelectedConsumer(consumer)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  {isRowLocked(consumer) ? "Locked" : "Update Status"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                <tr>
                  <th className="px-4 py-3">ID / Name</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Arrears</th>
                  <th className="px-4 py-3 text-center">Discon Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedConsumers.map(consumer => (
                  <tr key={consumer.consumerId} className={`hover:bg-gray-50 ${consumer._syncStatus === 'error' ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {consumer._syncStatus === 'syncing' && <RefreshCw className="h-3 w-3 animate-spin text-blue-500 shrink-0" />}
                        {consumer._syncStatus === 'error' && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
                        <div>
                          <div className="font-medium">{consumer.consumerId}</div>
                          <div className="text-xs text-gray-500">{consumer.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{consumer.address}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
                      ₹{Number(consumer.totalArrears || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <div className="text-gray-600">{consumer.disconDate || "-"}</div>
                      {consumer.visitDate && (
                        <div className="text-xs font-medium text-green-600">{consumer.visitDate}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={getStatusColor(consumer.disconStatus)}>{consumer.disconStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button size="sm" disabled={isRowLocked(consumer)} onClick={() => setSelectedConsumer(consumer)}>
                        {isRowLocked(consumer) ? "Locked" : "Update"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
