"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, Power, Clock, CheckCircle, AlertCircle, TrendingUp, ChevronDown, ChevronUp, HelpCircle } from "lucide-react"
import type { ConsumerData } from "@/lib/google-sheets"
import { useState, useEffect, useRef } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"

interface DashboardStatsProps {
  consumers: ConsumerData[]
  loading?: boolean
  onStatusSelect?: (status: string | null) => void
}

interface Stats {
  total: number
  connected: number
  connectedAmount: number
  disconnected: number
  disconnectedAmount: number
  pending: number
  pendingAmount: number
  billDispute: number
  billDisputeAmount: number
  officeTeam: number
  officeTeamAmount: number
  totalOutstanding: number
  paid: number
  paidAmount: number
  notAttended: number
  notAttendedAmount: number
  notFound: number
  notFoundAmount: number
}

interface AgencyReport {
  name: string
  total: number
  totalAmount: number
  disconnected: number
  disconnectedAmount: number
  paid: number
  paidAmount: number
  officeTeam: number
  officeTeamAmount: number
  billDispute: number
  billDisputeAmount: number
  notAttended: number
  notAttendedAmount: number
  notFound: number
  notFoundAmount: number
  performance: number
}

function useBackNavigation(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const isBackRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      isBackRef.current = false
      window.history.pushState(null, "", window.location.href)

      const onPopState = () => {
        isBackRef.current = true
        onCloseRef.current()
      }

      window.addEventListener("popstate", onPopState)

      return () => {
        window.removeEventListener("popstate", onPopState)
        if (!isBackRef.current) {
          window.history.back()
        }
      }
    }
  }, [isOpen])
}

export function DashboardStats({ consumers, loading = false, onStatusSelect }: DashboardStatsProps) {
  const [isSliderOpen, setIsSliderOpen] = useState(false)
  const [selectedAgency, setSelectedAgency] = useState("All")
  const [selectedClass, setSelectedClass] = useState("All")

  useBackNavigation(isSliderOpen, () => setIsSliderOpen(false))

  const agencies = ["All", ...Array.from(new Set(consumers.map((c) => c.agency || "Unknown"))).sort()]
  const classes = ["All", ...Array.from(new Set(consumers.map((c) => (c as any).class || "Unknown"))).sort()]

  const filteredConsumers = consumers.filter((consumer) => {
    const agencyMatch = selectedAgency === "All" || (consumer.agency || "Unknown") === selectedAgency
    const classMatch = selectedClass === "All" || ((consumer as any).class || "Unknown") === selectedClass
    return agencyMatch && classMatch
  })

  // Calculate statistics
  const stats: Stats = {
    total: filteredConsumers.length,
    connected: 0,
    connectedAmount: 0,
    disconnected: 0,
    disconnectedAmount: 0,
    pending: 0,
    pendingAmount: 0,
    billDispute: 0,
    billDisputeAmount: 0,
    officeTeam: 0,
    officeTeamAmount: 0,
    totalOutstanding: 0,
    paid: 0,
    paidAmount: 0,
    notAttended: 0,
    notAttendedAmount: 0,
    notFound: 0,
    notFoundAmount: 0,
  }

  const agencyReport: Record<string, AgencyReport> = {}

  filteredConsumers.forEach((consumer) => {
    const status = consumer.disconStatus.toLowerCase()
    const outstanding = Number.parseFloat(consumer.d2NetOS || "0")
    const agency = consumer.agency || "Unknown"

    if (!agencyReport[agency]) {
      agencyReport[agency] = {
        name: agency,
        total: 0,
        totalAmount: 0,
        disconnected: 0,
        disconnectedAmount: 0,
        paid: 0,
        paidAmount: 0,
        officeTeam: 0,
        officeTeamAmount: 0,
        billDispute: 0,
        billDisputeAmount: 0,
        notAttended: 0,
        notAttendedAmount: 0,
        notFound: 0,
        notFoundAmount: 0,
        performance: 0,
      }
    }

    agencyReport[agency].total++
    agencyReport[agency].totalAmount += outstanding
    stats.totalOutstanding += outstanding

    switch (status) {
      case "connected":
        stats.connected++
        stats.connectedAmount += outstanding
        stats.notAttended++
        stats.notAttendedAmount += outstanding
        agencyReport[agency].notAttended++
        agencyReport[agency].notAttendedAmount += outstanding
        break
      case "agency paid":
      case "paid": {
        const actualPaid = consumer.paidAmount && consumer.paidAmount.trim() !== ""
          ? Number.parseFloat(consumer.paidAmount)
          : outstanding
        stats.paid++
        stats.paidAmount += actualPaid
        agencyReport[agency].paid++
        agencyReport[agency].paidAmount += actualPaid
        break
      }
      case "disconnected":
        stats.disconnected++
        stats.disconnectedAmount += outstanding
        agencyReport[agency].disconnected++
        agencyReport[agency].disconnectedAmount += outstanding
        break
      case "office team":
        stats.pending++
        stats.pendingAmount += outstanding
        stats.officeTeam++
        stats.officeTeamAmount += outstanding
        agencyReport[agency].officeTeam++
        agencyReport[agency].officeTeamAmount += outstanding
        break
      case "bill dispute":
        stats.billDispute++
        stats.billDisputeAmount += outstanding
        agencyReport[agency].billDispute++
        agencyReport[agency].billDisputeAmount += outstanding
        break
      case "not found":
        stats.notFound++
        stats.notFoundAmount += outstanding
        agencyReport[agency].notFound++
        agencyReport[agency].notFoundAmount += outstanding
        break
      default:
        stats.notAttended++
        stats.notAttendedAmount += outstanding
        agencyReport[agency].notAttended++
        agencyReport[agency].notAttendedAmount += outstanding
    }
  })

  // Calculate performance and sort
  const agencyReportData = Object.values(agencyReport)
    .map(agency => ({
      ...agency,
      performance: agency.totalAmount > 0 
        ? ((agency.paidAmount + agency.disconnectedAmount) / agency.totalAmount) * 100
        : 0
    }))
    .sort((a, b) => b.performance - a.performance)

  // Calculate total stats for footer
  const totalStats = agencyReportData.reduce((acc, curr) => ({
    total: acc.total + curr.total,
    totalAmount: acc.totalAmount + curr.totalAmount,
    disconnected: acc.disconnected + curr.disconnected,
    disconnectedAmount: acc.disconnectedAmount + curr.disconnectedAmount,
    paid: acc.paid + curr.paid,
    paidAmount: acc.paidAmount + curr.paidAmount,
    officeTeam: acc.officeTeam + curr.officeTeam,
    officeTeamAmount: acc.officeTeamAmount + curr.officeTeamAmount,
    billDispute: acc.billDispute + curr.billDispute,
    billDisputeAmount: acc.billDisputeAmount + curr.billDisputeAmount,
    notAttended: acc.notAttended + curr.notAttended,
    notAttendedAmount: acc.notAttendedAmount + curr.notAttendedAmount,
    notFound: acc.notFound + curr.notFound,
    notFoundAmount: acc.notFoundAmount + curr.notFoundAmount,
  }), {
    total: 0, totalAmount: 0, disconnected: 0, disconnectedAmount: 0,
    paid: 0, paidAmount: 0, officeTeam: 0, officeTeamAmount: 0,
    billDispute: 0, billDisputeAmount: 0, notAttended: 0, notAttendedAmount: 0,
    notFound: 0, notFoundAmount: 0
  })

  const totalPerformance = totalStats.totalAmount > 0
    ? ((totalStats.paidAmount + totalStats.disconnectedAmount) / totalStats.totalAmount) * 100
    : 0

  const getPerformanceColor = (performance: number) => {
    if (performance >= 80) return "bg-green-50 text-green-800"
    if (performance >= 60) return "bg-blue-50 text-blue-800"
    if (performance >= 40) return "bg-yellow-50 text-yellow-800"
    return "bg-red-50 text-red-800"
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-slate-100 text-slate-400 rounded-xl">
              <TrendingUp className="h-5 w-5" />
            </span>
            <span className="font-bold text-slate-850 text-sm tracking-tight">Dashboard Statistics Breakdown</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider text-slate-300 bg-slate-100 px-2.5 py-1 rounded-full">
              Loading...
            </span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-400">
              <ChevronDown className="h-4 w-4 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          {Array.from({ length: 6 }).map((_, i) => (    
            <Card key={i} className="animate-pulse rounded-xl shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="h-3 rounded bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200"></div>
                <div className="h-6 rounded bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: "Total",
      value: stats.total.toLocaleString(),
      amount: stats.totalOutstanding,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      filter: null,
    },
    {
      title: "Connected",
      value: stats.connected.toLocaleString(),
      amount: stats.connectedAmount,
      icon: CheckCircle,
      color: "text-red-600",
      bgColor: "bg-red-50",
      filter: "connected",
    },
    {
      title: "Disconnected",
      value: stats.disconnected.toLocaleString(),
      amount: stats.disconnectedAmount,
      icon: Power,
      color: "text-red-600",
      bgColor: "bg-red-50",
      filter: "disconnected",
    },
    {
      title: "Paid",
      value: stats.paid.toLocaleString(),
      amount: stats.paidAmount,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
      filter: "paid",
    },
    {
      title: "Office Team",
      value: stats.pending.toLocaleString(),
      amount: stats.pendingAmount,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      filter: "office team",
    },
    {
      title: "Bill Dispute",
      value: stats.billDispute.toLocaleString(),
      amount: stats.billDisputeAmount,
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      filter: "bill dispute",
    },
    {
      title: "Not Found",
      value: stats.notFound.toLocaleString(),
      amount: stats.notFoundAmount,
      icon: HelpCircle,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      filter: "not found",
    },
    {
      title: "Total Outstanding",
      value: `₹${stats.totalOutstanding.toLocaleString()}`,
      amount: null,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      filter: null,
    },
  ]

  return (
    <div className="space-y-4">
      <div 
        className="flex justify-between items-center p-4 rounded-2xl cursor-pointer bg-white/70 hover:bg-white backdrop-blur-md border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300"
        onClick={() => setIsSliderOpen(!isSliderOpen)}
      >
        <div className="flex items-center gap-3">
          <span className={`p-2 rounded-xl transition-colors duration-300 ${isSliderOpen ? 'bg-indigo-50 text-indigo-650' : 'bg-slate-100 text-slate-600'}`}>
            <TrendingUp className="h-5 w-5" />
          </span>
          <span className="font-bold text-slate-800 text-sm tracking-tight">Dashboard Statistics Breakdown</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
            {isSliderOpen ? "Hide Panel" : "Show Panel"}
          </span>
          <div className={`p-1.5 rounded-lg ${isSliderOpen ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'} transition-colors duration-200`}>
            {isSliderOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {isSliderOpen && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 ml-1">Agency</label>
              <select
                value={selectedAgency}
                onChange={(e) => setSelectedAgency(e.target.value)}
                className="flex h-9 w-full sm:min-w-[200px] items-center justify-between rounded-md border border-gray-300 bg-white px-2 text-xs sm:text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                {agencies.map((agency) => (
                  <option key={agency} value={agency}>
                    {agency}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 ml-1">Class</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="flex h-9 w-full sm:min-w-[200px] items-center justify-between rounded-md border border-gray-300 bg-white px-2 text-xs sm:text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                {classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {statCards.map((stat, index) => (
              <Card 
                key={index} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onStatusSelect?.(stat.filter)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-600 mb-1 truncate">{stat.title}</p>
                      <p className="text-lg font-bold text-gray-900 truncate" title={stat.value}>{stat.value}</p>
                      {stat.amount !== null && (
                        <p className="text-xs font-medium text-gray-500 truncate">₹{stat.amount.toLocaleString()}</p>
                      )}
                    </div>
                    <div className={`p-1.5 rounded-lg ${stat.bgColor} shrink-0 ml-2`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-white rounded-lg border overflow-x-auto shadow-md text-[10px] font-sans">
            <Table className="compact-table">
              <TableHeader className="bg-white-50">
                {/* Main Header Row */}
                <TableRow className="border-b h-8">
                  <TableHead className="w-[100px] border-r sticky left-0 bg-white z-20 py-1 h-8 text-[10px]" rowSpan={2}>Agency</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Total</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Disconnected</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Paid</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Office Team</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Bill Dispute</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Not Found</TableHead>
                  <TableHead className="text-center border-r px-1 py-1 h-8 text-[10px]" colSpan={2}>Not Attended</TableHead>
                  <TableHead className="text-center w-[80px] px-1 py-1 h-8 text-[10px]" rowSpan={2}>Performance</TableHead>
                </TableRow>
                
                {/* Sub-header Row */}
                <TableRow className="border-b h-8">
                  {/* Total */}
                  <TableHead className="text-center border-r bg-gray-100 px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white-100 px-1 py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>
                  
                  {/* Disconnected */}
                  <TableHead className="text-center border-r bg-grey px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white px-1 py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>
                  
                  {/* Paid */}
                  <TableHead className="text-center border-r bg-gray-100 px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white-100 px-1 py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>
                  
                  {/* Office Team */}
                  <TableHead className="text-center border-r bg-gray px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white px-1 py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>
                  
                  {/* Bill Dispute */}
                  <TableHead className="text-center border-r bg-gray-100 px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white-100 px-1 py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>
                  
                  {/* Not Found */}
                  <TableHead className="text-center border-r bg-gray-50 px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white px-1 py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>

                  {/* Not Attended */}
                  <TableHead className="text-center border-r bg-gray px-1 py-1 h-8 text-[10px] w-[40px]">Count</TableHead>
                  <TableHead className="text-center px-1 bg-white py-1 h-8 text-[10px] w-[40px]">Amount</TableHead>
                </TableRow>
              </TableHeader>
              
              <TableBody>
                {agencyReportData.map((agency) => (
                  <TableRow key={agency.name} className="group hover:bg-gray-50 border-b h-8">
                    {/* Agency Name */}
                    <TableCell className="font-medium border-r px-2 py-1 sticky left-0 text-[10px] bg-white group-hover:bg-gray-50 z-10 h-8">
                      {agency.name}
                    </TableCell>
                    
                    {/* Total */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.total}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white-50">₹{agency.totalAmount.toLocaleString()}</TableCell>
                    
                    {/* Disconnected */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.disconnected}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white">₹{agency.disconnectedAmount.toLocaleString()}</TableCell>
                    
                    {/* Paid */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.paid}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white-50">₹{agency.paidAmount.toLocaleString()}</TableCell>
                    
                    {/* Office Team */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.officeTeam}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white">₹{agency.officeTeamAmount.toLocaleString()}</TableCell>
                    
                    {/* Bill Dispute */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.billDispute}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white-50">₹{agency.billDisputeAmount.toLocaleString()}</TableCell>
                    
                    {/* Not Found */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.notFound}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white">₹{agency.notFoundAmount.toLocaleString()}</TableCell>

                    {/* Not Attended */}
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-gray-50">{agency.notAttended}</TableCell>
                    <TableCell className="text-center border-r px-1 py-1 h-8 bg-white">₹{agency.notAttendedAmount.toLocaleString()}</TableCell>
                    
                    {/* Performance */}
                    <TableCell className={`text-center border-r px-1 py-1 h-8 font-medium ${getPerformanceColor(agency.performance)} bg-gray-50`}>
                      {(agency.performance).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-gray-100 font-medium">
                <TableRow className="border-b h-8">
                  <TableCell className="border-r px-2 py-1 sticky left-0 text-[10px] bg-gray-100 z-10 h-8">Total</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.total}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.disconnected}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.disconnectedAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.paid}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.paidAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.officeTeam}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.officeTeamAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.billDispute}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.billDisputeAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.notFound}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.notFoundAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">{totalStats.notAttended}</TableCell>
                  <TableCell className="text-center border-r px-1 py-1 h-8">₹{totalStats.notAttendedAmount.toLocaleString()}</TableCell>
                  <TableCell className={`text-center border-r px-1 py-1 h-8 ${getPerformanceColor(totalPerformance)}`}>
                    {totalPerformance.toFixed(1)}%
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}