// Pure, client-side filter rule engine for the DC-list upload.
// Runs entirely in the browser — zero server CPU.
//
// Model is DNF (sum of products): a row is INCLUDED iff it matches ALL
// conditions of AT LEAST ONE group. Empty group list = include everything.
// This expresses "RURAL & amt>500 OR URBAN & amt>1000" naturally.

export type Operator =
  | "eq" | "neq"        // equals / not equals (text, case-insensitive)
  | "in" | "nin"        // value is one of / none of (categorical multi-select)
  | "gt" | "lt" | "gte" | "lte" // numeric comparisons
  | "between"           // numeric inclusive range

export interface Condition {
  field: string
  op: Operator
  value: string | string[] | [number, number]
}

export interface Group {
  conditions: Condition[]
}

const NUMERIC_OPS: Operator[] = ["gt", "lt", "gte", "lte", "between"]

export function isNumericOp(op: Operator): boolean {
  return NUMERIC_OPS.includes(op)
}

// Parse an amount-like string ("5,700.00", "₹530", "146.9") to a number.
export function toNumber(raw: string): number {
  const n = parseFloat(String(raw ?? "").replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, ""))
  return isNaN(n) ? 0 : n
}

function eqCI(a: string, b: string): boolean {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

export function conditionMatches(raw: string, c: Condition): boolean {
  const val = c.value
  switch (c.op) {
    case "eq":  return eqCI(raw, String(val ?? ""))
    case "neq": return !eqCI(raw, String(val ?? ""))
    case "in":  return Array.isArray(val) && (val as string[]).some(v => eqCI(raw, v))
    case "nin": return Array.isArray(val) && !(val as string[]).some(v => eqCI(raw, v))
    case "gt":  return toNumber(raw) >  toNumber(String(val))
    case "lt":  return toNumber(raw) <  toNumber(String(val))
    case "gte": return toNumber(raw) >= toNumber(String(val))
    case "lte": return toNumber(raw) <= toNumber(String(val))
    case "between": {
      if (!Array.isArray(val) || val.length < 2) return true
      const n = toNumber(raw)
      const lo = toNumber(String(val[0])), hi = toNumber(String(val[1]))
      return n >= lo && n <= hi
    }
    default: return true
  }
}

// getField resolves a field name to the row's string value.
export function rowMatchesGroups(getField: (field: string) => string, groups: Group[]): boolean {
  if (!groups || groups.length === 0) return true
  return groups.some(g =>
    g.conditions.length === 0 ||
    g.conditions.every(c => conditionMatches(getField(c.field), c))
  )
}

export const OPERATOR_LABELS: Record<Operator, string> = {
  eq: "is", neq: "is not",
  in: "is any of", nin: "is none of",
  gt: ">", lt: "<", gte: "≥", lte: "≤", between: "between",
}
