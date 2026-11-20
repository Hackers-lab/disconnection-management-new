import {
  Zap,
  RotateCcw,
  UserX,
  PowerOff,
  RadioTower,
  Brush,
  ShieldAlert,
  ClipboardList,
  Building2,
  Gauge,
  FilePlus2,
  ArrowLeftRight,
  Package,
  Users,
  ReceiptIndianRupee,
  Camera,
  Settings,
  LayoutDashboard,
  BarChart3,
  CalendarDays,
  User,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import type { ViewType } from "@/components/app-sidebar"

export type ModuleCategory = "operations" | "field" | "assets" | "tools"

export interface ModuleCategoryMeta {
  id: ModuleCategory
  label: string
  description: string
  accentDot: string
}

export const MODULE_CATEGORIES: ModuleCategoryMeta[] = [
  {
    id: "operations",
    label: "Revenue & Recovery",
    description: "Disconnection, reconnection & defaulter tracking",
    accentDot: "bg-blue-500",
  },
  {
    id: "field",
    label: "Field Inspections & Safety",
    description: "DTR audits, painting, safety & site visits",
    accentDot: "bg-amber-500",
  },
  {
    id: "assets",
    label: "Connections, Meters & Store",
    description: "NSC, ICDS, meter stock, replacements & materials",
    accentDot: "bg-emerald-500",
  },
  {
    id: "tools",
    label: "Consumer Lookup & Tools",
    description: "Master database, live dues, camera & admin",
    accentDot: "bg-slate-500",
  },
]

export type ModuleAccent =
  | "red"
  | "blue"
  | "orange"
  | "rose"
  | "amber"
  | "cyan"
  | "violet"
  | "purple"
  | "emerald"
  | "indigo"
  | "teal"
  | "sky"
  | "fuchsia"
  | "slate"

export interface ModuleCatalogItem {
  id: ViewType
  title: string
  agencyTitle?: string
  description: string
  agencyDescription?: string
  icon: LucideIcon
  category: ModuleCategory
  /** Distinct per-module signature accent color so adjacent home cards stand apart at a glance */
  accent: ModuleAccent
  /** Short human label appended next to count badges (e.g. "pending", "low stock", "records") */
  badgeUnit?: string
  /** Whether this module displays a numeric count badge */
  hasCount?: boolean
  /** Mark critical modules that surface into Needs Attention at a lower threshold */
  criticalThreshold?: number
  keywords: string[]
}

export const MODULE_CATALOG: ModuleCatalogItem[] = [
  // Revenue & Recovery
  {
    id: "disconnection",
    title: "Disconnection",
    description: "Manage disconnection lists & field status updates",
    icon: Zap,
    category: "operations",
    accent: "red",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["dc", "disconnection", "defaulter", "arrears", "connected"],
  },
  {
    id: "reconnection",
    title: "Reconnection",
    description: "Track and restore consumer supply after payment",
    icon: RotateCcw,
    category: "operations",
    accent: "blue",
    badgeUnit: "pending",
    hasCount: true,
    criticalThreshold: 20,
    keywords: ["rc", "reconnection", "restore", "door locked", "overdue"],
  },
  {
    id: "deemed",
    title: "Deemed Visit",
    description: "Verify deemed disconnected consumer premises",
    icon: UserX,
    category: "operations",
    accent: "orange",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["dd", "deemed", "visit", "disconnect"],
  },
  {
    id: "permanent-disconnection",
    title: "Permanent Disconnection",
    description: "Track meter dismantling, Live OSD, GPS & Note Sheets",
    icon: PowerOff,
    category: "operations",
    accent: "rose",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["pd", "permanent", "dismantle", "note sheet"],
  },

  // Field Inspections & Safety
  {
    id: "safety",
    title: "Safety Inspection",
    description: "Report site safety hazards, drawings & PO approvals",
    icon: ShieldAlert,
    category: "field",
    accent: "amber",
    badgeUnit: "open",
    hasCount: true,
    criticalThreshold: 10,
    keywords: ["safety", "hazard", "po", "rectified"],
  },
  {
    id: "dtr",
    title: "DTR Verification",
    description: "Verify transformer existence & record inspection data",
    icon: RadioTower,
    category: "field",
    accent: "cyan",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["dtr", "transformer", "verification"],
  },
  {
    id: "dtr-painting",
    title: "DTR Painting",
    description: "Update DTR structural painting logs & photo proof",
    icon: Brush,
    category: "field",
    accent: "orange",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["painting", "dtr", "transformer", "photo"],
  },
  {
    id: "misc-inspection",
    title: "Misc Inspections",
    description: "Log shifting, meter checks, network & custom site visits",
    icon: ClipboardList,
    category: "field",
    accent: "violet",
    badgeUnit: "open",
    hasCount: true,
    keywords: ["misc", "inspection", "shifting", "network", "site"],
  },

  // Connections, Meters & Store
  {
    id: "meter",
    title: "Meter Management",
    agencyTitle: "Meter Installation",
    description: "Stock tracking, issuance & field installation",
    agencyDescription: "Report installations & view pending meters",
    icon: Gauge,
    category: "assets",
    accent: "purple",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["meter", "stock", "install", "check meter"],
  },
  {
    id: "nsc",
    title: "NSC Management",
    agencyTitle: "NSC Inspection",
    description: "New service connection applications & approvals",
    agencyDescription: "Site inspections for new service connections",
    icon: FilePlus2,
    category: "assets",
    accent: "emerald",
    badgeUnit: "pending",
    hasCount: true,
    keywords: ["nsc", "new connection", "application", "inspection"],
  },
  {
    id: "meter-replacement",
    title: "Replacement List",
    description: "Propose new meter replacements & track progress",
    icon: ArrowLeftRight,
    category: "assets",
    accent: "indigo",
    badgeUnit: "proposed",
    hasCount: true,
    keywords: ["replacement", "meter", "defective", "burnt"],
  },
  {
    id: "icds",
    title: "ICDS Electrification",
    description: "Anganwadi center wiring, smart meters & EDD/49 certificates",
    icon: Building2,
    category: "assets",
    accent: "teal",
    badgeUnit: "active",
    hasCount: true,
    keywords: ["icds", "anganwadi", "electrification", "edd49"],
  },
  {
    id: "material",
    title: "Material Management",
    description: "Track office store materials inward and issuance",
    icon: Package,
    category: "assets",
    accent: "amber",
    badgeUnit: "low stock",
    hasCount: true,
    criticalThreshold: 5,
    keywords: ["material", "store", "stock", "inward", "issue"],
  },

  // Consumer Lookup & Tools
  {
    id: "consumer-master",
    title: "Consumer Master",
    description: "Search consumer details by ID, name or meter",
    icon: Users,
    category: "tools",
    accent: "sky",
    badgeUnit: "records",
    hasCount: true,
    keywords: ["master", "database", "consumer", "search"],
  },
  {
    id: "osd",
    title: "Consumer Details & OSD",
    description: "Live dues, payment receipts, meter readings & bills",
    icon: ReceiptIndianRupee,
    category: "tools",
    accent: "blue",
    hasCount: false,
    keywords: ["osd", "live", "dues", "bill", "payment", "consumer details"],
  },
  {
    id: "gis-camera",
    title: "GIS Camera",
    description: "Geotagged field camera with map & instant watermark",
    icon: Camera,
    category: "tools",
    accent: "fuchsia",
    hasCount: false,
    keywords: ["gis", "camera", "gps", "photo", "watermark"],
  },
  {
    id: "admin",
    title: "Admin Panel",
    description: "Manage users, roles, agencies & system settings",
    icon: Settings,
    category: "tools",
    accent: "slate",
    hasCount: false,
    keywords: ["admin", "settings", "users", "roles", "agencies", "upload"],
  },
]

export function getModuleTitle(view: ViewType | "home", userRole?: string): string {
  if (view === "home") return "Dashboard"
  if (view === "analysis") return "Analysis Dashboard"
  if (view === "agency-updates") return "Agency Updates Report"
  if (view === "profile") return "Account Profile"
  if (view === "spotai") return "SpotAI Intelligence"

  const found = MODULE_CATALOG.find((m) => m.id === view)
  if (!found) return "Dashboard"
  if (userRole === "agency" && found.agencyTitle) return found.agencyTitle
  return found.title
}

export function getModuleIcon(view: ViewType | "home"): LucideIcon {
  if (view === "home") return LayoutDashboard
  if (view === "analysis") return BarChart3
  if (view === "agency-updates") return CalendarDays
  if (view === "profile") return User
  if (view === "spotai") return Sparkles
  const found = MODULE_CATALOG.find((m) => m.id === view)
  return found?.icon || LayoutDashboard
}

export function canAccessModule(
  moduleId: string,
  userRole: string,
  permissions?: Record<string, string[]>
): boolean {
  if (moduleId === "home" || moduleId === "gis-camera") return true
  if (moduleId === "meter-replacement") {
    return userRole === "admin" || userRole === "executive" || userRole === "superuser"
  }
  if (userRole === "admin" || userRole === "superuser") return true
  if (moduleId === "osd") {
    return (
      userRole === "executive" ||
      userRole === "viewer" ||
      userRole === "technical" ||
      userRole === "agency" ||
      Boolean(permissions?.osd && permissions.osd.length > 0)
    )
  }

  const permKey = moduleId.replace(/-/g, "_")
  if (!permissions) return false

  return Boolean(
    (permissions[moduleId] && permissions[moduleId].length > 0) ||
      (permissions[permKey] && permissions[permKey].length > 0) ||
      permissions[moduleId]?.includes("read") ||
      permissions[permKey]?.includes("read") ||
      (moduleId === "material" && permissions[moduleId]?.length > 0) ||
      (moduleId === "dtr-painting" &&
        (permissions["dtr"]?.includes("read") || permissions["dtr"]?.includes("update")))
  )
}

const RECENT_MODULES_KEY = "dm_recent_modules_v1"

export function recordRecentModule(moduleId: ViewType | "home") {
  if (typeof window === "undefined") return
  if (moduleId === "home" || moduleId === "profile" || moduleId === "spotai" || moduleId === "analysis" || moduleId === "agency-updates") {
    return
  }
  try {
    const raw = localStorage.getItem(RECENT_MODULES_KEY)
    const list: string[] = raw ? JSON.parse(raw) : []
    const next = [moduleId, ...list.filter((id) => id !== moduleId)].slice(0, 4)
    localStorage.setItem(RECENT_MODULES_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent("recent-modules-updated", { detail: { recent: next } }))
  } catch {
    // ignore storage quota errors
  }
}

export function getRecentModules(): ViewType[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_MODULES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ViewType[]) : []
  } catch {
    return []
  }
}
