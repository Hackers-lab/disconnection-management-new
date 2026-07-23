"use client"


import React, { useImperativeHandle, useRef, useMemo, useTransition } from "react"  
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Calendar as CalendarIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import {
  Search,
  Edit,
  MapPin,
  Phone,
  IndianRupee, 
  Filter,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Database,
  Cloud,
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Eye,
  CheckCircle2,
  Power,
  Clock,
  UserX,
  HelpCircle,
  Check,
  Loader2,
  DownloadCloud,
  Activity,
  History,
  Wallet,
  PowerOff,
  Footprints,
  PlusCircle,
  Navigation,
} from "lucide-react"
import { DashboardStats } from "./dashboard-stats"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ConsumerData } from "@/lib/google-sheets"
import { getFromCache, saveToCache, clearAllCache, getCacheAgeMs, getCccPrefix } from "@/lib/indexed-db"
import { useToast } from "@/components/ui/use-toast"

const ConsumerForm = dynamic(() => import("./consumer-form").then((mod) => mod.ConsumerForm), {
  loading: () => <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
})
const AdminPanel = dynamic(() => import("./admin-panel").then((mod) => mod.AdminPanel))
const NearbyConsumerMap = dynamic(
  () => import("./nearby-consumer-map").then((mod) => mod.NearbyConsumerMap),
  { ssr: false }
)

interface ConsumerListProps {
  userRole: string
  userAgencies: string[]
  onAdminClick: () => void
  showAdminPanel: boolean
  onCloseAdminPanel: () => void
  onDownload: () => void
  onDownloadDefaulters: () => void
  onGoToReconnection?: () => void
  permissions?: Record<string, string[]>
}
interface ConsumerListRef {  // <-- Add this interface
  getCurrentConsumers: () => ConsumerData[]
}

type SortOrder = "none" | "asc" | "desc"

function useBackNavigation(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const isBackRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    isBackRef.current = false
    window.history.pushState({ dialogOpen: true }, "")

    const handlePopState = () => {
      isBackRef.current = true
      onCloseRef.current()
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (!isBackRef.current) {
        window.history.back()
      }
    }
  }, [isOpen])
}

// Global variable to track last sync time across unmounts/remounts (SPA navigation)
let globalLastSyncTime = 0
const SYNC_COOLDOWN_MS = 10000 // 10 seconds cooldown

const ConsumerList = React.forwardRef<ConsumerListRef, ConsumerListProps>(
  (props, ref) => {
  const { userRole, userAgencies, onAdminClick, showAdminPanel, onCloseAdminPanel, onGoToReconnection, permissions } = props
  const { toast } = useToast()
  const [consumers, setConsumers] = useState<ConsumerData[]>([])
  const [agencies, setAgencies] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerData | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [minOsd, setMinOsd] = useState(0)
  const [showFilters, setShowFilters] = useState(userRole === "test")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [sortByOSD, setSortByOSD] = useState<SortOrder>("desc")
  const [dateFilter, setDateFilter] = useState<{
    from: Date | null
    to: Date | null
    isActive: boolean
  }>({
    from: null,
    to: null,
    isActive: false
  })
  const [filters, setFilters] = useState<{
    agency: string[]
    mru: string[]
    address: string
    name: string
    consumerId: string
    status: string[]
    baseClass: string[]
  }>({
    agency: [],
    mru: [],
    address: "",
    name: "",
    consumerId: "",
    status: [],
    baseClass: [],
  })
  const [excludeFilters, setExcludeFilters] = useState({
    excludeDeemedDisconnection: false,
    excludeTemproryDisconnected: false,
  })
  const [baseClasses, setBaseClasses] = useState<string[]>([])
  const [isCachedData, setIsCachedData] = useState(false)
  const [sortByMRU, setSortByMRU] = useState(false)
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [isBackgroundUpdating, setIsBackgroundUpdating] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'found' | 'syncing' | 'updated'>('idle')
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [previewConsumer, setPreviewConsumer] = useState<ConsumerData | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeHistoryConsumer, setActiveHistoryConsumer] = useState<ConsumerData | null>(null)
  const [showNearbyMap, setShowNearbyMap] = useState(false)

  // Handle back button navigation for modals/overlays
  useBackNavigation(isFilterOpen, () => setIsFilterOpen(false))
  useBackNavigation(!!selectedConsumer, () => setSelectedConsumer(null))
  useBackNavigation(!!previewConsumer, () => setPreviewConsumer(null))
  useBackNavigation(!!activeHistoryConsumer, () => setActiveHistoryConsumer(null))
  useBackNavigation(showAdminPanel, onCloseAdminPanel)
  useBackNavigation(showNearbyMap, () => setShowNearbyMap(false))

  useEffect(() => {
    const savedMode = localStorage.getItem("consumerListViewMode") as "card" | "list"
    if (savedMode === "card" || savedMode === "list") {
      setViewMode(savedMode)
    }
  }, [])

  const consumersRef = useRef<ConsumerData[]>(consumers)
  useEffect(() => {
    consumersRef.current = consumers
  }, [consumers])


  // Memoize agencies key to prevent unnecessary effect triggers on array reference changes
  const agenciesKey = useMemo(() => JSON.stringify(userAgencies), [userAgencies])

  // Blocked reconnection IDs — own effect so it runs immediately on mount
  // and refreshes every 5 minutes independently of the main data sync.
  // For agency users we scope the request to their own agencies so that
  // another agency's overdue work does NOT lock them out of the module.
  useEffect(() => {
    const fetchBlocked = () => {
      let url = "/api/reconnection/blocked-ids"
      if (userRole === "agency" && userAgencies.length > 0) {
        const param = userAgencies.map(a => encodeURIComponent(a)).join(",")
        url = `${url}?agencies=${param}`
      }
      fetch(url)
        .then(r => r.ok ? r.json() : [])
        .then((ids: string[]) => setBlockedIds(new Set(ids)))
        .catch(() => {})
    }
    fetchBlocked()
    const timer = setInterval(fetchBlocked, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [userRole, agenciesKey])

  useEffect(() => {
    const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
    const CACHE_KEY = "consumers_data_cache"
    const AGENCY_CACHE_KEY = "agencies_data_cache"
    const BASE_DATE_KEY = "consumers_base_date"
    const ROW_COUNT_KEY = `${prefix}consumer_row_count`
    const CONSUMER_VERSION_KEY = `${prefix}consumer_version_hash`

    async function processData(data: ConsumerData[], preloadedAgencies: string[] | null = null, isBackgroundUpdate = false) {
      // Yield to main thread to prevent UI blocking during heavy processing
      await new Promise(resolve => setTimeout(resolve, 0));

      // Merge local pending/error/recent-edit states with incoming network data
      // to prevent "Silent Reversion" — covers both in-flight writes and the
      // brief window where /patch may serve CDN-cached pre-write data.
      if (isBackgroundUpdate) {
        const LOCAL_WIN_WINDOW_MS = 30_000
        const now = Date.now()
        data = data.map(newC => {
          const existing = consumersRef.current.find(c => c.consumerId === newC.consumerId)
          if (!existing) return newC
          const recentLocal =
            existing._localEditedAt && now - existing._localEditedAt < LOCAL_WIN_WINDOW_MS
          if (existing._syncStatus === 'syncing' || existing._syncStatus === 'error' || recentLocal) {
            return existing
          }
          return newC
        })
      }

      // Extract unique baseClasses (ignore empty/null)
      const uniqueBaseClasses = Array.from(
        new Set(
          data
            .map(c => (c.baseClass || "").toUpperCase().trim())
            .filter(bc => bc !== "")
        )
      ).sort()
      setBaseClasses(uniqueBaseClasses)

      // Load agencies for admin
      let agencyList: string[] = []
      if (preloadedAgencies && preloadedAgencies.length > 0) {
        agencyList = preloadedAgencies
      } else if (userRole === "admin" || userRole === "viewer") {
        // Fallback fetch if not preloaded
        try {
          const agenciesResponse = await fetch("/api/admin/agencies")
          if (agenciesResponse.ok) {
            const agencyData = await agenciesResponse.json()
            agencyList = agencyData.filter((a: any) => a.isActive).map((a: any) => a.name)
          }
        } catch (error) {
          console.warn("Failed to load agencies, using default list")
          agencyList = Array.from(new Set(data.map((c) => c.agency).filter((a): a is string => !!a)))
        }
      } else {
        agencyList = userAgencies
      }
      setAgencies(agencyList)

      
      // Only reset the range slider on initial load, not during background updates
      if (!isBackgroundUpdate) {
        setMinOsd(0)
      }

      // NOTE: We no longer filter data here. State must hold 100% of rows.
      // Filtering happens in useMemo (filteredConsumers) below.
      setConsumers(data)
    }

    async function loadData() {
      let finalStatus = 'idle'
      // Step 1: Instant Load from Cache
      setError(null)

      try {
        const cachedData = await getFromCache<ConsumerData[]>(CACHE_KEY);
        let cachedAgencies: string[] | null = null;
        if (userRole === "admin" || userRole === "viewer") {
          cachedAgencies = await getFromCache<string[]>(AGENCY_CACHE_KEY);
        }

        if (cachedData && cachedData.length > 0) {
          console.log(`[Data Sync] ✅ Cache Hit: Loaded ${cachedData.length} records from IndexedDB.`);
          await processData(cachedData, cachedAgencies, false);
          setLoading(false); // Stop spinner immediately if cache exists
          setIsCachedData(true);
        } else {
          console.log("[Data Sync] M Cache Miss: No data in IndexedDB.");
          setLoading(true); // Only show spinner if cache is empty
        }

        setSyncStatus('checking');

        const countRes = await fetch(`/api/system/row-count?type=consumer`, { cache: 'no-store' });
        if (!countRes.ok) throw new Error(`Row count fetch failed: ${countRes.status}`);
        
        const countData = await countRes.json().catch(() => ({ count: 0, version: null }));
        const serverCount = countData?.count ?? 0;
        const serverVersion = countData?.version ?? null;
        const localCount = parseInt(localStorage.getItem(ROW_COUNT_KEY) || "0");
        const localVersion = localStorage.getItem(CONSUMER_VERSION_KEY) || null;

        console.log(`[Data Sync] Row Count Check - Server: ${serverCount}, Local: ${localCount}`);
        console.log(`[Data Sync] Version Check - Server: ${serverVersion}, Local: ${localVersion}`);
        
        const isCacheEmpty = !cachedData || cachedData.length === 0;
        const isMismatch = serverCount !== localCount || serverVersion !== localVersion;
        const cacheAgeMs = await getCacheAgeMs("consumers_data_cache");
        const isCacheStale = cacheAgeMs !== null && cacheAgeMs > 24 * 60 * 60 * 1000; // 24 hours
        // Detect split state: IndexedDB and localStorage got out of sync (e.g. server returned stale
        // base data during a previous sync so IndexedDB count != the count we committed to localStorage).
        const isCacheSplit = cachedData !== null && cachedData.length !== localCount;

        if (isCacheEmpty || isMismatch || isCacheStale || isCacheSplit) {
          if (isCacheSplit && !isMismatch) {
            console.log(`[Data Sync] ⚠️ Split state: IndexedDB has ${cachedData?.length} records but localStorage says ${localCount}. Forcing re-download.`);
            setSyncStatus('found');
          }
          if (isMismatch) {
             console.log("[Data Sync] Count or Version mismatch. Triggering full download.");
             setSyncStatus('found');
          } else if (isCacheStale) {
             console.log(`[Data Sync] Cache is stale (${Math.round((cacheAgeMs ?? 0) / 3600000)}h old). Triggering full download.`);
             setSyncStatus('found');
          } else {
             console.log("[Data Sync] Cache is empty. Triggering full download.");
          }
          setSyncStatus('syncing');
          try {
            const baseResponse = await fetch(`/api/consumers/base?v=${serverCount}${serverVersion ? `&h=${serverVersion}` : ''}`);
            if (!baseResponse.ok) throw new Error("Base fetch failed");
            
            const cacheControl = baseResponse.headers.get('Cache-Control');
            const baseData = await baseResponse.json();
            console.log(`[Data Sync] Loaded ${baseData.length} records from base.`);

            // Always update the underlying data cache and UI
            await saveToCache(CACHE_KEY, baseData);
            await processData(baseData, cachedAgencies, true);

            // Only "commit" the new count/version if the data was complete.
            // Use baseData.length (actual records received) not serverCount (from a separate API call)
            // so IndexedDB and localStorage always reflect the same thing even if the server's
            // Data Cache returned slightly stale data during the base fetch.
            const isCountConsistent = baseData.length === serverCount;
            if (cacheControl !== 'no-store' && isCountConsistent) {
              console.log('[Data Sync] ✅ Integrity check passed. Updating local count and version.');
              await saveToCache(BASE_DATE_KEY, new Date().toISOString().split("T")[0]);
              localStorage.setItem(ROW_COUNT_KEY, baseData.length.toString());
              if (serverVersion) {
                localStorage.setItem(CONSUMER_VERSION_KEY, serverVersion);
              }
              setSyncStatus('updated');
              finalStatus = 'updated';
            } else if (!isCountConsistent) {
              // Base API returned stale count (server Data Cache race). Save the actual count
              // so IndexedDB and localStorage stay in sync, but don't commit version —
              // next open will see count mismatch vs server and re-download.
              console.log(`[Data Sync] ⚠️ Count mismatch: base returned ${baseData.length} records but row-count said ${serverCount}. Will re-check on next sync.`);
              localStorage.setItem(ROW_COUNT_KEY, baseData.length.toString());
            } else {
              console.log('[Data Sync] ⚠️ Integrity check failed (no-store). Local count/version preserved to force re-check on next sync.');
            }
          } catch (e) {
            console.error("Base fetch error:", e);
            setError("Failed to download list");
            return;
          }
        } else {
          console.log("[Data Sync] Row counts and versions match. Checking for patches.");
          const patchResponse = await fetch(`/api/consumers/patch`);
          if (patchResponse.ok) {
            const patchData: ConsumerData[] = await patchResponse.json().catch(() => []);
            
            if (patchData.length > 0) {
              console.log(`[Data Sync] Patching with ${patchData.length} records.`);
              setSyncStatus('syncing');
              
              const currentData = consumersRef.current.length > 0 ? consumersRef.current : (cachedData || []);
              const dataMap = new Map(currentData.map(c => [c.consumerId, c]));
              // Stale-write protection: if this row was edited locally in the
              // last 30s (longer than the CDN cache window on /patch), keep
              // the local copy instead of letting potentially-stale patch data win.
              const LOCAL_WIN_WINDOW_MS = 30_000;
              const now = Date.now();
              patchData.forEach(patchItem => {
                const existing = dataMap.get(patchItem.consumerId);
                const recentLocal =
                  existing?._localEditedAt &&
                  now - existing._localEditedAt < LOCAL_WIN_WINDOW_MS;
                if (recentLocal || existing?._syncStatus === 'syncing' || existing?._syncStatus === 'error') {
                  return;
                }
                dataMap.set(patchItem.consumerId, patchItem);
              });
              const mergedData = Array.from(dataMap.values());

              await saveToCache(CACHE_KEY, mergedData);
              await processData(mergedData, cachedAgencies, true);
              setSyncStatus('updated');
              finalStatus = 'updated';
            }
          }
        }

        if ((userRole === "admin" || userRole === "viewer") && !cachedAgencies) {
           const agenciesRes = await fetch("/api/admin/agencies");
           if (agenciesRes.ok) {
             const agencyData = await agenciesRes.json();
             const freshAgencies = agencyData.filter((a: any) => a.isActive).map((a: any) => a.name);
             await saveToCache(AGENCY_CACHE_KEY, freshAgencies);
             setAgencies(freshAgencies);
          }
        }
      } catch (error) {
        console.error("💥 Error loading data:", error);
        if (consumersRef.current.length === 0) {
          setError(error instanceof Error ? error.message : "Unknown error occurred");
        }
      } finally {
        setLoading(false);
        if (finalStatus !== 'updated') {
           setTimeout(() => setSyncStatus('idle'), 2000);
        } else {
           setTimeout(() => setSyncStatus('idle'), 4000);
        }
      }
    }

    loadData()
  }, [userRole, agenciesKey, refreshKey]) // Use stable key instead of array reference

  const clearCache = async () => {
    if (confirm("Are you sure you want to clear the cache and reload?")) {
      try {
        await clearAllCache()
        window.location.reload()
      } catch (e) {
        console.error("Failed to clear cache", e)
      }
    }
  }

  const handleManualRefresh = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    
    // 💥 HARD RESET: Completely wipe all data (Consumers, Agencies, Dates)
    // This is more powerful than just setting the date to null.
    await clearAllCache()
    
    // Reset sync timer
    globalLastSyncTime = 0
    
    // Trigger the reload
    setRefreshKey((prev) => prev + 1)
  }
  // Advanced filtering logic
  const filteredConsumers = useMemo(() => {
    // 1. Role-Based Security Filter (Applied to Full Data)
    let dataToFilter = consumers;
    
    if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive") {
       const userAgenciesUpper = userAgencies.map(a => a.toUpperCase())
       dataToFilter = consumers.filter(c => {
          const consumerAgency = (c.agency || "").toUpperCase()
          return userAgenciesUpper.includes(consumerAgency) && c.disconStatus !== "&"
       })
    }

    return dataToFilter.filter((consumer) => {
    // Basic search term filter
    // Date range filter  
    function normalizeDate(dateValue: string | Date | null | undefined): string | null {
      if (!dateValue) return null;

      // If it's already a Date object
      if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0]; // YYYY-MM-DD
      }

      // If it's a string in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue; // already in correct format
      }

      // If it's a string in DD-MM-YYYY format
      if (/^\d{2}-\d{2}-\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split("-");
        return `${year}-${month}-${day}`; // convert to YYYY-MM-DD
      }

      // If it's some other format, try to parse
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }

      return null; // Unknown format
    }


    const matchesDateRange =
      !dateFilter.isActive ||
      (() => {
        const disconDateNorm = normalizeDate(consumer.disconDate);
        const fromNorm = normalizeDate(dateFilter.from);
        const toNorm = normalizeDate(dateFilter.to);

        if (!disconDateNorm) return false; // skip if no valid date

        return (
          (!fromNorm || disconDateNorm >= fromNorm) &&
          (!toNorm || disconDateNorm <= toNorm)
        );
      })();

    const matchesSearch =
      !searchTerm ||
      consumer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.consumerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.mobileNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (consumer.agency || "").toLowerCase().includes(searchTerm.toLowerCase())
    

    // Base class filter
    const matchesBaseClass = 
      filters.baseClass.length === 0 || 
      filters.baseClass.some(bc => (consumer.baseClass || "").toUpperCase() === bc.toUpperCase())

    // Agency filter (case-insensitive)
    const matchesAgency =
      filters.agency.length === 0 || 
      filters.agency.some(ag => (consumer.agency || "").toUpperCase() === ag.toUpperCase())

    // MRU / Zone filter (case-insensitive & trimmed)
    const matchesMru = 
      filters.mru.length === 0 || 
      filters.mru.some(m => (consumer.mru || "").trim().toUpperCase() === m.trim().toUpperCase())

    // Address fuzzy match
    const matchesAddress = !filters.address || consumer.address.toLowerCase().includes(filters.address.toLowerCase())

    // Name filter
    const matchesName = !filters.name || consumer.name.toLowerCase().includes(filters.name.toLowerCase())

    // Consumer ID exact match
    const matchesConsumerId =
      !filters.consumerId || consumer.consumerId.toLowerCase().includes(filters.consumerId.toLowerCase())

    // Status filter (case-insensitive; "paid" matches both "paid" and "agency paid")
    const consumerStatusLc = (consumer.disconStatus || "").toLowerCase()
    const matchesStatus =
      filters.status.length === 0 ||
      filters.status.some(st => {
        const filterStatusLc = st.toLowerCase()
        return filterStatusLc === "paid"
          ? consumerStatusLc === "paid" || consumerStatusLc === "agency paid"
          : consumerStatusLc === filterStatusLc
      })

    // OSD range filter
    const consumerOsd = Number.parseFloat(consumer.d2NetOS || "0")
    const matchesOsd = consumerOsd >= minOsd

    // Exclude filters
    const excludeDeemedDisconnection =
      !excludeFilters.excludeDeemedDisconnection || consumer.disconStatus.toLowerCase() !== "deemed disconnection"

    const excludeTemproryDisconnected =
      !excludeFilters.excludeTemproryDisconnected || !consumer.disconStatus.toLowerCase().includes("temprory")



    return (
      matchesSearch &&
      matchesAgency &&
      matchesMru &&
      matchesAddress &&
      matchesBaseClass &&
      matchesName &&
      matchesConsumerId &&
      matchesStatus &&
      matchesOsd &&
      matchesDateRange &&
      excludeDeemedDisconnection &&
      excludeTemproryDisconnected
    )
    })
  }, [consumers, searchTerm, filters, minOsd, excludeFilters, dateFilter, userRole, userAgencies])

  // ── Cascading Dependent Filters ───────────────────────────────────────────
  // Base scoped dataset according to user role & permission
  const scopedConsumers = useMemo(() => {
    if (userRole === "admin" || userRole === "viewer") return consumers
    const upper = userAgencies.map(a => a.toUpperCase())
    if (userRole === "executive") {
      return consumers.filter(c => {
        const ca = (c.agency || "").toUpperCase()
        return upper.includes(ca) || c.disconStatus?.toLowerCase() === "bill dispute"
      })
    }
    return consumers.filter(c => upper.includes((c.agency || "").toUpperCase()) && c.disconStatus !== "&")
  }, [consumers, userRole, userAgencies])

  // Available agencies: dynamically scoped by selected MRU, status, baseClass
  const availableAgencies = useMemo(() => {
    let pool = scopedConsumers
    if (filters.mru.length > 0) {
      const mruUpper = filters.mru.map(m => m.toUpperCase())
      pool = pool.filter(c => mruUpper.includes((c.mru || "").toUpperCase()))
    }
    if (filters.status.length > 0) {
      const statusLower = filters.status.map(s => s.toLowerCase())
      pool = pool.filter(c => statusLower.includes((c.disconStatus || "").toLowerCase()))
    }
    if (filters.baseClass.length > 0) {
      const bcUpper = filters.baseClass.map(b => b.toUpperCase())
      pool = pool.filter(c => bcUpper.includes((c.baseClass || "").toUpperCase()))
    }
    const set = new Set(pool.map(c => c.agency).filter((a): a is string => Boolean(a)))
    const fullList = agencies.length > 0 ? agencies : Array.from(set).sort()
    if (filters.mru.length === 0 && filters.status.length === 0 && filters.baseClass.length === 0) {
      return fullList
    }
    return fullList.filter(a => set.has(a))
  }, [scopedConsumers, agencies, filters.mru, filters.status, filters.baseClass])

  // Available MRUs (Zones): dynamically scoped by selected agency, status, baseClass
  const availableMrus = useMemo(() => {
    let pool = scopedConsumers
    if (filters.agency.length > 0) {
      const agUpper = filters.agency.map(a => a.toUpperCase())
      pool = pool.filter(c => agUpper.includes((c.agency || "").toUpperCase()))
    }
    if (filters.status.length > 0) {
      const statusLower = filters.status.map(s => s.toLowerCase())
      pool = pool.filter(c => statusLower.includes((c.disconStatus || "").toLowerCase()))
    }
    if (filters.baseClass.length > 0) {
      const bcUpper = filters.baseClass.map(b => b.toUpperCase())
      pool = pool.filter(c => bcUpper.includes((c.baseClass || "").toUpperCase()))
    }
    return Array.from(new Set(pool.map(c => (c.mru || "").trim()).filter(Boolean))).sort()
  }, [scopedConsumers, filters.agency, filters.status, filters.baseClass])

  // Available Statuses: dynamically scoped by selected agency, MRU, baseClass
  const availableStatuses = useMemo(() => {
    let pool = scopedConsumers
    if (filters.agency.length > 0) {
      const agUpper = filters.agency.map(a => a.toUpperCase())
      pool = pool.filter(c => agUpper.includes((c.agency || "").toUpperCase()))
    }
    if (filters.mru.length > 0) {
      const mruUpper = filters.mru.map(m => m.toUpperCase())
      pool = pool.filter(c => mruUpper.includes((c.mru || "").toUpperCase()))
    }
    if (filters.baseClass.length > 0) {
      const bcUpper = filters.baseClass.map(b => b.toUpperCase())
      pool = pool.filter(c => bcUpper.includes((c.baseClass || "").toUpperCase()))
    }
    const ALL_POSSIBLE_STATUSES = [
      "connected", "disconnected", "office team", "bill dispute", "pending", "paid", "not found"
    ]
    const presentSet = new Set(pool.map(c => (c.disconStatus || "").toLowerCase().trim()).filter(Boolean))
    return ALL_POSSIBLE_STATUSES.filter(s => presentSet.has(s))
  }, [scopedConsumers, filters.agency, filters.mru, filters.baseClass])

  // Available Base Classes: dynamically scoped by selected agency, MRU, status
  const availableBaseClasses = useMemo(() => {
    let pool = scopedConsumers
    if (filters.agency.length > 0) {
      const agUpper = filters.agency.map(a => a.toUpperCase())
      pool = pool.filter(c => agUpper.includes((c.agency || "").toUpperCase()))
    }
    if (filters.mru.length > 0) {
      const mruUpper = filters.mru.map(m => m.toUpperCase())
      pool = pool.filter(c => mruUpper.includes((c.mru || "").toUpperCase()))
    }
    if (filters.status.length > 0) {
      const statusLower = filters.status.map(s => s.toLowerCase())
      pool = pool.filter(c => statusLower.includes((c.disconStatus || "").toLowerCase()))
    }
    return Array.from(new Set(pool.map(c => (c.baseClass || "").toUpperCase().trim()).filter(Boolean))).sort()
  }, [scopedConsumers, filters.agency, filters.mru, filters.status])

  // Auto-prune effect hooks to keep selected filters valid when parent dependencies change
  useEffect(() => {
    if (filters.agency.length > 0) {
      const valid = filters.agency.filter(a => availableAgencies.includes(a))
      if (valid.length !== filters.agency.length) setFilters(prev => ({ ...prev, agency: valid }))
    }
  }, [availableAgencies])

  useEffect(() => {
    if (filters.mru.length > 0) {
      const valid = filters.mru.filter(m => availableMrus.includes(m))
      if (valid.length !== filters.mru.length) setFilters(prev => ({ ...prev, mru: valid }))
    }
  }, [availableMrus])

  useEffect(() => {
    if (filters.status.length > 0) {
      const valid = filters.status.filter(s => availableStatuses.includes(s))
      if (valid.length !== filters.status.length) setFilters(prev => ({ ...prev, status: valid }))
    }
  }, [availableStatuses])

  useEffect(() => {
    if (filters.baseClass.length > 0) {
      const valid = filters.baseClass.filter(b => availableBaseClasses.includes(b))
      if (valid.length !== filters.baseClass.length) setFilters(prev => ({ ...prev, baseClass: valid }))
    }
  }, [availableBaseClasses])

  const sortedConsumers = useMemo(() => [...filteredConsumers].sort((a, b) => {
    // 0. Urgent rows always appear first (admin-set priority flag)
    const urgentA = (a.priority || "").toLowerCase() === "urgent"
    const urgentB = (b.priority || "").toLowerCase() === "urgent"
    if (urgentA && !urgentB) return -1
    if (!urgentA && urgentB) return 1

    // 1. Connected next
    const isConnectedA = (a.disconStatus || "").toLowerCase() === "connected"
    const isConnectedB = (b.disconStatus || "").toLowerCase() === "connected"
    if (isConnectedA && !isConnectedB) return -1
    if (!isConnectedA && isConnectedB) return 1

    // 2. MRU A-Z sort (when active, groups by MRU before applying OSD)
    if (sortByMRU) {
      const mruCmp = (a.mru || "").localeCompare(b.mru || "")
      if (mruCmp !== 0) return mruCmp
    }

    // 3. OSD Sort
    if (sortByOSD === "none") return 0
    const aOsd = Number.parseFloat(a.d2NetOS || "0")
    const bOsd = Number.parseFloat(b.d2NetOS || "0")
    if (sortByOSD === "asc") return aOsd - bOsd
    if (sortByOSD === "desc") return bOsd - aOsd
    return 0
  }), [filteredConsumers, sortByOSD, sortByMRU])

    // Helper to ensure links work even if "https://" is missing in the sheet
  const getValidUrl = (url: string | undefined) => {
    if (!url) return "#";
    const cleanUrl = url.trim();
    if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
      return cleanUrl;
    }
    return `https://${cleanUrl}`;
  };

  const getStatusIcon = (status: string) => {
    const s = (status || "").toLowerCase()
    if (s === "connected") return <CheckCircle2 className="h-4 w-4 text-green-600" />
    if (s === "disconnected") return <Power className="h-4 w-4 text-red-600" />
    if (s === "pending" || s === "office team") return <Clock className="h-4 w-4 text-yellow-600" />
    if (s === "bill dispute") return <AlertCircle className="h-4 w-4 text-orange-500" />
    if (s.includes("deemed")) return <UserX className="h-4 w-4 text-red-500" />
    return <HelpCircle className="h-4 w-4 text-gray-400" />
  }

  // Pagination logic
  const itemsPerPage = viewMode === "list" ? 100 : 12
  const totalPages = Math.ceil(sortedConsumers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedConsumers = sortedConsumers.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, searchTerm, minOsd, excludeFilters, sortByOSD, sortByMRU, viewMode])

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "connected":
        return "bg-green-100 text-green-800"
      case "disconnected":
        return "bg-red-100 text-red-800"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "deemed disconnection":
        return "bg-orange-100 text-orange-800"
      case "temprory disconnected":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }



  const handleUpdateConsumer = async (updatedConsumer: ConsumerData) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    // Capture the pre-edit state so the server can log an accurate old→new
    // history entry without an extra sheet read.
    const prev = consumers.find((c) => c.consumerId === updatedConsumer.consumerId)
    const withPrev: any = {
      ...updatedConsumer,
      previousStatus: prev?.disconStatus ?? "",
      previousOsd: prev?.d2NetOS ?? "",
      previousNotes: prev?.notes ?? "",
    }
    // 1. Optimistic Update: Mark as syncing and stamp a local-edit timestamp
    //    so a stale CDN-cached patch fetch can't overwrite this row.
    const syncingConsumer: ConsumerData = {
      ...updatedConsumer,
      _syncStatus: 'syncing',
      _localEditedAt: Date.now(),
    };
    
    setConsumers((prev) => {
      const newList = prev
        .map((c) => (c.consumerId === updatedConsumer.consumerId ? syncingConsumer : c))
        // .filter((c) => userRole === "admin" || c.disconStatus !== "&"); // Removed to prevent accidental data loss
      saveToCache("consumers_data_cache", newList);
      return newList;
    });
    setSelectedConsumer(null);

    // 2. Background Sync with Retry Logic
    const attemptSync = async (data: ConsumerData, retriesLeft: number) => {
      try {
        const response = await fetch("/api/consumers/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) throw new Error("Update failed");

        window.dispatchEvent(new Event("notif-refresh"));
        // Success: Clear sync status but keep _localEditedAt so a stale
        // CDN-cached patch fetch in the next ~30s can't clobber this row.
        setConsumers((prev) => {
          const newList = prev.map((c) =>
            c.consumerId === data.consumerId
              ? { ...data, _syncStatus: undefined, _localEditedAt: Date.now() }
              : c
          );
          saveToCache("consumers_data_cache", newList);
          return newList;
        });
      } catch (error) {
        if (retriesLeft > 0) {
          console.warn(`Sync failed for ${data.consumerId}. Retrying in 5s...`);
          setTimeout(() => attemptSync(data, retriesLeft - 1), 5000);
        } else {
          // Permanent Failure: Mark as error
          setConsumers((prev) => {
            const newList = prev.map((c) => 
              c.consumerId === data.consumerId ? { ...data, _syncStatus: 'error' as const } : c
            );
            saveToCache("consumers_data_cache", newList);
            return newList;
          });
        }
      }
    };

    attemptSync(withPrev, 3);
  }

  const clearFilters = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    setFilters({
      agency: [],
      address: "",
      mru: [],
      name: "",
      consumerId: "",
      status: [],
      baseClass: [],
    })
    setSearchTerm("")
    setMinOsd(0)
    setExcludeFilters({
      excludeDeemedDisconnection: false,
      excludeTemproryDisconnected: false,
    })
    setSortByOSD("desc")
    setSortByMRU(false)
    setDateFilter({
      from: null,
      to: null,
      isActive: false
    })
    setCurrentPage(1)
  }

  const toggleOSDSort = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    if (sortByOSD === "none") setSortByOSD("desc")
    else if (sortByOSD === "desc") setSortByOSD("asc")
    else setSortByOSD("none")
  }

  const getSortIcon = () => {
    if (sortByOSD === "asc") return <ArrowUp className="h-4 w-4" />
    if (sortByOSD === "desc") return <ArrowDown className="h-4 w-4" />
    return <ArrowUpDown className="h-4 w-4" />
  }

  useImperativeHandle(ref, () => ({
    getCurrentConsumers: () => filteredConsumers,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardStats consumers={[]} loading={true} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading consumer data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DashboardStats consumers={[]} loading={false} />
        <div className="flex items-center justify-center py-12">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Error loading consumer data:</strong>
              <br />
              {error}
              <br />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 bg-transparent"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (selectedConsumer) {
    return (
      <ConsumerForm
        consumer={selectedConsumer}
        onSave={handleUpdateConsumer}
        onCancel={() => setSelectedConsumer(null)}
        userRole={userRole}
        availableAgencies={agencies}
        permissions={permissions}
      />
    )
  }

  if (showAdminPanel && userRole === "admin") {
    return <AdminPanel onClose={onCloseAdminPanel} />
  }

  // ── RECONNECTION BLOCK ────────────────────────────────────────────────────
  // Hard block for agency: if any of their reconnections have been pending
  // for more than 30 hours, the entire disconnection module is inaccessible.
  if (userRole === "agency" && blockedIds.size > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-red-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-red-700">Module Locked</h2>
          <p className="text-lg font-semibold text-gray-800">
            {blockedIds.size} Reconnection{blockedIds.size > 1 ? "s" : ""} Overdue
          </p>
          <p className="text-gray-600 max-w-md">
            You have <strong>{blockedIds.size} pending reconnection{blockedIds.size > 1 ? " requests" : " request"}</strong> that
            {blockedIds.size > 1 ? " have" : " has"} been waiting for more than <strong>30 hours</strong>.
            The Disconnection module is locked until all overdue reconnections are completed.
          </p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 max-w-sm w-full">
          <p className="text-sm font-bold text-red-800 uppercase tracking-wide mb-1">Action Required</p>
          <p className="text-sm text-red-700">
            Go to the <strong>Reconnection</strong> module from the home menu and mark all overdue requests as
            Reconnected or Door Locked before continuing.
          </p>
        </div>
        {onGoToReconnection && (
          <button
            onClick={onGoToReconnection}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow transition"
          >
            Go to Reconnection Module →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Nearby Consumer Radar overlay */}
      {showNearbyMap && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-4xl h-full max-h-[90vh]">
            <NearbyConsumerMap
              consumers={filteredConsumers}
              onClose={() => setShowNearbyMap(false)}
              onGoToConsumer={(consumer) => {
                // Close radar, ensure card view and navigate to the consumer's page/card
                setShowNearbyMap(false)
                setViewMode("card")
                // Find index in the current sorted list and compute page
                const idx = sortedConsumers.findIndex((c) => c.consumerId === consumer.consumerId)
                if (idx >= 0) {
                  const page = Math.floor(idx / itemsPerPage) + 1
                  setCurrentPage(page)
                  // Wait for the UI to render the target card, then scroll and open update
                  setTimeout(() => {
                    const el = document.getElementById(`consumer-card-${consumer.consumerId}`)
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                    setSelectedConsumer(consumer)
                  }, 300)
                } else {
                  setSelectedConsumer(consumer)
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Admin/Executive warning banner when overdue reconnections exist */}
      {(userRole === "admin" || userRole === "executive") && blockedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border-l-4 border-orange-500 rounded-lg p-3">
          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-orange-800">
              {blockedIds.size} reconnection{blockedIds.size > 1 ? "s" : ""} pending
            </p>
          </div>
          {onGoToReconnection && (
            <button
              onClick={onGoToReconnection}
              className="text-xs font-medium text-orange-700 underline shrink-0"
            >
              View →
            </button>
          )}
        </div>
      )}

      {/* Dashboard Statistics - Always visible */}
      <DashboardStats consumers={filteredConsumers} loading={false} />

      {/* Search and Filter Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border sticky top-[64px] z-30">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search id, name, address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-8"
              />
              {searchTerm && (
                <X
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer hover:text-red-700"
                  onClick={() => setSearchTerm("")}
                />
              )}
            </div>

            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative shrink-0">
                  <Filter className="h-4 w-4" />
                  {(filters.agency.length > 0 || filters.mru.length > 0 || filters.status.length > 0 || filters.baseClass.length > 0 || filters.address !== "" || filters.name !== "" || filters.consumerId !== "" ||
                    minOsd > 0 ||
                    dateFilter.isActive ||
                    sortByOSD !== "desc" || sortByMRU) && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-600 rounded-full border-2 border-white" />
                  )}
                </Button>
              </SheetTrigger>
            <SheetContent
              className="w-[300px] sm:w-[400px] overflow-y-auto"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <SheetHeader className="mb-6">
                <SheetTitle>Filters & Sort</SheetTitle>
                <SheetDescription>
                  Filter consumers by agency, status, and other criteria.
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-4 pb-20">
                {/* OSD Range */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium whitespace-nowrap">Min Outstanding</label>
                    <div className="relative flex-1 max-w-[120px]">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                      <Input
                        type="number"
                        value={minOsd || ""}
                        onChange={(e) => setMinOsd(Number(e.target.value))}
                        className="h-8 pl-5 pr-6"
                        placeholder="0"
                      />
                      {minOsd > 0 && (
                        <X
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-red-500 cursor-pointer hover:text-red-700"
                          onClick={() => setMinOsd(0)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMinOsd(3000)}>{`>= 3k`}</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMinOsd(5000)}>{`>= 5k`}</Button>
                  </div>
                </div>

                {/* Date Filter */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Disconnection Date</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">From</span>
                      <Input
                        type="date"
                        value={dateFilter.from ? format(dateFilter.from, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : null, isActive: true }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">To</span>
                      <Input
                        type="date"
                        value={dateFilter.to ? format(dateFilter.to, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : null, isActive: true }))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs" 
                      onClick={() => {
                        setDateFilter({
                          from: null,
                          to: null,
                          isActive: false
                        });
                      }}
                    >
                      All
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs" 
                      onClick={() => {
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        setDateFilter({
                          from: new Date(todayStr),
                          to: new Date(todayStr),
                          isActive: true
                        });
                      }}
                    >
                      Today
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs" 
                      onClick={() => {
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        const past = new Date(now);
                        past.setDate(now.getDate() - 7);
                        const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
                        setDateFilter({
                          from: new Date(pastStr),
                          to: new Date(todayStr),
                          isActive: true
                        });
                      }}
                    >
                      Last 7d
                    </Button>
                  </div>
                </div>

                {/* Dropdowns */}
                <div className="space-y-3">
                  {(userRole === "admin" || userRole === "viewer" || (userRole === "executive" && userAgencies.length > 1)) && (
                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">Agency</label>
                    <div className="col-span-2">
                      <MultiSelectDropdown
                        placeholder="All Agencies"
                        options={availableAgencies}
                        selected={filters.agency}
                        onChange={(val) => setFilters((prev) => ({ ...prev, agency: val }))}
                      />
                    </div>
                  </div>
                  )}

                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">Status</label>
                    <div className="col-span-2">
                      <MultiSelectDropdown
                        placeholder="All Status"
                        options={availableStatuses}
                        selected={filters.status}
                        onChange={(val) => setFilters((prev) => ({ ...prev, status: val }))}
                        searchable={false}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">MRU (Zone)</label>
                    <div className="col-span-2">
                      <MultiSelectDropdown
                        placeholder="All MRUs"
                        options={availableMrus}
                        selected={filters.mru}
                        onChange={(val) => setFilters((prev) => ({ ...prev, mru: val }))}
                        searchable={true}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">Base Class</label>
                    <div className="col-span-2">
                      <MultiSelectDropdown
                        placeholder="All Classes"
                        options={availableBaseClasses}
                        selected={filters.baseClass}
                        onChange={(val) => setFilters((prev) => ({ ...prev, baseClass: val }))}
                        searchable={false}
                      />
                    </div>
                  </div>
                </div>

                {/* Sort */}
                <div className="space-y-2 pt-4 border-t">
                  <label className="text-sm font-medium">Sorting</label>
                  <Button
                    variant="outline"
                    onClick={toggleOSDSort}
                    className="w-full justify-between"
                  >
                    <span>Sort by Outstanding Dues</span>
                    {getSortIcon()}
                  </Button>
                  <Button
                    variant={sortByMRU ? "default" : "outline"}
                    onClick={() => setSortByMRU(v => !v)}
                    className="w-full justify-between"
                  >
                    <span>Sort by MRU A–Z</span>
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Clear Filters */}
                <Button 
                  variant="destructive"
                  className="w-full mt-4"
                  onClick={() => clearFilters()}
                >
                  <X className="mr-2 h-4 w-4" /> Clear All Filters
                </Button>

                <Button
                  className="w-full mt-2 bg-slate-950 hover:bg-slate-900 text-white"
                  onClick={() => setIsFilterOpen(false)}
                >
                  OK
                </Button>
              </div>
            </SheetContent>
          </Sheet>

            <div className="flex items-center border rounded-md bg-white ml-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 rounded-none rounded-l-md ${viewMode === "card" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                  setViewMode("card")
                  localStorage.setItem("consumerListViewMode", "card")
                }}
                title="Card View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <div className="w-px h-5 bg-gray-200" />
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 rounded-none rounded-r-md ${viewMode === "list" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                  setViewMode("list")
                  localStorage.setItem("consumerListViewMode", "list")
                }}
                title="List View"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Nearby Consumer Radar button — full width below search row */}
          {
            <Button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setShowNearbyMap(v => !v)
              }}
              className={`w-full h-12 rounded-xl font-extrabold flex items-center justify-center gap-2 text-sm shadow-md transition-all duration-300 transform hover:scale-[1.01] bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-750 text-white`}
            >
              <MapPin className="h-4.5 w-4.5 animate-bounce" />
              {showNearbyMap ? "Hide Navigation Radar" : "Locate Nearby Consumers"}
            </Button>
          }
        </div>

        {/* Summary Footer in Sticky Header */}
        <div className="pt-3 border-t flex justify-between items-center mt-2 text-xs text-gray-500">
           <div className="flex items-center gap-2">
              <span>{sortedConsumers.length} consumers</span>

              <button
                onClick={handleManualRefresh}
                disabled={syncStatus === 'checking' || syncStatus === 'syncing'}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors disabled:cursor-not-allowed ${
                  syncStatus === 'checking' ? 'border-yellow-400 bg-yellow-50 text-yellow-600 animate-pulse' :
                  syncStatus === 'found'    ? 'border-orange-400 bg-orange-50 text-orange-500 animate-pulse' :
                  syncStatus === 'syncing'  ? 'border-blue-400 bg-blue-50 text-blue-500' :
                  syncStatus === 'updated'  ? 'border-green-500 bg-green-50 text-green-600' :
                  'border-blue-300 bg-blue-50 text-blue-500 hover:border-blue-500 hover:bg-blue-100 hover:text-blue-700 active:scale-95 cursor-pointer'
                }`}
                title={
                  syncStatus === 'checking' ? 'Checking for updates...' :
                  syncStatus === 'found'    ? 'Update found — downloading...' :
                  syncStatus === 'syncing'  ? 'Downloading...' :
                  syncStatus === 'updated'  ? 'Up to date' :
                  'Tap to refresh'
                }
              >
                {syncStatus === 'checking'
                  ? <><Loader2 className="h-3 w-3 animate-spin" /><span className="text-[10px] font-medium">Checking...</span></>
                  : syncStatus === 'found'
                  ? <><DownloadCloud className="h-3 w-3" /><span className="text-[10px] font-medium">Update Found</span></>
                  : syncStatus === 'syncing'
                  ? <><RefreshCw className="h-3 w-3 animate-spin" /><span className="text-[10px] font-medium">Downloading...</span></>
                  : syncStatus === 'updated'
                  ? <><Check className="h-3 w-3" /><span className="text-[10px] font-medium">Updated</span></>
                  : <><RefreshCw className="h-3 w-3" /><span className="text-[10px] font-medium">Refresh</span></>
                }
              </button>
           </div>
           {(filters.agency.length > 0 || filters.mru.length > 0 || filters.status.length > 0 || filters.baseClass.length > 0 || filters.address !== "" || filters.name !== "" || filters.consumerId !== "" ||
              minOsd > 0 ||
              dateFilter.isActive ||
              sortByOSD !== "desc") && (
              <div className="flex items-center gap-1">
                <span className="text-blue-600 font-medium">Filters Active</span>
                <X
                  className="h-4 w-4 text-red-500 cursor-pointer hover:text-red-700"
                  onClick={clearFilters}
                />
              </div>
           )}
        </div>
      </div>

      {/* Consumer Cards */}
      {viewMode === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedConsumers.map((consumer) => (
            <Card id={`consumer-card-${consumer.consumerId}`} key={consumer.consumerId} className={`shadow-md hover:shadow-lg transition-shadow overflow-hidden max-w-full ${(consumer.priority || "").toLowerCase() === "urgent" ? "ring-2 ring-red-500 border-red-300" : ""}`}>
              <CardHeader className="pb-3 break-words whitespace-normal">
                <div className="flex items-start justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-lg break-words whitespace-normal line-clamp-2 leading-tight">{consumer.name}</CardTitle>
                      {(consumer.priority || "").toLowerCase() === "urgent" && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded">URGENT</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <p className="text-sm text-gray-600 font-mono">ID: {consumer.consumerId}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                          setActiveHistoryConsumer(consumer)
                        }}
                        className="text-gray-400 hover:text-slate-900 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                        title="View history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {consumer.mru ? (
                      <Badge variant="outline" className="mt-2 text-[10px] uppercase tracking-[0.08em]">
                        {consumer.mru}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end space-y-1 shrink-0">
                    <div className="flex items-center gap-1">
                      {consumer._syncStatus === 'syncing' && (
                        <RefreshCw className="h-3 w-3 animate-spin text-blue-500" aria-label="Syncing..." />
                      )}
                      {consumer._syncStatus === 'error' && (
                        <AlertCircle className="h-3 w-3 text-red-500" aria-label="Sync failed (saved locally)" />
                      )}
                      <Badge className={getStatusColor(consumer.disconStatus)}>{consumer.disconStatus}</Badge>
                    </div>
                    <Badge variant="outline" className="text-xs max-w-[120px] truncate block">
                      {consumer.agency}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 break-words whitespace-normal">
                <div className="flex items-start space-x-2 min-w-0">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-600 line-clamp-2" title={consumer.address}>{consumer.address}</p>
                </div>
                {consumer.mobileNumber && (
                  <a href={`tel:${consumer.mobileNumber}`} className="flex items-center space-x-2 hover:underline">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-blue-600">{consumer.mobileNumber}</p>
                  </a>
                )}

                <div className="flex items-center space-x-2">
                  <IndianRupee className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-600">
                      ₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Outstanding Dues</p>
                  </div>
                </div>

                {consumer.osDuedateRange && (
                  <div className="flex items-center space-x-2">
                    <CalendarIcon className="h-4 w-4 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">{consumer.osDuedateRange}</p>
                      <p className="text-xs text-gray-500">Due Date Range</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Class:</span> {consumer.class}
                  </div>
                  <div>
                    <span className="font-medium">Device:</span> {consumer.device}
                  </div>
                </div>

                {consumer.disconDate && (
                  <div className="text-xs text-red-600">
                    <span className="font-medium">Last Updated:</span> {consumer.disconDate}
                  </div>
                )}

                {/* 👇 UPDATED IMAGE LINK SECTION 👇 */}
                {(consumer.imageUrl || (consumer as any).image) && (
                  <div className="pt-2 pb-1 relative z-10"> {/* Added z-10 and spacing */}
                    <a
                      href={getValidUrl((consumer.imageUrl || (consumer as any).image) as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>View Uploaded Image</span>
                    </a>
                  </div>
                )}
                {/* 👆 END UPDATED SECTION 👆 */}

                {(() => {
                  const isReadOnlyMode = permissions
                    ? !(permissions.disconnection?.includes("update") || permissions.consumer_master?.includes("update"))
                    : (userRole === "viewer" || userRole === "reader")
                  const reconnBlocked = blockedIds.has(consumer.consumerId)
                  return (
                    <Button
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        setSelectedConsumer(consumer)
                      }}
                      className={`w-full mt-4 ${
                        isReadOnlyMode
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      }`}
                      size="sm"
                      title={reconnBlocked ? "Reconnection pending >30h" : undefined}
                    >
                      {isReadOnlyMode ? (
                        <>
                          <Eye className="h-4 w-4 mr-2 text-slate-600" />
                          View Details
                        </>
                      ) : (
                        <>
                          <Edit className="h-4 w-4 mr-2" />
                          {reconnBlocked ? "⚠ Update Status" : "Update Status"}
                        </>
                      )}
                    </Button>
                  )
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Desktop Table View (Hidden on Mobile) */}
          <div className="hidden md:block bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">ID / Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Address</th>
                    <th className="px-4 py-3 whitespace-nowrap">Mobile</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">OSD</th>
                    <th className="px-4 py-3 whitespace-nowrap text-center">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedConsumers.map((consumer) => (
                    <tr id={`consumer-row-${consumer.consumerId}`} key={consumer.consumerId} className={`hover:bg-gray-50 transition-colors ${(consumer.priority || "").toLowerCase() === "urgent" ? "bg-red-50 border-l-4 border-red-500" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900 font-mono">{consumer.consumerId}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                              setActiveHistoryConsumer(consumer)
                            }}
                            className="text-gray-400 hover:text-slate-900 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                            title="View history"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                          {(consumer.priority || "").toLowerCase() === "urgent" && (
                            <span className="text-[9px] font-bold uppercase tracking-wide bg-red-600 text-white px-1 py-0.5 rounded">URGENT</span>
                          )}
                        </div>
                        {consumer.mru ? (
                          <div className="text-[10px] text-gray-500 uppercase tracking-[0.08em] truncate max-w-[150px]">
                            {consumer.mru}
                          </div>
                        ) : null}
                        <div className="text-xs text-gray-500 truncate max-w-[150px]" title={consumer.name}>{consumer.name}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="truncate text-gray-600" title={consumer.address}>{consumer.address}</div>
                        <div className="text-xs text-gray-400">{consumer.agency}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {consumer.mobileNumber ? (
                           <a href={`tel:${consumer.mobileNumber}`} className="hover:text-blue-600 hover:underline">{consumer.mobileNumber}</a>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="font-medium text-red-600">₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{consumer.agency}</div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                         <Badge className={`${getStatusColor(consumer.disconStatus)} whitespace-nowrap`}>{consumer.disconStatus}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {(() => {
                          const isReadOnlyMode = permissions
                            ? !(permissions.disconnection?.includes("update") || permissions.consumer_master?.includes("update"))
                            : (userRole === "viewer" || userRole === "reader")
                          const reconnBlocked = blockedIds.has(consumer.consumerId)
                          return (
                            <Button
                              onClick={() => {
                                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                                setSelectedConsumer(consumer)
                              }}
                              size="sm"
                              className={`h-8 ${
                                isReadOnlyMode
                                  ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold"
                                  : "bg-slate-950 hover:bg-slate-900 text-white"
                              }`}
                              title={reconnBlocked ? "Reconnection pending >30h" : undefined}
                            >
                              {isReadOnlyMode ? "View" : reconnBlocked ? "⚠ Update" : "Update"}
                            </Button>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile List View (Hidden on Desktop) */}
          <div className="md:hidden space-y-2">
            {paginatedConsumers.map((consumer) => (
              <div 
                id={`consumer-item-${consumer.consumerId}`}
                key={consumer.consumerId} 
                onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setPreviewConsumer(consumer)
                }}
                className={`p-2 rounded-lg shadow-sm border active:bg-gray-50 transition-colors ${
                  (consumer.priority || "").toLowerCase() === "urgent"
                    ? "bg-red-50 border-red-400"
                    : "bg-white"
                } ${
                  ((!["connected", "visited", "not found"].includes(consumer.disconStatus.toLowerCase()) && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")
                    ? "opacity-90"
                    : "cursor-pointer"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                     <div className="shrink-0">{getStatusIcon(consumer.disconStatus)}</div>
                     <div className="flex items-center gap-1 shrink-0">
                       <span className="font-semibold text-sm text-gray-900 font-mono">{consumer.consumerId}</span>
                       <button
                         onClick={(e) => {
                           e.stopPropagation()
                           if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                           setActiveHistoryConsumer(consumer)
                         }}
                         className="text-gray-400 hover:text-slate-900 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                         title="View history"
                       >
                         <History className="h-3.5 w-3.5" />
                       </button>
                     </div>
                     {(consumer.priority || "").toLowerCase() === "urgent" && (
                       <span className="text-[9px] font-bold uppercase bg-red-600 text-white px-1 py-0.5 rounded shrink-0">URGENT</span>
                     )}
                     <div className="text-xs text-gray-500 flex flex-col gap-1 min-w-0">
                        <span className="truncate">{consumer.name}</span>
                        {consumer.mru ? (
                          <span className="text-[10px] uppercase tracking-[0.08em] text-gray-400 truncate">{consumer.mru}</span>
                        ) : null}
                     </div>
                  </div>
                  <div className="text-xs font-bold text-red-600 whitespace-nowrap shrink-0 mt-0.5">
                     ₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-0.5 pl-6">
                  <div className="text-xs text-gray-600 truncate mr-2">
                    {consumer.address}
                  </div>
                  <div className="flex items-center -mr-2">
                    {consumer.mobileNumber && (
                       <a href={`tel:${consumer.mobileNumber}`} onClick={(e) => e.stopPropagation()} className="p-1 text-blue-600 mr-1">
                          <Phone className="h-4 w-4" />
                       </a>
                    )}
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6 text-blue-600 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        if (!((!["connected", "visited", "not found"].includes(consumer.disconStatus.toLowerCase()) && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")) {
                          setSelectedConsumer(consumer)
                        }
                      }}
                      disabled={((!["connected", "visited", "not found"].includes(consumer.disconStatus.toLowerCase()) && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="h-[2px] bg-gray-200 w-full mt-2 rounded-full" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages} ({sortedConsumers.length} total consumers)
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setCurrentPage(Math.max(1, currentPage - 1))
              }}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        setCurrentPage(pageNum)
                    }}
                    className="w-8 h-8 p-0"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }}
              disabled={currentPage === totalPages}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {sortedConsumers.length === 0 && consumers.length > 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No consumers found matching your search criteria.</p>
          <Button variant="outline" onClick={clearFilters} className="mt-4 bg-transparent">
            Clear all filters
          </Button>
        </div>
      )}

      {consumers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No consumer data available.</p>
        </div>
      )}

      {/* Mobile PIP View Dialog */}
      <Dialog open={!!previewConsumer} onOpenChange={(open) => !open && setPreviewConsumer(null)}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-lg">
          <DialogTitle className="sr-only">Consumer Details</DialogTitle>
          <DialogDescription className="sr-only">
            Details of the selected consumer
          </DialogDescription>
          {previewConsumer && (
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-3 bg-gray-50 border-b">
                <div className="flex items-start justify-between w-full">
                  <div className="min-w-0">
                    <CardTitle className="text-lg break-words whitespace-normal">{previewConsumer.name}</CardTitle>
                    <p className="text-sm text-gray-600">{previewConsumer.consumerId}</p>
                  </div>
                  <div className="flex flex-col items-end space-y-1">
                    <Badge className={getStatusColor(previewConsumer.disconStatus)}>{previewConsumer.disconStatus}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {previewConsumer.agency}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-start space-x-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-600">{previewConsumer.address}</p>
                </div>
                
                {previewConsumer.mobileNumber && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${previewConsumer.mobileNumber}`} className="text-sm text-blue-600 hover:underline">
                      {previewConsumer.mobileNumber}
                    </a>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <IndianRupee className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-600">
                      ₹{Number.parseFloat(previewConsumer.d2NetOS || "0").toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Outstanding Dues</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  <div><span className="font-medium">Class:</span> {previewConsumer.baseClass}</div>
                  <div><span className="font-medium">Device:</span> {previewConsumer.device}</div>
                  <div className="col-span-2"><span className="font-medium">Due:</span> {previewConsumer.osDuedateRange}</div>
                </div>

                {(previewConsumer.imageUrl || (previewConsumer as any).image) && (
                  <div className="pt-2">
                    <a
                      href={getValidUrl((previewConsumer.imageUrl || (previewConsumer as any).image) as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-xs font-medium text-blue-600 hover:underline"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>View Uploaded Image</span>
                    </a>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setPreviewConsumer(null);
                    if (!((!["connected", "visited", "not found"].includes(previewConsumer.disconStatus.toLowerCase()) && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")) {
                      setSelectedConsumer(previewConsumer);
                    }
                  }}
                  disabled={(!["connected", "visited", "not found"].includes(previewConsumer.disconStatus.toLowerCase()) && userRole !== "admin" && userRole !== "executive") || userRole === "viewer"}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Update Status
                </Button>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      {/* Consumer History Dialog */}
      {activeHistoryConsumer && (
        <ConsumerHistoryDialog
          consumer={activeHistoryConsumer}
          onClose={() => setActiveHistoryConsumer(null)}
        />
      )}
    </div>
  )
})

function ConsumerHistoryDialog({ consumer, onClose }: { consumer: ConsumerData; onClose: () => void }) {
  const [historyEntries, setHistoryEntries] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const eventMeta = (h: { action: string; newStatus: string }) => {
    const a = (h.action || "").toLowerCase()
    const ns = (h.newStatus || "").toLowerCase()
    if (a === "paid" || ns === "paid") return { label: "Payment Recorded", Icon: Wallet, color: "text-green-600", ring: "bg-green-100" }
    if (a === "reconnection_issued" || ns === "reconnection_pending") return { label: "Reconnection Issued", Icon: Activity, color: "text-purple-600", ring: "bg-purple-100" }
    if (a === "reconnected" || ns === "reconnected") return { label: "Reconnected", Icon: CheckCircle2, color: "text-emerald-600", ring: "bg-emerald-100" }
    if (a === "door_locked" || ns === "door_locked") return { label: "Door Locked (Reconnection)", Icon: AlertCircle, color: "text-amber-600", ring: "bg-amber-100" }
    if (a === "cancelled" || ns === "cancelled") return { label: "Reconnection Cancelled", Icon: X, color: "text-gray-500", ring: "bg-gray-100" }
    if (a === "removed_from_upload") return { label: "Removed from list", Icon: Trash2, color: "text-red-600", ring: "bg-red-100" }
    if (a.startsWith("in_new_list")) return { label: "Listed in cycle", Icon: PlusCircle, color: "text-blue-600", ring: "bg-blue-100" }
    if (a === "disconnected" || ns === "disconnected" || ns.includes("disconnect")) return { label: "Disconnected", Icon: PowerOff, color: "text-red-600", ring: "bg-red-100" }
    if (ns === "visited" || ns === "not found") return { label: ns === "visited" ? "Visited" : "Not found", Icon: Footprints, color: "text-amber-600", ring: "bg-amber-100" }
    return { label: (h.action || "Updated").replace(/_/g, " "), Icon: Clock, color: "text-gray-500", ring: "bg-gray-100" }
  }

  const getValidUrl = (url: string | undefined) => {
    if (!url) return "#"
    const clean = url.trim()
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean
    return `https://${clean}`
  }

  useEffect(() => {
    let active = true
    const loadHistory = async () => {
      const cacheKey = `consumer_history_${consumer.consumerId}`
      const cached = await getFromCache<any[]>(cacheKey)
      if (cached && active) {
        setHistoryEntries(cached)
      } else {
        setHistoryLoading(true)
      }

      try {
        const resp = await fetch(`/api/consumers/history?id=${encodeURIComponent(consumer.consumerId)}`)
        if (resp.ok && active) {
          const data = await resp.json()
          setHistoryEntries(data)
          await saveToCache(cacheKey, data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (active) setHistoryLoading(false)
      }
    }
    loadHistory()
    return () => {
      active = false
    }
  }, [consumer.consumerId])

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>Consumer History — {consumer.consumerId}</DialogTitle>
          <DialogDescription className="sr-only">Timeline of changes for consumer {consumer.consumerId}</DialogDescription>
        </DialogHeader>
        {historyLoading && historyEntries.length === 0 && (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
          </div>
        )}
        {!historyLoading && historyEntries.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">No history recorded yet.</p>
        )}
        {historyEntries.length > 0 && (
          <div className="mt-2 relative pl-5">
            <span className="absolute left-[9px] top-1 bottom-1 w-px bg-gray-200" aria-hidden />
            <div className="space-y-3">
              {historyEntries.map((h, i) => {
                const meta = eventMeta(h)
                const Icon = meta.Icon
                return (
                  <div key={i} className="relative border rounded-lg p-3 space-y-2 bg-gray-50 text-left">
                    <span className={`absolute -left-[18px] top-3 h-5 w-5 rounded-full flex items-center justify-center ${meta.ring}`}>
                      <Icon className={`h-3 w-3 ${meta.color}`} />
                    </span>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                      <span className="text-[10px] font-mono text-gray-400">{h.timestamp}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {h.oldStatus && (
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{h.oldStatus}</span>
                      )}
                      {h.newStatus && h.newStatus !== h.oldStatus && (
                        <>
                          <span className="text-gray-400">→</span>
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{h.newStatus}</span>
                        </>
                      )}
                      {h.amount && Number(h.amount) > 0 && (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">₹{Number(h.amount).toLocaleString("en-IN")}</span>
                      )}
                      {h.oldOsd && (
                        <span className="text-gray-500">OSD: ₹{Number(h.oldOsd).toLocaleString("en-IN")}</span>
                      )}
                      {h.eventDate && <span className="text-gray-400">on {h.eventDate}</span>}
                    </div>
                    {h.oldNotes && (
                      <p className="text-xs text-gray-600 italic">Remarks: {h.oldNotes}</p>
                    )}
                    <div className="flex items-center justify-between">
                      {h.oldImageUrl ? (
                        <a
                          href={getValidUrl(h.oldImageUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          <span>View Uploaded Image</span>
                        </a>
                      ) : <span />}
                      <span className="text-[10px] text-gray-400">by {h.changedBy}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { ConsumerList }
