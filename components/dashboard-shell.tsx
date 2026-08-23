"use client"

import { Header } from "@/components/header"
import { ViewType } from "@/components/app-sidebar"
import { VisitorLiveCounter } from "@/components/visitor-live-counter"

interface DashboardShellProps {
  role: string
  agencies: string[]
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
}

export function DashboardShell({ 
  role, 
  agencies, 
  showAdminPanel, 
  openAdmin, 
  closeAdmin, 
  activeView, 
  setActiveView,
  children,
  onDownload,
  onDownloadExcel,
  onDownloadDefaulters,
  permissions
}: DashboardShellProps) {
  
  return (
    <div className={`bg-[#f8fafc] relative overflow-x-hidden ${
      activeView === "gis-camera" ? "h-[100dvh] overflow-hidden" : "min-h-screen"
    }`}>
      {/* Ambient Aurora Mesh Glow Lights (Apple / Linear style) */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-400/[0.08] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[28rem] h-[28rem] bg-indigo-400/[0.07] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed top-1/3 right-10 w-72 h-72 bg-sky-300/[0.06] rounded-full blur-3xl pointer-events-none -z-10" />

      <Header 
        userRole={role} 
        userAgencies={agencies}
        onAdminClick={(role === "admin" || permissions?.admin?.includes("read")) ? openAdmin : undefined} 
        onDownload={onDownload} 
        onDownloadExcel={onDownloadExcel}
        onDownloadDefaulters={onDownloadDefaulters}
        activeView={activeView}
        setActiveView={setActiveView}
        permissions={permissions}
      />
      <main className={`max-w-7xl mx-auto relative z-10 ${
        activeView === "gis-camera"
          ? "px-1 sm:px-4 h-[calc(100dvh-4rem)] overflow-hidden flex flex-col"
          : activeView === "home"
          ? "px-4 sm:px-6 lg:px-8 py-4 sm:py-6"
          : "px-4 sm:px-6 lg:px-8 pt-2 pb-6"
      }`}>
        {/* Render whatever is passed as children (Menu, List, etc.) */}
        {children} 

        {/* Real-time Visitor Count & Live Users in simple text at the bottom (hidden in GIS Camera) */}
        {activeView !== "gis-camera" && (
          <div className="py-4 mt-6 border-t border-slate-200/60">
            <VisitorLiveCounter activeModule={activeView} />
          </div>
        )}
      </main>
    </div>
  )
}