"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  Building2,
  Users,
  MapPin,
  FileSpreadsheet,
  Database,
  X,
  ChevronRight,
  RefreshCw,
  PartyPopper,
} from "lucide-react"

export interface OnboardingStep {
  id: string
  stepNumber: number
  title: string
  description: string
  completed: boolean
  count?: number
  targetView: string
  buttonText: string
}

export interface OnboardingData {
  cccCode: string
  cccName: string
  isLinked: boolean
  steps: OnboardingStep[]
  completedCount: number
  totalSteps: number
  allCompleted: boolean
  progressPercent: number
}

interface OnboardingGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (targetView: string) => void
  role: string
}

export function OnboardingGuideDialog({
  open,
  onOpenChange,
  onNavigate,
  role,
}: OnboardingGuideDialogProps) {
  const [data, setData] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasDismissed, setHasDismissed] = useState(false)

  const fetchChecklist = useCallback(async () => {
    if (role !== "admin") return
    try {
      setLoading(true)
      const res = await fetch("/api/admin/onboarding-checklist", {
        cache: "no-store",
      })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error("Failed to fetch onboarding checklist:", err)
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    if (role === "admin") {
      fetchChecklist()
    }
  }, [role, fetchChecklist])

  // Re-fetch when dialog opens
  useEffect(() => {
    if (open && role === "admin") {
      fetchChecklist()
    }
  }, [open, role, fetchChecklist])

  if (role !== "admin") return null

  const getStepIcon = (id: string) => {
    switch (id) {
      case "agencies":
        return <Building2 className="h-5 w-5 text-indigo-600" />
      case "users":
        return <Users className="h-5 w-5 text-blue-600" />
      case "zoneMap":
        return <MapPin className="h-5 w-5 text-amber-600" />
      case "dcList":
        return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
      case "masterData":
        return <Database className="h-5 w-5 text-purple-600" />
      default:
        return <Sparkles className="h-5 w-5 text-blue-600" />
    }
  }

  const handleStepClick = (targetView: string) => {
    onOpenChange(false)
    onNavigate(targetView)
  }

  const steps = data?.steps || [
    {
      id: "agencies",
      stepNumber: 1,
      title: "Create Agencies",
      description: "Add field agencies or contractor teams in Admin Panel to execute field tasks.",
      completed: false,
      targetView: "admin:agencies",
      buttonText: "Create Agency",
    },
    {
      id: "users",
      stepNumber: 2,
      title: "Create Users & Assign Agencies",
      description: "Create field staff or sub-user accounts and assign their respective agencies.",
      completed: false,
      targetView: "admin:users",
      buttonText: "Create User",
    },
    {
      id: "zoneMap",
      stepNumber: 3,
      title: "Configure Zone / MRU Map",
      description: "Map MRU zones to agencies for automated work allocation during upload.",
      completed: false,
      targetView: "admin:zoneMap",
      buttonText: "Set Up Zone Map",
    },
    {
      id: "dcList",
      stepNumber: 4,
      title: "Upload Disconnection List",
      description: "Upload current cycle DC consumer list from billing Excel/CSV file.",
      completed: false,
      targetView: "admin:dcList",
      buttonText: "Upload DC List",
    },
    {
      id: "masterData",
      stepNumber: 5,
      title: "Upload Consumer Master Data",
      description: "Upload the master database for complete consumer lookup & geocoding.",
      completed: false,
      targetView: "consumerMaster",
      buttonText: "Upload Master Data",
    },
  ]

  const completedCount = data?.completedCount ?? 0
  const totalSteps = data?.totalSteps ?? 5
  const progressPercent = data?.progressPercent ?? Math.round((completedCount / totalSteps) * 100)
  const allCompleted = data?.allCompleted ?? false

  return (
    <>
      {/* --- FLOATING PILL WHEN MODAL IS CLOSED --- */}
      {!open && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Button
            onClick={() => onOpenChange(true)}
            className={`shadow-xl flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold border transition-all duration-300 ${
              allCompleted
                ? "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 shadow-emerald-100"
                : "bg-slate-900 text-white border-slate-700 hover:bg-slate-800 shadow-slate-900/20"
            }`}
          >
            {allCompleted ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Setup Complete (5/5)</span>
              </>
            ) : (
              <>
                <div className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </div>
                <span>⚡ Setup Progress ({completedCount}/{totalSteps})</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-60 ml-0.5" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* --- ONBOARDING SETUP GUIDE DIALOG --- */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl w-[95vw] p-0 overflow-hidden bg-slate-50 border border-slate-200 rounded-3xl shadow-2xl dark:bg-slate-900 dark:border-slate-800">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 md:p-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                </div>
                <div>
                  <DialogTitle className="text-lg md:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                    Setup & Onboarding Guide
                  </DialogTitle>
                  <DialogDescription className="text-slate-400 text-xs mt-0.5">
                    {data?.cccName ? `${data.cccName} • ` : ""}Complete the essential steps to configure your system.
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetchChecklist}
                  disabled={loading}
                  title="Refresh status"
                  className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="mt-5 space-y-1.5 relative z-10">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-slate-300">Overall Progress</span>
                <span className="text-indigo-300">{completedCount} of {totalSteps} Completed ({progressPercent}%)</span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-slate-700/50 p-0.5">
                <div
                  className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Steps List */}
          <div className="p-4 md:p-6 space-y-3 max-h-[60vh] overflow-y-auto">
            {allCompleted && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-emerald-900 mb-4 animate-in fade-in">
                <PartyPopper className="h-6 w-6 text-emerald-600 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-sm text-emerald-800">All Setup Steps Completed!</p>
                  <p className="text-emerald-700/90 mt-0.5">Your Customer Care Center is fully configured and ready for operational use.</p>
                </div>
              </div>
            )}

            {steps.map((step) => {
              const isDone = step.completed
              return (
                <div
                  key={step.id}
                  className={`rounded-2xl border p-4 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isDone
                      ? "bg-white border-emerald-150 shadow-sm"
                      : "bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isDone
                          ? "bg-emerald-100/70 border border-emerald-200 text-emerald-700"
                          : "bg-slate-100 border border-slate-200 text-slate-700"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        getStepIcon(step.id)
                      )}
                    </div>

                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Step {step.stepNumber}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 leading-none truncate">
                          {step.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 font-bold rounded-full ${
                            isDone
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                          }`}
                        >
                          {isDone ? "Completed" : "Pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  <div className="sm:self-center shrink-0 pl-12 sm:pl-0">
                    <Button
                      size="sm"
                      onClick={() => handleStepClick(step.targetView)}
                      className={`w-full sm:w-auto text-xs font-bold rounded-xl h-8 px-3.5 transition-all gap-1.5 ${
                        isDone
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                          : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"
                      }`}
                    >
                      {step.buttonText}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer Note */}
          <div className="bg-slate-100/80 px-5 py-3 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <span>You can close and reopen this guide anytime from the floating pill.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 h-7"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
