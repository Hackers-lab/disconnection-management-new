"use client"

import { useEffect, useMemo, useState } from "react"
// xlsx loaded dynamically in exportExcel()
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BarChart3, PieChart as PieIcon, Filter, Plus, X, Save, Download, Printer, Loader2,
  Trophy, SlidersHorizontal, Columns3, ChevronDown, ChevronRight,
} from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import { Condition, Group, Operator, rowMatchesGroups, isNumericOp, OPERATOR_LABELS } from "@/lib/upload-filter"
import {
  METRICS, METRIC_BY_KEY, GROUP_FIELDS, aggregate, scoreGroups, totalsRow,
  formatMetric, type GroupMetricKey, type ScorecardItem, type GroupRow,
} from "@/lib/analysis-metrics"

const NUMERIC_FILTER_FIELDS = new Set(["d2NetOS", "paidAmount", "outstandingAfter"])
const FILTER_FIELDS: { key: string; label: string }[] = [
  { key: "agency", label: "Agency" }, { key: "disconStatus", label: "Status" },
  { key: "class", label: "Class" }, { key: "baseClass", label: "Base Class" },
  { key: "govNonGov", label: "Gov / Non-Gov" }, { key: "mru", label: "Zone (MRU)" },
  { key: "priority", label: "Priority" }, { key: "paymentSource", label: "Payment Source" },
  { key: "d2NetOS", label: "OSD Amount" }, { key: "paidAmount", label: "Paid Amount" },
]
const CHART_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#0d9488"]

const DEFAULT_COLUMNS: GroupMetricKey[] = ["count", "totalOSD", "recoveredAmount", "recoveryPct", "disconnectedCount", "pendingCount"]

// Parse "DD-MM-YYYY" / "DD/MM/YYYY" → Date (local midnight).
function parseDMY(s: string): Date | null {
  if (!s) return null
  const parts = String(s).trim().split(/[-/]/)
  if (parts.length !== 3) return null
  let [d, mo, y] = parts.map(p => parseInt(p, 10))
  if (isNaN(d) || isNaN(mo) || isNaN(y)) return null
  if (y < 100) y += 2000
  const dt = new Date(y, mo - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}

interface AnalysisDashboardProps { userRole: string }

export function AnalysisDashboard({ userRole }: AnalysisDashboardProps) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [conditions, setConditions] = useState<Condition[]>([])
  const [dateField, setDateField] = useState<"none" | "disconDate" | "paidDate">("none")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [groupBy, setGroupBy] = useState("agency")
  const [columns, setColumns] = useState<GroupMetricKey[]>(DEFAULT_COLUMNS)
  const [scorecard, setScorecard] = useState<ScorecardItem[]>([{ metric: "recoveryPct", weight: 1 }])
  const [chartType, setChartType] = useState<"bar" | "pie">("bar")
  const [chartMetric, setChartMetric] = useState<GroupMetricKey>("recoveredAmount")
  const [sortKey, setSortKey] = useState<string>("rank")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const [templates, setTemplates] = useState<{ name: string; config: any }[]>([])
  const [templateName, setTemplateName] = useState("")
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [showFilters, setShowFilters] = useState(true)
  const [showConfig, setShowConfig] = useState(true)

  // Load cached consumers + saved templates.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cached = await getFromCache<any[]>("consumers_data_cache")
        if (!cancelled && Array.isArray(cached)) setRows(cached)
      } catch { /* ignore */ }
      try {
        const resp = await fetch("/api/admin/report-templates")
        if (resp.ok && !cancelled) setTemplates(await resp.json())
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const getField = (row: any, field: string) => String(row?.[field] ?? "")

  const distinctValues = (field: string): string[] => {
    const set = new Set<string>()
    for (const r of rows) { const v = String(r?.[field] ?? "").trim(); if (v) set.add(v) }
    return Array.from(set).sort()
  }

  // Filter rows by conditions (single AND group) + date range.
  const filteredRows = useMemo(() => {
    const groups: Group[] = conditions.length ? [{ conditions }] : []
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(dateTo) : null
    return rows.filter(r => {
      if (!rowMatchesGroups(f => getField(r, f), groups)) return false
      if (dateField !== "none" && (from || to)) {
        const d = parseDMY(String(r?.[dateField] ?? ""))
        if (!d) return false
        if (from && d < from) return false
        if (to && d > to) return false
      }
      return true
    })
  }, [rows, conditions, dateField, dateFrom, dateTo])

  const groupRows = useMemo(() => aggregate(filteredRows, groupBy), [filteredRows, groupBy])
  const ranked = useMemo(() => scoreGroups(groupRows, scorecard), [groupRows, scorecard])
  const totals = useMemo(() => totalsRow(groupRows), [groupRows])
  const hasScore = scorecard.some(s => s.weight > 0)

  const sortedRows = useMemo(() => {
    const arr = [...ranked]
    arr.sort((a, b) => {
      let av: number | string, bv: number | string
      if (sortKey === "rank") { av = a.rank ?? 9999; bv = b.rank ?? 9999 }
      else if (sortKey === "group") { av = a.group; bv = b.group }
      else { av = Number((a as any)[sortKey] || 0); bv = Number((b as any)[sortKey] || 0) }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [ranked, sortKey, sortDir])

  const chartData = useMemo(
    () => sortedRows.slice(0, 12).map(g => ({ name: g.group, value: Number((g as any)[chartMetric] || 0) })),
    [sortedRows, chartMetric]
  )

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir(key === "group" || key === "rank" ? "asc" : "desc") }
  }

  // --- condition mutators ---
  const addCondition = () => {
    const field = FILTER_FIELDS[0].key
    setConditions(c => [...c, NUMERIC_FILTER_FIELDS.has(field) ? { field, op: "gt", value: "0" } : { field, op: "in", value: [] }])
  }
  const updateCondition = (i: number, patch: Partial<Condition>) =>
    setConditions(c => c.map((cond, j) => j === i ? { ...cond, ...patch } : cond))
  const removeCondition = (i: number) => setConditions(c => c.filter((_, j) => j !== i))

  // --- scorecard mutators ---
  const toggleScorecardMetric = (metric: GroupMetricKey) => {
    setScorecard(sc => sc.some(s => s.metric === metric)
      ? sc.filter(s => s.metric !== metric)
      : [...sc, { metric, weight: 1 }])
  }
  const setWeight = (metric: GroupMetricKey, weight: number) =>
    setScorecard(sc => sc.map(s => s.metric === metric ? { ...s, weight } : s))

  const toggleColumn = (key: GroupMetricKey) =>
    setColumns(cols => cols.includes(key) ? cols.filter(c => c !== key) : [...cols, key])

  // --- templates ---
  const currentConfig = () => ({ conditions, dateField, dateFrom, dateTo, groupBy, columns, scorecard, chartType, chartMetric })
  const applyTemplate = (name: string) => {
    const t = templates.find(x => x.name === name)
    if (!t?.config) return
    const c = t.config
    setConditions(c.conditions || [])
    setDateField(c.dateField || "none"); setDateFrom(c.dateFrom || ""); setDateTo(c.dateTo || "")
    setGroupBy(c.groupBy || "agency")
    setColumns(c.columns?.length ? c.columns : DEFAULT_COLUMNS)
    setScorecard(c.scorecard || [])
    setChartType(c.chartType || "bar"); setChartMetric(c.chartMetric || "recoveredAmount")
  }
  const saveTemplate = async () => {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    try {
      const resp = await fetch("/api/admin/report-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName.trim(), config: currentConfig() }),
      })
      if (resp.ok) {
        const list = await fetch("/api/admin/report-templates")
        if (list.ok) setTemplates(await list.json())
        setTemplateName("")
      }
    } finally { setSavingTemplate(false) }
  }

  // --- export ---
  const tableColumns = (): GroupMetricKey[] => columns
  const exportExcel = async () => {
    const header = ["Rank", GROUP_FIELDS.find(g => g.key === groupBy)?.label || groupBy,
      ...tableColumns().map(k => METRIC_BY_KEY[k].label), ...(hasScore ? ["Score"] : [])]
    const body = sortedRows.map(g => [
      g.rank ?? "", g.group,
      ...tableColumns().map(k => Number((g as any)[k] || 0)),
      ...(hasScore ? [Number((g.score ?? 0).toFixed(1))] : []),
    ])
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Analysis")
    XLSX.writeFile(wb, `analysis-${groupBy}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }
  const printReport = () => {
    const w = window.open("", "_blank")
    if (!w) return
    const cols = tableColumns()
    const head = `<tr><th>Rank</th><th>${GROUP_FIELDS.find(g => g.key === groupBy)?.label || groupBy}</th>${cols.map(k => `<th>${METRIC_BY_KEY[k].label}</th>`).join("")}${hasScore ? "<th>Score</th>" : ""}</tr>`
    const body = sortedRows.map(g => `<tr><td>${g.rank ?? ""}</td><td>${g.group}</td>${cols.map(k => `<td>${formatMetric(Number((g as any)[k] || 0), METRIC_BY_KEY[k].kind)}</td>`).join("")}${hasScore ? `<td>${(g.score ?? 0).toFixed(1)}</td>` : ""}</tr>`).join("")
    w.document.write(`<html><head><title>Analysis Report</title><style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:20px;margin:0 0 4px} p{color:#666;font-size:12px;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f3f4f6}</style></head><body>
      <h1>Analysis Report — by ${GROUP_FIELDS.find(g => g.key === groupBy)?.label || groupBy}</h1>
      <p>Generated ${new Date().toLocaleString()} · ${filteredRows.length} records · ${sortedRows.length} groups</p>
      <table><thead>${head}</thead><tbody>${body}</tbody></table>
      </body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  if (userRole !== "admin") {
    return <div className="p-8 text-center text-gray-500">Analysis is available to admins only.</div>
  }
  if (loading) {
    return <div className="flex items-center justify-center py-20 gap-2 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading analytics…</div>
  }
  if (rows.length === 0) {
    return <div className="p-8 text-center text-gray-500">No consumer data cached yet. Open the Disconnection List first to load data into your browser.</div>
  }

  const groupLabel = GROUP_FIELDS.find(g => g.key === groupBy)?.label || groupBy

  return (
    <div className="space-y-4 pb-12">
      {/* Header + toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-600" /> Analysis</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={applyTemplate}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Load template…" /></SelectTrigger>
            <SelectContent>
              {templates.length === 0 && <div className="px-2 py-1 text-xs text-gray-400">No templates</div>}
              {templates.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-8 w-36 text-xs" placeholder="Template name…" value={templateName} onChange={e => setTemplateName(e.target.value)} />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={saveTemplate} disabled={!templateName.trim() || savingTemplate}>
            {savingTemplate ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportExcel}><Download className="h-3 w-3 mr-1" /> Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={printReport}><Printer className="h-3 w-3 mr-1" /> Print</Button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Consumers" value={totals.count.toLocaleString("en-IN")} accent="text-gray-900" />
        <KpiCard label="Total OSD" value={"₹" + Math.round(totals.totalOSD).toLocaleString("en-IN")} accent="text-red-600" />
        <KpiCard label="Recovered" value={"₹" + Math.round(totals.recoveredAmount).toLocaleString("en-IN")} accent="text-emerald-600" />
        <KpiCard label="Recovery %" value={totals.recoveryPct.toFixed(1) + "%"} accent="text-blue-600" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <button className="flex items-center gap-1 text-sm font-semibold" onClick={() => setShowFilters(s => !s)}>
            {showFilters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Filter className="h-4 w-4" /> Filters & Date Range
            <span className="text-xs font-normal text-gray-400">({filteredRows.length} of {rows.length} records)</span>
          </button>
          {showFilters && (
            <div className="space-y-2">
              {conditions.map((cond, i) => {
                const numeric = NUMERIC_FILTER_FIELDS.has(cond.field)
                const ops: Operator[] = numeric ? ["gt", "lt", "gte", "lte", "between", "eq"] : ["in", "nin", "eq", "neq"]
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Select value={cond.field} onValueChange={v => {
                      const num = NUMERIC_FILTER_FIELDS.has(v)
                      updateCondition(i, { field: v, op: num ? "gt" : "in", value: num ? "0" : [] })
                    }}>
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{FILTER_FIELDS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={cond.op} onValueChange={v => updateCondition(i, { op: v as Operator, value: isNumericOp(v as Operator) ? (v === "between" ? ["0", "0"] : "0") : [] })}>
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ops.map(o => <SelectItem key={o} value={o}>{OPERATOR_LABELS[o]}</SelectItem>)}</SelectContent>
                    </Select>
                    {numeric ? (
                      cond.op === "between" ? (
                        <div className="flex items-center gap-1">
                          <Input className="h-7 w-20 text-xs" type="number" value={String((cond.value as any[])?.[0] ?? "")} onChange={e => updateCondition(i, { value: [e.target.value, String((cond.value as any[])?.[1] ?? "")] as any })} />
                          <span className="text-gray-400">–</span>
                          <Input className="h-7 w-20 text-xs" type="number" value={String((cond.value as any[])?.[1] ?? "")} onChange={e => updateCondition(i, { value: [String((cond.value as any[])?.[0] ?? ""), e.target.value] as any })} />
                        </div>
                      ) : (
                        <Input className="h-7 w-24 text-xs" type="number" value={String(cond.value ?? "")} onChange={e => updateCondition(i, { value: e.target.value })} />
                      )
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-lg">
                        {distinctValues(cond.field).slice(0, 40).map(v => {
                          const selected = Array.isArray(cond.value) && (cond.value as string[]).includes(v)
                          return (
                            <button key={v} type="button"
                              className={`px-1.5 py-0.5 rounded-full text-[10px] border ${selected ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                              onClick={() => {
                                const cur = Array.isArray(cond.value) ? (cond.value as string[]) : []
                                updateCondition(i, { value: selected ? cur.filter(x => x !== v) : [...cur, v] })
                              }}>{v}</button>
                          )
                        })}
                      </div>
                    )}
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400" onClick={() => removeCondition(i)}><X className="h-3 w-3" /></Button>
                  </div>
                )
              })}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCondition}><Plus className="h-3 w-3 mr-1" /> Add condition</Button>
                <span className="text-xs text-gray-400">|</span>
                <Label className="text-xs text-gray-500">Date</Label>
                <Select value={dateField} onValueChange={v => setDateField(v as any)}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No date filter</SelectItem>
                    <SelectItem value="disconDate">Discon Date</SelectItem>
                    <SelectItem value="paidDate">Paid Date</SelectItem>
                  </SelectContent>
                </Select>
                {dateField !== "none" && (
                  <>
                    <Input type="date" className="h-7 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    <span className="text-gray-400 text-xs">to</span>
                    <Input type="date" className="h-7 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config: group-by, columns, scorecard */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <button className="flex items-center gap-1 text-sm font-semibold" onClick={() => setShowConfig(s => !s)}>
            {showConfig ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <SlidersHorizontal className="h-4 w-4" /> Report Configuration
          </button>
          {showConfig && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Label className="text-gray-500">Group by</Label>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{GROUP_FIELDS.map(g => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500 flex items-center gap-1 mb-1"><Columns3 className="h-3 w-3" /> Columns</Label>
                <div className="flex flex-wrap gap-1">
                  {METRICS.map(m => (
                    <button key={m.key} type="button"
                      className={`px-2 py-0.5 rounded-full text-[10px] border ${columns.includes(m.key as GroupMetricKey) ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                      onClick={() => toggleColumn(m.key as GroupMetricKey)}>{m.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500 flex items-center gap-1 mb-1"><Trophy className="h-3 w-3" /> Ranking scorecard (pick metrics + weights)</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {METRICS.map(m => (
                    <button key={m.key} type="button"
                      className={`px-2 py-0.5 rounded-full text-[10px] border ${scorecard.some(s => s.metric === m.key) ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-white border-gray-200 text-gray-500"}`}
                      onClick={() => toggleScorecardMetric(m.key as GroupMetricKey)}>{m.label}</button>
                  ))}
                </div>
                {scorecard.length > 0 && (
                  <div className="space-y-1.5">
                    {scorecard.map(s => (
                      <div key={s.metric} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate">{METRIC_BY_KEY[s.metric]?.label}</span>
                        <input type="range" min={0} max={5} step={0.5} value={s.weight}
                          onChange={e => setWeight(s.metric, Number(e.target.value))} className="flex-1 max-w-[200px]" />
                        <span className="w-10 text-gray-500">×{s.weight}</span>
                        <span className="text-[10px] text-gray-400">{METRIC_BY_KEY[s.metric]?.higherIsBetter ? "higher better" : "lower better"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1">
              <Button size="sm" variant={chartType === "bar" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setChartType("bar")}><BarChart3 className="h-3 w-3 mr-1" /> Bar</Button>
              <Button size="sm" variant={chartType === "pie" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setChartType("pie")}><PieIcon className="h-3 w-3 mr-1" /> Pie</Button>
            </div>
            <Select value={chartMetric} onValueChange={v => setChartMetric(v as GroupMetricKey)}>
              <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              {chartType === "bar" ? (
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={60} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => formatMetric(Number(v), METRIC_BY_KEY[chartMetric].kind)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e: any) => e.name}>
                    {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatMetric(Number(v), METRIC_BY_KEY[chartMetric].kind)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                {hasScore && <Th label="#" onClick={() => toggleSort("rank")} active={sortKey === "rank"} dir={sortDir} className="w-10 text-center" />}
                <Th label={groupLabel} onClick={() => toggleSort("group")} active={sortKey === "group"} dir={sortDir} />
                {columns.map(k => (
                  <Th key={k} label={METRIC_BY_KEY[k].label} onClick={() => toggleSort(k)} active={sortKey === k} dir={sortDir} className="text-right" />
                ))}
                {hasScore && <Th label="Score" onClick={() => toggleSort("score")} active={sortKey === "score"} dir={sortDir} className="text-right" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedRows.map(g => (
                <tr key={g.group} className="hover:bg-gray-50">
                  {hasScore && (
                    <td className="px-2 py-1.5 text-center">
                      {g.rank && g.rank <= 3
                        ? <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${g.rank === 1 ? "bg-amber-100 text-amber-700" : g.rank === 2 ? "bg-gray-200 text-gray-600" : "bg-orange-100 text-orange-700"}`}>{g.rank}</span>
                        : <span className="text-gray-400">{g.rank}</span>}
                    </td>
                  )}
                  <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[200px] truncate" title={g.group}>{g.group}</td>
                  {columns.map(k => {
                    const def = METRIC_BY_KEY[k]
                    const val = Number((g as any)[k] || 0)
                    const color = def.kind === "amount" && k.includes("recover") ? "text-emerald-700"
                      : def.kind === "amount" ? "text-red-600"
                      : def.kind === "percent" ? "text-blue-700" : "text-gray-700"
                    return <td key={k} className={`px-3 py-1.5 text-right tabular-nums ${color}`}>{formatMetric(val, def.kind)}</td>
                  })}
                  {hasScore && (
                    <td className="px-3 py-1.5 text-right">
                      <span className="inline-block min-w-[3rem]">
                        <span className="font-semibold text-gray-800">{(g.score ?? 0).toFixed(1)}</span>
                        <span className="ml-1 inline-block h-1.5 rounded-full bg-blue-500 align-middle" style={{ width: `${Math.max(4, (g.score ?? 0) * 0.4)}px` }} />
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold text-gray-700">
              <tr>
                {hasScore && <td />}
                <td className="px-3 py-1.5">Total ({sortedRows.length})</td>
                {columns.map(k => (
                  <td key={k} className="px-3 py-1.5 text-right tabular-nums">{formatMetric(Number((totals as any)[k] || 0), METRIC_BY_KEY[k].kind)}</td>
                ))}
                {hasScore && <td />}
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
    </CardContent></Card>
  )
}

function Th({ label, onClick, active, dir, className = "" }: { label: string; onClick: () => void; active: boolean; dir: "asc" | "desc"; className?: string }) {
  return (
    <th className={`px-3 py-2 whitespace-nowrap font-medium cursor-pointer select-none ${className}`} onClick={onClick}>
      <span className={`inline-flex items-center gap-0.5 ${active ? "text-blue-600" : ""}`}>
        {label}{active && <span className="text-[8px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  )
}
