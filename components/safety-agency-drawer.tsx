"use client"

import React, { useState, useMemo } from "react"
import type { SafetyTicket } from "@/lib/safety-service"
import { Building2, ChevronDown, ChevronUp, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface SafetyAgencyDrawerProps {
  tickets: SafetyTicket[]
}

interface AgencySummary {
  agencyName: string
  inspected: number
  pending: number
  rectified: number
  closed: number
}

export function SafetyAgencyDrawer({ tickets }: SafetyAgencyDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const agencySummaries = useMemo<AgencySummary[]>(() => {
    const map = new Map<string, { inspected: number; pending: number; rectified: number; closed: number }>()

    tickets.forEach(t => {
      const agName = (t.agency || "Unassigned").trim()
      const key = agName.toUpperCase()
      
      if (!map.has(key)) {
        map.set(key, { inspected: 0, pending: 0, rectified: 0, closed: 0 })
      }

      const stats = map.get(key)!
      stats.inspected += 1

      if (t.physicalStatus === "pending") {
        stats.pending += 1
      }
      if (t.physicalStatus === "rectified") {
        stats.rectified += 1
        if (t.adminStatus === "po_done" || t.adminStatus === "not_required") {
          stats.closed += 1
        }
      }
    })

    const list: AgencySummary[] = []
    map.forEach((stats, key) => {
      // Find original casing if possible
      const original = tickets.find(t => (t.agency || "Unassigned").trim().toUpperCase() === key)?.agency || key
      list.push({
        agencyName: original.trim() || key,
        ...stats
      })
    })

    // Sort by agency name
    return list.sort((a, b) => a.agencyName.localeCompare(b.agencyName))
  }, [tickets])

  const totals = useMemo(() => {
    return agencySummaries.reduce(
      (acc, curr) => ({
        inspected: acc.inspected + curr.inspected,
        pending: acc.pending + curr.pending,
        rectified: acc.rectified + curr.rectified,
        closed: acc.closed + curr.closed,
      }),
      { inspected: 0, pending: 0, rectified: 0, closed: 0 }
    )
  }, [agencySummaries])

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden text-xs">
      <Button
        type="button"
        variant="ghost"
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-slate-800 font-bold border-b border-slate-100"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="text-left">
            <span className="text-xs font-bold block text-slate-800">Agency Safety Summary Dashboard</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {agencySummaries.length} Agencies ({totals.inspected} Total Inspected Hazards)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-blue-600 font-semibold text-[11px]">
          <span>{isOpen ? "Hide Table" : "View Agency Table"}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </Button>

      {isOpen && (
        <div className="p-2 sm:p-3 bg-slate-50/50">
          <div className="border rounded-lg overflow-x-auto bg-white shadow-2xs">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="text-[11px]">
                  <TableHead className="font-extrabold text-slate-700 py-2">Agency Name</TableHead>
                  <TableHead className="font-extrabold text-center text-slate-700 py-2">Inspected</TableHead>
                  <TableHead className="font-extrabold text-center text-amber-700 py-2">Pending</TableHead>
                  <TableHead className="font-extrabold text-center text-blue-700 py-2">Rectified</TableHead>
                  <TableHead className="font-extrabold text-center text-emerald-700 py-2">Closed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencySummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-slate-400">
                      No safety tickets recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  agencySummaries.map((summary, idx) => (
                    <TableRow key={idx} className="hover:bg-slate-50/80 text-[11px]">
                      <TableCell className="font-bold text-slate-800 py-2">
                        {summary.agencyName}
                      </TableCell>
                      <TableCell className="text-center py-2 font-extrabold text-slate-700">
                        <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px]">
                          {summary.inspected}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 font-extrabold text-[10px]">
                          {summary.pending}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-extrabold text-[10px]">
                          {summary.rectified}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-extrabold text-[10px]">
                          {summary.closed}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {/* Summary Row */}
                {agencySummaries.length > 0 && (
                  <TableRow className="bg-slate-100/90 font-extrabold text-[11px] border-t-2 border-slate-200">
                    <TableCell className="text-slate-900 py-2">TOTAL (ALL AGENCIES)</TableCell>
                    <TableCell className="text-center text-slate-900 py-2">{totals.inspected}</TableCell>
                    <TableCell className="text-center text-amber-900 py-2">{totals.pending}</TableCell>
                    <TableCell className="text-center text-blue-900 py-2">{totals.rectified}</TableCell>
                    <TableCell className="text-center text-emerald-900 py-2">{totals.closed}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
