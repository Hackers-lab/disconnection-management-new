"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, ArrowRight, ShieldAlert, Sparkles, X, Smartphone, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AdminMappingBannerProps {
  onOpenAdmin?: () => void
}

export function AdminMappingBanner({ onOpenAdmin }: AdminMappingBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem("admin_mapping_banner_dismissed")
      if (dismissed === "true") {
        setIsDismissed(true)
      }
    } catch {}
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      sessionStorage.setItem("admin_mapping_banner_dismissed", "true")
    } catch {}
  }

  if (isDismissed) return null

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-600/15 border border-amber-300/60 dark:border-amber-700/60 p-3.5 sm:p-4 shadow-sm backdrop-blur-sm transition-all duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20 shrink-0">
            <Smartphone className="w-5 h-5 stroke-[2.2]" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-400/40">
                <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                Action Required
              </span>
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-900/50">
                ⏳ Deadline: 01-09-2026
              </span>
            </div>

            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Mobile Number & Agency SAP Vendor Code Mapping
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              To prepare for OTP/Mobile login and automated vendor code list assignments from <strong>01-09-2026</strong>, please ensure all <strong>Officers have 10-digit Mobile Numbers</strong> and all <strong>Contractor Agencies have SAP Vendor Codes + Mobile Numbers</strong> mapped in the Admin Panel.
            </p>

            {onOpenAdmin && (
              <div className="pt-1.5">
                <Button
                  size="sm"
                  variant="default"
                  onClick={onOpenAdmin}
                  className="h-7 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Open Admin Panel to Update
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-amber-100/50 dark:hover:bg-amber-950/50 transition-colors shrink-0 cursor-pointer"
          title="Dismiss notice"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
