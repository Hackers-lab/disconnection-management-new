// c:\Users\Pc\Documents\GitHub\Disconnection-management-web\components\dashboard-context.tsx

"use client"

import { createContext, useContext } from "react"
import { ViewType } from "@/components/app-sidebar"

interface DashboardContextType {
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function useDashboard() {
  return useContext(DashboardContext)
}

export const DashboardProvider = DashboardContext.Provider
