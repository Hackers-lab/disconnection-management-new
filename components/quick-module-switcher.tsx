"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Search, LayoutDashboard, ArrowRight, CornerDownLeft, Clock } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ViewType } from "@/components/app-sidebar"
import {
  MODULE_CATALOG,
  MODULE_CATEGORIES,
  canAccessModule,
  getRecentModules,
} from "@/lib/module-catalog"

interface QuickModuleSwitcherProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeView: ViewType | "home"
  onSelect: (view: ViewType | "home") => void
  userRole: string
  permissions?: Record<string, string[]>
}

export function QuickModuleSwitcher({
  open,
  onOpenChange,
  activeView,
  onSelect,
  userRole,
  permissions,
}: QuickModuleSwitcherProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<ViewType[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      setRecentIds(getRecentModules())
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  const accessibleItems = useMemo(() => {
    const homeItem = {
      id: "home" as ViewType,
      title: "Dashboard Home",
      description: "Return to the main module overview",
      icon: LayoutDashboard,
      category: "operations" as const,
      keywords: ["home", "dashboard", "start", "menu"],
    }

    const modules = MODULE_CATALOG.filter((m) => canAccessModule(m.id, userRole, permissions)).map(
      (m) => ({
        ...m,
        title: userRole === "agency" && m.agencyTitle ? m.agencyTitle : m.title,
        description: userRole === "agency" && m.agencyDescription ? m.agencyDescription : m.description,
      })
    )

    return [homeItem, ...modules]
  }, [userRole, permissions])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // Put recent modules first (after Dashboard Home) for rapid recall
      const recentSet = new Set(recentIds)
      const recentOrdered = recentIds
        .map((id) => accessibleItems.find((item) => item.id === id))
        .filter(Boolean) as typeof accessibleItems
      const rest = accessibleItems.filter((item) => !recentSet.has(item.id))
      return [...recentOrdered, ...rest]
    }

    return accessibleItems.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q))
      )
    })
  }, [query, accessibleItems, recentIds])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleSelect = (id: ViewType) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    onSelect(id)
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(filteredItems.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + Math.max(filteredItems.length, 1)) % Math.max(filteredItems.length, 1))
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault()
      handleSelect(filteredItems[selectedIndex].id)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl">
        <DialogTitle className="sr-only">Quick Module Switcher</DialogTitle>

        {/* Search Input Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to any module (e.g. Disconnection, Meter, NSC, Safety)..."
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-8 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No modules matching <span className="font-semibold text-slate-600">"{query}"</span>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon
              const isSelected = idx === selectedIndex
              const isCurrent = activeView === item.id
              const isRecent = !query.trim() && recentIds.includes(item.id)
              const cat = MODULE_CATEGORIES.find((c) => c.id === item.category)

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer interactive-tap ${
                    isSelected
                      ? "bg-blue-50/90 text-blue-950 ring-1 ring-blue-200/80"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : isCurrent
                          ? "bg-blue-50 text-blue-600 border-blue-200"
                          : "bg-slate-100/80 text-slate-600 border-slate-200/70"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{item.title}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            Current
                          </span>
                        )}
                        {isRecent && !isCurrent && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-slate-400">
                            <Clock className="h-2.5 w-2.5" />
                            Recent
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {item.id === "home" ? item.description : `${cat?.label || ""} • ${item.description}`}
                      </p>
                    </div>
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 shrink-0 transition-all duration-150 ${
                      isSelected ? "text-blue-600 translate-x-0.5 opacity-100" : "text-slate-300 opacity-0"
                    }`}
                  />
                </button>
              )
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="hidden sm:flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/70 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">↑↓</kbd>
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono inline-flex items-center">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              Open
            </span>
          </div>
          <span>Shortcut: Ctrl/⌘ + K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
