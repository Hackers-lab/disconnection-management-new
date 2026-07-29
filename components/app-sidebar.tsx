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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { getFromCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import { Badge } from "@/components/ui/badge"

// Define the available views
export type ViewType = "disconnection" | "reconnection" | "deemed" | "nsc" | "meter" | "admin" | "home" | "analysis" | "agency-updates" | "consumer-master" | "dtr" | "meter-replacement" | "dtr-painting" | "material" | "profile" | "osd" | "safety" | "misc-inspection"

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
  const [loadingCounts, setLoadingCounts] = useState<Record<string, boolean>>({
    disconnection: true,
    deemed: true,
    meter: true,
    safety: true,
    "misc-inspection": true,
  })

  // Fetch pending counts
  useEffect(() => {
    let active = true
    async function fetchCount() {
      try {
        // Consolidated System Counts (Single Edge-cached Request)
        fetch("/api/system/dashboard-counts")
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (active && data) {
              if (typeof data.miscPending === "number") setMiscPendingCount(data.miscPending)
              if (typeof data.safetyPending === "number") setSafetyPendingCount(data.safetyPending)
            }
          })
          .catch(() => {})

        // DD Count
        const data = await getFromCache<any[]>("dd_data_cache")
        if (data && active) {
          const count = data.filter(d => {
            const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
            if (!isPending) return false
            if (userRole === "admin" || userRole === "viewer") return true
            return agencies.map(a => a.toUpperCase()).includes((d.agency || "").toUpperCase())
          }).length
          setDdPendingCount(count)
        }

        // Disconnection Count
        const consumerData = await getFromCache<ConsumerData[]>("consumers_data_cache")
        if (consumerData && active) {
          const count = consumerData.filter(c => {
            const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
            if (!isConnected) return false
            if (userRole === "admin" || userRole === "viewer") return true
            return agencies.map(a => a.toUpperCase()).includes((c.agency || "").toUpperCase())
          }).length
          setDisconnectionPendingCount(count)
        }

        // Meter Pending Count (Aggregated Replacements + Active Installations + Check Meters)
        const isAgency = userRole === "agency"
        const cacheKey = isAgency ? "meter_issues_cache" : "meter_stock_cache"
        const meterCached = await getFromCache<any>(cacheKey)
        const upper = (agencies || []).map((a: string) => a.toUpperCase())
        if (meterCached && active) {
          const meterIssues: any[] = isAgency ? (Array.isArray(meterCached) ? meterCached : []) : (meterCached.issues || [])
          const count = meterIssues.filter((i: any) => {
            if (isAgency) {
              if (i.status !== "issued") return false
              return upper.includes((i.agency || "").trim().toUpperCase())
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
        } else if (active) {
          // Live fallback when cache is cold
          fetch("/api/meters/pending-count")
            .then(res => res.ok ? res.json() : { pendingCount: 0 })
            .then(data => { if (active) setMeterPendingCount(data.pendingCount || 0) })
            .catch(() => {})
        }
      } catch (e) {
        console.error("Failed to load counts", e)
      }
    }
    fetchCount()
    return () => { active = false }
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
      icon: FileCheck2,
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
        const hasAccess = userRole === "admin" || userRole === "superuser" || item.id === "home" || (permissions && (
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