/**
 * Server-side subscription plan catalog.
 * All pricing and duration are controlled here — never trust client-sent values.
 */

export interface SubscriptionPlan {
  id: string
  name: string
  amount: number // in paise (e.g. 9900 = ₹99)
  days: number
  description: string
}

/**
 * Predefined subscription plans.
 * To add a new plan, add an entry here — no client changes needed.
 */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "monthly_79",
    name: "1 Month Vendor Access",
    amount: 7900,
    days: 30,
    description: "30 days of full vendor access (60% OFF)",
  },
  {
    id: "quarterly_199",
    name: "3 Month Vendor Access",
    amount: 19900,
    days: 90,
    description: "90 days of full vendor access (67% OFF - Save ₹398)",
  },
  {
    id: "half_yearly_349",
    name: "6 Month Vendor Access",
    amount: 34900,
    days: 180,
    description: "180 days of full vendor access (71% OFF - Save ₹845)",
  },
  // Legacy plan retained for verification/webhook backwards-compatibility
  {
    id: "monthly_99",
    name: "1 Month Vendor Access (Legacy)",
    amount: 9900,
    days: 30,
    description: "30 days of full vendor access",
  },
]

/**
 * Look up a plan by amount (in paise).
 * Returns the matching plan or null if the amount doesn't correspond to any plan.
 */
export function getPlanByAmount(amount: number): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS.find((p) => p.amount === amount) || null
}

/**
 * Look up a plan by its ID.
 */
export function getPlanById(id: string): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id) || null
}

/**
 * Validate that an amount corresponds to a valid plan.
 */
export function isValidPlanAmount(amount: number): boolean {
  return SUBSCRIPTION_PLANS.some((p) => p.amount === amount)
}
