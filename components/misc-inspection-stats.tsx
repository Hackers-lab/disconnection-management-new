"use client"

import { MiscInspectionRecord } from "@/lib/misc-inspection-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList, Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

interface MiscInspectionStatsProps {
  records: MiscInspectionRecord[]
}

export function MiscInspectionStats({ records }: MiscInspectionStatsProps) {
  const total = records.length
  const pendingAgency = records.filter(r => r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS").length
  const inspected = records.filter(r => r.status === "INSPECTED").length
  const finalized = records.filter(r => r.status === "FINALIZED").length
  const rejected = records.filter(r => r.status === "REJECTED").length

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card className="bg-gradient-to-br from-blue-500/10 via-background to-background border-blue-500/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Inspections</CardTitle>
          <ClipboardList className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{total}</div>
          <p className="text-xs text-muted-foreground mt-1">Logged requests</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-amber-500/10 via-background to-background border-amber-500/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pending Agency</CardTitle>
          <Clock className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingAgency}</div>
          <p className="text-xs text-muted-foreground mt-1">Awaiting site visit</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-purple-500/10 via-background to-background border-purple-500/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Agency Inspected</CardTitle>
          <AlertTriangle className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{inspected}</div>
          <p className="text-xs text-muted-foreground mt-1">Awaiting admin review</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-emerald-500/10 via-background to-background border-emerald-500/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Finalized / Approved</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{finalized}</div>
          <p className="text-xs text-muted-foreground mt-1">Closed successfully</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-red-500/10 via-background to-background border-red-500/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
          <XCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{rejected}</div>
          <p className="text-xs text-muted-foreground mt-1">Inspection rejected</p>
        </CardContent>
      </Card>
    </div>
  )
}
