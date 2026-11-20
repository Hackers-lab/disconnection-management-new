"use client"

import React, { useState, useEffect, useMemo, useTransition, useRef, useCallback } from "react"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search, MapPin, Phone, IndianRupee, RefreshCw, AlertCircle, X, Filter,
  CheckCircle2, Power, Clock, HelpCircle, Edit, LayoutGrid, List,
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, UserX, Image as ImageIcon,
  Check, Loader2, DownloadCloud, Activity, Eye,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getFromCache, saveToCache, clearAllCache, getCccPrefix } from "@/lib/indexed-db"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import { useModuleVersionSync } from "@/hooks/use-module-version-sync"
import type { DeemedVisitData } from "@/lib/dd-service"
import { getGoogleDriveDirectLink, handleImageError } from "@/lib/image-utils"
import { DDStats } from "./dd-stats"
import { DDForm } from "./dd-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton"
import { ModuleWaiter } from "@/components/ui/module-waiter"
import { useToast } from "@/components/ui/use-toast"
import dynamic from "next/dynamic"

const NearbyConsumerMap = dynamic(
  () => import("./nearby-consumer-map").then((mod) => mod.NearbyConsumerMap),
  {
    ssr: false,
    loading: () => (
      <ModuleWaiter
        variant="inline"
        accent="orange"
        title="Loading GPS Consumer Map"
        messages={["Initializing GPS radar...", "Plotting nearby consumers..."]}
        showSkeletonCards={false}
      />
    ),
  }
)

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
  permissions?: Record<string, string[]>
}

export function DDList({ userRole, userAgencies, permissions }: DDListProps) {
  const { toast } = useToast()
  const [consumers, setConsumers] = useState<DeemedVisitData[]>([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'found' | 'syncing' | 'updated'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("module_search_term")
      if (saved) {
        sessionStorage.removeItem("module_search_term")
        return saved
      }
    }
    return ""
  })

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.searchTerm) setSearchTerm(e.detail.searchTerm)
    }
    window.addEventListener("set_module_search" as any, handler)
    return () => window.removeEventListener("set_module_search" as any, handler)
  }, [])
  const [isPending, startTransition] = useTransition()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedConsumer, setSelectedConsumer] = useState<DeemedVisitData | null>(null)
  const [baseClasses, setBaseClasses] = useState<string[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showNearbyMap, setShowNearbyMap] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; consumerId?: string } | null>(null)
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
  function extractBaseClasses(data: DeemedVisitData[]) {
    return Array.from(new Set(data.map(c => (c.baseClass || "").toUpperCase().trim()).filter(Boolean))).sort()
  }

  const { checkVersion } = useModuleVersionSync<DeemedVisitData>("dd", "dd_data_cache", "consumerId", (updated) => {
    setConsumers(updated)
    consumersRef.current = updated
    setBaseClasses(extractBaseClasses(updated))
    setLoading(false)
  })

  // Fast initial cache hydration directly on mount (<10ms first paint)
  useEffect(() => {
    getFromCache<DeemedVisitData[]>("dd_data_cache").then(cached => {
      if (cached && Array.isArray(cached) && cached.length > 0 && consumersRef.current.length === 0) {
        setConsumers(cached)
        consumersRef.current = cached
        setBaseClasses(extractBaseClasses(cached))
        setLoading(false)
      }
    }).catch(() => {})
  }, [])

  const loadData = useCallback(async (force = false) => {
    setError(null)
    try {
      if (force) {
        await fetch("/api/system/reset-base?moduleKey=dd", { method: "POST" }).catch(() => {})
      }
      await checkVersion(force)
    } catch (err: any) {
      console.error(err)
      if (consumersRef.current.length === 0) setError("Failed to load Deemed Visit data")
    } finally {
      if (consumersRef.current.length > 0) {
        setLoading(false)
      }
    }
  }, [checkVersion])

  useEffect(() => {
    if (refreshKey > 0) {
      loadData()
    }
  }, [loadData, refreshKey])

  // --- Filtering ---
  const filteredConsumers = useMemo(() => {
    return consumers.filter(c => {
      if (userRole !== "admin" && userRole !== "viewer") {
        const myAgencies = userAgencies.map(a => a.toUpperCase())
        if (!myAgencies.includes((c.agency || "").toUpperCase())) return false
      }

      const searchLower = String(searchTerm || "").trim().toLowerCase()
      const consumerName = String(c?.name || "").toLowerCase()
      const consumerId = String(c?.consumerId || "").toLowerCase()
      const consumerAddress = String(c?.address || "").toLowerCase()
      const consumerDevice = String(c?.device || "").toLowerCase()
      const consumerAgency = String(c?.agency || "").toLowerCase()

      const matchesSearch = !searchLower ||
        consumerName.includes(searchLower) ||
        consumerId.includes(searchLower) ||
        consumerAddress.includes(searchLower) ||
        consumerDevice.includes(searchLower) ||
        consumerAgency.includes(searchLower)

      const matchesAgency = filters.agency === "All Agencies" || String(c?.agency || "").trim().toUpperCase() === String(filters.agency || "").trim().toUpperCase()
      const matchesStatus = filters.status === "All Status" || String(c?.disconStatus || "").trim().toLowerCase() === String(filters.status || "").trim().toLowerCase()
      const matchesBaseClass = filters.baseClass === "All Classes" || String(c?.baseClass || "").trim().toUpperCase() === String(filters.baseClass || "").trim().toUpperCase()

      const matchesDate = !dateFilter.isActive || (() => {
        if (!c.disconDate) return false
        let dateStr = String(c.disconDate).trim().replace(/[./]/g, "-")
        if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
          const [d, m, y] = dateStr.split("-")
          const pad = (n: string) => n.padStart(2, "0")
          dateStr = `${y}-${pad(m)}-${pad(d)}`
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
    Array.from(new Set(consumers.map(c => String(c?.agency || "").trim()).filter(Boolean))).sort(),
  [consumers])

  const uniqueStatuses = useMemo(() =>
    Array.from(new Set(consumers.map(c => String(c?.disconStatus || "").trim()).filter(Boolean))).sort(),
  [consumers])

  const getStatusColor = (status: string) => {
    const s = String(status || "").trim().toLowerCase()
    if (s === "deemed disconnected") return "bg-red-100 text-red-900 border border-red-200/80"
    if (s === "connected (meter running)" || s === "physically live") return "bg-amber-100 text-amber-900 border border-amber-200/80"
    if (s === "disconnected (using neighbor source)" || s.includes("enjoying power")) return "bg-orange-100 text-orange-900 border border-orange-200/80"
    if (s === "permanently disconnected" || s === "disconnected") return "bg-emerald-100 text-emerald-900 border border-emerald-200/80"
    if (s === "premises locked") return "bg-blue-100 text-blue-900 border border-blue-200/80"
    if (s === "consumer not found" || s === "not found") return "bg-slate-100 text-slate-800 border border-slate-200/80"
    return "bg-blue-50 text-blue-900 border border-blue-200/80"
  }

  const getDDCardVisual = (status: string) => {
    const s = String(status || "").trim().toLowerCase()
    if (s === "deemed disconnected") {
      return {
        leftBar: "border-l-red-500",
        headerBg: "bg-gradient-to-r from-red-50/75 via-red-50/25 to-white",
        indexPill: "bg-red-100 text-red-900 border-red-200/90",
      }
    }
    if (s === "connected (meter running)" || s === "physically live") {
      return {
        leftBar: "border-l-amber-500",
        headerBg: "bg-gradient-to-r from-amber-50/75 via-amber-50/25 to-white",
        indexPill: "bg-amber-100 text-amber-900 border-amber-200/90",
      }
    }
    if (s === "disconnected (using neighbor source)" || s.includes("enjoying power")) {
      return {
        leftBar: "border-l-orange-500",
        headerBg: "bg-gradient-to-r from-orange-50/75 via-orange-50/25 to-white",
        indexPill: "bg-orange-100 text-orange-900 border-orange-200/90",
      }
    }
    if (s === "permanently disconnected" || s === "disconnected") {
      return {
        leftBar: "border-l-emerald-500",
        headerBg: "bg-gradient-to-r from-emerald-50/75 via-emerald-50/25 to-white",
        indexPill: "bg-emerald-100 text-emerald-900 border-emerald-200/90",
      }
    }
    if (s === "premises locked") {
      return {
        leftBar: "border-l-blue-500",
        headerBg: "bg-gradient-to-r from-blue-50/75 via-blue-50/25 to-white",
        indexPill: "bg-blue-100 text-blue-900 border-blue-200/90",
      }
    }
    return {
      leftBar: "border-l-slate-400",
      headerBg: "bg-gradient-to-r from-slate-100/80 via-slate-50/40 to-white",
      indexPill: "bg-slate-200/80 text-slate-800 border-slate-300/80",
    }
  }

  const itemsPerPage = viewMode === "list" ? 100 : 12
  const totalPages = Math.ceil(filteredConsumers.length / itemsPerPage)
  const paginatedConsumers = filteredConsumers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  useEffect(() => { setCurrentPage(1) }, [filters, searchTerm, viewMode])

  const isRowLocked = (consumer: DeemedVisitData) => {
    if (userRole === "admin" || userRole === "executive") return false
    return (consumer.disconStatus || "").trim().toLowerCase() !== "deemed disconnected"
  }

  const getValidUrl = (url: any) => {
    if (!url || typeof url !== "string") return "#"
    const clean = url.trim()
    if (!clean || clean === "#") return "#"
    return clean.startsWith("http://") || clean.startsWith("https://") ? clean : `https://${clean}`
  }

  const handleUpdateConsumer = async (updatedConsumer: DeemedVisitData) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)

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

  const lastRefreshTimeRef = useRef<number>(0)

  const handleManualRefresh = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    const now = Date.now()
    if (now - lastRefreshTimeRef.current < 10_000) {
      toast({ title: "Already Up to Date", description: "Checked just now. All records are synced." })
      return
    }
    lastRefreshTimeRef.current = now
    await loadData(false)
  }

  if ((loading || syncStatus === "checking" || syncStatus === "found" || syncStatus === "syncing") && consumers.length === 0) {
    return (
      <div className="space-y-5">
        <DDStats consumers={[]} loading={true} />
        <ModuleWaiter
          variant="inline"
          accent="orange"
          title="Loading Deemed Visit List"
          messages={[
            "Fetching deemed disconnected records...",
            "Syncing agency visits & photo status...",
            "Preparing consumer cards...",
          ]}
          showSkeletonCards={viewMode === "card"}
          skeletonCount={6}
        />
        {viewMode !== "card" && <SkeletonTable rows={8} cols={6} />}
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
      <div className="animate-form-expand">
        <DDForm
          consumer={selectedConsumer}
          onSave={handleUpdateConsumer}
          onCancel={() => setSelectedConsumer(null)}
          userRole={userRole}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DDStats consumers={filteredConsumers} />

      {/* Controls */}
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-sm border border-slate-200/80 sticky top-14 z-30">
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
            <SheetContent className="flex flex-col p-0 gap-0">
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Filter Deemed Visit list</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0 flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setFilters({ agency: "All Agencies", status: "All Status", baseClass: "All Classes" }); setDateFilter({ from: null, to: null, isActive: false }) }}>
                  Clear All
                </Button>
                <Button className="flex-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white" onClick={() => setIsFilterOpen(false)}>
                  Show {filteredConsumers.length}
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

        {/* Nearby Consumer Radar button — full width below search row */}
        <div className="mt-3">
          <Button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
              setShowNearbyMap(v => !v)
            }}
            className="w-full h-12 rounded-xl font-extrabold flex items-center justify-center gap-2 text-sm shadow-md transition-all duration-200 interactive-tap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
          >
            <MapPin className="h-4 w-4" />
            {showNearbyMap ? "Hide Navigation Radar" : "Locate Nearby Consumers"}
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
        <div key="dd-card-grid" className="grid gap-2.5 sm:gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-tab-enter">
          {paginatedConsumers.map((consumer, idx) => {
            const cardVisual = getDDCardVisual(consumer.disconStatus)
            const serialNumber = (currentPage - 1) * itemsPerPage + idx + 1
            const isReadOnlyMode = permissions ? !permissions.deemed?.includes("update") : (userRole === "viewer" || userRole === "reader")
            return (
            <Card
              key={consumer.consumerId}
              className={`h-full flex flex-col justify-between bg-white rounded-xl border border-slate-300/85 border-l-4 ${cardVisual.leftBar} shadow-[0_2px_8px_-2px_rgba(15,23,42,0.09)] hover:shadow-[0_10px_20px_-6px_rgba(15,23,42,0.14)] card-interactive animate-card-enter stagger-${(idx % 6) + 1} overflow-hidden max-w-full transition-all duration-150 ${
                consumer._syncStatus === 'error' ? "border-red-400 ring-2 ring-red-400/50" : ""
              }`}
            >
              {/* ZONE 1: Compact Tinted Header */}
              <CardHeader className={`px-2.5 py-2 space-y-1 border-b border-slate-200/75 ${cardVisual.headerBg}`}>
                <div className="flex justify-between items-center gap-1">
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    <span className={`notranslate tabular-nums shrink-0 text-[9px] font-extrabold px-1 py-0.5 rounded border leading-none ${cardVisual.indexPill}`}>
                      #{String(serialNumber).padStart(2, "0")}
                    </span>
                    {consumer.mru ? (
                      <span className="text-[9px] font-mono font-semibold text-slate-600 bg-white/90 border border-slate-200/90 px-1 py-0.5 rounded uppercase truncate max-w-[80px] leading-none">
                        {consumer.mru}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {consumer._syncStatus === 'syncing' && (
                      <RefreshCw className="h-2.5 w-2.5 animate-spin text-blue-500" title="Syncing..." />
                    )}
                    {consumer._syncStatus === 'error' && (
                      <AlertCircle className="h-2.5 w-2.5 text-red-500" title="Sync failed — saved locally" />
                    )}
                    <Badge className={`${getStatusColor(consumer.disconStatus)} text-[9px] font-bold px-1.5 py-0 h-4 shadow-none`}>
                      {consumer.disconStatus}
                    </Badge>
                  </div>
                </div>

                {/* Name + Outstanding on Same Row */}
                <div className="flex items-baseline justify-between gap-2">
                  <CardTitle className="text-[13px] font-extrabold text-slate-900 line-clamp-1 leading-tight tracking-tight min-w-0" title={consumer.name}>
                    {consumer.name}
                  </CardTitle>
                  <span className="notranslate tabular-nums text-[14px] font-black text-red-600 shrink-0 leading-tight">
                    ₹{Number(consumer.totalArrears || 0).toLocaleString()}
                  </span>
                </div>

                {/* ID + Mobile + Agency */}
                <div className="flex items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-slate-700 bg-white/90 border border-slate-200/80 px-1.5 py-0.5 rounded leading-none">
                      {consumer.consumerId}
                    </span>
                    {consumer.mobileNumber && (
                      <a
                        href={`tel:${consumer.mobileNumber}`}
                        className="inline-flex items-center gap-0.5 text-blue-700 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 px-1.5 py-0.5 rounded font-semibold leading-none transition-colors truncate"
                      >
                        <Phone className="h-2.5 w-2.5 shrink-0" />
                        <span>{consumer.mobileNumber}</span>
                      </a>
                    )}
                  </div>
                  {consumer.agency && (
                    <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 h-4 bg-white/90 border-slate-200/90 max-w-[90px] truncate block">
                      {consumer.agency}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              {/* ZONE 2: Compact Detail Body */}
              <CardContent className="px-2.5 py-2 space-y-1.5 flex-1 bg-white">
                <div className="flex items-start gap-1">
                  <MapPin className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">{consumer.address || "Address not provided"}</p>
                </div>

                <div className="bg-slate-50/90 border border-slate-200/80 rounded-lg px-2 py-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                  <div className="truncate col-span-2">
                    <span className="text-slate-400">{consumer.visitDate ? "Visit: " : "Discon: "}</span>
                    <strong className={`font-semibold ${consumer.visitDate ? "text-emerald-700" : "text-slate-700"}`}>
                      {consumer.visitDate || consumer.disconDate || "Not recorded"}
                    </strong>
                  </div>
                  <div className="truncate border-t border-slate-200/70 pt-1">
                    <span className="text-slate-400">Class: </span>
                    <strong className="font-semibold text-slate-800">{consumer.baseClass || "-"}</strong>
                  </div>
                  <div className="truncate text-right font-mono border-t border-slate-200/70 pt-1">
                    <span className="text-slate-400 font-sans">Dev: </span>
                    <strong className="font-semibold text-slate-800">{consumer.device || "-"}</strong>
                  </div>
                </div>
              </CardContent>

              {/* ZONE 3: Single-Row Compact Action Footer */}
              <div className="px-2.5 py-1.5 bg-slate-50/90 border-t border-slate-200/75 flex items-center justify-between gap-1.5">
                {consumer.imageUrl ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPreviewImage({
                        url: consumer.imageUrl,
                        title: `Evidence Photo - ${consumer.name || consumer.consumerId}`,
                        consumerId: consumer.consumerId,
                      })
                    }}
                    className="h-7 px-2 rounded-md inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-colors cursor-pointer shrink-0"
                  >
                    <ImageIcon className="h-3 w-3" />
                    <span>Photo</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">No photo</span>
                )}

                <Button
                  className={`h-7 px-2.5 rounded-md text-[11px] font-bold shadow-2xs shrink-0 ${
                    isReadOnlyMode
                      ? "bg-white hover:bg-slate-100 text-slate-800 border border-slate-300"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  }`}
                  size="sm"
                  disabled={!isReadOnlyMode && isRowLocked(consumer)}
                  onClick={() => setSelectedConsumer(consumer)}
                >
                  {isReadOnlyMode ? (
                    <>
                      <Eye className="h-3 w-3 mr-1 text-slate-600" />
                      View
                    </>
                  ) : (
                    <>
                      <Edit className="h-3 w-3 mr-1" />
                      {isRowLocked(consumer) ? "Locked" : "Update"}
                    </>
                  )}
                </Button>
              </div>
            </Card>
            )
          })}
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
      {/* Dedicated Full-Screen Locate Consumer GPS Radar Page */}
      {showNearbyMap && (
        <NearbyConsumerMap
          consumers={filteredConsumers as any}
          onClose={() => setShowNearbyMap(false)}
          onGoToConsumer={(consumer) => {
            setShowNearbyMap(false)
            setViewMode("card")
            const idx = filteredConsumers.findIndex((c) => c.consumerId === consumer.consumerId)
            if (idx >= 0) {
              const page = Math.floor(idx / itemsPerPage) + 1
              setCurrentPage(page)
            }
          }}
        />
      )}

      {/* Evidence Image Preview Lightbox Dialog */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden bg-slate-950 border-slate-800 text-white rounded-2xl z-[70]">
            <DialogHeader className="p-3 bg-slate-900 border-b border-slate-800 flex flex-row items-center justify-between space-y-0">
              <div className="min-w-0 pr-2">
                <DialogTitle className="text-xs font-bold text-slate-100 flex items-center gap-1.5 truncate">
                  <ImageIcon className="h-4 w-4 text-blue-400 shrink-0" />
                  <span>{previewImage.title}</span>
                </DialogTitle>
                {previewImage.consumerId && (
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Consumer #{previewImage.consumerId}
                  </p>
                )}
              </div>
            </DialogHeader>

            <div className="p-3 bg-black flex items-center justify-center min-h-[250px] max-h-[65vh] overflow-hidden">
              <img
                src={getGoogleDriveDirectLink(previewImage.url, 1600)}
                onError={(e) => handleImageError(e, previewImage.url)}
                alt={previewImage.title}
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md border border-slate-700"
              />
            </div>

            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-400 truncate">
                {previewImage.consumerId ? `Consumer_${previewImage.consumerId}_Evidence.jpg` : "Evidence.jpg"}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={getGoogleDriveDirectLink(previewImage.url, 1600)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-8 px-3 rounded-lg flex items-center gap-1.5 border border-slate-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Full Size</span>
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewImage(null)}
                  className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs h-8 rounded-lg cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
