export const FEEDBACK_REWARD_DAYS = 7
export const FEEDBACK_MIN_WRITTEN_CHARS = 20
export const FEEDBACK_REWARD_TYPE = "feedback_7d"
export const FEEDBACK_REWARD_EVENT = "feedback-reward-granted"

export const FEEDBACK_QUICK_CHIPS = [
  "⚡ Super Fast & Smooth",
  "📱 Easy on Mobile",
  "⏳ Saves a Lot of Time",
  "🎯 Very Helpful in Field",
  "👍 Best Tool for DC Work",
  "👌 Simple & User Friendly",
]

const AUTO_FILL_FALLBACKS = new Set([
  "excellent app! makes daily field operations very smooth, accurate and fast.",
  "very good and reliable app for daily disconnection and field work.",
])

export interface FeedbackRewardStatus {
  eligible: boolean
  reason:
    | "eligible"
    | "already_claimed_by_user"
    | "already_claimed_by_agency"
    | "bypass_account"
    | "not_applicable"
  daysBonus: number
  minWrittenChars: number
  claimedAt: string | null
  claimedBy: string | null
  previousExpiresAt: string | null
  newExpiresAt: string | null
}

export interface FeedbackRewardGrantResult {
  granted: boolean
  reason:
    | "granted"
    | "comment_too_short"
    | "already_claimed_by_user"
    | "already_claimed_by_agency"
    | "bypass_account"
    | "not_applicable"
    | "error"
  daysAdded: number
  writtenChars: number
  minWrittenChars: number
  previousExpiresAt: string | null
  newExpiresAt: string | null
  message: string
}

/**
 * Parse a YYYY-MM-DD (or ISO) date string into a local end-of-day timestamp (23:59:59.999).
 */
export function parseExpiryEndOfDayMs(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const clean = String(dateStr).trim().split("T")[0]
  if (!clean) return null
  const parts = clean.split("-")
  if (parts.length === 3 && parts[0].length === 4) {
    const y = Number(parts[0])
    const m = Number(parts[1]) - 1
    const d = Number(parts[2])
    const dt = new Date(y, m, d, 23, 59, 59, 999)
    return Number.isNaN(dt.getTime()) ? null : dt.getTime()
  }
  const dt = new Date(dateStr)
  if (Number.isNaN(dt.getTime())) return null
  dt.setHours(23, 59, 59, 999)
  return dt.getTime()
}

export function isExpiryDateActive(dateStr?: string | null): boolean {
  const ms = parseExpiryEndOfDayMs(dateStr)
  if (ms === null) return false
  return ms >= Date.now()
}

export function pickLaterExpiry(a?: string | null, b?: string | null): string {
  const cleanA = String(a || "").trim()
  const cleanB = String(b || "").trim()
  if (!cleanA) return cleanB
  if (!cleanB) return cleanA

  const msA = parseExpiryEndOfDayMs(cleanA)
  const msB = parseExpiryEndOfDayMs(cleanB)
  if (msA === null) return cleanB
  if (msB === null) return cleanA
  return msA >= msB ? cleanA : cleanB
}

export function formatDisplayExpiryDate(dateStr?: string | null): string {
  if (!dateStr) return ""
  const clean = String(dateStr).trim().split("T")[0]
  const parts = clean.split("-")
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return clean
}

/**
 * Computes genuine user-written character length after stripping boilerplate quick-highlight chips
 * and auto-fill fallback strings so rewards require a real written review.
 */
export function computeGenuineWrittenLength(rawComment: string): number {
  const trimmed = String(rawComment || "").trim()
  if (!trimmed) return 0
  if (AUTO_FILL_FALLBACKS.has(trimmed.toLowerCase())) return 0

  let cleaned = trimmed
  for (const chip of FEEDBACK_QUICK_CHIPS) {
    cleaned = cleaned.split(chip).join(" ")
  }
  // Strip suggestion wrapper label if present (keep actual suggestion text)
  cleaned = cleaned.replace(/\(Suggestion:\s*/gi, " ").replace(/\)$/g, " ")
  // Remove excessive punctuation/separators left behind from stripped chips
  cleaned = cleaned.replace(/[,|•·]+/g, " ").replace(/\s+/g, " ").trim()
  return cleaned.length
}
