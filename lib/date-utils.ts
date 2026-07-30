// Shared date helpers — IST (UTC+5:30), safe for server and client

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS)
}

/** "DD-MM-YYYY HH:MM" */
export function nowTs(): string {
  const d = nowIST()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** "DD-MM-YYYY" */
export function nowDate(): string {
  return nowTs().split(" ")[0]
}

/** Parse "DD-MM-YYYY HH:MM", "DD-MM-YYYY", ISO string, etc. → epoch ms */
export function parseTs(ts: string): number {
  if (!ts) return 0
  try {
    const trimmed = ts.trim()
    if (!trimmed) return 0
    if (trimmed.includes("T") || (trimmed.includes("-") && trimmed.indexOf("-") === 4)) {
      const parsed = new Date(trimmed).getTime()
      if (!isNaN(parsed)) return parsed
    }
    const [datePart, timePart = "00:00"] = trimmed.split(" ")
    const parts = datePart.split("-").map(Number)
    if (parts.length === 3) {
      const [d, m, y] = parts
      const [h = 0, min = 0] = (timePart || "00:00").split(":").map(Number)
      if (d && m && y) {
        const parsed = new Date(y, m - 1, d, h, min).getTime()
        if (!isNaN(parsed)) return parsed
      }
    }
    const fallback = new Date(trimmed).getTime()
    return isNaN(fallback) ? 0 : fallback
  } catch {
    return 0
  }
}

/** Current Indian financial year, e.g. "26-27" */
export function currentFY(): string {
  const d = nowIST()
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
  return m >= 4
    ? `${String(y).slice(2)}-${String(y + 1).slice(2)}`
    : `${String(y - 1).slice(2)}-${String(y).slice(2)}`
}
