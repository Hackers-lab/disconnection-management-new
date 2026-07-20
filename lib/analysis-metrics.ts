// Pure, client-side analytics for the admin Analysis system.
// Aggregates consumer rows into per-group metrics and computes a weighted
// scorecard ranking. Runs entirely in the browser — zero server CPU.

import { toNumber } from "./upload-filter"

export type MetricKind = "count" | "amount" | "percent"

export interface MetricDef {
  key: string
  label: string
  kind: MetricKind
  higherIsBetter: boolean
}

// Per-group aggregate shape (all numeric).
export interface GroupMetrics {
  count: number
  totalOSD: number
  recoveredAmount: number
  recoveredCount: number
  recoveryPct: number
  disconnectedCount: number
  disconnectedAmount: number
  pendingCount: number
  visitedCount: number
  notFoundCount: number
  billDisputeCount: number
  officeTeamCount: number
  attendedPct: number
}

export type GroupMetricKey = keyof GroupMetrics

// Registry — order drives the column/metric pickers in the UI.
export const METRICS: MetricDef[] = [
  { key: "count",             label: "Consumers",        kind: "count",   higherIsBetter: true },
  { key: "totalOSD",          label: "Total OSD",        kind: "amount",  higherIsBetter: true },
  { key: "recoveredAmount",   label: "Recovered ₹",      kind: "amount",  higherIsBetter: true },
  { key: "recoveredCount",    label: "Paid (count)",     kind: "count",   higherIsBetter: true },
  { key: "recoveryPct",       label: "Recovery %",       kind: "percent", higherIsBetter: true },
  { key: "disconnectedCount", label: "Disconnected",     kind: "count",   higherIsBetter: true },
  { key: "disconnectedAmount",label: "Disconnected ₹",   kind: "amount",  higherIsBetter: true },
  { key: "attendedPct",       label: "Attended %",       kind: "percent", higherIsBetter: true },
  { key: "pendingCount",      label: "Pending",          kind: "count",   higherIsBetter: false },
  { key: "visitedCount",      label: "Visited",          kind: "count",   higherIsBetter: true },
  { key: "notFoundCount",     label: "Not Found",        kind: "count",   higherIsBetter: false },
  { key: "billDisputeCount",  label: "Bill Dispute",     kind: "count",   higherIsBetter: false },
  { key: "officeTeamCount",   label: "Office Team",      kind: "count",   higherIsBetter: false },
]

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map(m => [m.key, m]))

// Dimensions a report can group by (field on the consumer object).
export const GROUP_FIELDS: { key: string; label: string }[] = [
  { key: "agency",       label: "Agency" },
  { key: "mru",          label: "Zone (MRU)" },
  { key: "class",        label: "Class" },
  { key: "baseClass",    label: "Base Class" },
  { key: "govNonGov",    label: "Gov / Non-Gov" },
  { key: "disconStatus", label: "Status" },
]

function emptyMetrics(): GroupMetrics {
  return {
    count: 0, totalOSD: 0, recoveredAmount: 0, recoveredCount: 0, recoveryPct: 0,
    disconnectedCount: 0, disconnectedAmount: 0, pendingCount: 0, visitedCount: 0,
    notFoundCount: 0, billDisputeCount: 0, officeTeamCount: 0, attendedPct: 0,
  }
}

export interface GroupRow extends GroupMetrics {
  group: string
  score?: number
  rank?: number
}

// Aggregate rows into per-group metrics keyed by the chosen group field.
export function aggregate(rows: any[], groupByField: string): GroupRow[] {
  const acc: Record<string, GroupMetrics> = {}
  for (const r of rows) {
    const key = String(r?.[groupByField] ?? "").trim() || "—"
    const m = (acc[key] ||= emptyMetrics())
    const osd = toNumber(String(r?.d2NetOS ?? "0"))
    const paid = toNumber(String(r?.paidAmount ?? "0"))
    const status = String(r?.disconStatus ?? "").toLowerCase().trim()

    m.count++
    m.totalOSD += osd
    if (paid > 0) { m.recoveredAmount += paid; m.recoveredCount++ }

    switch (status) {
      case "paid":
      case "agency paid":
        // recovery already captured via paidAmount above
        break
      case "disconnected":
      case "temprory disconnected":
      case "deemed disconnected":
        m.disconnectedCount++; m.disconnectedAmount += osd; break
      case "connected":
        m.pendingCount++; break
      case "visited":      m.visitedCount++; break
      case "not found":    m.notFoundCount++; break
      case "bill dispute": m.billDisputeCount++; break
      case "office team":  m.officeTeamCount++; break
    }
  }

  return Object.entries(acc).map(([group, m]) => {
    m.recoveryPct = m.totalOSD > 0 ? (m.recoveredAmount / m.totalOSD) * 100 : 0
    m.attendedPct = m.count > 0 ? ((m.count - m.pendingCount) / m.count) * 100 : 0
    return { group, ...m }
  })
}

export interface ScorecardItem { metric: GroupMetricKey; weight: number }

// Weighted scorecard: min-max normalize each metric 0–100 across groups
// (inverted when lower is better), composite = Σ(weight·norm)/Σweight.
export function scoreGroups(groups: GroupRow[], scorecard: ScorecardItem[]): GroupRow[] {
  const active = scorecard.filter(s => s.weight > 0 && METRIC_BY_KEY[s.metric])
  if (active.length === 0 || groups.length === 0) {
    return groups.map(g => ({ ...g, score: undefined, rank: undefined }))
  }

  // Precompute min/max per metric.
  const bounds: Record<string, { min: number; max: number }> = {}
  for (const s of active) {
    const vals = groups.map(g => Number(g[s.metric] || 0))
    bounds[s.metric] = { min: Math.min(...vals), max: Math.max(...vals) }
  }
  const totalWeight = active.reduce((sum, s) => sum + s.weight, 0)

  const scored = groups.map(g => {
    let composite = 0
    for (const s of active) {
      const def = METRIC_BY_KEY[s.metric]
      const { min, max } = bounds[s.metric]
      const v = Number(g[s.metric] || 0)
      let norm = max === min ? 100 : ((v - min) / (max - min)) * 100
      if (!def.higherIsBetter) norm = 100 - norm
      composite += s.weight * norm
    }
    return { ...g, score: composite / totalWeight }
  })

  // Rank by score desc.
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  scored.forEach((g, i) => { g.rank = i + 1 })
  return scored
}

// Sum a totals row across groups (percent columns recomputed from totals).
export function totalsRow(groups: GroupRow[]): GroupMetrics {
  const t = emptyMetrics()
  for (const g of groups) {
    t.count += g.count; t.totalOSD += g.totalOSD; t.recoveredAmount += g.recoveredAmount
    t.recoveredCount += g.recoveredCount; t.disconnectedCount += g.disconnectedCount
    t.disconnectedAmount += g.disconnectedAmount; t.pendingCount += g.pendingCount
    t.visitedCount += g.visitedCount; t.notFoundCount += g.notFoundCount
    t.billDisputeCount += g.billDisputeCount; t.officeTeamCount += g.officeTeamCount
  }
  t.recoveryPct = t.totalOSD > 0 ? (t.recoveredAmount / t.totalOSD) * 100 : 0
  t.attendedPct = t.count > 0 ? ((t.count - t.pendingCount) / t.count) * 100 : 0
  return t
}

// Format a metric value for display.
export function formatMetric(value: number, kind: MetricKind): string {
  if (kind === "amount") return "₹" + Math.round(value).toLocaleString("en-IN")
  if (kind === "percent") return value.toFixed(1) + "%"
  return Math.round(value).toLocaleString("en-IN")
}
