"use client"

import { useEffect, useState } from "react"
import type { ConsumerData } from "@/lib/google-sheets"
import type { DeemedVisitData } from "@/lib/dd-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Zap,
  RotateCcw,
  ClipboardCheck,
  UserX,
  Settings,
  LayoutDashboard,
  ArrowRight,
  RadioTower,
  Gauge,
  X,
  Users,
  RefreshCw,
  Brush,
  Phone,
  Package,
  FileCheck2,
  ShieldAlert,
  Building2,
  Calendar,
  Camera
} from "lucide-react"
import { GlobalConsumerSearch } from "@/components/global-consumer-search"
import { ViewType } from "@/components/app-sidebar"
import { getFromCache, saveToCache, notifyCacheUpdate, getCccPrefix } from "@/lib/indexed-db"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import { parseTs } from "@/lib/date-utils"
import { matchesAgency } from "@/lib/permission-utils"

interface DashboardMenuProps {
  onSelect: (module: ViewType) => void
  userRole: string
  userAgencies?: string[]
  permissions?: Record<string, string[]>
}

export function DashboardMenu({ onSelect, userRole, userAgencies = [], permissions }: DashboardMenuProps) {
  const [latestUpdateDate, setLatestUpdateDate] = useState<string>("")
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [ddPendingCount, setDdPendingCount] = useState<number>(0)
  const [reconnectionPendingCount, setReconnectionPendingCount] = useState<number>(0)
  const [meterPendingCount, setMeterPendingCount] = useState<number>(0)
  const [nscPendingCount, setNscPendingCount] = useState<number>(0)
  const [replacementPendingCount, setReplacementPendingCount] = useState<number>(0)
  const [dtrPendingCount, setDtrPendingCount] = useState<number>(0)
  const [dtrPaintingPendingCount, setDtrPaintingPendingCount] = useState<number>(0)
  const [materialPendingCount, setMaterialPendingCount] = useState<number>(0)
  const [safetyPendingCount, setSafetyPendingCount] = useState<number>(0)
  const [miscPendingCount, setMiscPendingCount] = useState<number>(0)
  const [icdsPendingCount, setIcdsPendingCount] = useState<number>(0)
  const [masterCount, setMasterCount] = useState<number>(0)
  const [loadingModules, setLoadingModules] = useState<Record<string, boolean>>({})

  // Helper to scan all local module caches and find the latest update date
  const refreshGlobalLatestDate = async () => {
    try {
      let maxTs = 0
      let maxDateStr = ""

      const scanList = (items: any[], dateKeys: string[]) => {
        if (!Array.isArray(items)) return
        for (const item of items) {
          for (const k of dateKeys) {
            const val = item[k]
            if (val && typeof val === "string") {
              const ts = parseTs(val)
              // Only consider valid timestamps (up to tomorrow in ms)
              if (ts > 0 && ts <= Date.now() + 86400000 && ts > maxTs) {
                maxTs = ts
                const d = new Date(ts)
                const pad = (n: number) => String(n).padStart(2, "0")
                maxDateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
              }
            }
          }
        }
      }

      const [consumers, recon, dd, icds, safety, misc, nsc, meterRep, dtr] = await Promise.all([
        getFromCache<any[]>("consumers_data_cache"),
        getFromCache<any[]>("reconnection_data_cache"),
        getFromCache<any[]>("dd_data_cache"),
        getFromCache<any[]>("icds_data_cache"),
        getFromCache<any[]>("safety_data_cache"),
        getFromCache<any[]>("misc_inspection_cache"),
        getFromCache<any[]>("nsc_data_cache"),
        getFromCache<any[]>("meter_replacement_data_cache"),
        getFromCache<any[]>("dtr_data_cache"),
      ])

      scanList(consumers, ["disconDate", "uploadDate", "lastUpdated"])
      scanList(recon, ["reconDate", "lastUpdated", "date"])
      scanList(dd, ["visitDate", "lastUpdated", "date"])
      scanList(icds, ["updatedAt", "inspectionDate", "completionDate", "lastUpdated"])
      scanList(safety, ["updatedAt", "rectifiedDate", "lastUpdated"])
      scanList(misc, ["updatedAt", "inspectionDate", "lastUpdated"])
      scanList(nsc, ["inspectionDate", "completedDate", "lastUpdated"])
      scanList(meterRep, ["updatedAt", "installationDate", "lastUpdated"])
      scanList(dtr, ["verificationDate", "lastUpdated"])

      if (maxDateStr) {
        setLatestUpdateDate(maxDateStr)
      }
    } catch (err) {
      console.error("Failed to compute latest global update date:", err)
    }
  }

  const modules = [
    {
      id: "disconnection",
      title: "Disconnection",
      description: "Manage disconnection lists & status",
      icon: Zap,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "hover:border-red-400 hover:shadow-red-500/10",
      allowed: ["all"],
      status: "live"
    },
    {
      id: "reconnection",
      title: "Reconnection",
      description: "Track and manage consumer reconnections",
      icon: RotateCcw,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "hover:border-blue-400 hover:shadow-blue-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "deemed",
      title: "Deemed Visit",
      description: "View deemed disconnected consumers",
      icon: UserX,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "hover:border-orange-400 hover:shadow-orange-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "dtr",
      title: "DTR Verification",
      description: "Verify transformer existence and record inspection parameters",
      icon: RadioTower,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "hover:border-amber-400 hover:shadow-amber-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "dtr-painting",
      title: "DTR Painting",
      description: "Update DTR structural painting logs and photo proof",
      icon: Brush,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "hover:border-orange-400 hover:shadow-orange-500/10",
      allowed: ["admin", "executive", "agency", "painter"],
      status: "live"
    },
    {
      id: "safety",
      title: "Safety Inspection",
      description: "Report site safety hazards, drawings, & PO approvals",
      icon: ShieldAlert,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "hover:border-amber-400 hover:shadow-amber-500/10",
      allowed: ["all"],
      status: "live"
    },
    {
      id: "misc-inspection",
      title: "Misc Inspections",
      description: "Log shifting, meter checks, network & custom site inspections",
      icon: ClipboardCheck,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "hover:border-blue-400 hover:shadow-blue-500/10",
      allowed: ["all"],
      status: "live"
    },
    {
      id: "icds",
      title: "ICDS Electrification",
      description: "Manage Anganwadi center wiring, smart meters & service certification (EDD/49)",
      icon: Building2,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "hover:border-emerald-400 hover:shadow-emerald-500/10",
      allowed: ["all"],
      status: "live"
    },
    {
      id: "meter",
      title: userRole === "agency" ? "Meter Installation" : "Meter Management",
      description: userRole === "agency" ? "Report installations & view pending" : "Stock tracking, issue & installation",
      icon: Gauge,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "hover:border-purple-400 hover:shadow-purple-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "nsc",
      title: userRole === "agency" ? "NSC Inspection" : "NSC Management",
      description: userRole === "agency" ? "Site inspections for new connections" : "New service connection applications",
      icon: ClipboardCheck,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "hover:border-green-400 hover:shadow-green-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "consumer-master",
      title: "Consumer Master",
      description: userRole === "admin" ? "Upload & search 45k consumer database" : "Search consumer details by ID or name",
      icon: Users,
      color: "text-teal-600",
      bgColor: "bg-teal-50",
      borderColor: "hover:border-teal-400 hover:shadow-teal-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "meter-replacement",
      title: "Replacement List",
      description: "Propose new meter replacements & track progress",
      icon: ClipboardCheck,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      borderColor: "hover:border-indigo-400 hover:shadow-indigo-500/10",
      allowed: ["admin", "executive"],
      status: "live"
    },
    {
      id: "material",
      title: "Material Management",
      description: "Track office store materials inward and issuance",
      icon: Package,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "hover:border-amber-400 hover:shadow-amber-500/10",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "osd",
      title: "Live OSD Check",
      description: "Live consumer details & OSD check from WBSEDCL",
      icon: FileCheck2,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "hover:border-emerald-400 hover:shadow-emerald-500/10",
      allowed: ["admin", "executive", "agency", "viewer", "technical"],
      status: "live"
    },
    {
      id: "gis-camera",
      title: "GIS Camera",
      description: "Geotagged field camera with map & instant watermark",
      icon: Camera,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "hover:border-blue-400 hover:shadow-blue-500/10",
      allowed: ["all"],
      status: "live"
    },
    {
      id: "admin",
      title: "Admin Panel",
      description: "Manage users and settings",
      icon: Settings,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
      borderColor: "hover:border-gray-400 hover:shadow-gray-500/10",
      allowed: ["admin"],
      status: "active"
    }
  ]

  // Helper calculator functions
  const upperAgencies = (userAgencies || []).map((a) => a.trim().toUpperCase()).filter(Boolean)

  const calcDisconnection = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    return data.filter((c) => {
      const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
      if (!isConnected) return false
      if (userRole === "admin" || userRole === "viewer") return true
      const consumerAgency = (c.agency || "").trim().toUpperCase()
      return upperAgencies.includes(consumerAgency)
    }).length
  }

  const calcDd = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    return data.filter((d) => {
      const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
      if (!isPending) return false
      if (userRole === "admin" || userRole === "viewer") return true
      const agency = (d.agency || "").trim().toUpperCase()
      return upperAgencies.includes(agency)
    }).length
  }

  const calcReconnection = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    const now = Date.now()
    return data.filter((r: any) => {
      let effectiveStatus = r.status
      if (r.status === "door_locked") {
        const updatedTime = parseTs(r.updatedAt || r.createdAt || "")
        const hrsLocked = Math.floor((now - updatedTime) / (1000 * 60 * 60))
        if (hrsLocked >= 72) effectiveStatus = "pending"
      }
      if (effectiveStatus !== "pending") return false
      if (userRole === "admin" || userRole === "viewer" || userRole === "executive") return true
      return upperAgencies.includes((r.agency || "").trim().toUpperCase())
    }).length
  }

  const calcMeter = (meterData: any) => {
    if (!meterData) return 0
    const isAgency = userRole === "agency"
    const meterIssues: any[] = isAgency ? (Array.isArray(meterData) ? meterData : []) : (meterData.issues || [])
    return meterIssues.filter((i: any) => {
      if (isAgency) {
        if (i.status !== "issued") return false
        return upperAgencies.includes((i.agency || "").trim().toUpperCase())
      } else {
        return i.status === "installation_done"
      }
    }).length
  }

  const calcReplacement = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    return data.filter((r: any) => {
      if ((r.status || "").toLowerCase() !== "proposed") return false
      if ((r.purpose || "") === "slow_fast") return false
      if (userRole === "admin" || userRole === "executive") return true
      return upperAgencies.includes((r.agency || "").trim().toUpperCase())
    }).length
  }

  const calcNsc = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    return data.filter((a: any) => {
      if (userRole === "agency") {
        return a.status === "pending" && upperAgencies.includes((a.agency || "").trim().toUpperCase())
      }
      return a.status === "inspected"
    }).length
  }

  const calcDtr = (data: any[]) => {
    if (!Array.isArray(data)) return { dtrCount: 0, paintingCount: 0 }
    const dtrCount = data.filter((r) => (r.status || "").toUpperCase() !== "EXIST").length
    const paintingCount = data.filter((r) => {
      const isAssigned =
        userRole === "admin" ||
        userRole === "viewer" ||
        userRole === "executive" ||
        (r.paintingAgency && upperAgencies.includes(r.paintingAgency.trim().toUpperCase()))
      return isAssigned && (r.painting || "").toLowerCase() !== "done"
    }).length
    return { dtrCount, paintingCount }
  }

  const calcSafety = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    const isAgency = userRole === "agency"
    return data.filter((t) => {
      if (isAgency) {
        return t.physicalStatus === "pending" && upperAgencies.includes((t.agency || "").trim().toUpperCase())
      }
      return (
        t.physicalStatus === "pending" ||
        (t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required")
      )
    }).length
  }

  const calcMisc = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    return data.filter((r) => {
      if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive" && r.agency) {
        if (!upperAgencies.includes((r.agency || "").trim().toUpperCase())) return false
      }
      return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
    }).length
  }

  const calcIcds = (data: any[]) => {
    if (!Array.isArray(data)) return 0
    const isAgency = userRole === "agency"
    return data.filter((r) => {
      if (isAgency && r.assignedAgency) {
        const recAgency = String(r.assignedAgency || "").trim()
        if (userAgencies.length > 0 && !userAgencies.some((ua) => matchesAgency(recAgency, ua))) {
          return false
        }
      }
      return r.stage !== "COMPLETED"
    }).length
  }

  const calcMaterial = (cached: any) => {
    if (!cached || !cached.stock) return 0
    const stock = cached.stock || []
    return stock.filter((s: any) => s.currentStock < (s.threshold || 0)).length
  }

  useEffect(() => {
    const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""

    // 1. Instant 0ms hydration from localStorage snapshot
    try {
      const snapRaw = localStorage.getItem(`${prefix}badge_counts_snapshot`)
      if (snapRaw) {
        const s = JSON.parse(snapRaw)
        if (s.pendingCount !== undefined) setPendingCount(s.pendingCount)
        if (s.ddPendingCount !== undefined) setDdPendingCount(s.ddPendingCount)
        if (s.reconnectionPendingCount !== undefined) setReconnectionPendingCount(s.reconnectionPendingCount)
        if (s.meterPendingCount !== undefined) setMeterPendingCount(s.meterPendingCount)
        if (s.nscPendingCount !== undefined) setNscPendingCount(s.nscPendingCount)
        if (s.replacementPendingCount !== undefined) setReplacementPendingCount(s.replacementPendingCount)
        if (s.dtrPendingCount !== undefined) setDtrPendingCount(s.dtrPendingCount)
        if (s.dtrPaintingPendingCount !== undefined) setDtrPaintingPendingCount(s.dtrPaintingPendingCount)
        if (s.materialPendingCount !== undefined) setMaterialPendingCount(s.materialPendingCount)
        if (s.safetyPendingCount !== undefined) setSafetyPendingCount(s.safetyPendingCount)
        if (s.miscPendingCount !== undefined) setMiscPendingCount(s.miscPendingCount)
        if (s.icdsPendingCount !== undefined) setIcdsPendingCount(s.icdsPendingCount)
        if (s.masterCount !== undefined) setMasterCount(s.masterCount)
      }
    } catch {}

    async function loadPendingCount() {
      const isAgency = userRole === "agency"
      const meterCacheKey = isAgency ? "meter_issues_cache" : "meter_stock_cache"

      // 2. Read ALL local IndexedDB caches in parallel immediately
      let consumers: any[] | null = null
      let dd: any[] | null = null
      let recon: any[] | null = null
      let meterCached: any = null
      let mrCached: any[] | null = null
      let nscCached: any[] | null = null
      let dtrCached: any[] | null = null
      let safetyCached: any[] | null = null
      let miscCached: any[] | null = null
      let icdsCached: any[] | null = null
      let materialCached: any = null

      try {
        const results = await Promise.all([
          hasReadPermission("disconnection") ? getFromCache<ConsumerData[]>("consumers_data_cache") : Promise.resolve(null),
          hasReadPermission("deemed") ? getFromCache<DeemedVisitData[]>("dd_data_cache") : Promise.resolve(null),
          hasReadPermission("reconnection") ? getFromCache<any[]>("reconnection_data_cache") : Promise.resolve(null),
          hasReadPermission("meter") ? getFromCache<any>(meterCacheKey) : Promise.resolve(null),
          hasReadPermission("meter_replacement") ? getFromCache<any[]>("meter_replacement_data_cache") : Promise.resolve(null),
          hasReadPermission("nsc") ? getFromCache<any[]>("nsc_data_cache") : Promise.resolve(null),
          hasReadPermission("dtr") || hasReadPermission("dtr_painting") ? getFromCache<any[]>("dtr_data_cache") : Promise.resolve(null),
          hasReadPermission("safety") ? getFromCache<any[]>("safety_data_cache") : Promise.resolve(null),
          hasReadPermission("misc_inspection") ? getFromCache<any[]>("misc_inspection_cache") : Promise.resolve(null),
          hasReadPermission("icds") ? getFromCache<any[]>("icds_data_cache") : Promise.resolve(null),
          hasReadPermission("material") ? getFromCache<any>("material_stock_cache") : Promise.resolve(null),
        ])

        consumers = results[0]
        dd = results[1]
        recon = results[2]
        meterCached = results[3]
        mrCached = results[4]
        nscCached = results[5]
        dtrCached = results[6]
        safetyCached = results[7]
        miscCached = results[8]
        icdsCached = results[9]
        materialCached = results[10]
      } catch (e) {
        console.error("Parallel IndexedDB badge load failed", e)
      }

      // Synchronously compute and update all cached badges (0ms)
      const currentCounts: Record<string, number> = {}

      if (consumers && Array.isArray(consumers)) {
        const count = calcDisconnection(consumers)
        setPendingCount(count)
        currentCounts.pendingCount = count
      }
      if (dd && Array.isArray(dd)) {
        const count = calcDd(dd)
        setDdPendingCount(count)
        currentCounts.ddPendingCount = count
      }
      if (recon && Array.isArray(recon)) {
        const count = calcReconnection(recon)
        setReconnectionPendingCount(count)
        currentCounts.reconnectionPendingCount = count
      }
      if (meterCached) {
        const count = calcMeter(meterCached)
        setMeterPendingCount(count)
        currentCounts.meterPendingCount = count
      }
      if (mrCached && Array.isArray(mrCached)) {
        const count = calcReplacement(mrCached)
        setReplacementPendingCount(count)
        currentCounts.replacementPendingCount = count
      }
      if (nscCached && Array.isArray(nscCached)) {
        const count = calcNsc(nscCached)
        setNscPendingCount(count)
        currentCounts.nscPendingCount = count
      }
      if (dtrCached && Array.isArray(dtrCached)) {
        const { dtrCount, paintingCount } = calcDtr(dtrCached)
        setDtrPendingCount(dtrCount)
        setDtrPaintingPendingCount(paintingCount)
        currentCounts.dtrPendingCount = dtrCount
        currentCounts.dtrPaintingPendingCount = paintingCount
      }
      if (safetyCached && Array.isArray(safetyCached)) {
        const count = calcSafety(safetyCached)
        setSafetyPendingCount(count)
        currentCounts.safetyPendingCount = count
      }
      if (miscCached && Array.isArray(miscCached)) {
        const count = calcMisc(miscCached)
        setMiscPendingCount(count)
        currentCounts.miscPendingCount = count
      }
      if (icdsCached && Array.isArray(icdsCached)) {
        const count = calcIcds(icdsCached)
        setIcdsPendingCount(count)
        currentCounts.icdsPendingCount = count
      }
      if (materialCached) {
        const count = calcMaterial(materialCached)
        setMaterialPendingCount(count)
        currentCounts.materialPendingCount = count
      }

      // Save initial snapshot
      try {
        localStorage.setItem(`${prefix}badge_counts_snapshot`, JSON.stringify(currentCounts))
      } catch {}

      // 3. Parallel non-blocking background fetch for empty caches
      const bgTasks: Promise<void>[] = []

      if (hasReadPermission("disconnection") && (!consumers || consumers.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, disconnection: true }))
              const res = await fetch("/api/consumers/base")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("consumers_data_cache", fresh)
                  setPendingCount(calcDisconnection(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch disconnection failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, disconnection: false }))
            }
          })()
        )
      }

      if (hasReadPermission("deemed") && (!dd || dd.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, deemed: true }))
              const res = await fetch("/api/dd/base")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("dd_data_cache", fresh)
                  setDdPendingCount(calcDd(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch DD failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, deemed: false }))
            }
          })()
        )
      }

      if (hasReadPermission("reconnection") && (!recon || recon.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, reconnection: true }))
              const res = await fetch("/api/reconnection")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("reconnection_data_cache", fresh)
                  setReconnectionPendingCount(calcReconnection(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch reconnection failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, reconnection: false }))
            }
          })()
        )
      }

      if (hasReadPermission("meter") && (!meterCached || (isAgency && meterCached.length === 0) || (!isAgency && !meterCached.issues))) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, meter: true }))
              const url = isAgency ? "/api/meters/issue" : "/api/meters/stock"
              const res = await fetch(url)
              if (res.ok) {
                const fresh = await res.json()
                if (fresh) {
                  const saved = isAgency
                    ? [...fresh].reverse()
                    : { summary: fresh.summary || [], stock: fresh.stock || [], issues: [...(fresh.issues || [])].reverse() }
                  await saveToCache(meterCacheKey, saved)
                  setMeterPendingCount(calcMeter(saved))
                }
              }
            } catch (err) {
              console.error("Auto-fetch meter failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, meter: false }))
            }
          })()
        )
      }

      if (hasReadPermission("meter_replacement") && (!mrCached || mrCached.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, "meter-replacement": true }))
              const res = await fetch("/api/meters/replacement")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("meter_replacement_data_cache", fresh)
                  setReplacementPendingCount(calcReplacement(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch meter replacement failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, "meter-replacement": false }))
            }
          })()
        )
      }

      if (hasReadPermission("nsc") && (!nscCached || nscCached.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, nsc: true }))
              const res = await fetch("/api/nsc")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("nsc_data_cache", fresh)
                  setNscPendingCount(calcNsc(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch NSC failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, nsc: false }))
            }
          })()
        )
      }

      if ((hasReadPermission("dtr") || hasReadPermission("dtr_painting")) && (!dtrCached || dtrCached.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, dtr: true, "dtr-painting": true }))
              const res = await fetch("/api/dtr")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("dtr_data_cache", fresh)
                  const { dtrCount, paintingCount } = calcDtr(fresh)
                  setDtrPendingCount(dtrCount)
                  setDtrPaintingPendingCount(paintingCount)
                }
              }
            } catch (err) {
              console.error("Auto-fetch DTR failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, dtr: false, "dtr-painting": false }))
            }
          })()
        )
      }

      if (hasReadPermission("safety") && (!safetyCached || safetyCached.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, safety: true }))
              const res = await fetch("/api/safety/base")
              if (res.ok) {
                const fresh = await res.json()
                const items = Array.isArray(fresh) ? fresh : fresh.patchData || []
                if (Array.isArray(items)) {
                  await saveToCache("safety_data_cache", items)
                  setSafetyPendingCount(calcSafety(items))
                }
              }
            } catch (err) {
              console.error("Auto-fetch safety failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, safety: false }))
            }
          })()
        )
      }

      if (hasReadPermission("misc_inspection") && (!miscCached || miscCached.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, "misc-inspection": true }))
              const res = await fetch("/api/misc-inspection")
              if (res.ok) {
                const fresh = await res.json()
                const items = Array.isArray(fresh) ? fresh : fresh.patchData || []
                if (Array.isArray(items)) {
                  await saveToCache("misc_inspection_cache", items)
                  setMiscPendingCount(calcMisc(items))
                }
              }
            } catch (err) {
              console.error("Auto-fetch misc inspection failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, "misc-inspection": false }))
            }
          })()
        )
      }

      if (hasReadPermission("icds") && (!icdsCached || icdsCached.length === 0)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, icds: true }))
              const res = await fetch("/api/icds")
              if (res.ok) {
                const fresh = await res.json()
                if (Array.isArray(fresh)) {
                  await saveToCache("icds_data_cache", fresh)
                  setIcdsPendingCount(calcIcds(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch ICDS failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, icds: false }))
            }
          })()
        )
      }

      if (hasReadPermission("material") && (!materialCached || !materialCached.stock)) {
        bgTasks.push(
          (async () => {
            try {
              setLoadingModules((prev) => ({ ...prev, material: true }))
              const res = await fetch("/api/material")
              if (res.ok) {
                const fresh = await res.json()
                if (fresh && fresh.stock) {
                  await saveToCache("material_stock_cache", fresh)
                  setMaterialPendingCount(calcMaterial(fresh))
                }
              }
            } catch (err) {
              console.error("Auto-fetch material failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, material: false }))
            }
          })()
        )
      }

      if (hasReadPermission("consumer_master")) {
        bgTasks.push(
          (async () => {
            try {
              const cachedMaster = localStorage.getItem(`${prefix}consumer_master_row_count`)
              if (cachedMaster) {
                setMasterCount(parseInt(cachedMaster, 10))
              } else {
                setLoadingModules((prev) => ({ ...prev, "consumer-master": true }))
              }
              const res = await fetch("/api/system/row-count?type=master")
              if (res.ok) {
                const data = await res.json()
                setMasterCount(data.count)
                localStorage.setItem(`${prefix}consumer_master_row_count`, String(data.count))
              }
            } catch (err) {
              console.error("Auto-fetch master count failed", err)
            } finally {
              setLoadingModules((prev) => ({ ...prev, "consumer-master": false }))
            }
          })()
        )
      }

      // Execute all background refreshes in parallel without blocking
      Promise.allSettled(bgTasks)

      // Listener for module-specific badge cache updates
      const handleCacheUpdate = async (e: Event) => {
        const key = (e as CustomEvent).detail?.key
        if (!key) return

        if (key === "icds_data_cache") {
          const cached = await getFromCache<any[]>("icds_data_cache")
          if (cached && Array.isArray(cached)) setIcdsPendingCount(calcIcds(cached))
        } else if (key === "safety_data_cache") {
          const cached = await getFromCache<any[]>("safety_data_cache")
          if (cached && Array.isArray(cached)) setSafetyPendingCount(calcSafety(cached))
        } else if (key === "misc_inspection_cache") {
          const cached = await getFromCache<any[]>("misc_inspection_cache")
          if (cached && Array.isArray(cached)) setMiscPendingCount(calcMisc(cached))
        } else if (key === "consumers_data_cache") {
          const cached = await getFromCache<ConsumerData[]>("consumers_data_cache")
          if (cached && Array.isArray(cached)) setPendingCount(calcDisconnection(cached))
        } else if (key === "dd_data_cache") {
          const cached = await getFromCache<DeemedVisitData[]>("dd_data_cache")
          if (cached && Array.isArray(cached)) setDdPendingCount(calcDd(cached))
        } else if (key === "reconnection_data_cache") {
          const cached = await getFromCache<any[]>("reconnection_data_cache")
          if (cached && Array.isArray(cached)) setReconnectionPendingCount(calcReconnection(cached))
        } else if (key === "meter_replacement_data_cache") {
          const mr = await getFromCache<any[]>("meter_replacement_data_cache")
          if (mr && Array.isArray(mr)) setReplacementPendingCount(calcReplacement(mr))
        } else if (key === "meter_stock_cache" || key === "meter_issues_cache") {
          const m = await getFromCache<any>(meterCacheKey)
          if (m) setMeterPendingCount(calcMeter(m))
        } else if (key === "dtr_data_cache") {
          const d = await getFromCache<any[]>("dtr_data_cache")
          if (d && Array.isArray(d)) {
            const { dtrCount, paintingCount } = calcDtr(d)
            setDtrPendingCount(dtrCount)
            setDtrPaintingPendingCount(paintingCount)
          }
        }
        await refreshGlobalLatestDate()
      }

      await refreshGlobalLatestDate()

      window.addEventListener("badge_cache_updated", handleCacheUpdate)
      return () => {
        window.removeEventListener("badge_cache_updated", handleCacheUpdate)
      }
    }

    loadPendingCount()
  }, [userRole, JSON.stringify(userAgencies), Boolean(permissions)])

  const totalPendingActionCount = pendingCount + reconnectionPendingCount + ddPendingCount + safetyPendingCount + dtrPendingCount + replacementPendingCount + icdsPendingCount


  // Configurable thresholds for dynamic severity and attention surface
  const ATTENTION_THRESHOLD = 500
  const WARNING_THRESHOLD = 50

  const accessibleModulesWithCounts = modules
    .filter((module) => {
      const permKey = module.id.replace(/-/g, "_")
      return (
        userRole === "admin" ||
        userRole === "superuser" ||
        module.id === "home" ||
        (permissions &&
          ((permissions[module.id] && permissions[module.id].length > 0) ||
            (permissions[permKey] && permissions[permKey].length > 0) ||
            permissions[module.id]?.includes("read") ||
            permissions[permKey]?.includes("read") ||
            (module.id === "material" && permissions[module.id]?.length > 0) ||
            (module.id === "dtr-painting" &&
              (permissions["dtr"]?.includes("read") || permissions["dtr"]?.includes("update")))))
      )
    })
    .map((module) => {
      let count = 0
      if (module.id === "safety") count = safetyPendingCount
      else if (module.id === "misc-inspection") count = miscPendingCount
      else if (module.id === "icds") count = icdsPendingCount
      else if (module.id === "disconnection") count = pendingCount
      else if (module.id === "deemed") count = ddPendingCount
      else if (module.id === "reconnection") count = reconnectionPendingCount
      else if (module.id === "nsc") count = nscPendingCount
      else if (module.id === "meter") count = meterPendingCount
      else if (module.id === "meter-replacement") count = replacementPendingCount
      else if (module.id === "material") count = materialPendingCount
      else if (module.id === "dtr") count = dtrPendingCount
      else if (module.id === "dtr-painting") count = dtrPaintingPendingCount
      else if (module.id === "consumer-master") count = masterCount

      const isLoading = Boolean(loadingModules[module.id])
      return { ...module, count, isLoading }
    })

  // Surface any action module exceeding attention threshold (excluding static master DB count)
  const attentionModules = accessibleModulesWithCounts.filter(
    (m) => m.id !== "consumer-master" && m.id !== "admin" && m.id !== "osd" && m.count >= ATTENTION_THRESHOLD
  )

  // Main 2-column grid contains other modules
  const gridModules = accessibleModulesWithCounts.filter(
    (m) => !attentionModules.some((att) => att.id === m.id)
  )

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE TESTING VIEW (< md: screen sizes) */}
      {/* ========================================================================= */}
      <div className="block md:hidden relative p-2 sm:p-4 max-w-xl mx-auto flex flex-col justify-between min-h-[calc(100vh-100px)]">
        <div className="flex-grow space-y-4">
          {/* Global Fast IndexedDB Consumer Search */}
          <GlobalConsumerSearch
            onSelectModule={onSelect}
            userRole={userRole}
            permissions={permissions}
          />

          {/* SECTION 1: Needs attention (Full-width dynamic card) */}
          {attentionModules.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 mb-2">Needs attention</h2>
              <div className="space-y-3">
                {attentionModules.map((module) => {
                  const Icon = module.icon
                  return (
                    <div
                      key={module.id}
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        onSelect(module.id as ViewType)
                      }}
                      className="rounded-2xl border border-red-500/20 hover:border-red-500/35 bg-gradient-to-b from-white via-red-50/20 to-red-50/40 p-3.5 flex items-center justify-between shadow-[0_4px_14px_rgba(239,68,68,0.08),0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_22px_rgba(239,68,68,0.14)] cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-[10px] bg-red-50 border border-red-200/80 flex items-center justify-center text-red-600 shrink-0 shadow-xs">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-900 leading-tight">
                            {module.title}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {module.description}
                          </p>
                        </div>
                      </div>
                      <div className="px-3 py-1 rounded-full bg-red-100/90 text-red-800 border border-red-200/80 text-xs font-bold shrink-0 ml-2 shadow-xs">
                        {module.isLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : module.count.toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* SECTION 2: Modules (2-Column Grid for Mobile) */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <h2 className="text-xs font-semibold text-slate-500">Modules</h2>
              {latestUpdateDate && (
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  Last Updated: <span className="font-semibold text-slate-600">{latestUpdateDate}</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {gridModules.map((module) => {
                const Icon = module.icon
                const isWarning = module.count >= WARNING_THRESHOLD && module.count < ATTENTION_THRESHOLD
                const isDanger = module.count >= ATTENTION_THRESHOLD

                const pillStyleClass = isDanger
                  ? "bg-red-100/90 text-red-800 border-red-200/80 shadow-xs"
                  : isWarning
                    ? "bg-amber-100/90 text-amber-900 border-amber-200/80 shadow-xs"
                    : "bg-slate-100/90 text-slate-700 border-slate-200/80 shadow-xs"

                return (
                  <div
                    key={module.id}
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                      onSelect(module.id as ViewType)
                    }}
                    className="group relative cursor-pointer transition-all duration-200 hover:-translate-y-0.5 rounded-2xl bg-gradient-to-b from-white via-white to-slate-50/80 border border-black/[0.08] hover:border-black/[0.20] shadow-[0_4px_12px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.09)] p-3.5 flex flex-col justify-between min-h-[96px] select-none"
                  >
                    {/* Top Row: Icon (Top-Left) + Shadowed Pill Count Badge (Top-Right) */}
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-10 h-10 rounded-[10px] ${module.bgColor} border border-black/[0.04] flex items-center justify-center ${module.color} shrink-0 shadow-2xs`}>
                        <Icon className="h-5 w-5" />
                      </div>

                      {module.id !== "osd" && module.id !== "admin" && module.id !== "gis-camera" && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center justify-center min-w-[1.5rem] ${pillStyleClass}`}>
                          {module.isLoading ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            module.id === "consumer-master" ? module.count.toLocaleString() : (module.count ?? 0)
                          )}
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Title Only */}
                    <h3 className="text-sm font-bold text-slate-900 leading-snug mt-2">
                      {module.title}
                    </h3>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DEFAULT COMMITTED DESKTOP VIEW (>= md: screen sizes - Unchanged) */}
      {/* ========================================================================= */}
      <div className="hidden md:flex relative p-4 md:p-6 max-w-7xl mx-auto flex-col justify-between min-h-[calc(100vh-100px)] overflow-hidden">
        {/* Ambient Background Mesh Blobs */}
        <div className="absolute top-10 left-1/4 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse" />
        <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-1/2 left-10 w-60 h-60 bg-purple-400/10 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="flex-grow">
          {/* Global Fast IndexedDB Consumer Search */}
          <div className="max-w-xl mx-auto mb-6">
            <GlobalConsumerSearch
              onSelectModule={onSelect}
              userRole={userRole}
              permissions={permissions}
            />
          </div>

          <div className="flex items-center justify-between mb-3.5 px-1">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modules</h2>
            {latestUpdateDate && (
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5 bg-white/70 backdrop-blur-sm px-2.5 py-1 rounded-full border border-slate-200/80 shadow-2xs">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Last Updated: <span className="font-bold text-slate-800">{latestUpdateDate}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {accessibleModulesWithCounts.map((module) => {
              const Icon = module.icon

              return (
                <Card
                  key={module.id}
                  className="group relative cursor-pointer transition-all duration-300 hover:-translate-y-1.5 border border-black/[0.08] hover:border-black/[0.22] bg-white/85 backdrop-blur-xl rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] overflow-hidden"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    onSelect(module.id as ViewType)
                  }}
                >
                  {/* Executive Dark Badge Counter */}
                  {module.id !== "osd" && module.id !== "admin" && module.id !== "gis-camera" && (
                    <div className={`absolute top-2.5 right-2.5 md:top-3.5 md:right-3.5 z-20 flex items-center justify-center text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-7 md:px-2.5 rounded-full shadow-md border-2 border-white transition-all duration-300 group-hover:scale-105 ${
                      module.isLoading ? "bg-slate-800 text-white animate-pulse" : "bg-slate-900 text-white shadow-slate-900/20"
                    }`}>
                      {module.isLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : module.id === "consumer-master" ? module.count.toLocaleString() : (module.count ?? 0)}
                    </div>
                  )}

                  {/* Faded Background Icon */}
                  <div className="absolute top-0 right-0 p-2 md:p-3 opacity-5 group-hover:opacity-15 transition-opacity duration-300">
                    <Icon className={`h-20 w-20 md:h-24 md:w-24 ${module.color} transition-transform duration-500 group-hover:scale-110`} />
                  </div>

                  <CardHeader className="relative pb-2 p-3.5 md:p-5">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${module.bgColor} flex items-center justify-center mb-2.5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm border border-slate-100`}>
                      <Icon className={`h-5 w-5 md:h-6 md:w-6 ${module.color}`} />
                    </div>
                    <CardTitle className="text-sm md:text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight">
                      {module.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative p-3.5 pt-0 md:p-5 md:pt-0">
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {module.description}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
