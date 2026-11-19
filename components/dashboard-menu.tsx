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
  Camera,
  PowerOff
} from "lucide-react"
import { GlobalConsumerSearch } from "@/components/global-consumer-search"
import { AdminSetupGuideBanner } from "@/components/admin-setup-guide"
import { ViewType } from "@/components/app-sidebar"
import { getFromCache, saveToCache, notifyCacheUpdate, getCccPrefix } from "@/lib/indexed-db"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import { parseTs } from "@/lib/date-utils"
import { matchesAgency } from "@/lib/permission-utils"
import { useModuleTheme, ModuleTheme } from "@/lib/module-theme"
import {
  MODULE_CATALOG,
  MODULE_CATEGORIES,
  canAccessModule,
  getRecentModules,
} from "@/lib/module-catalog"
import { Clock, AlertTriangle, Sparkles } from "lucide-react"

interface DashboardMenuProps {
  onSelect: (module: ViewType) => void
  userRole: string
  userAgencies?: string[]
  permissions?: Record<string, string[]>
}

export function DashboardMenu({ onSelect, userRole, userAgencies = [], permissions }: DashboardMenuProps) {
  const { theme } = useModuleTheme()
  const [recentModuleIds, setRecentModuleIds] = useState<ViewType[]>([])
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
  const [pdPendingCount, setPdPendingCount] = useState<number>(0)
  const [masterCount, setMasterCount] = useState<number>(0)
  const [loadingModules, setLoadingModules] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setRecentModuleIds(getRecentModules())
    const onRecentUpdate = () => setRecentModuleIds(getRecentModules())
    window.addEventListener("recent-modules-updated", onRecentUpdate)
    return () => window.removeEventListener("recent-modules-updated", onRecentUpdate)
  }, [])

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
      id: "permanent-disconnection",
      title: "Permanent Disconnection",
      description: "Track permanent meter dismantling, Live OSD, GPS & Note Sheets",
      icon: PowerOff,
      color: "text-rose-600",
      bgColor: "bg-rose-50",
      borderColor: "hover:border-rose-400 hover:shadow-rose-500/10",
      allowed: ["all"],
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
      title: "Consumer Details",
      description: "Live dues, payment receipts, meter readings & bills",
      icon: Zap,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "hover:border-blue-400 hover:shadow-blue-500/10",
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

  const hasReadPermission = (moduleName: string) => {
    if (userRole === "admin") return true
    if (!permissions) return false
    const key = moduleName.replace(/-/g, "_")
    const perms = permissions[key] || permissions[moduleName] || []
    return perms.includes("read")
  }

  useEffect(() => {
    async function loadPendingCount() {
      const upperAgencies = (userAgencies || []).map((a) => a.trim().toUpperCase()).filter(Boolean)
      const isAgency = userRole === "agency"

      // -------------------------------------------------------------------------
      // PHASE 1: Instant Local Cache Resolution (0ms)
      // Read all module caches concurrently from IndexedDB and set counts immediately.
      // -------------------------------------------------------------------------
      let cachedConsumers: any[] | null = null
      let cachedSafety: any[] | null = null
      let cachedMisc: any[] | null = null
      let cachedDd: any[] | null = null
      let cachedRc: any[] | null = null
      let cachedMeter: any = null
      let cachedNsc: any[] | null = null
      let cachedMr: any[] | null = null
      let cachedDtr: any[] | null = null
      let cachedMaterial: any = null

      try {
        const meterCacheKey = isAgency ? "meter_issues_cache" : "meter_stock_cache"
        const [
          cConsumers,
          cSafety,
          cMisc,
          cIcds,
          cPd,
          cDd,
          cRc,
          cMeter,
          cNsc,
          cMr,
          cDtr,
          cMaterial
        ] = await Promise.all([
          getFromCache<any[]>("consumers_data_cache"),
          getFromCache<any[]>("safety_data_cache"),
          getFromCache<any[]>("misc_inspection_cache"),
          getFromCache<any[]>("icds_data_cache"),
          getFromCache<any[]>("pd_data_cache"),
          getFromCache<any[]>("dd_data_cache"),
          getFromCache<any[]>("reconnection_data_cache"),
          getFromCache<any>(meterCacheKey),
          getFromCache<any[]>("nsc_data_cache"),
          getFromCache<any[]>("meter_replacement_data_cache"),
          getFromCache<any[]>("dtr_data_cache"),
          getFromCache<any>("material_stock_cache"),
        ])

        cachedConsumers = cConsumers
        cachedSafety = cSafety
        cachedMisc = cMisc
        cachedDd = cDd
        cachedRc = cRc
        cachedMeter = cMeter
        cachedNsc = cNsc
        cachedMr = cMr
        cachedDtr = cDtr
        cachedMaterial = cMaterial

        // 1. Permanent Disconnection
        if (cPd && Array.isArray(cPd)) {
          const count = cPd.filter((r) => {
            if (isAgency) {
              if (r.status !== "issued") return false
              const recAgency = String(r.agency || "").trim()
              if (userAgencies.length > 0 && !userAgencies.some((ua) => matchesAgency(recAgency, ua))) {
                return false
              }
              return true
            }
            return r.status === "proposed" || (r.status === "disconnected" && (!r.noteSheetNo || r.meterReturnStatus !== "returned"))
          }).length
          setPdPendingCount(count)
        }

        // 2. ICDS
        if (cIcds && Array.isArray(cIcds)) {
          const count = cIcds.filter((r) => {
            if (isAgency && r.assignedAgency) {
              const recAgency = String(r.assignedAgency || "").trim()
              if (userAgencies.length > 0 && !userAgencies.some((ua) => matchesAgency(recAgency, ua))) {
                return false
              }
            }
            return r.stage !== "COMPLETED"
          }).length
          setIcdsPendingCount(count)
        }

        // 3. Misc Inspection
        if (cMisc && Array.isArray(cMisc)) {
          const count = cMisc.filter(r => {
            if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive" && r.agency) {
              if (!upperAgencies.includes((r.agency || "").trim().toUpperCase())) return false
            }
            return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
          }).length
          setMiscPendingCount(count)
        }

        // 4. Safety Inspection
        if (cSafety && Array.isArray(cSafety)) {
          const count = cSafety.filter(t => {
            if (isAgency) {
              return t.physicalStatus === "pending" && upperAgencies.includes((t.agency || "").trim().toUpperCase())
            }
            return t.physicalStatus === "pending" || (t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required")
          }).length
          setSafetyPendingCount(count)
        }

        // 5. Disconnection
        if (cConsumers && Array.isArray(cConsumers)) {
          const count = cConsumers.filter(c => {
            const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
            if (!isConnected) return false
            if (userRole === "admin" || userRole === "viewer") return true
            return upperAgencies.includes((c.agency || "").trim().toUpperCase())
          }).length
          setPendingCount(count)
        }

        // 6. Deemed Visit
        if (cDd && Array.isArray(cDd)) {
          const ddCount = cDd.filter(d => {
            const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
            if (!isPending) return false
            if (userRole === "admin" || userRole === "viewer") return true
            return upperAgencies.includes((d.agency || "").trim().toUpperCase())
          }).length
          setDdPendingCount(ddCount)
        }

        // 7. Reconnection
        if (cRc && Array.isArray(cRc)) {
          const now = Date.now()
          const count = cRc.filter((r: any) => {
            let effectiveStatus = r.status
            if (r.status === "door_locked") {
              const updatedTime = parseTs(r.updatedAt || r.createdAt || "")
              const hrsLocked = Math.floor((now - updatedTime) / (1000 * 60 * 60))
              if (hrsLocked >= 72) {
                effectiveStatus = "pending"
              }
            }
            if (effectiveStatus !== "pending") return false
            if (userRole === "admin" || userRole === "viewer" || userRole === "executive") return true
            return upperAgencies.includes((r.agency || "").toUpperCase())
          }).length
          setReconnectionPendingCount(count)
        }

        // 8. Meter
        if (cMeter) {
          const meterIssues: any[] = isAgency ? (Array.isArray(cMeter) ? cMeter : []) : (cMeter.issues || [])
          const count = meterIssues.filter((i: any) => {
            if (isAgency) {
              if (i.status !== "issued") return false
              return upperAgencies.includes((i.agency || "").toUpperCase())
            } else {
              return i.status === "installation_done"
            }
          }).length
          setMeterPendingCount(count)
        }

        // 9. NSC
        if (cNsc && Array.isArray(cNsc)) {
          const count = cNsc.filter((a: any) => {
            if (userRole === "agency") {
              return a.status === "pending" && upperAgencies.includes((a.agency || "").toUpperCase())
            }
            return a.status === "inspected"
          }).length
          setNscPendingCount(count)
        }

        // 10. Meter Replacement
        if (cMr && Array.isArray(cMr)) {
          const count = cMr.filter((r: any) => {
            if ((r.status || "").toLowerCase() !== "proposed") return false
            if ((r.purpose || "") === "slow_fast") return false
            if (userRole === "admin" || userRole === "executive") return true
            return upperAgencies.includes((r.agency || "").toUpperCase())
          }).length
          setReplacementPendingCount(count)
        }

        // 11. DTR & Painting
        if (cDtr && Array.isArray(cDtr)) {
          const count = cDtr.filter(r => (r.status || "").toUpperCase() !== "EXIST").length
          setDtrPendingCount(count)

          const paintingPending = cDtr.filter(r => {
            const isAssigned = userRole === "admin" || userRole === "viewer" || userRole === "executive" || 
              (r.paintingAgency && upperAgencies.includes(r.paintingAgency.trim().toUpperCase()))
            return isAssigned && (r.painting || "").toLowerCase() !== "done"
          }).length
          setDtrPaintingPendingCount(paintingPending)
        }

        // 12. Material Stock
        if (cMaterial && cMaterial.stock) {
          const stock = cMaterial.stock || []
          const belowThresholdCount = stock.filter((s: any) => s.currentStock < (s.threshold || 0)).length
          setMaterialPendingCount(belowThresholdCount)
        }

        // 13. Consumer Master from localStorage
        const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
        const cachedMaster = localStorage.getItem(`${prefix}consumer_master_row_count`)
        if (cachedMaster) {
          setMasterCount(parseInt(cachedMaster, 10))
        }
      } catch (e) {
        console.error("Instant cache read error:", e)
      }

      // -------------------------------------------------------------------------
      // PHASE 2: Parallel Independent Network Tasks for Any Missing Caches
      // Every task runs concurrently without blocking other cards.
      // -------------------------------------------------------------------------
      const networkTasks: Promise<void>[] = []

      // Task: Misc Inspection
      if ((!cachedMisc || cachedMisc.length === 0) && hasReadPermission("misc_inspection")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, "misc-inspection": true }))
            const res = await fetch("/api/misc-inspection")
            if (res.ok) {
              const freshData = await res.json()
              const items = Array.isArray(freshData) ? freshData : (freshData.patchData || [])
              if (items && Array.isArray(items)) {
                await saveToCache("misc_inspection_cache", items)
                notifyCacheUpdate("misc_inspection_cache")
                const count = items.filter(r => {
                  if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive" && r.agency) {
                    if (!upperAgencies.includes((r.agency || "").trim().toUpperCase())) return false
                  }
                  return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
                }).length
                setMiscPendingCount(count)
              }
            }
          } catch (err) {
            console.error("Fetch misc inspection failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, "misc-inspection": false }))
          }
        })())
      }

      // Task: Safety Inspection
      if ((!cachedSafety || cachedSafety.length === 0) && hasReadPermission("safety")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, safety: true }))
            const res = await fetch("/api/safety/base")
            if (res.ok) {
              const freshData = await res.json()
              const items = Array.isArray(freshData) ? freshData : (freshData.patchData || [])
              if (items && Array.isArray(items)) {
                await saveToCache("safety_data_cache", items)
                notifyCacheUpdate("safety_data_cache")
                const count = items.filter(t => {
                  if (isAgency) {
                    return t.physicalStatus === "pending" && upperAgencies.includes((t.agency || "").trim().toUpperCase())
                  }
                  return t.physicalStatus === "pending" || (t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required")
                }).length
                setSafetyPendingCount(count)
              }
            }
          } catch (err) {
            console.error("Fetch safety inspection failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, safety: false }))
          }
        })())
      }

      // Task: Disconnection
      if ((!cachedConsumers || cachedConsumers.length === 0) && hasReadPermission("disconnection")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, disconnection: true }))
            const res = await fetch("/api/consumers/base")
            if (res.ok) {
              const data = await res.json()
              if (data && Array.isArray(data)) {
                await saveToCache("consumers_data_cache", data)
                const count = data.filter(c => {
                  const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
                  if (!isConnected) return false
                  if (userRole === "admin" || userRole === "viewer") return true
                  return upperAgencies.includes((c.agency || "").trim().toUpperCase())
                }).length
                setPendingCount(count)
              }
            }
          } catch (err) {
            console.error("Fetch disconnection failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, disconnection: false }))
          }
        })())
      }

      // Task: Deemed Visit
      if ((!cachedDd || cachedDd.length === 0) && hasReadPermission("deemed")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, deemed: true }))
            const res = await fetch("/api/dd/base")
            if (res.ok) {
              const ddData = await res.json()
              if (ddData && Array.isArray(ddData)) {
                await saveToCache("dd_data_cache", ddData)
                const ddCount = ddData.filter(d => {
                  const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
                  if (!isPending) return false
                  if (userRole === "admin" || userRole === "viewer") return true
                  return upperAgencies.includes((d.agency || "").trim().toUpperCase())
                }).length
                setDdPendingCount(ddCount)
              }
            }
          } catch (err) {
            console.error("Fetch deemed failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, deemed: false }))
          }
        })())
      }

      // Task: Reconnection
      if ((!cachedRc || cachedRc.length === 0) && hasReadPermission("reconnection")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, reconnection: true }))
            const res = await fetch("/api/reconnection")
            if (res.ok) {
              const freshData = await res.json()
              if (freshData && Array.isArray(freshData)) {
                await saveToCache("reconnection_data_cache", freshData)
                const now = Date.now()
                const count = freshData.filter((r: any) => {
                  let effectiveStatus = r.status
                  if (r.status === "door_locked") {
                    const updatedTime = parseTs(r.updatedAt || r.createdAt || "")
                    const hrsLocked = Math.floor((now - updatedTime) / (1000 * 60 * 60))
                    if (hrsLocked >= 72) {
                      effectiveStatus = "pending"
                    }
                  }
                  if (effectiveStatus !== "pending") return false
                  if (userRole === "admin" || userRole === "viewer" || userRole === "executive") return true
                  return upperAgencies.includes((r.agency || "").toUpperCase())
                }).length
                setReconnectionPendingCount(count)
              }
            }
          } catch (err) {
            console.error("Fetch reconnection failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, reconnection: false }))
          }
        })())
      }

      // Task: Meter
      const meterNeedsFetch = !cachedMeter || (isAgency && cachedMeter.length === 0) || (!isAgency && (!cachedMeter.issues || cachedMeter.issues.length === 0))
      if (meterNeedsFetch && hasReadPermission("meter")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, meter: true }))
            const url = isAgency ? "/api/meters/issue" : "/api/meters/stock"
            const res = await fetch(url)
            if (res.ok) {
              const freshData = await res.json()
              if (freshData) {
                let savedMeter: any
                if (isAgency) {
                  savedMeter = [...freshData].reverse()
                } else {
                  const sorted = [...(freshData.issues || [])].reverse()
                  savedMeter = { summary: freshData.summary || [], stock: freshData.stock || [], issues: sorted }
                }
                const cacheKey = isAgency ? "meter_issues_cache" : "meter_stock_cache"
                await saveToCache(cacheKey, savedMeter)
                const meterIssues: any[] = isAgency ? savedMeter : (savedMeter.issues || [])
                const count = meterIssues.filter((i: any) => {
                  if (isAgency) {
                    if (i.status !== "issued") return false
                    return upperAgencies.includes((i.agency || "").toUpperCase())
                  } else {
                    return i.status === "installation_done"
                  }
                }).length
                setMeterPendingCount(count)
              }
            }
          } catch (err) {
            console.error("Fetch meters failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, meter: false }))
          }
        })())
      }

      // Task: NSC
      const nscNeedsFetch = !cachedNsc || cachedNsc.length === 0 || !cachedNsc.some((a: any) => {
        const s = (a.status || "").toLowerCase()
        return s === "pending" || s === "inspected"
      })
      if (nscNeedsFetch && hasReadPermission("nsc")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, nsc: true }))
            const res = await fetch("/api/nsc")
            if (res.ok) {
              const freshData = await res.json()
              if (freshData && Array.isArray(freshData)) {
                await saveToCache("nsc_data_cache", freshData)
                const nscCount = freshData.filter((a: any) => {
                  if (userRole === "agency") {
                    return a.status === "pending" && upperAgencies.includes((a.agency || "").toUpperCase())
                  }
                  return a.status === "inspected"
                }).length
                setNscPendingCount(nscCount)
              }
            }
          } catch (err) {
            console.error("Fetch NSC failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, nsc: false }))
          }
        })())
      }

      // Task: Meter Replacement
      if ((!cachedMr || cachedMr.length === 0) && hasReadPermission("meter_replacement")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, "meter-replacement": true }))
            const res = await fetch("/api/meters/replacement")
            if (res.ok) {
              const freshData = await res.json()
              if (freshData && Array.isArray(freshData)) {
                await saveToCache("meter_replacement_data_cache", freshData)
                const count = freshData.filter((r: any) => {
                  if ((r.status || "").toLowerCase() !== "proposed") return false
                  if ((r.purpose || "") === "slow_fast") return false
                  if (userRole === "admin" || userRole === "executive") return true
                  return upperAgencies.includes((r.agency || "").toUpperCase())
                }).length
                setReplacementPendingCount(count)
              }
            }
          } catch (err) {
            console.error("Fetch meter replacement failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, "meter-replacement": false }))
          }
        })())
      }

      // Task: DTR & Painting
      if ((!cachedDtr || cachedDtr.length === 0) && (hasReadPermission("dtr") || hasReadPermission("dtr_painting"))) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, dtr: true, "dtr-painting": true }))
            const res = await fetch("/api/dtr")
            if (res.ok) {
              const freshData = await res.json()
              if (freshData && Array.isArray(freshData)) {
                await saveToCache("dtr_data_cache", freshData)
                const count = freshData.filter(r => (r.status || "").toUpperCase() !== "EXIST").length
                setDtrPendingCount(count)
                const paintingPending = freshData.filter(r => {
                  const isAssigned = userRole === "admin" || userRole === "viewer" || userRole === "executive" || 
                    (r.paintingAgency && upperAgencies.includes(r.paintingAgency.trim().toUpperCase()))
                  return isAssigned && (r.painting || "").toLowerCase() !== "done"
                }).length
                setDtrPaintingPendingCount(paintingPending)
              }
            }
          } catch (err) {
            console.error("Fetch DTR failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, dtr: false, "dtr-painting": false }))
          }
        })())
      }

      // Task: Material Stock
      if ((!cachedMaterial || !cachedMaterial.stock) && hasReadPermission("material")) {
        networkTasks.push((async () => {
          try {
            setLoadingModules(prev => ({ ...prev, material: true }))
            const res = await fetch("/api/material")
            if (res.ok) {
              const freshData = await res.json()
              if (freshData && freshData.stock) {
                await saveToCache("material_stock_cache", freshData)
                const stock = freshData.stock || []
                const belowThresholdCount = stock.filter((s: any) => s.currentStock < (s.threshold || 0)).length
                setMaterialPendingCount(belowThresholdCount)
              }
            }
          } catch (err) {
            console.error("Fetch material failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, material: false }))
          }
        })())
      }

      // Task: Consumer Master Row Count
      if (hasReadPermission("consumer_master")) {
        networkTasks.push((async () => {
          try {
            const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
            const cachedMaster = localStorage.getItem(`${prefix}consumer_master_row_count`)
            if (!cachedMaster) {
              setLoadingModules(prev => ({ ...prev, "consumer-master": true }))
            }
            const res = await fetch("/api/system/row-count?type=master")
            if (res.ok) {
              const data = await res.json()
              setMasterCount(data.count)
              localStorage.setItem(`${prefix}consumer_master_row_count`, String(data.count))
            }
          } catch (err) {
            console.error("Fetch master count failed", err)
          } finally {
            setLoadingModules(prev => ({ ...prev, "consumer-master": false }))
          }
        })())
      }

      // Run all network tasks concurrently in the background without blocking the UI
      Promise.allSettled(networkTasks).then(() => {
        refreshGlobalLatestDate()
      })

      // Listener for module-specific badge cache updates
      const handleCacheUpdate = async (e: Event) => {
        const key = (e as CustomEvent).detail?.key
        if (!key) return
        const upperAgencies = (userAgencies || []).map(a => a.trim().toUpperCase())

        if (key === "icds_data_cache") {
          const cached = await getFromCache<any[]>("icds_data_cache")
          if (cached && Array.isArray(cached)) {
            const isAgency = userRole === "agency"
            const count = cached.filter(r => {
              if (isAgency && r.assignedAgency) {
                if (!upperAgencies.includes((r.assignedAgency || "").trim().toUpperCase())) return false
              }
              return r.stage === "PENDING_INSPECTION" || r.stage === "INSPECTED" || r.stage === "APPLICATION_PENDING" || r.stage === "WO_ISSUED"
            }).length
            setIcdsPendingCount(count)
          }
        } else if (key === "safety_data_cache") {
          const cached = await getFromCache<any[]>("safety_data_cache")
          if (cached && Array.isArray(cached)) {
            const isAgency = userRole === "agency"
            const count = cached.filter(t => {
              if (isAgency) {
                return t.physicalStatus === "pending" && upperAgencies.includes((t.agency || "").trim().toUpperCase())
              }
              return t.physicalStatus === "pending" || (t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required")
            }).length
            setSafetyPendingCount(count)
          }
        } else if (key === "misc_inspection_cache") {
          const cached = await getFromCache<any[]>("misc_inspection_cache")
          if (cached && Array.isArray(cached)) {
            const count = cached.filter(r => {
              if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive" && r.agency) {
                if (!upperAgencies.includes((r.agency || "").trim().toUpperCase())) return false
              }
              return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
            }).length
            setMiscPendingCount(count)
          }
        } else if (key === "consumers_data_cache") {
          const data = await getFromCache<ConsumerData[]>("consumers_data_cache")
          if (data && Array.isArray(data)) {
            const upper = (userAgencies || []).map(a => a.toUpperCase())
            const count = data.filter(c => {
              const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
              if (!isConnected) return false
              if (userRole === "admin" || userRole === "viewer") return true
              return upper.includes((c.agency || "").toUpperCase())
            }).length
            setPendingCount(count)
          }
        } else if (key === "dd_data_cache") {
          const data = await getFromCache<DeemedVisitData[]>("dd_data_cache")
          if (data && Array.isArray(data)) {
            const upper = (userAgencies || []).map(a => a.toUpperCase())
            const count = data.filter(d => {
              const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
              if (!isPending) return false
              if (userRole === "admin" || userRole === "viewer") return true
              return upper.includes((d.agency || "").toUpperCase())
            }).length
            setDdPendingCount(count)
          }
        } else if (key === "meter_replacement_data_cache" || key === "meter_stock_cache" || key === "meter_issues_cache") {
          const mrCached = await getFromCache<any[]>("meter_replacement_data_cache")
          if (mrCached && Array.isArray(mrCached)) {
            const upper = (userAgencies || []).map(a => a.toUpperCase())
            const count = mrCached.filter(r => {
              if ((r.status || "").toLowerCase() !== "proposed") return false
              if ((r.purpose || "") === "slow_fast") return false
              if (userRole === "admin" || userRole === "executive") return true
              return upper.includes((r.agency || "").toUpperCase())
            }).length
            setReplacementPendingCount(count)
          }
        } else if (key === "dtr_data_cache") {
          const dtrCached = await getFromCache<any[]>("dtr_data_cache")
          if (dtrCached && Array.isArray(dtrCached)) {
            const count = dtrCached.filter(r => (r.status || "").toUpperCase() !== "EXIST").length
            setDtrPendingCount(count)
            const upper = (userAgencies || []).map((a: string) => a.toUpperCase())
            const paintingPending = dtrCached.filter(r => {
              const isAssigned = userRole === "admin" || userRole === "viewer" || userRole === "executive" || 
                (r.paintingAgency && upper.includes(r.paintingAgency.trim().toUpperCase()))
              return isAssigned && (r.painting || "").toLowerCase() !== "done"
            }).length
            setDtrPaintingPendingCount(paintingPending)
          }
        } else if (key === "pd_data_cache") {
          const pdCached = await getFromCache<any[]>("pd_data_cache")
          if (pdCached && Array.isArray(pdCached)) {
            const isAgency = userRole === "agency"
            const count = pdCached.filter((r) => {
              if (isAgency) {
                if (r.status !== "issued") return false
                const recAgency = String(r.agency || "").trim()
                if (userAgencies.length > 0 && !userAgencies.some((ua) => matchesAgency(recAgency, ua))) {
                  return false
                }
                return true
              }
              return r.status === "proposed" || (r.status === "disconnected" && (!r.noteSheetNo || r.meterReturnStatus !== "returned"))
            }).length
            setPdPendingCount(count)
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

  // Build unified accessible modules from MODULE_CATALOG (single source of truth for icons, categories & badge labels)
  const countMap: Record<string, number> = {
    safety: safetyPendingCount,
    "misc-inspection": miscPendingCount,
    icds: icdsPendingCount,
    "permanent-disconnection": pdPendingCount,
    disconnection: pendingCount,
    deemed: ddPendingCount,
    reconnection: reconnectionPendingCount,
    nsc: nscPendingCount,
    meter: meterPendingCount,
    "meter-replacement": replacementPendingCount,
    material: materialPendingCount,
    dtr: dtrPendingCount,
    "dtr-painting": dtrPaintingPendingCount,
    "consumer-master": masterCount,
  }

  const accessibleModulesWithCounts = MODULE_CATALOG.filter((m) =>
    canAccessModule(m.id, userRole, permissions)
  ).map((m) => {
    const count = countMap[m.id] ?? 0
    const isLoading = Boolean(loadingModules[m.id])
    const title = userRole === "agency" && m.agencyTitle ? m.agencyTitle : m.title
    const description =
      userRole === "agency" && m.agencyDescription
        ? m.agencyDescription
        : m.id === "consumer-master" && userRole === "admin"
        ? "Upload & search consumer master database"
        : m.description
    return {
      ...m,
      title,
      description,
      count,
      isLoading,
    }
  })

  // Surface high-volume (>= 500) OR critical operational modules (e.g., safety hazards, overdue reconnections, low stock)
  const attentionModules = accessibleModulesWithCounts.filter((m) => {
    if (!m.hasCount || m.id === "consumer-master") return false
    if (m.criticalThreshold && m.count >= m.criticalThreshold) return true
    return m.count >= ATTENTION_THRESHOLD
  })

  // Quick-access recently visited modules (top 4)
  const recentModules = recentModuleIds
    .map((id) => accessibleModulesWithCounts.find((m) => m.id === id))
    .filter((m): m is (typeof accessibleModulesWithCounts)[number] => Boolean(m))
    .slice(0, 4)

  const formatSemanticCount = (mod: (typeof accessibleModulesWithCounts)[number], compact = false) => {
    if (mod.isLoading) return null
    const formattedNum =
      mod.id === "consumer-master" && mod.count >= 1000
        ? `${(mod.count / 1000).toFixed(1)}k`
        : mod.count.toLocaleString()
    if (compact || !mod.badgeUnit) return formattedNum
    return `${formattedNum} ${mod.badgeUnit}`
  }

  // Style generator according to active theme: "slate" | "categorized" | "status" | "minimal-accent"
  const getThemeStyles = (mod: (typeof accessibleModulesWithCounts)[number]) => {
    const isDanger =
      mod.count >= ATTENTION_THRESHOLD ||
      Boolean(mod.criticalThreshold && mod.count >= mod.criticalThreshold)
    const isWarning = !isDanger && mod.count >= WARNING_THRESHOLD

    switch (theme) {
      case "categorized": {
        let iconBox = "bg-blue-50 text-blue-600 border-blue-200/80 group-hover:bg-blue-100/80"
        let badge = "bg-blue-50 text-blue-800 border-blue-200/80"
        let watermark = "text-blue-600"
        let cardBorder = "hover:border-blue-300 hover:shadow-blue-500/10"

        if (mod.category === "field") {
          iconBox = "bg-amber-50 text-amber-600 border-amber-200/80 group-hover:bg-amber-100/80"
          badge = "bg-amber-50 text-amber-900 border-amber-200/80"
          watermark = "text-amber-600"
          cardBorder = "hover:border-amber-300 hover:shadow-amber-500/10"
        } else if (mod.category === "assets") {
          iconBox = "bg-emerald-50 text-emerald-600 border-emerald-200/80 group-hover:bg-emerald-100/80"
          badge = "bg-emerald-50 text-emerald-800 border-emerald-200/80"
          watermark = "text-emerald-600"
          cardBorder = "hover:border-emerald-300 hover:shadow-emerald-500/10"
        } else if (mod.category === "tools") {
          iconBox = "bg-slate-100 text-slate-700 border-slate-200/80 group-hover:bg-slate-200/70"
          badge = "bg-slate-100 text-slate-700 border-slate-200/80"
          watermark = "text-slate-600"
          cardBorder = "hover:border-slate-300"
        }

        return {
          iconContainer: `w-10 h-10 rounded-xl ${iconBox} border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105`,
          badgeClass: mod.isLoading
            ? "bg-slate-700 text-white border-slate-700 animate-pulse"
            : badge,
          watermark: `h-20 w-20 ${watermark} transition-transform duration-500 group-hover:scale-110`,
          cardBorder,
        }
      }

      case "status": {
        const badgeClass = mod.isLoading
          ? "bg-slate-700 text-white border-slate-700 animate-pulse"
          : isDanger
          ? "bg-red-50 text-red-700 border-red-200"
          : isWarning
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-slate-100 text-slate-700 border-slate-200"

        return {
          iconContainer:
            "w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/70 text-slate-700 flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-slate-200/80 group-hover:text-slate-900 group-hover:scale-105",
          badgeClass,
          watermark: "h-20 w-20 text-slate-700 transition-transform duration-500 group-hover:scale-110",
          cardBorder: isDanger ? "hover:border-red-300" : "hover:border-slate-300",
        }
      }

      case "minimal-accent": {
        return {
          iconContainer:
            "w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-indigo-100 group-hover:text-indigo-700 group-hover:scale-105",
          badgeClass: mod.isLoading
            ? "bg-indigo-500 text-white border-indigo-500 animate-pulse"
            : "bg-indigo-50 text-indigo-700 border-indigo-200/80",
          watermark: "h-20 w-20 text-indigo-600 transition-transform duration-500 group-hover:scale-110",
          cardBorder: "hover:border-indigo-300 hover:shadow-indigo-500/10",
        }
      }

      case "slate":
      default: {
        return {
          iconContainer:
            "w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/70 text-slate-700 flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 group-hover:scale-105",
          badgeClass: mod.isLoading
            ? "bg-slate-800 text-white border-slate-800 animate-pulse"
            : mod.count > 0 && mod.id !== "consumer-master"
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-slate-100 text-slate-600 border-slate-200",
          watermark: "h-20 w-20 text-slate-800 transition-transform duration-500 group-hover:scale-110",
          cardBorder: "hover:border-slate-300",
        }
      }
    }
  }

  const handleOpenModule = (id: ViewType) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    onSelect(id)
  }

  return (
    <div className="relative max-w-6xl mx-auto space-y-5 sm:space-y-6 pb-4">
      {/* 1. Admin Setup Guide Banner (Now visible on BOTH mobile & desktop) */}
      {((userRole || "").toLowerCase() === "admin" || (userRole || "").toLowerCase() === "superuser") && (
        <div className="animate-fade-slide-up">
          <AdminSetupGuideBanner />
        </div>
      )}

      {/* 2. Global Consumer Search Bar + Last Updated Meta */}
      <div className="space-y-2.5 animate-fade-slide-up">
        <div className="max-w-2xl mx-auto">
          <GlobalConsumerSearch
            onSelectModule={onSelect}
            userRole={userRole}
            permissions={permissions}
          />
        </div>

        {latestUpdateDate && (
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-200/80 shadow-2xs">
              <Calendar className="h-3 w-3 text-blue-500" />
              Last Synced Activity: <strong className="font-semibold text-slate-800">{latestUpdateDate}</strong>
            </span>
          </div>
        )}
      </div>

      {/* 3. Quick Access — Recently Used Strip (1-tap jump for daily workflows) */}
      {recentModules.length > 0 && (
        <section className="animate-fade-slide-up space-y-2">
          <div className="flex items-center gap-1.5 px-0.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Quick Access
            </h2>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {recentModules.map((mod, idx) => {
              const Icon = mod.icon
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => handleOpenModule(mod.id)}
                  className={`animate-chip-in stagger-${idx + 1} shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/90 hover:border-blue-300 hover:bg-blue-50/40 shadow-2xs text-xs font-semibold text-slate-800 transition-all interactive-tap cursor-pointer`}
                >
                  <Icon className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>{mod.title}</span>
                  {mod.hasCount && mod.count > 0 && mod.id !== "consumer-master" && (
                    <span className="notranslate tabular-nums px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {mod.count.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 4. Needs Attention Surface (Unified across Mobile & Desktop) */}
      {attentionModules.length > 0 && (
        <section className="animate-fade-slide-up space-y-2.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <h2 className="text-[11px] font-bold text-red-600 uppercase tracking-wider">
              Needs Attention
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {attentionModules.map((mod, idx) => {
              const Icon = mod.icon
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => handleOpenModule(mod.id)}
                  className={`animate-card-enter stagger-${Math.min(idx + 1, 6)} group text-left rounded-2xl border border-red-200/90 hover:border-red-300 bg-gradient-to-br from-white via-red-50/20 to-red-50/50 p-3.5 flex items-center justify-between gap-3 shadow-xs hover:shadow-md card-interactive cursor-pointer`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-red-100/80 border border-red-200 flex items-center justify-center text-red-600 shrink-0 transition-transform duration-200 group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">
                        {mod.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {mod.description}
                      </p>
                    </div>
                  </div>
                  <span className="notranslate tabular-nums shrink-0 px-2.5 py-1 rounded-full bg-red-600 text-white text-[11px] font-bold shadow-xs">
                    {mod.isLoading ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      formatSemanticCount(mod, false)
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 5. Categorized Modules Grid */}
      <div className="space-y-6">
        {MODULE_CATEGORIES.map((category) => {
          const items = accessibleModulesWithCounts.filter((m) => m.category === category.id)
          if (items.length === 0) return null

          return (
            <section key={category.id} className="space-y-3">
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${category.accentDot}`} />
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {category.label}
                  </h2>
                  <span className="hidden sm:inline text-xs text-slate-400 font-normal">
                    — {category.description}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-400">
                  {items.length} {items.length === 1 ? "module" : "modules"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {items.map((mod, idx) => {
                  const Icon = mod.icon
                  const styles = getThemeStyles(mod)
                  const semanticLabel = formatSemanticCount(mod, false)
                  const compactLabel = formatSemanticCount(mod, true)

                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => handleOpenModule(mod.id)}
                      className={`animate-card-enter stagger-${Math.min(idx + 1, 8)} group relative text-left cursor-pointer rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/90 ${styles.cardBorder} shadow-xs hover:shadow-md p-3.5 sm:p-4 flex flex-col justify-between min-h-[116px] sm:min-h-[136px] overflow-hidden card-interactive select-none`}
                    >
                      {/* Subtle Watermark Icon on Desktop */}
                      <div className="hidden sm:block absolute -bottom-3 -right-3 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-300 pointer-events-none">
                        <Icon className={styles.watermark} />
                      </div>

                      {/* Top Row: Icon + Semantic Count Pill */}
                      <div className="relative z-10 flex items-start justify-between gap-2 w-full">
                        <div className={styles.iconContainer}>
                          <Icon className="h-5 w-5" />
                        </div>

                        {mod.hasCount && (
                          <span
                            className={`notranslate tabular-nums inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold border transition-transform duration-200 group-hover:scale-105 ${styles.badgeClass}`}
                          >
                            {mod.isLoading ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <span className="sm:hidden">{compactLabel}</span>
                                <span className="hidden sm:inline">{semanticLabel}</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Bottom Row: Title, Description & Mobile Semantic Hint */}
                      <div className="relative z-10 mt-3 space-y-0.5">
                        <h3 className="text-sm sm:text-[15px] font-bold text-slate-900 leading-snug tracking-tight group-hover:text-blue-700 transition-colors">
                          {mod.title}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {mod.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

