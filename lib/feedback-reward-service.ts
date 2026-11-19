import { db } from "./db"
import { createSession } from "./session"
import {
  FEEDBACK_REWARD_DAYS,
  FEEDBACK_MIN_WRITTEN_CHARS,
  FEEDBACK_REWARD_TYPE,
  FEEDBACK_QUICK_CHIPS,
  type FeedbackRewardStatus,
  type FeedbackRewardGrantResult,
  parseExpiryEndOfDayMs,
  isExpiryDateActive,
  pickLaterExpiry,
  formatDisplayExpiryDate,
  computeGenuineWrittenLength,
} from "./feedback-reward-utils"

export {
  FEEDBACK_REWARD_DAYS,
  FEEDBACK_MIN_WRITTEN_CHARS,
  FEEDBACK_REWARD_TYPE,
  FEEDBACK_QUICK_CHIPS,
  type FeedbackRewardStatus,
  type FeedbackRewardGrantResult,
  parseExpiryEndOfDayMs,
  isExpiryDateActive,
  pickLaterExpiry,
  formatDisplayExpiryDate,
  computeGenuineWrittenLength,
}

export interface SessionRewardContext {
  userId: string
  username: string
  role: string
  cccCode: string
  agencies?: string[]
  name?: string
  subscriptionStatus?: string
  subscriptionExpiresAt?: string
  bypassSubscription?: boolean
}

let rewardTableInitialized = false

export async function ensureFeedbackRewardsTable(): Promise<void> {
  if (rewardTableInitialized) return
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS feedback_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reward_type TEXT NOT NULL DEFAULT 'feedback_7d',
        ccc_code TEXT NOT NULL,
        claim_scope_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        agency_name TEXT,
        days_granted INTEGER NOT NULL DEFAULT 7,
        previous_expires_at TEXT,
        new_expires_at TEXT NOT NULL,
        feedback_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_rewards_unique_scope
      ON feedback_rewards (ccc_code, claim_scope_key, reward_type)
    `)
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_feedback_rewards_user
      ON feedback_rewards (user_id, reward_type)
    `)
    rewardTableInitialized = true
  } catch (err) {
    console.warn("[feedback-reward] Table initialization warning:", err)
  }
}

function formatYyyyMmDd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDaysToExpiry(currentExpiry?: string | null, days = FEEDBACK_REWARD_DAYS): string {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let baseDate = todayStart
  const clean = String(currentExpiry || "").trim().split("T")[0]
  if (clean) {
    const parts = clean.split("-")
    if (parts.length === 3 && parts[0].length === 4) {
      const parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > todayStart.getTime()) {
        baseDate = parsed
      }
    } else {
      const parsed = new Date(currentExpiry as string)
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > todayStart.getTime()) {
        baseDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      }
    }
  }

  const next = new Date(baseDate.getTime())
  next.setDate(next.getDate() + days)
  return formatYyyyMmDd(next)
}

function resolveClaimScope(session: SessionRewardContext): {
  cccCode: string
  scopeKey: string
  agencyName: string
  isAgencyScoped: boolean
} {
  const cccCode = String(session.cccCode || "MAIN").trim().toUpperCase()
  const roleLower = String(session.role || "").trim().toLowerCase()
  const agencies = Array.isArray(session.agencies)
    ? session.agencies.map((a) => String(a || "").trim()).filter(Boolean)
    : []

  const primaryAgency =
    agencies[0] || (roleLower === "agency" ? String(session.name || session.username || "").trim() : "")

  if (primaryAgency && (roleLower === "agency" || agencies.length > 0)) {
    const normalizedAgency = primaryAgency.toLowerCase().replace(/\s+/g, " ")
    return {
      cccCode,
      scopeKey: `agency:${normalizedAgency}`,
      agencyName: primaryAgency,
      isAgencyScoped: true,
    }
  }

  return {
    cccCode,
    scopeKey: `user:${String(session.userId || session.username).trim().toLowerCase()}`,
    agencyName: "",
    isAgencyScoped: false,
  }
}

function isAccountRewardBypassed(session: SessionRewardContext): boolean {
  const roleLower = String(session.role || "").trim().toLowerCase()
  if (roleLower === "superuser" || roleLower === "monitor") return true
  if (String(session.userId || "").startsWith("div-")) return true
  if (session.bypassSubscription) return true
  if (roleLower === "admin") return true
  return false
}

export async function getFeedbackRewardStatus(
  session: SessionRewardContext
): Promise<FeedbackRewardStatus> {
  if (isAccountRewardBypassed(session)) {
    return {
      eligible: false,
      reason: "bypass_account",
      daysBonus: FEEDBACK_REWARD_DAYS,
      minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
      claimedAt: null,
      claimedBy: null,
      previousExpiresAt: null,
      newExpiresAt: null,
    }
  }

  await ensureFeedbackRewardsTable()
  const { cccCode, scopeKey, isAgencyScoped } = resolveClaimScope(session)

  try {
    // Check both agency scope AND direct user_id claim to prevent cross-agency re-claiming by same user
    const res = await db.execute({
      sql: `SELECT user_id, username, previous_expires_at, new_expires_at, created_at
            FROM feedback_rewards
            WHERE reward_type = ?
              AND ((ccc_code = ? AND claim_scope_key = ?) OR user_id = ?)
            LIMIT 1`,
      args: [FEEDBACK_REWARD_TYPE, cccCode, scopeKey, session.userId],
    })

    if (res.rows && res.rows.length > 0) {
      const row: any = res.rows[0]
      const claimedBySelf =
        String(row.user_id || "") === String(session.userId) ||
        String(row.username || "").toLowerCase() === String(session.username || "").toLowerCase()

      return {
        eligible: false,
        reason: claimedBySelf
          ? "already_claimed_by_user"
          : isAgencyScoped
            ? "already_claimed_by_agency"
            : "already_claimed_by_user",
        daysBonus: FEEDBACK_REWARD_DAYS,
        minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
        claimedAt: row.created_at ? String(row.created_at) : null,
        claimedBy: row.username ? String(row.username) : null,
        previousExpiresAt: row.previous_expires_at ? String(row.previous_expires_at) : null,
        newExpiresAt: row.new_expires_at ? String(row.new_expires_at) : null,
      }
    }
  } catch (err) {
    console.warn("[feedback-reward] Status check warning:", err)
  }

  return {
    eligible: true,
    reason: "eligible",
    daysBonus: FEEDBACK_REWARD_DAYS,
    minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
    claimedAt: null,
    claimedBy: null,
    previousExpiresAt: null,
    newExpiresAt: null,
  }
}

export async function tryGrantFeedbackReward(
  session: SessionRewardContext,
  feedbackId: string,
  rawComment: string
): Promise<FeedbackRewardGrantResult> {
  const writtenChars = computeGenuineWrittenLength(rawComment)

  const currentStatus = await getFeedbackRewardStatus(session)
  if (!currentStatus.eligible) {
    return {
      granted: false,
      reason: currentStatus.reason === "eligible" ? "not_applicable" : currentStatus.reason,
      daysAdded: 0,
      writtenChars,
      minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
      previousExpiresAt: currentStatus.previousExpiresAt,
      newExpiresAt: currentStatus.newExpiresAt,
      message:
        currentStatus.reason === "already_claimed_by_user"
          ? "Your feedback was updated. You already claimed the one-time +7 day bonus."
          : currentStatus.reason === "already_claimed_by_agency"
            ? "Your feedback was saved. Your agency's one-time +7 day bonus was already redeemed."
            : "Your feedback was saved. Your account already has full unrestricted access.",
    }
  }

  if (writtenChars < FEEDBACK_MIN_WRITTEN_CHARS) {
    return {
      granted: false,
      reason: "comment_too_short",
      daysAdded: 0,
      writtenChars,
      minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
      previousExpiresAt: null,
      newExpiresAt: null,
      message: `Feedback saved! Write at least ${FEEDBACK_MIN_WRITTEN_CHARS} characters of personal review anytime to unlock your +${FEEDBACK_REWARD_DAYS} day bonus.`,
    }
  }

  await ensureFeedbackRewardsTable()
  const { cccCode, scopeKey, agencyName } = resolveClaimScope(session)

  try {
    // 1. Fetch user's latest DB expiry to compute effective base expiry = MAX(userExpiry, sessionExpiry)
    let dbUserExpiry = ""
    const userRes = await db.execute({
      sql: `SELECT subscription_expires_at FROM users WHERE id = ? LIMIT 1`,
      args: [session.userId],
    })
    if (userRes.rows && userRes.rows.length > 0) {
      dbUserExpiry = String((userRes.rows[0] as any).subscription_expires_at || "").trim()
    }

    const effectivePreviousExpiry = pickLaterExpiry(dbUserExpiry, session.subscriptionExpiresAt)
    const newExpiresAt = addDaysToExpiry(effectivePreviousExpiry, FEEDBACK_REWARD_DAYS)

    // 2. Atomic claim insert (UNIQUE constraint prevents concurrent double-claims across agency logins)
    try {
      await db.execute({
        sql: `INSERT INTO feedback_rewards (
                reward_type, ccc_code, claim_scope_key, user_id, username, agency_name,
                days_granted, previous_expires_at, new_expires_at, feedback_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          FEEDBACK_REWARD_TYPE,
          cccCode,
          scopeKey,
          session.userId,
          session.username,
          agencyName || null,
          FEEDBACK_REWARD_DAYS,
          effectivePreviousExpiry || null,
          newExpiresAt,
          feedbackId || null,
        ],
      })
    } catch (insertErr: any) {
      const msg = String(insertErr?.message || insertErr || "")
      if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("constraint")) {
        return {
          granted: false,
          reason: agencyName ? "already_claimed_by_agency" : "already_claimed_by_user",
          daysAdded: 0,
          writtenChars,
          minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
          previousExpiresAt: effectivePreviousExpiry || null,
          newExpiresAt: null,
          message: "Feedback saved. The one-time +7 day bonus has already been claimed for this agency.",
        }
      }
      throw insertErr
    }

    // 3. Credit +7 days strictly to the individual submitting user's account in `users`
    await db.execute({
      sql: `UPDATE users
            SET subscription_status = 'active',
                subscription_expires_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [newExpiresAt, session.userId],
    })

    // 4. Invalidate user storage cache & immediately refresh session cookie
    const { UserStorage } = await import("./user-storage")
    UserStorage.getInstance().invalidateCache()

    await createSession(
      session.userId,
      session.username,
      session.role,
      session.agencies || [],
      session.cccCode,
      session.name || "",
      "active",
      newExpiresAt,
      Boolean(session.bypassSubscription)
    )

    console.log(
      `🎁 [FEEDBACK REWARD] +${FEEDBACK_REWARD_DAYS}d granted to user '${session.username}' (CCC: ${cccCode}, scope: ${scopeKey}) | ${effectivePreviousExpiry || "none"} -> ${newExpiresAt}`
    )

    return {
      granted: true,
      reason: "granted",
      daysAdded: FEEDBACK_REWARD_DAYS,
      writtenChars,
      minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
      previousExpiresAt: effectivePreviousExpiry || null,
      newExpiresAt,
      message: `+${FEEDBACK_REWARD_DAYS} free days added to your subscription! Valid until ${newExpiresAt}.`,
    }
  } catch (err) {
    console.error("[feedback-reward] Error granting feedback reward:", err)
    return {
      granted: false,
      reason: "error",
      daysAdded: 0,
      writtenChars,
      minWrittenChars: FEEDBACK_MIN_WRITTEN_CHARS,
      previousExpiresAt: null,
      newExpiresAt: null,
      message: "Feedback saved! We couldn't apply the bonus automatically right now—please try editing your review shortly.",
    }
  }
}
