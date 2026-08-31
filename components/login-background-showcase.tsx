"use client"

import { Zap, RefreshCw, Gauge, ClipboardCheck, ShieldCheck, TrendingUp, Users, ArrowUpRight, CheckCircle2, Clock, AlertTriangle } from "lucide-react"

// Mock Cards Data grouped by column
const COLUMN_1_CARDS = [
  {
    id: "c1-1",
    module: "Disconnection",
    icon: Zap,
    iconColor: "text-amber-500 bg-amber-50 border-amber-200",
    title: "Consumer #661209381",
    subtitle: "Chanchal CCC • Feeder 11kV",
    badge: "Disconnected",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
    statLabel: "Outstanding Dues",
    statValue: "₹14,820",
    action: "Snapping & Pole Tagged",
  },
  {
    id: "c1-2",
    module: "Meter Cell",
    icon: Gauge,
    iconColor: "text-sky-500 bg-sky-50 border-sky-200",
    title: "Meter Replacement Slip",
    subtitle: "Old: GEN-88910 • New: SM-99120",
    badge: "Verified",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statLabel: "Initial Reading",
    statValue: "00004.2 kWh",
    action: "Seal #WB-7712 Applied",
  },
  {
    id: "c1-3",
    module: "Operations",
    icon: TrendingUp,
    iconColor: "text-purple-500 bg-purple-50 border-purple-200",
    title: "Daily CCC Recovery Summary",
    subtitle: "All 8 Active Field Crews",
    badge: "83% Target",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    statLabel: "Total Realized Today",
    statValue: "₹4.82 Lakh",
    action: "118/142 Cases Resolved",
  },
  {
    id: "c1-4",
    module: "NSC Inspection",
    icon: ClipboardCheck,
    iconColor: "text-indigo-500 bg-indigo-50 border-indigo-200",
    title: "Application #NSC-2026-881",
    subtitle: "Domestic Connection (3.5 kW)",
    badge: "Feasible",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statLabel: "Pole Distance",
    statValue: "18.5 meters",
    action: "Estimate Generated",
  },
]

const COLUMN_2_CARDS = [
  {
    id: "c2-1",
    module: "Reconnection",
    icon: RefreshCw,
    iconColor: "text-emerald-500 bg-emerald-50 border-emerald-200",
    title: "Payment Realization & RO",
    subtitle: "Consumer #661204192",
    badge: "Restored",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statLabel: "Payment Receipt",
    statValue: "₹8,450 Verified",
    action: "Service Line Restored",
  },
  {
    id: "c2-2",
    module: "DTR Management",
    icon: ShieldCheck,
    iconColor: "text-blue-500 bg-blue-50 border-blue-200",
    title: "DTR #TR-100 kVA (Market)",
    subtitle: "Substation Bay #2 • Malda",
    badge: "Balanced",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    statLabel: "Peak Load",
    statValue: "74% (Within Limit)",
    action: "Thermal Scan OK",
  },
  {
    id: "c2-3",
    module: "Field Staff",
    icon: Users,
    iconColor: "text-amber-500 bg-amber-50 border-amber-200",
    title: "Crew Assignment: North Zone",
    subtitle: "Tech: Rajesh Roy & Team",
    badge: "Active",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statLabel: "Pending Jobs",
    statValue: "3 Remaining",
    action: "GPS Tracking Synced",
  },
  {
    id: "c2-4",
    module: "Disconnection",
    icon: Zap,
    iconColor: "text-rose-500 bg-rose-50 border-rose-200",
    title: "Commercial Defaulter #77192",
    subtitle: "3-Phase Industrial Connection",
    badge: "Notice Served",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    statLabel: "Notice Period",
    statValue: "48h Expiry",
    action: "Disconnection Scheduled",
  },
]

const COLUMN_3_CARDS = [
  {
    id: "c3-1",
    module: "NSC Management",
    icon: ClipboardCheck,
    iconColor: "text-indigo-500 bg-indigo-50 border-indigo-200",
    title: "Commercial NSC #2026-904",
    subtitle: "10 kVA Commercial Establishment",
    badge: "Under Review",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    statLabel: "Transformer Load",
    statValue: "62% Feasible",
    action: "AE Verification Pending",
  },
  {
    id: "c3-2",
    module: "Meter Testing",
    icon: Gauge,
    iconColor: "text-sky-500 bg-sky-50 border-sky-200",
    title: "Burnt Meter Replacement",
    subtitle: "Consumer #661201994",
    badge: "High Priority",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
    statLabel: "Average Assessment",
    statValue: "320 Units / Mo",
    action: "New Meter Assigned",
  },
  {
    id: "c3-3",
    module: "Reconnection",
    icon: RefreshCw,
    iconColor: "text-emerald-500 bg-emerald-50 border-emerald-200",
    title: "Instant Online RO Clearance",
    subtitle: "Consumer #661208831",
    badge: "Automated",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statLabel: "Clearance Time",
    statValue: "3 mins",
    action: "SMS Alert Dispatched",
  },
  {
    id: "c3-4",
    module: "DTR Analytics",
    icon: ShieldCheck,
    iconColor: "text-purple-500 bg-purple-50 border-purple-200",
    title: "Feeder Loss Analysis",
    subtitle: "Chanchal Sub-Division",
    badge: "-3.4% Loss",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statLabel: "Billing Efficiency",
    statValue: "96.2%",
    action: "Weekly Audit Completed",
  },
]

function MockCard({ card }: { card: (typeof COLUMN_1_CARDS)[0] }) {
  const Icon = card.icon
  return (
    <div className="w-[270px] sm:w-[290px] rounded-2xl bg-white/80 border border-slate-200/90 p-4 shadow-sm backdrop-blur-md select-none transition-transform">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${card.iconColor}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{card.module}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${card.badgeColor}`}>
          {card.badge}
        </span>
      </div>

      <div className="pt-2.5 space-y-1.5">
        <h4 className="text-xs font-bold text-slate-900 truncate">{card.title}</h4>
        <p className="text-[10px] text-slate-500 truncate">{card.subtitle}</p>

        <div className="pt-1.5 flex items-center justify-between text-[10px] bg-slate-50/80 rounded-lg p-2 border border-slate-100">
          <div>
            <span className="text-slate-400 block text-[9px]">{card.statLabel}</span>
            <span className="font-bold text-slate-800 text-xs">{card.statValue}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[9px]">Status Note</span>
            <span className="font-semibold text-slate-600 text-[10px] truncate max-w-[100px] block">{card.action}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoginBackgroundShowcase() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0">
      {/* Center protection mask: ensures 100% clean reading corridor behind card, header, and counter */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-transparent to-slate-50/80 z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_15%,rgba(248,250,252,0.94)_65%)] sm:bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(248,250,252,0.96)_80%)] z-10 pointer-events-none" />

      {/* Left Peripheral Stream (Scrolls Up) */}
      <div className="absolute -left-12 sm:left-4 lg:left-10 xl:left-20 -top-32 bottom-0 w-[240px] sm:w-[270px] opacity-10 sm:opacity-20 hover:opacity-30 transition-opacity duration-700 blur-[1px] sm:blur-none scale-90 sm:scale-100 origin-left">
        <div className="flex flex-col gap-4 sm:gap-5 animate-scroll-vertical-up-slow">
          {[...COLUMN_1_CARDS, ...COLUMN_1_CARDS].map((card, i) => (
            <MockCard key={`left-${i}`} card={card} />
          ))}
        </div>
      </div>

      {/* Right Peripheral Stream (Scrolls Down) */}
      <div className="absolute -right-12 sm:right-4 lg:right-10 xl:right-20 -top-32 bottom-0 w-[240px] sm:w-[270px] opacity-10 sm:opacity-20 hover:opacity-30 transition-opacity duration-700 blur-[1px] sm:blur-none scale-90 sm:scale-100 origin-right">
        <div className="flex flex-col gap-4 sm:gap-5 animate-scroll-vertical-down-slow">
          {[...COLUMN_3_CARDS, ...COLUMN_3_CARDS].map((card, i) => (
            <MockCard key={`right-${i}`} card={card} />
          ))}
        </div>
      </div>
    </div>
  )
}


