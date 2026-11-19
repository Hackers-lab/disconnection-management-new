"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/header"
import { AppSidebar, ViewType } from "@/components/app-sidebar"
import { QuickModuleSwitcher } from "@/components/quick-module-switcher"
import { VisitorLiveCounter } from "@/components/visitor-live-counter"
import { PushNotificationManager } from "@/components/push-notification-manager"
import { recordRecentModule } from "@/lib/module-catalog"

interface DashboardShellProps {
  role: string
  agencies: string[]
  userName?: string
  userCccCode?: string
  initialProfile?: any
  showAdminPanel: boolean
  openAdmin: () => void
  closeAdmin: () => void
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
  children: React.ReactNode
  onDownload?: () => void
  onDownloadExcel?: () => void
  onDownloadDefaulters?: () => void
  permissions?: Record<string, string[]>
  isSetupLocked?: boolean
}

const SIDEBAR_COLLAPSED_KEY = "dm_sidebar_collapsed"

export function DashboardShell({
  role,
  agencies,
  userName,
  userCccCode,
  initialProfile,
  showAdminPanel,
  openAdmin,
  closeAdmin,
  activeView,
  setActiveView,
  children,
  onDownload,
  onDownloadExcel,
  onDownloadDefaulters,
  permissions,
  isSetupLocked = false,
}: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (saved === "true") setSidebarCollapsed(true)
    } catch {
      // ignore
    }
  }, [])

  // Record recently visited modules for the Home quick-access strip & Cmd+K palette
  useEffect(() => {
    recordRecentModule(activeView)
  }, [activeView])

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const isFullscreenCamera = activeView === "gis-camera"

  return (
    <div
      className={`bg-[#f8fafc] relative overflow-x-hidden ${
        isFullscreenCamera ? "h-[100dvh] overflow-hidden" : "min-h-screen"
      }`}
    >
      {/* Ambient Aurora Mesh Glow Lights */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-400/[0.07] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[28rem] h-[28rem] bg-indigo-400/[0.06] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed top-1/3 right-10 w-72 h-72 bg-sky-300/[0.05] rounded-full blur-3xl pointer-events-none -z-10" />

      <Header
        userRole={role}
        userAgencies={agencies}
        userName={userName}
        userCccCode={userCccCode}
        initialProfile={initialProfile}
        onAdminClick={role === "admin" || permissions?.admin?.includes("read") ? openAdmin : undefined}
        onDownload={onDownload}
        onDownloadExcel={onDownloadExcel}
        onDownloadDefaulters={onDownloadDefaulters}
        activeView={activeView}
        setActiveView={setActiveView}
        permissions={permissions}
        onOpenQuickSwitcher={isSetupLocked ? undefined : () => setQuickSwitcherOpen(true)}
        isSetupLocked={isSetupLocked}
      />

      {/* Persistent Desktop Sidebar (hidden on fullscreen GIS Camera) */}
      {!isFullscreenCamera && (
        <AppSidebar
          isMobile={false}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          activeView={activeView}
          setActiveView={setActiveView}
          userRole={role}
          agencies={agencies}
          permissions={permissions}
          isSetupLocked={isSetupLocked}
        />
      )}

      {/* Main Content Container shifted smoothly by desktop sidebar width */}
      <div
        className={`transition-[padding-left] duration-200 ease-out ${
          isFullscreenCamera ? "" : sidebarCollapsed ? "md:pl-[70px]" : "md:pl-64"
        }`}
      >
        <main
          className={`max-w-7xl mx-auto relative z-10 ${
            isFullscreenCamera
              ? "px-1 sm:px-4 h-[calc(100dvh-3.5rem)] overflow-hidden flex flex-col"
              : activeView === "home"
              ? "px-3 sm:px-6 lg:px-8 py-4 sm:py-6"
              : "px-3 sm:px-6 lg:px-8 pt-3 pb-8"
          }`}
        >
          {/* Crisp 60fps module transition */}
          <div key={activeView} className="animate-module-zoom">
            {children}
          </div>

          {/* Visitor Count at bottom */}
          {!isFullscreenCamera && (
            <div className="py-4 mt-6 border-t border-slate-200/60">
              <VisitorLiveCounter activeModule={activeView} />
            </div>
          )}
        </main>
      </div>

      {/* Cmd/Ctrl+K Quick Module Switcher */}
      {!isSetupLocked && (
        <QuickModuleSwitcher
          open={quickSwitcherOpen}
          onOpenChange={setQuickSwitcherOpen}
          activeView={activeView}
          onSelect={setActiveView}
          userRole={role}
          permissions={permissions}
        />
      )}

      <PushNotificationManager />
    </div>
  )
}
