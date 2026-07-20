"use client"

import { useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ArrowDownToLine, ArrowUpFromLine, Package, ImageIcon } from "lucide-react"
import type { MaterialStock, MaterialReceive, MaterialIssue } from "@/lib/material-types"

interface HistoryEntry {
  type: "receive" | "issue"
  date: string
  by: string
  quantity: number
  unit: string
  receiveId?: string
  challanRef?: string
  receivedFrom?: string
  photoUrl?: string
  remarks?: string
  issueId?: string
  recipientName?: string
  recipientDesignation?: string
  purpose?: string
}

interface Props {
  material: MaterialStock | null
  open: boolean
  onClose: () => void
  receives: MaterialReceive[]
  issues: MaterialIssue[]
}

export function MaterialHistoryDialog({ material, open, onClose, receives, issues }: Props) {
  const history = useMemo(() => {
    if (!material) return []

    const matReceives = receives
      .filter(r => r.materialId === material.materialId)
      .map(r => ({ type: "receive" as const, ...r, date: r.receivedDate, by: r.createdBy }))

    const matIssues = issues
      .filter(i => i.materialId === material.materialId)
      .map(i => ({ type: "issue" as const, ...i, date: i.issueDate, by: i.issuedBy }))

    const combined = [...matReceives, ...matIssues]

    // Sort newest first (DD-MM-YYYY)
    combined.sort((a, b) => {
      const parseD = (d: string) => {
        if (!d) return 0
        const [dd, mm, yy] = d.split("-").map(Number)
        return new Date(yy, mm - 1, dd).getTime()
      }
      return parseD(b.date) - parseD(a.date)
    })
    return combined
  }, [material, receives, issues])

  if (!material) return null

  const isLow = material.currentStock < (material.threshold || 0)
  const colorClass = isLow ? "text-red-700 font-bold" : "text-emerald-700"

  // Compute running balance from oldest to newest, then reverse back to newest first
  let runningBalance = 0
  const historyWithBalance = [...history].reverse().map(h => {
    if (h.type === "receive") runningBalance += h.quantity
    else runningBalance -= h.quantity
    return { ...h, balance: Math.round(runningBalance * 1000) / 1000 }
  }).reverse()

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 text-base">
            <Package className="h-5 w-5 text-amber-600" />
            Material History
          </DialogTitle>
        </DialogHeader>

        {/* Material info header */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/80">
          <p className="text-sm font-semibold text-gray-900">{material.description}</p>
          <div className="flex items-center gap-2 mt-1">
            {material.materialNo && <span className="text-[10px] font-mono text-gray-500">{material.materialNo}</span>}
            <Badge variant="outline" className="text-[10px] px-1 py-0">{material.category}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{material.totalReceived}</p>
              <p className="text-[10px] text-gray-400">Received</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-orange-600">{material.totalIssued}</p>
              <p className="text-[10px] text-gray-400">Issued</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${colorClass}`}>{material.currentStock}</p>
              <p className="text-[10px] text-gray-400">In Stock</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1">Unit: {material.unit}</p>
        </div>

        {/* Timeline */}
        {history.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No transactions yet</p>
        ) : (
          <div className="space-y-0 relative mt-2">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />

            {historyWithBalance.map((h, idx) => {
              const isReceive = h.type === "receive"
              return (
                <div key={idx} className="flex gap-3 relative pb-4">
                  {/* Dot */}
                  <div className={`w-[31px] h-[31px] rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                    isReceive ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
                  }`}>
                    {isReceive
                      ? <ArrowDownToLine className="h-3.5 w-3.5" />
                      : <ArrowUpFromLine className="h-3.5 w-3.5" />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            isReceive ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                          }`}>
                            {isReceive ? `+${h.quantity}` : `-${h.quantity}`} {h.unit}
                          </Badge>
                          <span className="text-[10px] text-gray-400">{h.date}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-gray-600 flex-shrink-0">
                        bal: {h.balance}
                      </span>
                    </div>

                    <div className="mt-1.5 text-[11px] text-gray-600 space-y-0.5">
                      {isReceive ? (
                        <>
                          {h.challanRef && <p><span className="text-gray-400">Challan:</span> {h.challanRef}</p>}
                          {h.receivedFrom && <p><span className="text-gray-400">From:</span> {h.receivedFrom}</p>}
                          <p><span className="text-gray-400">By:</span> {h.by}</p>
                        </>
                      ) : (
                        <>
                          <p><span className="text-gray-400">To:</span> <span className="font-medium">{h.recipientName}</span> {h.recipientDesignation && `(${h.recipientDesignation})`}</p>
                          {h.purpose && <p><span className="text-gray-400">Purpose:</span> {h.purpose}</p>}
                          <p><span className="text-gray-400">By:</span> {h.by}</p>
                        </>
                      )}
                      {h.remarks && <p className="italic text-gray-500">"{h.remarks}"</p>}
                    </div>

                    {h.photoUrl && (
                      <a href={h.photoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 mt-1 hover:underline">
                        <ImageIcon className="h-3 w-3" /> View Photo
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
