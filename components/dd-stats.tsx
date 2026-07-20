"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, CheckCircle, AlertCircle, Clock, TrendingUp, ChevronDown, ChevronUp, IndianRupee } from "lucide-react"
import type { DeemedVisitData } from "@/lib/dd-service"
import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"

interface DDStatsProps {
  consumers: DeemedVisitData[]
  loading?: boolean
}

interface Stats {
  total: number
  totalTarget: number
  pending: number
  completed: number
  breakdown: Record<string, { count: number, amount: number }>
}

interface AgencyStat {
  name: string
  total: number
  pending: number
  completed: number
  recovered: number
  target: number
}

export function DDStats({ consumers, loading = false }: DDStatsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate statistics
  const stats: Stats = {
    total: consumers.length,
    totalTarget: 0,
    pending: 0,
    completed: 0,
    breakdown: {}
  }

  const agencyStats: Record<string, AgencyStat> = {}

  consumers.forEach((c) => {
    const status = (c.disconStatus || "Deemed Disconnected").toLowerCase()
    const arrears = Number.parseFloat(c.totalArrears || "0")
    const agency = c.agency || "Unknown"
    
    // Init Agency Stat
    if (!agencyStats[agency]) {
      agencyStats[agency] = { name: agency, total: 0, pending: 0, completed: 0, recovered: 0, target: 0 }
    }
    
    agencyStats[agency].total++
    agencyStats[agency].target += arrears
    
    // Total Target is sum of all arrears
    stats.totalTarget += arrears

    // Pending: Status is exactly "deemed disconnected"
    if (status === "deemed disconnected") {
      stats.pending++
      agencyStats[agency].pending++
    } else {
      // Completed: Any other status
      stats.completed++
      agencyStats[agency].completed++
      
      // Breakdown count and amount for completed statuses
      const displayStatus = c.disconStatus || "Unknown"
      if (!stats.breakdown[displayStatus]) {
        stats.breakdown[displayStatus] = { count: 0, amount: 0 }
      }
      stats.breakdown[displayStatus].count++
      stats.breakdown[displayStatus].amount += arrears
    }
  })

  const agencyReportData = Object.values(agencyStats).sort((a, b) => b.total - a.total)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 bg-white rounded-lg shadow-sm border animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-2">
                <div className="h-3 w-20 bg-gray-200 rounded"></div>
                <div className="h-6 w-16 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: "Total Visits",
      value: stats.total.toLocaleString(),
      subValue: `Target: ₹${(stats.totalTarget / 100000).toFixed(2)} L`,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Pending",
      value: stats.pending.toLocaleString(),
      subValue: "To be visited",
      icon: Clock,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Completed",
      value: stats.completed.toLocaleString(),
      subValue: "Visits done",
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
  ]

  return (
    <div className="space-y-4">
      <div 
        className="flex justify-between items-center p-4 bg-orange-50 border border-orange-100 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <h3 className="font-medium text-orange-900">Deemed Visit Statistics</h3>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5 text-orange-600" /> : <ChevronDown className="h-5 w-5 text-orange-600" />}
      </div>

      {/* Breakdown Section */}
      {isExpanded && Object.keys(stats.breakdown).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-1 animate-in fade-in zoom-in duration-300">
          {Object.entries(stats.breakdown).map(([status, data]) => (
            <div key={status} className="bg-white border rounded px-3 py-2 text-xs flex justify-between items-center shadow-sm">
              <span className="font-medium text-gray-600 truncate mr-2" title={status}>{status}</span>
              <div className="text-right">
                <span className="font-bold text-gray-900 block">{data.count}</span>
                <span className="text-[10px] text-gray-500">₹{data.amount.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-in slide-in-from-top-2 duration-200">
          {statCards.map((stat, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-600 mb-1 truncate">{stat.title}</p>
                    <p className="text-lg font-bold text-gray-900 truncate">{stat.value}</p>
                    <p className="text-xs font-medium text-gray-500 truncate">{stat.subValue}</p>
                  </div>
                  <div className={`p-1.5 rounded-lg ${stat.bgColor} shrink-0 ml-2`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {/* Total Outstanding Summary Card */}
          <Card className="col-span-2 sm:col-span-3 bg-gradient-to-r from-gray-50 to-white border-dashed">
            <CardContent className="p-3 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <TrendingUp className="h-4 w-4 text-purple-600" />
                 <span className="text-sm font-medium text-gray-700">Total OSD</span>
               </div>
               <span className="text-lg font-bold text-purple-700">₹{stats.totalTarget.toLocaleString()}</span>
            </CardContent>
          </Card>

          {/* Agency Table */}
          <div className="col-span-2 sm:col-span-3 bg-white rounded-lg border overflow-x-auto shadow-sm mt-2">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-[150px] text-xs">Agency</TableHead>
                  <TableHead className="text-center text-xs">Total</TableHead>
                  <TableHead className="text-right text-xs">Target</TableHead>
                  <TableHead className="text-center text-xs">Pending</TableHead>
                  <TableHead className="text-center text-xs">Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencyReportData.map((agency) => (
                  <TableRow key={agency.name} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-xs">{agency.name}</TableCell>
                    <TableCell className="text-center text-xs">{agency.total}</TableCell>
                    <TableCell className="text-right text-xs text-gray-500">₹{agency.target.toLocaleString()}</TableCell>
                    <TableCell className="text-center text-xs text-orange-600 font-medium">{agency.pending}</TableCell>
                    <TableCell className="text-center text-xs text-green-600 font-medium">{agency.completed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-gray-50 border-t">
                <TableRow>
                  <TableCell className="font-bold text-xs">Total</TableCell>
                  <TableCell className="text-center text-xs font-bold">{stats.total}</TableCell>
                  <TableCell className="text-right text-xs font-bold">₹{stats.totalTarget.toLocaleString()}</TableCell>
                  <TableCell className="text-center text-xs font-bold text-orange-700">{stats.pending}</TableCell>
                  <TableCell className="text-center text-xs font-bold text-green-700">{stats.completed}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}