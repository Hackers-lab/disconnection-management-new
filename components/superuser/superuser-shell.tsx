"use client"

import { useState, useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { logout } from "@/app/actions/auth"
import type { SuperadminTab } from "./types"
import {
  Building2,
  Users,
  UserCheck,
  TrendingUp,
  CreditCard,
  Layers,
  Flame,
  ShieldAlert,
  Sparkles,
  LogOut,
  Plus,
  UserPlus,
  Bell,
  RefreshCw,
  FileSpreadsheet,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from "lucide-react"

interface NavItemConfig {
  id: SuperadminTab
  label: string
  shortLabel: string
  description: string
  group: "operations" | "billing" | "telemetry"
  icon: typeof Building2
  accentBg: string
  accentText: string
  accentRing: string
  badgeText?: string
  badgeVariant?: "default" | "live" | "warn"
}

interface SuperuserShellProps {
  activeTab: SuperadminTab
  onTabChange: (tab: SuperadminTab) => void
  hasLoadedData: boolean
  isLoadingData: boolean
  tenantCount: number
  registrationCount: number
  onlineUserCount: number | null
  vercelSpikeCount: number | null
  masterSheetId: string
  onLoadData: () => void
  onOpenAddTenant: () => void
  onOpenAddUser: () => void
  onOpenBroadcast: () => void
  children: ReactNode
}

const SIDEBAR_STORAGE_KEY = "sa_sidebar_collapsed"

const GROUP_LABELS: Record<"operations" | "billing" | "telemetry", string> = {
  operations: "Operations",
  billing: "Revenue & Billing",
  telemetry: "System Telemetry",
}

export function SuperuserShell({
  activeTab,
  onTabChange,
  hasLoadedData,
  isLoadingData,
  tenantCount,
  registrationCount,
  onlineUserCount,
  vercelSpikeCount,
  masterSheetId,
  onLoadData,
  onOpenAddTenant,
  onOpenAddUser,
  onOpenBroadcast,
  children,
}: SuperuserShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleSignOut = async () => {
    if (loggingOut) return
    setMobileMenuOpen(false)
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (saved === "true") setCollapsed(true)
    } catch {
      // Ignore storage access errors
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      } catch {
        // Ignore storage errors
      }
      return next
    })
  }

  const navItems: NavItemConfig[] = [
    {
      id: "overview",
      label: "Care Centers",
      shortLabel: "CCCs",
      description: "Supply registry, credentials & setup health",
      group: "operations",
      icon: Building2,
      accentBg: "bg-blue-600",
      accentText: "text-blue-600",
      accentRing: "bg-blue-50 text-blue-700 border-blue-200/80",
      badgeText: hasLoadedData ? String(tenantCount) : undefined,
    },
    {
      id: "registrations",
      label: "Registrations",
      shortLabel: "Signups",
      description: "Self-registered CCC onboarding log",
      group: "operations",
      icon: UserCheck,
      accentBg: "bg-violet-600",
      accentText: "text-violet-600",
      accentRing: "bg-violet-50 text-violet-700 border-violet-200/80",
      badgeText: hasLoadedData ? String(registrationCount) : "Log",
    },
    {
      id: "agency_tracker",
      label: "Agency Profiles",
      shortLabel: "Agencies",
      description: "Vendor ID & mobile profile compliance",
      group: "operations",
      icon: ShieldAlert,
      accentBg: "bg-indigo-600",
      accentText: "text-indigo-600",
      accentRing: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    },
    {
      id: "revenue_analytics",
      label: "Revenue Check",
      shortLabel: "Revenue",
      description: "Monthly audit, renewals & cohort metrics",
      group: "billing",
      icon: TrendingUp,
      accentBg: "bg-emerald-600",
      accentText: "text-emerald-600",
      accentRing: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
      badgeText: "Audit",
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      shortLabel: "Billing",
      description: "Razorpay plans, free passes & renewals",
      group: "billing",
      icon: CreditCard,
      accentBg: "bg-amber-600",
      accentText: "text-amber-600",
      accentRing: "bg-amber-50 text-amber-700 border-amber-200/80",
    },
    {
      id: "online_users",
      label: "Online Users",
      shortLabel: "Online",
      description: "Live active sessions & presence radar",
      group: "telemetry",
      icon: Users,
      accentBg: "bg-emerald-600",
      accentText: "text-emerald-600",
      accentRing: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
      badgeText: onlineUserCount !== null ? String(onlineUserCount) : "Live",
      badgeVariant: onlineUserCount !== null && onlineUserCount > 0 ? "live" : "default",
    },
    {
      id: "module_versions",
      label: "Module Sync",
      shortLabel: "Sync KV",
      description: "Cross-CCC module version & update heatmap",
      group: "telemetry",
      icon: Layers,
      accentBg: "bg-sky-600",
      accentText: "text-sky-600",
      accentRing: "bg-sky-50 text-sky-700 border-sky-200/80",
      badgeText: "KV",
    },
    {
      id: "vercel_usage",
      label: "Vercel Quota",
      shortLabel: "Quota",
      description: "Infrastructure bandwidth, limits & spikes",
      group: "telemetry",
      icon: Flame,
      accentBg: "bg-orange-600",
      accentText: "text-orange-600",
      accentRing: "bg-orange-50 text-orange-700 border-orange-200/80",
      badgeText:
        vercelSpikeCount !== null && vercelSpikeCount > 0
          ? `${vercelSpikeCount} alert`
          : "OK",
      badgeVariant: vercelSpikeCount !== null && vercelSpikeCount > 0 ? "warn" : "default",
    },
  ]

  const currentNav = navItems.find((item) => item.id === activeTab) || navItems[0]
  const CurrentIcon = currentNav.icon

  const handleSelectNav = (tab: SuperadminTab) => {
    onTabChange(tab)
    setMobileMenuOpen(false)
  }

  const renderNavGroups = (isCompact: boolean) => {
    const groups: Array<"operations" | "billing" | "telemetry"> = [
      "operations",
      "billing",
      "telemetry",
    ]
    return (
      <div className="space-y-4">
        {groups.map((group) => {
          const items = navItems.filter((item) => item.group === group)
          return (
            <div key={group} className="space-y-1">
              {!isCompact ? (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {GROUP_LABELS[group]}
                </div>
              ) : (
                <div className="mx-auto my-2 h-px w-7 bg-slate-200/80" />
              )}
              {items.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectNav(item.id)}
                    title={isCompact ? `${item.label} — ${item.description}` : undefined}
                    className={`group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all cursor-pointer interactive-tap ${
                      isCompact ? "justify-center px-0 py-2.5" : ""
                    } ${
                      isActive
                        ? `${item.accentRing} border font-semibold shadow-2xs`
                        : "border border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? `${item.accentBg} text-white shadow-xs`
                          : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-800"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    {!isCompact && (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold leading-tight">
                            {item.label}
                          </div>
                          <div
                            className={`truncate text-[10px] leading-tight mt-0.5 ${
                              isActive ? "opacity-80" : "text-slate-400"
                            }`}
                          >
                            {item.description}
                          </div>
                        </div>
                        {item.badgeText && (
                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono inline-flex items-center gap-1 ${
                              item.badgeVariant === "live"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : item.badgeVariant === "warn"
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : isActive
                                ? "bg-white/80 text-slate-800 border border-black/5"
                                : "bg-slate-100 text-slate-600 border border-slate-200/80"
                            }`}
                          >
                            {item.badgeVariant === "live" && (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                            {item.badgeText}
                          </span>
                        )}
                      </>
                    )}

                    {isCompact && item.badgeVariant === "warn" && (
                      <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
                    )}
                    {isCompact && item.badgeVariant === "live" && (
                      <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900 flex relative overflow-x-clip">
      {/* Subtle Ambient Background Accents */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-400/[0.06] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[28rem] h-[28rem] bg-indigo-400/[0.05] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* DESKTOP LEFT SIDEBAR */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen bg-white border-r border-slate-200/80 z-40 transition-all duration-200 ease-out ${
          collapsed ? "w-[74px]" : "w-[260px]"
        }`}
      >
        {/* Brand Crest */}
        <div
          className={`h-14 border-b border-slate-200/80 flex items-center shrink-0 ${
            collapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-800 text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="h-4 w-4 text-sky-300" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm font-extrabold tracking-tight text-slate-900 truncate">
                  Superadmin
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      hasLoadedData ? "bg-emerald-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="truncate">
                    {hasLoadedData ? `Synced • ${tenantCount} CCCs` : "Standby Mode"}
                  </span>
                </div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3.5 custom-scrollbar">
          {renderNavGroups(collapsed)}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-slate-200/80 p-2.5 space-y-1.5 bg-slate-50/60 shrink-0">
          {masterSheetId && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${masterSheetId}`}
              target="_blank"
              rel="noreferrer"
              title="Open Master Config Google Spreadsheet"
              className={`flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-800 text-xs font-semibold transition-colors ${
                collapsed ? "justify-center p-2" : "px-3 py-2"
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1">Master Sheet</span>
                  <ExternalLink className="h-3 w-3 text-emerald-600/80 shrink-0" />
                </>
              )}
            </a>
          )}

          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex w-full items-center justify-center rounded-xl p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors cursor-pointer"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSignOut}
            disabled={loggingOut}
            title="Sign out of Superadmin"
            className={`flex w-full items-center gap-2 rounded-xl border border-rose-200/80 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
              collapsed ? "justify-center p-2" : "px-3 py-2"
            }`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* TOP COMMAND BAR */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
          <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
            {/* Left: Mobile Drawer Trigger + Active Section Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="lg:hidden h-9 w-9 rounded-xl border-slate-200 bg-white text-slate-700 shrink-0"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[285px] p-0 bg-white border-r border-slate-200 flex flex-col">
                  <SheetHeader className="h-14 px-4 border-b border-slate-200/80 flex flex-row items-center justify-between space-y-0">
                    <SheetTitle className="flex items-center gap-2.5 text-sm font-extrabold text-slate-900">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-800 text-white flex items-center justify-center shadow-sm">
                        <Sparkles className="h-4 w-4 text-sky-300" />
                      </div>
                      <div className="text-left">
                        <div>Superadmin</div>
                        <div className="text-[10px] font-medium text-slate-500">
                          {hasLoadedData ? `Synced • ${tenantCount} CCCs` : "Standby Mode"}
                        </div>
                      </div>
                    </SheetTitle>
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto px-3 py-4">
                    {renderNavGroups(false)}
                  </div>

                  <div className="border-t border-slate-200/80 p-3 space-y-2 bg-slate-50/70">
                    {masterSheetId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${masterSheetId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="flex-1">Open Master Sheet</span>
                        <ExternalLink className="h-3 w-3 text-emerald-600" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={loggingOut}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 cursor-pointer disabled:opacity-60"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>

              <div
                className={`hidden sm:flex h-8 w-8 rounded-xl items-center justify-center shrink-0 text-white shadow-2xs ${currentNav.accentBg}`}
              >
                <CurrentIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {currentNav.label}
                  </h1>
                  {hasLoadedData && (
                    <Badge
                      variant="outline"
                      className="hidden md:inline-flex bg-slate-50 border-slate-200 text-slate-600 text-[10px] font-mono px-1.5 py-0"
                    >
                      {tenantCount} CCCs
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate hidden sm:block">
                  {currentNav.description}
                </p>
              </div>
            </div>

            {/* Right: Streamlined Quick Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onLoadData}
                disabled={isLoadingData}
                className="h-8 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 rounded-lg font-medium shadow-2xs cursor-pointer"
                title={hasLoadedData ? "Refresh Care Centers & Stats" : "Load Live Care Center Data"}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    isLoadingData ? "animate-spin text-blue-600" : "text-slate-500"
                  }`}
                />
                <span className="ml-1.5 hidden sm:inline">
                  {hasLoadedData ? "Refresh" : "Load Data"}
                </span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenBroadcast}
                className="h-8 text-xs border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2.5 rounded-lg font-semibold shadow-2xs cursor-pointer"
                title="Send Push Notification Broadcast"
              >
                <Bell className="h-3.5 w-3.5 text-emerald-600 sm:mr-1" />
                <span className="hidden md:inline">Broadcast</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={onOpenAddTenant}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2.5 sm:px-3 rounded-lg shadow-2xs cursor-pointer"
                title="Register New Care Center (CCC)"
              >
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Add CCC</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={onOpenAddUser}
                className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold px-2.5 sm:px-3 rounded-lg shadow-2xs cursor-pointer"
                title="Create User Account"
              >
                <UserPlus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Add User</span>
              </Button>

              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="lg:hidden shrink-0 h-8 w-8 rounded-lg text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 cursor-pointer"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Mobile & Tablet Horizontal Quick-Switch Pill Bar */}
          <div className="lg:hidden border-t border-slate-100 px-3 py-2 overflow-x-auto flex items-center gap-1.5 no-scrollbar bg-slate-50/70">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? `${item.accentBg} text-white shadow-xs`
                      : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.shortLabel}</span>
                  {item.badgeText && item.badgeVariant === "live" && (
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        isActive ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {item.badgeText}
                    </span>
                  )}
                  {item.badgeText && item.badgeVariant === "warn" && (
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        isActive ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      !
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </header>

        {/* MAIN VIEWPORT */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 py-4 sm:px-6 sm:py-5">
          {children}
        </main>
      </div>

      {loggingOut &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl px-7 py-6 flex flex-col items-center gap-3.5 max-w-xs w-full text-center">
              <div className="relative h-12 w-12 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">Signing out of Superadmin...</p>
                <p className="text-xs text-slate-500">Closing your session securely</p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
