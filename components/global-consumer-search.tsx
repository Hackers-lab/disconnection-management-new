"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  Search,
  X,
  Loader2,
  ArrowRight,
  Zap,
  RotateCcw,
  UserX,
  Building2,
  Users,
  ClipboardCheck,
  RadioTower,
  Gauge,
  ShieldAlert,
  Sparkles,
  MapPin,
  Phone,
  FileCheck2
} from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import { ViewType } from "@/components/app-sidebar"
import { OsdDetailsDialog } from "@/components/osd-details-dialog"

export interface SearchResultItem {
  moduleId: ViewType
  moduleName: string
  icon: any
  badgeBg: string
  badgeText: string
  badgeBorder: string
  id: string
  name: string
  consumerId?: string
  meterNo?: string
  caNo?: string
  amount?: string | number
  status?: string
  statusColor?: string
  address?: string
  mobile?: string
  extra?: Record<string, any>
}

interface GlobalConsumerSearchProps {
  onSelectModule: (module: ViewType) => void
  userRole: string
  permissions?: Record<string, string[]>
}

export function GlobalConsumerSearch({ onSelectModule, userRole, permissions }: GlobalConsumerSearchProps) {
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [showOsdModal, setShowOsdModal] = useState(false)
  const [osdTargetId, setOsdTargetId] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  // Check if user has permission to view a given module
  const hasModuleAccess = (moduleId: string): boolean => {
    if (moduleId === "consumer-master" || moduleId === "home") return true
    if (moduleId === "meter-replacement") return userRole === "admin" || userRole === "executive" || userRole === "superuser"
    if (userRole === "admin" || userRole === "superuser" || userRole === "executive" || userRole === "viewer") return true
    const permKey = moduleId.replace(/-/g, "_")
    if (!permissions) return false
    return Boolean(
      (permissions[moduleId] && permissions[moduleId].length > 0) ||
      (permissions[permKey] && permissions[permKey].length > 0) ||
      permissions[moduleId]?.includes("read") ||
      permissions[permKey]?.includes("read") ||
      (moduleId === "material" && permissions[moduleId]?.length > 0) ||
      (moduleId === "dtr-painting" && (permissions["dtr"]?.includes("read") || permissions["dtr"]?.includes("update")))
    )
  }

  // Strict check: Agency can NEVER access OSD
  const canAccessOsd = userRole !== "agency" && (
    userRole === "admin" ||
    userRole === "superuser" ||
    userRole === "executive" ||
    userRole === "viewer" ||
    userRole === "technical" ||
    Boolean(permissions?.osd && permissions.osd.length > 0)
  )

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleOpenOsd = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!canAccessOsd) return
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    setOsdTargetId(id)
    setShowOsdModal(true)
    setIsOpen(false)
  }

  const handleSelectResult = (item: SearchResultItem) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    const term = item.consumerId || item.caNo || item.meterNo || item.id || item.name
    if (term && typeof window !== "undefined") {
      sessionStorage.setItem("module_search_term", term)
      window.dispatchEvent(new CustomEvent("set_module_search", { detail: { searchTerm: term } }))
    }
    setIsOpen(false)
    onSelectModule(item.moduleId)
  }

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeoutId = setTimeout(async () => {
      try {
        const found: SearchResultItem[] = []

        // 1. Disconnection Cache (Only if user has access)
        if (hasModuleAccess("disconnection")) {
          const disconList = await getFromCache<any[]>("consumers_data_cache")
          if (Array.isArray(disconList)) {
            for (const item of disconList) {
              const id = String(item.consumerId || item.id || "").toLowerCase()
              const name = String(item.name || "").toLowerCase()
              const mobile = String(item.mobileNumber || item.mobile || "").toLowerCase()
              const addr = String(item.address || "").toLowerCase()

              if (id.includes(q) || name.includes(q) || mobile.includes(q) || addr.includes(q)) {
                found.push({
                  moduleId: "disconnection",
                  moduleName: "Disconnection",
                  icon: Zap,
                  badgeBg: "bg-red-50",
                  badgeText: "text-red-700",
                  badgeBorder: "border-red-200",
                  id: item.consumerId || item.id || "",
                  consumerId: item.consumerId || item.id || "",
                  name: item.name || "Consumer",
                  amount: item.totalArrears ? Number(item.totalArrears).toLocaleString() : undefined,
                  status: item.disconStatus || "Pending",
                  statusColor: item.disconStatus === "Disconnected" ? "bg-red-100 text-red-800 border-red-200" : "bg-amber-100 text-amber-800 border-amber-200",
                  address: item.address,
                  mobile: item.mobileNumber || item.mobile,
                  extra: item
                })
              }
            }
          }
        }

        // 2. Reconnection Cache (Only if user has access)
        if (hasModuleAccess("reconnection")) {
          const reconList = await getFromCache<any[]>("reconnection_data_cache")
          if (Array.isArray(reconList)) {
            for (const item of reconList) {
              const id = String(item.consumerId || item.id || "").toLowerCase()
              const name = String(item.name || "").toLowerCase()
              const mobile = String(item.mobileNumber || "").toLowerCase()
              const addr = String(item.address || "").toLowerCase()

              if (id.includes(q) || name.includes(q) || mobile.includes(q) || addr.includes(q)) {
                found.push({
                  moduleId: "reconnection",
                  moduleName: "Reconnection",
                  icon: RotateCcw,
                  badgeBg: "bg-blue-50",
                  badgeText: "text-blue-700",
                  badgeBorder: "border-blue-200",
                  id: item.consumerId || item.id || "",
                  consumerId: item.consumerId || item.id || "",
                  name: item.name || "Consumer",
                  amount: item.amountPaid || item.amount ? Number(item.amountPaid || item.amount).toLocaleString() : undefined,
                  status: item.reconStatus || "Reconnected",
                  statusColor: "bg-blue-100 text-blue-800 border-blue-200",
                  address: item.address,
                  mobile: item.mobileNumber,
                  extra: item
                })
              }
            }
          }
        }

        // 3. Deemed Visit Cache (Only if user has access)
        if (hasModuleAccess("deemed")) {
          const ddList = await getFromCache<any[]>("dd_data_cache")
          if (Array.isArray(ddList)) {
            for (const item of ddList) {
              const id = String(item.consumerId || item.id || "").toLowerCase()
              const name = String(item.name || "").toLowerCase()
              const mobile = String(item.mobileNumber || "").toLowerCase()
              const addr = String(item.address || "").toLowerCase()

              if (id.includes(q) || name.includes(q) || mobile.includes(q) || addr.includes(q)) {
                found.push({
                  moduleId: "deemed",
                  moduleName: "Deemed Visit",
                  icon: UserX,
                  badgeBg: "bg-orange-50",
                  badgeText: "text-orange-700",
                  badgeBorder: "border-orange-200",
                  id: item.consumerId || item.id || "",
                  consumerId: item.consumerId || item.id || "",
                  name: item.name || "Consumer",
                  status: item.disconStatus || "Deemed",
                  statusColor: "bg-orange-100 text-orange-800 border-orange-200",
                  address: item.address,
                  mobile: item.mobileNumber,
                  extra: item
                })
              }
            }
          }
        }

        // 4. ICDS Electrification Cache (Only if user has access)
        if (hasModuleAccess("icds")) {
          const icdsList = await getFromCache<any[]>("icds_data_cache")
          if (Array.isArray(icdsList)) {
            for (const item of icdsList) {
              const code = String(item.centerCode || item.code || "").toLowerCase()
              const name = String(item.centerName || item.awcName || "").toLowerCase()
              const ca = String(item.caNo || item.consumerId || "").toLowerCase()
              const sec = String(item.sector || "").toLowerCase()

              if (code.includes(q) || name.includes(q) || ca.includes(q) || sec.includes(q)) {
                found.push({
                  moduleId: "icds",
                  moduleName: "ICDS Center",
                  icon: Building2,
                  badgeBg: "bg-emerald-50",
                  badgeText: "text-emerald-700",
                  badgeBorder: "border-emerald-200",
                  id: item.centerCode || item.caNo || "",
                  caNo: item.caNo,
                  name: item.centerName || item.awcName || "ICDS Center",
                  status: item.stage || item.status || "In Progress",
                  statusColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
                  address: [item.sector ? `Sector: ${item.sector}` : "", item.district, item.block].filter(Boolean).join(" • "),
                  extra: item
                })
              }
            }
          }
        }

        // 5. NSC (New Connection) Cache (Only if user has access)
        if (hasModuleAccess("nsc")) {
          const nscList = await getFromCache<any[]>("nsc_data_cache")
          if (Array.isArray(nscList)) {
            for (const item of nscList) {
              const id = String(item.consumerId || item.applicationNo || item.id || "").toLowerCase()
              const name = String(item.applicantName || item.name || "").toLowerCase()
              const mobile = String(item.mobileNumber || "").toLowerCase()
              const addr = String(item.address || "").toLowerCase()

              if (id.includes(q) || name.includes(q) || mobile.includes(q) || addr.includes(q)) {
                found.push({
                  moduleId: "nsc",
                  moduleName: "NSC",
                  icon: ClipboardCheck,
                  badgeBg: "bg-green-50",
                  badgeText: "text-green-700",
                  badgeBorder: "border-green-200",
                  id: item.consumerId || item.applicationNo || "",
                  consumerId: item.consumerId || item.applicationNo || "",
                  name: item.applicantName || item.name || "NSC Applicant",
                  status: item.status || "Inspected",
                  statusColor: "bg-green-100 text-green-800 border-green-200",
                  address: item.address,
                  mobile: item.mobileNumber,
                  extra: item
                })
              }
            }
          }
        }

        // 6. Meter Replacement Cache (Only if user has access)
        if (hasModuleAccess("meter-replacement")) {
          const mrList = await getFromCache<any[]>("meter_replacement_data_cache")
          if (Array.isArray(mrList)) {
            for (const item of mrList) {
              const id = String(item.consumerId || "").toLowerCase()
              const name = String(item.consumerName || item.name || "").toLowerCase()
              const oldMeter = String(item.oldMeterNo || item.meterNo || "").toLowerCase()
              const newMeter = String(item.newMeterNo || "").toLowerCase()

              if (id.includes(q) || name.includes(q) || oldMeter.includes(q) || newMeter.includes(q)) {
                found.push({
                  moduleId: "meter-replacement",
                  moduleName: "Meter Replacement",
                  icon: Gauge,
                  badgeBg: "bg-purple-50",
                  badgeText: "text-purple-700",
                  badgeBorder: "border-purple-200",
                  id: item.consumerId || oldMeter || "",
                  consumerId: item.consumerId,
                  meterNo: item.newMeterNo ? `${item.oldMeterNo || ""} → ${item.newMeterNo}` : (item.oldMeterNo || item.meterNo),
                  name: item.consumerName || item.name || "Consumer",
                  status: item.status || "Replaced",
                  statusColor: "bg-purple-100 text-purple-800 border-purple-200",
                  extra: item
                })
              }
            }
          }
        }

        // 7. Safety Inspection Cache (Only if user has access)
        if (hasModuleAccess("safety")) {
          const safetyList = await getFromCache<any[]>("safety_data_cache")
          if (Array.isArray(safetyList)) {
            for (const item of safetyList) {
              const id = String(item.hazardId || item.consumerId || item.id || "").toLowerCase()
              const loc = String(item.location || "").toLowerCase()
              const desc = String(item.description || "").toLowerCase()

              if (id.includes(q) || loc.includes(q) || desc.includes(q)) {
                found.push({
                  moduleId: "safety",
                  moduleName: "Safety",
                  icon: ShieldAlert,
                  badgeBg: "bg-amber-50",
                  badgeText: "text-amber-700",
                  badgeBorder: "border-amber-200",
                  id: item.hazardId || item.id || "",
                  name: item.location || item.description || "Safety Issue",
                  status: item.status || "Reported",
                  statusColor: "bg-amber-100 text-amber-800 border-amber-200",
                  address: item.location,
                  extra: item
                })
              }
            }
          }
        }

        // 8. DTR Verification Cache (Only if user has access)
        if (hasModuleAccess("dtr")) {
          const dtrList = await getFromCache<any[]>("dtr_data_cache")
          if (Array.isArray(dtrList)) {
            for (const item of dtrList) {
              const code = String(item.dtrCode || item.code || "").toLowerCase()
              const name = String(item.dtrName || item.name || "").toLowerCase()
              const loc = String(item.location || "").toLowerCase()

              if (code.includes(q) || name.includes(q) || loc.includes(q)) {
                found.push({
                  moduleId: "dtr",
                  moduleName: "DTR Transformer",
                  icon: RadioTower,
                  badgeBg: "bg-amber-50",
                  badgeText: "text-amber-700",
                  badgeBorder: "border-amber-200",
                  id: item.dtrCode || "",
                  name: item.dtrName || item.dtrCode || "Transformer",
                  status: item.capacity ? `${item.capacity} KVA` : "Verified",
                  statusColor: "bg-amber-100 text-amber-800 border-amber-200",
                  address: item.location,
                  extra: item
                })
              }
            }
          }
        }

        // 9. Consumer Master Cache (Always searchable)
        if (hasModuleAccess("consumer-master")) {
          let masterList = await getFromCache<any[]>("consumer_master_cache")
          if (!masterList || !Array.isArray(masterList) || masterList.length === 0) {
            try {
              const res = await fetch("/api/consumer-master?limit=5000")
              if (res.ok) {
                masterList = await res.json()
                if (Array.isArray(masterList) && masterList.length > 0) {
                  saveToCache("consumer_master_cache", masterList)
                }
              }
            } catch {}
          }

          if (Array.isArray(masterList)) {
            for (const item of masterList) {
              const id = String(item.consumerId || item.id || "").toLowerCase()
              const name = String(item.name || "").toLowerCase()
              const careOf = String(item.careOf || "").toLowerCase()
              const mobile = String(item.mobile || item.mobileNumber || "").toLowerCase()
              const meter = String(item.meterNo || item.meter || "").toLowerCase()
              const addr = String(item.address || "").toLowerCase()
              const zone = String(item.zone || "").toLowerCase()

              if (id.includes(q) || name.includes(q) || careOf.includes(q) || mobile.includes(q) || meter.includes(q) || addr.includes(q) || zone.includes(q)) {
                found.push({
                  moduleId: "consumer-master",
                  moduleName: "Master DB",
                  icon: Users,
                  badgeBg: "bg-teal-50",
                  badgeText: "text-teal-700",
                  badgeBorder: "border-teal-200",
                  id: item.consumerId || item.id || "",
                  consumerId: item.consumerId || item.id || "",
                  meterNo: item.meterNo,
                  name: item.name || "Consumer",
                  status: item.baseClass || item.zone || "Master Record",
                  statusColor: "bg-teal-100 text-teal-800 border-teal-200",
                  address: item.address || item.zone,
                  mobile: item.mobile || item.mobileNumber,
                  extra: item
                })
              }
            }
          }
        }

        setResults(found.slice(0, 50)) // Cap to 50 results
      } catch (err) {
        console.error("Global search error:", err)
      } finally {
        setIsSearching(false)
      }
    }, 180)

    return () => clearTimeout(timeoutId)
  }, [query, userRole, JSON.stringify(permissions)])

  return (
    <>
      <div ref={containerRef} className="relative w-full mb-3 sm:mb-4">
        {/* Search Input Bar */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Search className="h-4 w-4" />}
          </div>
          <input
            type="text"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            placeholder="Global Search (ID, Name, Phone, Meter)..."
            className="w-full pl-10 pr-9 py-2.5 sm:py-3 bg-white/95 backdrop-blur-md border-2 border-black hover:border-black rounded-2xl text-xs sm:text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black shadow-[0_4px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] focus:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("")
                setResults([])
                setIsOpen(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-full"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Instant Dropdown Results */}
        {isOpen && query.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white/98 backdrop-blur-xl rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden max-h-[440px] flex flex-col animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Results Header */}
            <div className="px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Local Database Matches
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {results.length} match{results.length === 1 ? "" : "es"}
              </span>
            </div>

            {/* Results List */}
            <div className="overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5 flex-grow">
              {results.length === 0 && !isSearching && (
                <div className="py-8 text-center px-4">
                  <p className="text-xs font-semibold text-slate-700">No records found for &ldquo;{query}&rdquo;</p>
                  <p className="text-[11px] text-slate-400 mt-1">Make sure the record exists in your downloaded modules</p>
                </div>
              )}

              {results.map((item, index) => {
                const Icon = item.icon
                const itemConsumerId = item.consumerId || (item.id && /^\d{5,}$/.test(item.id) ? item.id : null)

                return (
                  <div
                    key={`${item.moduleId}-${item.id}-${index}`}
                    onClick={() => handleSelectResult(item)}
                    className="p-3 bg-white hover:bg-slate-50/90 rounded-xl cursor-pointer transition-all duration-150 flex flex-col gap-2 group select-none border border-slate-200/70 hover:border-indigo-200 shadow-2xs hover:shadow-xs"
                  >
                    {/* Top Meta Line: Module Tag + ID / CA / Meter + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Module Pill */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${item.badgeBg} ${item.badgeText} ${item.badgeBorder}`}>
                          <Icon className="h-3 w-3" />
                          <span>{item.moduleName}</span>
                        </span>

                        {/* ID / Code Badge */}
                        {item.consumerId ? (
                          <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                            {item.consumerId}
                          </span>
                        ) : item.caNo ? (
                          <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                            CA: {item.caNo}
                          </span>
                        ) : item.meterNo ? (
                          <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                            Meter: {item.meterNo}
                          </span>
                        ) : null}
                      </div>

                      {/* Status Pill */}
                      {item.status && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${item.statusColor || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                          {item.status}
                        </span>
                      )}
                    </div>

                    {/* Middle Line: Consumer / Center Name & Amount */}
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {item.name}
                      </h4>
                      {item.amount && (
                        <span className="text-xs font-extrabold text-slate-900 shrink-0">
                          ₹{item.amount}
                        </span>
                      )}
                    </div>

                    {/* Bottom Line: Address, Mobile & Quick Actions */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-3 truncate min-w-0">
                        {item.address && (
                          <span className="flex items-center gap-1 truncate text-slate-500 text-[10px] sm:text-[11px]">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{item.address}</span>
                          </span>
                        )}
                        {item.mobile && (
                          <span className="flex items-center gap-1 text-slate-500 shrink-0 text-[10px] sm:text-[11px]">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{item.mobile}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Quick OSD Button (Only for Non-Agency authorized roles) */}
                        {canAccessOsd && itemConsumerId && (
                          <button
                            onClick={(e) => handleOpenOsd(itemConsumerId, e)}
                            title="Check Live OSD on WBSEDCL"
                            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer shadow-2xs"
                          >
                            <FileCheck2 className="h-3 w-3" />
                            <span>Check OSD</span>
                          </button>
                        )}
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
                          <span>Open</span>
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-all" />
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Floating OSD Details Popup Dialog */}
      {canAccessOsd && (
        <OsdDetailsDialog
          open={showOsdModal}
          onOpenChange={setShowOsdModal}
          initialConsumerId={osdTargetId}
        />
      )}
    </>
  )
}
