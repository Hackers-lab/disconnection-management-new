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
    id: "monthly_99",
    name: "1 Month Vendor Access",
    amount: 9900,
    days: 30,
    description: "30 days of full vendor access",
  },
  {
    id: "quarterly_249",
    name: "3 Month Vendor Access",
    amount: 24900,
    days: 90,
    description: "90 days of full vendor access",
  },
  {
    id: "yearly_899",
    name: "1 Year Vendor Access",
    amount: 89900,
    days: 365,
    description: "365 days of full vendor access",
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
