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
    <>
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
      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-hidden ${
        activeView === "home" ? "py-6 bg-gradient-to-b from-slate-50/80 via-slate-100/40 to-slate-50/80 rounded-3xl" : "pt-2 pb-6"
      }`}>
        {/* Render whatever is passed as children (Menu, List, etc.) */}
        {children} 

        {/* Real-time Visitor Count & Live Users in simple text at the bottom */}
        <div className="py-4 mt-6 border-t border-slate-200/60">
          <VisitorLiveCounter activeModule={activeView} />
        </div>
      </main>
    </>
  )
}