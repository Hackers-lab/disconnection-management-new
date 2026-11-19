"use client"

import {
  LayoutDashboard,
  Menu,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useState, useEffect, useCallback } from "react"
import { getFromCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import { matchesAgency } from "@/lib/permission-utils"
import { FeedbackDialog } from "@/components/feedback-dialog"
import { parseTs } from "@/lib/date-utils"
import {
  MODULE_CATALOG,
  MODULE_CATEGORIES,
  canAccessModule,
} from "@/lib/module-catalog"

// Define the available views
export type ViewType =
  | "disconnection"
  | "reconnection"
  | "deemed"
  | "nsc"
  | "meter"
  | "admin"
  | "home"
  | "analysis"
  | "agency-updates"
  | "consumer-master"
  | "dtr"
  | "meter-replacement"
  | "dtr-painting"
  | "material"
  | "profile"
  | "osd"
  | "spotai"
  | "safety"
  | "misc-inspection"
  | "icds"
  | "gis-camera"
  | "permanent-disconnection"

interface AppSidebarProps {
  activeView: ViewType
  setActiveView: (view: ViewType | "home") => void
  userRole: string
  isMobile?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  agencies?: string[]
  permissions?: Record<string, string[]>
}

export function AppSidebar({
  activeView,
  setActiveView,
  userRole,
  isMobile = false,
  collapsed = false,
  onToggleCollapse,
  agencies = [],
  permissions,
}: AppSidebarProps) {
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const agenciesKey = JSON.stringify(agencies || [])

  const loadAllCountsFromCache = useCallback(async () => {
    try {
      const upperAgencies = (agencies || []).map((a) => a.trim().toUpperCase()).filter(Boolean)
      const rawAgencies = (agencies || []).map((a) => a.trim()).filter(Boolean)
      const isAgency = userRole === "agency"
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
        cMaterial,
      ] = await Promise.all([
        getFromCache<ConsumerData[]>("consumers_data_cache"),
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

      const next: Record<string, number> = {}

      if (Array.isArray(cConsumers)) {
        next["disconnection"] = cConsumers.filter((c) => {
          if ((c.disconStatus || "").toLowerCase() !== "connected") return false
          if (userRole === "admin" || userRole === "viewer") return true
          return upperAgencies.includes((c.agency || "").trim().toUpperCase())
        }).length
      }

      if (Array.isArray(cRc)) {
        const now = Date.now()
        next["reconnection"] = cRc.filter((r: any) => {
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

      if (Array.isArray(cDd)) {
        next["deemed"] = cDd.filter((d) => {
          if ((d.disconStatus || "").toLowerCase() !== "deemed disconnected") return false
          if (userRole === "admin" || userRole === "viewer") return true
          return upperAgencies.includes((d.agency || "").trim().toUpperCase())
        }).length
      }

      if (Array.isArray(cPd)) {
        next["permanent-disconnection"] = cPd.filter((r) => {
          if (isAgency) {
            if (r.status !== "issued") return false
            const recAgency = String(r.agency || "").trim()
            if (rawAgencies.length > 0 && !rawAgencies.some((ua) => matchesAgency(recAgency, ua))) {
              return false
            }
            return true
          }
          return (
            r.status === "proposed" ||
            (r.status === "disconnected" && (!r.noteSheetNo || r.meterReturnStatus !== "returned"))
          )
        }).length
      }

      if (Array.isArray(cSafety)) {
        next["safety"] = cSafety.filter((t) => {
          if (isAgency) {
            return (
              t.physicalStatus === "pending" &&
              upperAgencies.includes((t.agency || "").trim().toUpperCase())
            )
          }
          return (
            t.physicalStatus === "pending" ||
            (t.physicalStatus === "rectified" &&
              t.adminStatus !== "po_done" &&
              t.adminStatus !== "not_required")
          )
        }).length
      }

      if (Array.isArray(cMisc)) {
        next["misc-inspection"] = cMisc.filter((r) => {
          if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive" && r.agency) {
            if (!upperAgencies.includes((r.agency || "").trim().toUpperCase())) return false
          }
          return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
        }).length
      }

      if (Array.isArray(cIcds)) {
        next["icds"] = cIcds.filter((r) => {
          if (isAgency && r.assignedAgency) {
            const recAgency = String(r.assignedAgency || "").trim()
            if (rawAgencies.length > 0 && !rawAgencies.some((ua) => matchesAgency(recAgency, ua))) {
              return false
            }
          }
          return r.stage !== "COMPLETED"
        }).length
      }

      if (cMeter) {
        const meterIssues: any[] = isAgency
          ? Array.isArray(cMeter)
            ? cMeter
            : []
          : cMeter.issues || []
        next["meter"] = meterIssues.filter((i: any) => {
          if (isAgency) {
            if (i.status !== "issued") return false
            return upperAgencies.includes((i.agency || "").trim().toUpperCase())
          }
          return i.status === "installation_done"
        }).length
      }

      if (Array.isArray(cNsc)) {
        next["nsc"] = cNsc.filter((a: any) => {
          if (isAgency) {
            return a.status === "pending" && upperAgencies.includes((a.agency || "").trim().toUpperCase())
          }
          return a.status === "inspected"
        }).length
      }

      if (Array.isArray(cMr)) {
        next["meter-replacement"] = cMr.filter((r: any) => {
          if ((r.status || "").toLowerCase() !== "proposed") return false
          if ((r.purpose || "") === "slow_fast") return false
          if (userRole === "admin" || userRole === "executive") return true
          return upperAgencies.includes((r.agency || "").trim().toUpperCase())
        }).length
      }

      if (Array.isArray(cDtr)) {
        next["dtr"] = cDtr.filter((r) => (r.status || "").toUpperCase() !== "EXIST").length
        next["dtr-painting"] = cDtr.filter((r) => {
          const isAssigned =
            userRole === "admin" ||
            userRole === "viewer" ||
            userRole === "executive" ||
            (r.paintingAgency && upperAgencies.includes(r.paintingAgency.trim().toUpperCase()))
          return isAssigned && (r.painting || "").toLowerCase() !== "done"
        }).length
      }

      if (cMaterial && Array.isArray(cMaterial.stock)) {
        next["material"] = cMaterial.stock.filter(
          (s: any) => s.currentStock < (s.threshold || 0)
        ).length
      }

      setCounts(next)
    } catch (e) {
      console.error("Failed to load sidebar counts", e)
    }
  }, [userRole, agenciesKey])

  useEffect(() => {
    loadAllCountsFromCache()
    const handleCacheUpdate = () => {
      loadAllCountsFromCache()
    }
    window.addEventListener("badge_cache_updated", handleCacheUpdate)
    return () => window.removeEventListener("badge_cache_updated", handleCacheUpdate)
  }, [loadAllCountsFromCache])

  const handleSelect = (view: ViewType) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    setActiveView(view)
    setOpen(false)
  }

  const renderNavContent = (isCompact: boolean) => {
    const isHomeActive = activeView === "home"

    return (
      <div className="flex flex-col h-full">
        {/* Scrollable Nav Items */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {/* Home Link */}
          <div>
            <button
              type="button"
              onClick={() => handleSelect("home")}
              title={isCompact ? "Dashboard Home" : undefined}
              className={`w-full group relative flex items-center ${
                isCompact ? "justify-center px-2" : "justify-between px-3"
              } h-10 rounded-xl text-sm font-semibold transition-all duration-150 interactive-tap cursor-pointer ${
                isHomeActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-700 hover:bg-slate-100/90 hover:text-slate-950"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <LayoutDashboard
                  className={`h-4 w-4 shrink-0 ${
                    isHomeActive ? "text-white" : "text-slate-500 group-hover:text-slate-800"
                  }`}
                />
                {!isCompact && <span className="truncate">Dashboard Home</span>}
              </div>
              {!isCompact && isHomeActive && <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
            </button>
          </div>

          {/* Categorized Modules */}
          {MODULE_CATEGORIES.map((category) => {
            const items = MODULE_CATALOG.filter(
              (m) => m.category === category.id && canAccessModule(m.id, userRole, permissions)
            )
            if (items.length === 0) return null

            return (
              <div key={category.id} className="space-y-1">
                {!isCompact ? (
                  <div className="px-3 pb-1 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${category.accentDot}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {category.label}
                    </span>
                  </div>
                ) : (
                  <div className="mx-auto w-6 h-px bg-slate-200/80 my-2" />
                )}

                {items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeView === item.id
                  const label = userRole === "agency" && item.agencyTitle ? item.agencyTitle : item.title
                  const count = counts[item.id]
                  const showCount = item.hasCount && item.id !== "consumer-master" && typeof count === "number" && count > 0

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      title={isCompact ? `${label}${showCount ? ` (${count})` : ""}` : undefined}
                      className={`w-full group relative flex items-center ${
                        isCompact ? "justify-center px-2" : "justify-between px-3"
                      } h-9 rounded-xl text-[13px] font-medium transition-all duration-150 interactive-tap cursor-pointer ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/70"
                          : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-600" />
                      )}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                            isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-800"
                          }`}
                        />
                        {!isCompact && <span className="truncate">{label}</span>}
                      </div>

                      {!isCompact && showCount && (
                        <span
                          className={`notranslate tabular-nums shrink-0 ml-2 min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : count >= 500 || (item.criticalThreshold && count >= item.criticalThreshold)
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-700 group-hover:bg-slate-200/80"
                          }`}
                        >
                          {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                        </span>
                      )}

                      {isCompact && showCount && (
                        <span
                          className={`absolute top-1 right-1.5 h-2 w-2 rounded-full ring-2 ring-white ${
                            count >= 500 || (item.criticalThreshold && count >= item.criticalThreshold)
                              ? "bg-red-500"
                              : "bg-blue-500"
                          }`}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Bottom Sticky Footer */}
        <div className="p-2.5 border-t border-slate-200/70 bg-slate-50/60 shrink-0 space-y-2">
          <FeedbackDialog
            trigger={
              <Button
                variant="outline"
                onClick={() => isMobile && setOpen(false)}
                title={isCompact ? "Rate App / Feedback" : undefined}
                className={`w-full ${
                  isCompact ? "justify-center px-0" : "justify-start px-3"
                } border-amber-300/80 bg-amber-50/80 hover:bg-amber-100/90 text-amber-900 font-semibold gap-2 text-xs rounded-xl h-9 cursor-pointer interactive-tap`}
              >
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                {!isCompact && <span className="truncate">Rate App / Feedback</span>}
              </Button>
            }
          />

          {!isMobile && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`w-full flex items-center ${
                isCompact ? "justify-center" : "justify-between px-3"
              } h-8 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer`}
              title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
            >
              {!isCompact && <span>Collapse sidebar</span>}
              {isCompact ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  // MOBILE VIEW: Hamburger Button that opens a cleanly scrollable Sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 rounded-xl text-slate-700 hover:bg-slate-100 interactive-tap"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[275px] sm:w-[300px] p-0 flex flex-col bg-white">
          <SheetHeader className="px-4 py-3.5 border-b border-slate-100 shrink-0">
            <SheetTitle className="text-left flex items-center gap-2 text-base font-bold text-slate-900">
              <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <LayoutDashboard className="w-4 h-4" />
              </div>
              <span>Workspace Menu</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0">{renderNavContent(false)}</div>
        </SheetContent>
      </Sheet>
    )
  }

  // DESKTOP VIEW: Persistent collapsible sidebar
  return (
    <aside
      aria-label="Primary Workspace Navigation"
      className={`hidden md:flex flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-md fixed left-0 top-14 bottom-0 z-30 transition-[width] duration-200 ease-out ${
        collapsed ? "w-[70px]" : "w-64"
      }`}
    >
      {renderNavContent(collapsed)}
    </aside>
  )
}