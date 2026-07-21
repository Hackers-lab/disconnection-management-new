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
  Package
} from "lucide-react"
import { ViewType } from "@/components/app-sidebar"
import { getFromCache, saveToCache, getCccPrefix } from "@/lib/indexed-db"

interface DashboardMenuProps {
  onSelect: (module: ViewType) => void
  userRole: string
  userAgencies?: string[]
  permissions?: Record<string, string[]>
}

export function DashboardMenu({ onSelect, userRole, userAgencies = [], permissions }: DashboardMenuProps) {
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [ddPendingCount, setDdPendingCount] = useState<number>(0)
  const [reconnectionPendingCount, setReconnectionPendingCount] = useState<number>(0)
  const [meterPendingCount, setMeterPendingCount] = useState<number>(0)
  const [nscPendingCount, setNscPendingCount] = useState<number>(0)
  const [replacementPendingCount, setReplacementPendingCount] = useState<number>(0)
  const [dtrPendingCount, setDtrPendingCount] = useState<number>(0)
  const [dtrPaintingPendingCount, setDtrPaintingPendingCount] = useState<number>(0)
  const [materialPendingCount, setMaterialPendingCount] = useState<number>(0)
  const [masterCount, setMasterCount] = useState<number>(0)
  const [showDevModal, setShowDevModal] = useState(false)
  const [loadingModules, setLoadingModules] = useState<Record<string, boolean>>({
    disconnection: false,
    reconnection: false,
    deemed: false,
    dtr: false,
    "dtr-painting": false,
    meter: false,
    nsc: false,
    "meter-replacement": false,
    material: false,
    "consumer-master": false,
  })

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
      allowed: ["admin", "executive", "agency"],
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

  useEffect(() => {
    async function loadPendingCount() {
      // Disconnection
      try {
        let data = await getFromCache<ConsumerData[]>("consumers_data_cache")
        if (!data || data.length === 0) {
          setLoadingModules(prev => ({ ...prev, disconnection: true }))
          try {
            const res = await fetch("/api/consumers/base")
            if (res.ok) {
              data = await res.json()
              if (data) await saveToCache("consumers_data_cache", data)
            }
          } catch (err) { console.error("Auto-fetch consumers failed", err) }
        }

        if (!data) data = []
        const count = data.filter(c => {
          const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
          if (!isConnected) return false
          if (userRole === "admin" || userRole === "viewer") return true
          const consumerAgency = (c.agency || "").trim().toUpperCase()
          const safeAgencies = userAgencies || []
          const userAgenciesUpper = safeAgencies.map(a => a.trim().toUpperCase())
          return userAgenciesUpper.includes(consumerAgency)
        }).length
        setPendingCount(count)
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, disconnection: false }))
      }

      // Deemed
      try {
        let ddData = await getFromCache<DeemedVisitData[]>("dd_data_cache")
        if (!ddData || ddData.length === 0) {
          setLoadingModules(prev => ({ ...prev, deemed: true }))
          try {
            const res = await fetch("/api/dd/base")
            if (res.ok) {
              ddData = await res.json()
              if (ddData) await saveToCache("dd_data_cache", ddData)
            }
          } catch (err) { console.error("Auto-fetch DD failed", err) }
        }

        if (ddData) {
          const ddCount = ddData.filter(d => {
            const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
            if (!isPending) return false
            if (userRole === "admin" || userRole === "viewer") return true
            const agency = (d.agency || "").trim().toUpperCase()
            const safeAgencies = userAgencies || []
            const userAgenciesUpper = safeAgencies.map(a => a.trim().toUpperCase())
            return userAgenciesUpper.includes(agency)
          }).length
          setDdPendingCount(ddCount)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, deemed: false }))
      }

      // Reconnection
      try {
        let rcCached = await getFromCache<any[]>("reconnection_data_cache")
        if (!rcCached || rcCached.length === 0) {
          setLoadingModules(prev => ({ ...prev, reconnection: true }))
          try {
            const res = await fetch("/api/reconnection")
            if (res.ok) {
              rcCached = await res.json()
              if (rcCached) await saveToCache("reconnection_data_cache", rcCached)
            }
          } catch (err) { console.error("Auto-fetch reconnection failed", err) }
        }
        if (rcCached) {
          const upper = (userAgencies || []).map((a: string) => a.toUpperCase())
          const rcPending = rcCached.filter((r: any) => {
            if (r.status !== "pending") return false
            if (userRole === "admin" || userRole === "viewer" || userRole === "executive") return true
            return upper.includes((r.agency || "").toUpperCase())
          }).length
          setReconnectionPendingCount(rcPending)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, reconnection: false }))
      }

      // Meter
      try {
        const isAgency = userRole === "agency"
        const cacheKey = isAgency ? "meter_issues_cache" : "meter_stock_cache"
        let meterCached = await getFromCache<any>(cacheKey)
        if (!meterCached || (isAgency && meterCached.length === 0) || (!isAgency && (!meterCached.issues || meterCached.issues.length === 0))) {
          setLoadingModules(prev => ({ ...prev, meter: true }))
          try {
            const url = isAgency ? "/api/meters/issue" : "/api/meters/stock"
            const res = await fetch(url)
            if (res.ok) {
              const freshData = await res.json()
              if (freshData) {
                if (isAgency) {
                  meterCached = [...freshData].reverse()
                } else {
                  const sorted = [...(freshData.issues || [])].reverse()
                  meterCached = { summary: freshData.summary || [], stock: freshData.stock || [], issues: sorted }
                }
                await saveToCache(cacheKey, meterCached)
              }
            }
          } catch (err) { console.error("Auto-fetch meters failed", err) }
        }
        if (meterCached) {
          const meterIssues: any[] = isAgency ? meterCached : (meterCached.issues || [])
          const upper = (userAgencies || []).map((a: string) => a.toUpperCase())
          const count = meterIssues.filter((i: any) => {
            if (isAgency) {
              if (i.status !== "issued") return false
              return upper.includes((i.agency || "").toUpperCase())
            } else {
              return i.status === "installation_done"
            }
          }).length
          setMeterPendingCount(count)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, meter: false }))
      }

      // NSC
      try {
        let nscCached = await getFromCache<any[]>("nsc_data_cache")
        if (!nscCached || nscCached.length === 0) {
          setLoadingModules(prev => ({ ...prev, nsc: true }))
          try {
            const res = await fetch("/api/nsc")
            if (res.ok) {
              nscCached = await res.json()
              if (nscCached) await saveToCache("nsc_data_cache", nscCached)
            }
          } catch (err) { console.error("Auto-fetch NSC failed", err) }
        }
        if (nscCached) {
          const upper = (userAgencies || []).map((a: string) => a.toUpperCase())
          const nscCount = nscCached.filter((a: any) => {
            if (userRole === "agency") {
              return a.status === "pending" && upper.includes((a.agency || "").toUpperCase())
            }
            return a.status === "inspected"
          }).length
          setNscPendingCount(nscCount)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, nsc: false }))
      }

      // Meter Replacement
      try {
        let mrCached = await getFromCache<any[]>("meter_replacement_data_cache")
        if (!mrCached || mrCached.length === 0) {
          setLoadingModules(prev => ({ ...prev, "meter-replacement": true }))
          try {
            const res = await fetch("/api/meters/replacement")
            if (res.ok) {
              mrCached = await res.json()
              if (mrCached) await saveToCache("meter_replacement_data_cache", mrCached)
            }
          } catch (err) { console.error("Auto-fetch meter replacement failed", err) }
        }
        if (mrCached) {
          const upper = (userAgencies || []).map((a: string) => a.toUpperCase())
          const count = mrCached.filter((r: any) => {
            if ((r.status || "").toLowerCase() !== "proposed") return false
            if (userRole === "admin" || userRole === "executive") return true
            return upper.includes((r.agency || "").toUpperCase())
          }).length
          setReplacementPendingCount(count)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, "meter-replacement": false }))
      }

      // DTR
      try {
        let dtrCached = await getFromCache<any[]>("dtr_data_cache")
        if (!dtrCached || dtrCached.length === 0) {
          setLoadingModules(prev => ({ ...prev, dtr: true, "dtr-painting": true }))
          try {
            const res = await fetch("/api/dtr")
            if (res.ok) {
              dtrCached = await res.json()
              if (dtrCached) await saveToCache("dtr_data_cache", dtrCached)
            }
          } catch (err) { console.error("Auto-fetch DTR failed", err) }
        }
        if (dtrCached) {
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
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingModules(prev => ({ ...prev, dtr: false, "dtr-painting": false }))
      }

      // Material Stock
      try {
        setLoadingModules(prev => ({ ...prev, material: true }))
        const res = await fetch("/api/material")
        if (res.ok) {
          const data = await res.json()
          const stock = data.stock || []
          const belowThresholdCount = stock.filter((s: any) => s.currentStock < (s.threshold || 0)).length
          setMaterialPendingCount(belowThresholdCount)
        }
      } catch (e) {
        console.error("Auto-fetch material failed", e)
      } finally {
        setLoadingModules(prev => ({ ...prev, material: false }))
      }

      // Consumer Master count (cached in localStorage for speed, updated in background)
      try {
        const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
        const cachedMaster = localStorage.getItem(`${prefix}consumer_master_row_count`)
        if (cachedMaster) {
          setMasterCount(parseInt(cachedMaster, 10))
        }
        setLoadingModules(prev => ({ ...prev, "consumer-master": true }))
        const res = await fetch("/api/system/row-count?type=master")
        if (res.ok) {
          const data = await res.json()
          setMasterCount(data.count)
          localStorage.setItem(`${prefix}consumer_master_row_count`, String(data.count))
        }
      } catch (e) {
        console.error("Auto-fetch master count failed", e)
      } finally {
        setLoadingModules(prev => ({ ...prev, "consumer-master": false }))
      }
    }
    loadPendingCount()
  }, [userRole, userAgencies])

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
        <div className="flex-grow">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
            {modules.map((module) => {
              const permKey = module.id.replace(/-/g, "_")
              const hasAccess = module.id === "home" || (permissions && (
                permissions[module.id]?.includes("read") || 
                permissions[permKey]?.includes("read") ||
                (module.id === "material" && permissions[module.id]?.length > 0) ||
                (module.id === "dtr-painting" && (permissions["dtr"]?.includes("read") || permissions["dtr"]?.includes("update")))
              ))
              if (!hasAccess) return null
              const Icon = module.icon
              return (
                <Card
                  key={module.id}
                  className={`group relative cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 border border-gray-200/80 bg-white/70 backdrop-blur-md rounded-2xl ${module.borderColor} overflow-hidden`}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    onSelect(module.id as ViewType)
                  }}
                >
                  {module.id === "disconnection" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-red-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["disconnection"] ? "bg-blue-500 animate-pulse" : pendingCount > 0 ? "bg-red-600 shadow-red-500/20" : "bg-gray-400 shadow-gray-400/20"
                      }`}>
                      {loadingModules["disconnection"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : pendingCount}
                    </div>
                  )}
                  {module.id === "deemed" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-orange-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["deemed"] ? "bg-blue-500 animate-pulse" : ddPendingCount > 0 ? "bg-orange-600 shadow-orange-500/20" : "bg-gray-400 shadow-gray-400/20"
                      }`}>
                      {loadingModules["deemed"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : ddPendingCount}
                    </div>
                  )}
                  {module.id === "reconnection" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-blue-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["reconnection"] ? "bg-blue-500 animate-pulse" : reconnectionPendingCount > 0 ? "bg-blue-600 shadow-blue-500/20" : "bg-gray-400 shadow-gray-400/20"
                      }`}>
                      {loadingModules["reconnection"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : reconnectionPendingCount}
                    </div>
                  )}
                  {module.id === "nsc" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-green-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["nsc"] ? "bg-blue-500 animate-pulse" : nscPendingCount > 0 ? "bg-green-600" : "bg-gray-400"
                      }`}>
                      {loadingModules["nsc"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : nscPendingCount}
                    </div>
                  )}
                  {module.id === "meter" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-purple-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["meter"] ? "bg-blue-500 animate-pulse" : meterPendingCount > 0 ? "bg-purple-600" : "bg-gray-400"
                      }`}>
                      {loadingModules["meter"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : meterPendingCount}
                    </div>
                  )}
                  {module.id === "meter-replacement" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-indigo-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["meter-replacement"] ? "bg-blue-500 animate-pulse" : replacementPendingCount > 0 ? "bg-indigo-600" : "bg-gray-400"
                      }`}>
                      {loadingModules["meter-replacement"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : replacementPendingCount}
                    </div>
                  )}
                  {module.id === "material" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-amber-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["material"] ? "bg-blue-500 animate-pulse" : materialPendingCount > 0 ? "bg-amber-600 shadow-amber-500/20" : "bg-gray-400 shadow-gray-400/20"
                      }`}>
                      {loadingModules["material"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : materialPendingCount}
                    </div>
                  )}
                  {module.id === "dtr" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-teal-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["dtr"] ? "bg-blue-500 animate-pulse" : dtrPendingCount > 0 ? "bg-teal-600" : "bg-gray-400"
                      }`}>
                      {loadingModules["dtr"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : dtrPendingCount}
                    </div>
                  )}
                  {module.id === "dtr-painting" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-orange-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["dtr-painting"] ? "bg-blue-500 animate-pulse" : dtrPaintingPendingCount > 0 ? "bg-orange-600" : "bg-gray-400"
                      }`}>
                      {loadingModules["dtr-painting"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : dtrPaintingPendingCount}
                    </div>
                  )}
                  {module.id === "consumer-master" && (
                    <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-teal-500/10 transition-all duration-300 group-hover:scale-105 ${loadingModules["consumer-master"] ? "bg-blue-500 animate-pulse" : masterCount > 0 ? "bg-teal-600 shadow-teal-500/20" : "bg-gray-400 shadow-gray-400/20"
                      }`}>
                      {loadingModules["consumer-master"] ? <RefreshCw className="h-3 w-3 animate-spin" /> : masterCount.toLocaleString()}
                    </div>
                  )}

                  <div className={`absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500`}>
                    <Icon className={`h-16 w-16 md:h-24 md:w-24 ${module.color} transition-transform duration-500 group-hover:scale-110`} />
                  </div>

                  <CardHeader className="relative pb-2 p-3 md:p-6">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl ${module.bgColor} flex items-center justify-center mb-2 md:mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm`}>
                      <Icon className={`h-5 w-5 md:h-6 md:w-6 ${module.color}`} />
                    </div>
                    <CardTitle className="text-sm md:text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {module.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
                    <p className="text-xs md:text-sm text-gray-500 line-clamp-2">
                      {module.description}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* --- BEAUTIFUL DEVELOPER FOOTER --- */}
        <div className="mt-12 py-6 border-t border-gray-100 text-center">
          <p className="text-sm font-medium text-gray-400">
            Developed by{" "}
            <button
              onClick={() => setShowDevModal(true)}
              className="font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer text-base"
            >
              Pramod Verma
            </button>
          </p>
        </div>
      </div>

      {/* --- FLOATING WINDOW (MODAL) --- */}
      {showDevModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200 border border-gray-100">
            <button
              onClick={() => setShowDevModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="h-8 w-8 text-indigo-600" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Contact Developer</h3>
            <p className="text-gray-600 mb-6">
              To add your supply or for technical assistance, please contact:
            </p>

            <a
              href="tel:8092273459"
              className="inline-block w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold text-lg hover:shadow-lg transition-all active:scale-95"
            >
              8092273459
            </a>

            <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest font-bold">Pramod Verma • System Support</p>
          </div>
        </div>
      )}
    </>
  )
}
