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

/**
 * Normalizes date strings (DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD) into canonical "DD-MM-YYYY".
 * Detects dates that were flipped by Google Sheets US locale (e.g. Month > currentMonth in the current year)
 * and safely un-flips Day and Month back to their actual values.
 */
export function sanitizeDisconDate(rawDate: string | null | undefined): string {
  if (!rawDate || typeof rawDate !== "string") return ""
  const trimmed = rawDate.trim()
  if (!trimmed || trimmed === "-") return ""

  // Standardize delimiters
  const clean = trimmed.replace(/[./]/g, "-")

  // Case 1: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number)
    const now = nowIST()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth() + 1
    let actD = d
    let actM = m

    // If year is current year and month is in future while day is in past/current, unswap
    if (y === currentYear && actM > currentMonth && actD <= currentMonth) {
      const tmp = actD
      actD = actM
      actM = tmp
    }

    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(actD)}-${pad(actM)}-${y}`
  }

  // Case 2: DD-MM-YYYY or MM-DD-YYYY
  const parts = clean.split("-")
  if (parts.length === 3) {
    let [p1, p2, p3] = parts.map(Number)
    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      let year = p3
      if (year < 100) year += 2000

      let day = p1
      let month = p2

      const now = nowIST()
      const currentYear = now.getUTCFullYear()
      const currentMonth = now.getUTCMonth() + 1

      // If month > 12, then p1 must have been month and p2 day (e.g. 08-25-2026)
      if (month > 12 && day <= 12) {
        const tmp = day
        day = month
        month = tmp
      }
      // If year is current year and month is in future (> currentMonth) while day is <= currentMonth,
      // it was flipped by Google Sheets US locale parsing (e.g. 08-12-2026 for 12th Aug)
      else if (year === currentYear && month > currentMonth && day <= currentMonth) {
        const tmp = day
        day = month
        month = tmp
      }

      const pad = (n: number) => String(n).padStart(2, "0")
      return `${pad(day)}-${pad(month)}-${year}`
    }
  }

  return clean
}
