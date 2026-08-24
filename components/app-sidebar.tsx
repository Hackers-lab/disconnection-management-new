"use client"

import {
  Zap,             // For Disconnection
  RotateCcw,       // For Reconnection (Reissue)
  ClipboardCheck,  // For NSC Inspection
  LayoutDashboard, // For Dashboard
  Menu,
  Settings,
  UserX,
  BarChart3,       // For Analysis
  Users,           // For Consumer Master
  RadioTower,      // For DTR Verification
  Brush,            // For DTR Painting
  Package,
  FileCheck2,
  Gauge,
  ShieldAlert,
  RefreshCw,
  Building2,
  Camera,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import { Badge } from "@/components/ui/badge"
import { matchesAgency } from "@/lib/permission-utils"

// Define the available views
export type ViewType = "disconnection" | "reconnection" | "deemed" | "nsc" | "meter" | "admin" | "home" | "analysis" | "agency-updates" | "consumer-master" | "dtr" | "meter-replacement" | "dtr-painting" | "material" | "profile" | "osd" | "spotai" | "safety" | "misc-inspection" | "icds" | "gis-camera"

interface AppSidebarProps {
  activeView: ViewType
  setActiveView: (view: ViewType | "home") => void
  userRole: string
  isMobile?: boolean
  agencies?: string[]
  permissions?: Record<string, string[]>
}

export function AppSidebar({ activeView, setActiveView, userRole, isMobile = false, agencies = [], permissions }: AppSidebarProps) {
  const [open, setOpen] = useState(false)
  const [ddPendingCount, setDdPendingCount] = useState(0)
  const [disconnectionPendingCount, setDisconnectionPendingCount] = useState(0)
  const [meterPendingCount, setMeterPendingCount] = useState(0)
  const [safetyPendingCount, setSafetyPendingCount] = useState(0)
  const [miscPendingCount, setMiscPendingCount] = useState(0)
  const [icdsPendingCount, setIcdsPendingCount] = useState(0)
  const [loadingCounts, setLoadingCounts] = useState<Record<string, boolean>>({
    disconnection: true,
    deemed: true,
    meter: true,
    safety: true,
    "misc-inspection": true,
    icds: true,
  })

  // Helper calculators for module counts from IndexedDB
  const upperAgencies = (agencies || []).map((a) => a.trim()).filter(Boolean)

  const loadIcdsFromCache = async () => {
    try {
      let cached = await getFromCache<any[]>("icds_data_cache")
      if (!cached || !Array.isArray(cached) || cached.length === 0) {
        const res = await fetch("/api/icds")
        if (res.ok) {
          const freshData = await res.json()
          if (Array.isArray(freshData)) {
            cached = freshData
            await saveToCache("icds_data_cache", freshData)
          }
        }
      }

      if (cached && Array.isArray(cached)) {
        const isAgency = userRole === "agency"
        const count = cached.filter((r) => {
          if (isAgency && r.assignedAgency) {
            const recAgency = String(r.assignedAgency || "").trim()
            if (upperAgencies.length > 0 && !upperAgencies.some((ua) => matchesAgency(recAgency, ua))) {
              return false
            }
          }
          return r.stage !== "COMPLETED"
        }).length
        setIcdsPendingCount(count)
        return true
      }
      return false
    } catch (e) {
      console.error("Error loading ICDS counts in sidebar:", e)
      return false
    } finally {
      setLoadingCounts((prev) => ({ ...prev, icds: false }))
    }
  }

  const loadSafetyFromCache = async () => {
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
      return true
    }
    return false
  }

  const loadMiscFromCache = async () => {
    const cached = await getFromCache<any[]>("misc_inspection_cache")
    if (cached && Array.isArray(cached)) {
      const count = cached.filter(r => {
        if (userRole !== "admin" && userRole !== "viewer" && userRole !== "executive" && r.agency) {
          if (!upperAgencies.includes((r.agency || "").trim().toUpperCase())) return false
        }
        return r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS"
      }).length
      setMiscPendingCount(count)
      return true
    }
    return false
  }

  const loadDdFromCache = async () => {
    const data = await getFromCache<any[]>("dd_data_cache")
    if (data && Array.isArray(data)) {
      const count = data.filter(d => {
        const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
        if (!isPending) return false
        if (userRole === "admin" || userRole === "viewer") return true
        return upperAgencies.includes((d.agency || "").toUpperCase())
      }).length
      setDdPendingCount(count)
      return true
    }
    return false
  }

  const loadDisconnectionFromCache = async () => {
    const consumerData = await getFromCache<ConsumerData[]>("consumers_data_cache")
    if (consumerData && Array.isArray(consumerData)) {
      const count = consumerData.filter(c => {
        const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
        if (!isConnected) return false
        if (userRole === "admin" || userRole === "viewer") return true
        return upperAgencies.includes((c.agency || "").toUpperCase())
      }).length
      setDisconnectionPendingCount(count)
      return true
    }
    return false
  }

  const loadMeterFromCache = async () => {
    const isAgency = userRole === "agency"
    const cacheKey = isAgency ? "meter_issues_cache" : "meter_stock_cache"
    const meterCached = await getFromCache<any>(cacheKey)
    if (meterCached) {
      const meterIssues: any[] = isAgency ? (Array.isArray(meterCached) ? meterCached : []) : (meterCached.issues || [])
      const count = meterIssues.filter((i: any) => {
        if (isAgency) {
          if (i.status !== "issued") return false
          return upperAgencies.includes((i.agency || "").trim().toUpperCase())
        } else {
          return i.status === "installation_done" || (i.purpose === "slow_fast" && i.checkMeterStatus !== "finalized" && i.status !== "returned")
        }
      }).length
      const mrCached = await getFromCache<any[]>("meter_replacement_data_cache")
      const repCount = (mrCached || []).filter((r: any) => {
        if ((r.status || "").toLowerCase() !== "proposed") return false
        if (isAgency) return false
        return true
      }).length
      setMeterPendingCount(count + repCount)
      return true
    }
    return false
  }

  // Fetch pending counts
  useEffect(() => {
    let active = true
    async function initCounts() {
      try {
        await Promise.all([
          loadIcdsFromCache(),
          loadSafetyFromCache(),
          loadMiscFromCache(),
          loadDdFromCache(),
          loadDisconnectionFromCache(),
          loadMeterFromCache(),
        ])
      } catch (e) {
        console.error("Failed to load counts", e)
      }
    }

    initCounts()

    // Listen for module-specific cache updates to update only the changed module's badge
    const handleCacheUpdate = (e: Event) => {
      if (!active) return
      const key = (e as CustomEvent).detail?.key
      if (!key) return

      if (key === "icds_data_cache") {
        loadIcdsFromCache()
      } else if (key === "safety_data_cache") {
        loadSafetyFromCache()
      } else if (key === "misc_inspection_cache") {
        loadMiscFromCache()
      } else if (key === "dd_data_cache") {
        loadDdFromCache()
      } else if (key === "consumers_data_cache") {
        loadDisconnectionFromCache()
      } else if (key === "meter_stock_cache" || key === "meter_issues_cache" || key === "meter_replacement_data_cache") {
        loadMeterFromCache()
      }
    }

    window.addEventListener("badge_cache_updated", handleCacheUpdate)
    return () => {
      active = false
      window.removeEventListener("badge_cache_updated", handleCacheUpdate)
    }
  }, [userRole, JSON.stringify(agencies)])

  const menuItems = [
    { 
      id: "home", 
      label: "Dashboard Home", 
      icon: LayoutDashboard,
    },
    { 
      id: "disconnection", 
      label: "Disconnection List", 
      icon: Zap,
    },
    { 
      id: "reconnection", 
      label: "Reconnection", 
      icon: RotateCcw,
    },
    { 
      id: "deemed", 
      label: "Deemed Visit", 
      icon: UserX, 
    },
    {
      id: "meter",
      label: userRole === "agency" ? "Meter Installation" : "Meter Management",
      icon: Gauge,
    },
    {
      id: "nsc",
      label: "NSC Inspection",
      icon: ClipboardCheck,
    },
    {
      id: "consumer-master",
      label: "Consumer Master",
      icon: Users,
    },
    {
      id: "dtr",
      label: "DTR Verification",
      icon: RadioTower,
    },
    {
      id: "dtr-painting",
      label: "DTR Painting",
      icon: Brush,
    },
    {
      id: "safety",
      label: "Safety Inspection",
      icon: ShieldAlert,
    },
    {
      id: "misc-inspection",
      label: "Misc Inspections",
      icon: ClipboardCheck,
    },
    {
      id: "icds",
      label: "ICDS Electrification",
      icon: Building2,
    },
    {
      id: "meter-replacement",
      label: "Replacement List",
      icon: ClipboardCheck,
    },
    {
      id: "material",
      label: "Material Management",
      icon: Package,
    },
    {
      id: "osd",
      label: "Live OSD Check",
      icon: Zap,
    },
    {
      id: "gis-camera",
      label: "GIS Camera",
      icon: Camera,
    },
    // Only show Admin Panel button here if you want it in the menu
    {
      id: "admin",
      label: "Admin Settings",
      icon: Settings,
    }
  ]

  const handleSelect = (view: string) => {
    setActiveView(view as ViewType)
    setOpen(false) // Close mobile menu on select
  }

  const MenuList = () => (
    <div className="flex flex-col space-y-2 py-4">
      {menuItems.map((item) => {
        const permKey = item.id.replace(/-/g, "_")
        const hasAccess = userRole === "admin" || userRole === "superuser" || item.id === "home" || item.id === "osd" || (permissions && (
          (permissions[item.id] && permissions[item.id].length > 0) || 
          (permissions[permKey] && permissions[permKey].length > 0) ||
          permissions[item.id]?.includes("read") || 
          permissions[permKey]?.includes("read") ||
          (item.id === "material" && permissions[item.id]?.length > 0) ||
          (item.id === "dtr-painting" && (permissions["dtr"]?.includes("read") || permissions["dtr"]?.includes("update")))
        ))
        if (!hasAccess) {
          return null
        }

        const Icon = item.icon
        const isActive = activeView === item.id

        return (
          <Button
            key={item.id}
            variant={isActive ? "secondary" : "ghost"}
            className={`justify-between ${isActive ? "bg-blue-100 text-blue-700" : "text-gray-600"}`}
            onClick={() => handleSelect(item.id)}
          >
            <div className="flex items-center">
              <Icon className="mr-2 h-4 w-4" />
              {item.label}
            </div>
            {item.id === "disconnection" && (
              <Badge variant={disconnectionPendingCount > 0 ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                {disconnectionPendingCount}
              </Badge>
            )}
            {item.id === "deemed" && (
              <Badge variant={ddPendingCount > 0 ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                {ddPendingCount}
              </Badge>
            )}
            {item.id === "meter" && (
              <Badge variant={meterPendingCount > 0 ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                {meterPendingCount}
              </Badge>
            )}
            {item.id === "safety" && (
              <Badge variant={safetyPendingCount > 0 ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                {safetyPendingCount}
              </Badge>
            )}
            {item.id === "misc-inspection" && (
              <Badge variant={miscPendingCount > 0 ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                {miscPendingCount}
              </Badge>
            )}
            {item.id === "icds" && (
              <Badge variant={icdsPendingCount > 0 ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                {icdsPendingCount}
              </Badge>
            )}
          </Button>
        )
      })}
    </div>
  )

  // MOBILE VIEW: Return a Hamburger Button that opens a Sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[250px] sm:w-[300px]">
          <SheetHeader>
            <SheetTitle className="text-left flex items-center">
              <LayoutDashboard className="w-5 h-5 mr-2 text-blue-600" />
              Menu
            </SheetTitle>
          </SheetHeader>
          <MenuList />
        </SheetContent>
      </Sheet>
    )
  }

  // DESKTOP VIEW: Return a static Sidebar
  return (
    <div className="hidden md:flex flex-col w-64 border-r bg-white h-screen fixed left-0 top-0 pt-16 px-4">
       <div className="text-xs font-semibold text-gray-400 mb-4 uppercase tracking-wider">Apps</div>
       <MenuList />
    </div>
  )
}