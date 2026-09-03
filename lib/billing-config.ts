/**
 * Shared billing configuration — Single Source of Truth.
 * All billing-related constants and helpers live here so they are never duplicated.
 */

/**
 * The date at which subscription billing enforcement begins.
 * Before this date, all agencies are treated as subscribed (trial period).
 */
export const BILLING_START_DATE_STR = "2026-09-07"
export const BILLING_START_DATE = new Date("2026-09-07T00:00:00")

/**
 * Returns true if the billing enforcement window is currently active.
 */
export function isBillingActive(): boolean {
  return Date.now() >= BILLING_START_DATE.getTime()
}
