"use client"

import React from "react"
import type { SafetyTicket } from "@/lib/safety-service"

interface SafetyStatsProps {
  tickets: SafetyTicket[]
  loading?: boolean
}

export function SafetyStats({ tickets, loading }: SafetyStatsProps) {
  if (loading) return null

  const pendingSite = tickets.filter(t => t.physicalStatus === "pending").length
  const siteRectified = tickets.filter(t => t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required").length
  const noteSheetDone = tickets.filter(t => t.adminStatus === "notesheet_done" && t.physicalStatus === "rectified").length
  const fullyClosed = tickets.filter(t => t.physicalStatus === "rectified" && (t.adminStatus === "po_done" || t.adminStatus === "not_required")).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-semibold">
      <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1 text-amber-900 flex justify-between items-center">
        <span className="text-[11px] font-bold">Pending</span>
        <span className="bg-amber-200/80 px-2 py-0.5 rounded text-[11px] font-extrabold">{pendingSite}</span>
      </div>
      <div className="bg-blue-50/80 border border-blue-200 rounded-lg px-2.5 py-1 text-blue-900 flex justify-between items-center">
        <span className="text-[11px] font-bold">Rectified</span>
        <span className="bg-blue-200/80 px-2 py-0.5 rounded text-[11px] font-extrabold">{siteRectified}</span>
      </div>
      <div className="bg-purple-50/80 border border-purple-200 rounded-lg px-2.5 py-1 text-purple-900 flex justify-between items-center">
        <span className="text-[11px] font-bold">Note Placed</span>
        <span className="bg-purple-200/80 px-2 py-0.5 rounded text-[11px] font-extrabold">{noteSheetDone}</span>
      </div>
      <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg px-2.5 py-1 text-emerald-900 flex justify-between items-center">
        <span className="text-[11px] font-bold">Closed</span>
        <span className="bg-emerald-200/80 px-2 py-0.5 rounded text-[11px] font-extrabold">{fullyClosed}</span>
      </div>
    </div>
  )
}
