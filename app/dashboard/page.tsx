import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import DashboardClient from "@/components/dashboard-client"
import { SubscriptionPaywall } from "@/components/subscription-paywall"
import { AgencyProfileIncomplete } from "@/components/agency-profile-incomplete"
import { db } from "@/lib/db"
import { roleStorage } from "@/lib/role-storage"
import { expandRolePermissions } from "@/lib/permissions"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { getUserFeedback } from "@/lib/feedback-service"

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    redirect("/login")
  }

  // Superuser has a dedicated dashboard — redirect them there
  if (session.role === "superuser") {
    redirect("/superuser")
  }

  // Server-side subscription paywall: only agency/vendor users without active subscription are gated
  if (session.role === "agency" && !session.isSubscribed) {
    return <SubscriptionPaywall session={session} />
  }

  // Server-side profile completeness gate: agency users must have SAP Vendor Code & Mobile
  if (session.role === "agency") {
    try {
      const rawAgencies = session.agencies || []
      const agencyName = rawAgencies.length > 0 ? rawAgencies[0] : (session.name || session.username)
      const cccCode = session.cccCode || ""

      if (cccCode && agencyName) {
        const agencyRes = await db.execute({
          sql: `SELECT a.id, a.name, a.vendor_code, a.mobile_number, a.is_active,
                       u.mobile_number as user_mobile
                FROM users u
                LEFT JOIN ccc_registry c ON u.ccc_id = c.id
                LEFT JOIN agencies a ON a.ccc_id = c.id AND (a.name = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE)
                WHERE u.id = ? AND c.ccc_code = ? COLLATE NOCASE
                ORDER BY a.is_active DESC, a.id DESC
                LIMIT 1`,
          args: [agencyName, session.username, session.userId, cccCode]
        })

        let ag: any = (agencyRes.rows && agencyRes.rows.length > 0) ? agencyRes.rows[0] : null
        const isMissingVendor = !ag?.vendor_code || !String(ag.vendor_code).trim()
        const isMissingMobile = !ag?.mobile_number || !String(ag.mobile_number).trim()
        const isMissingUserMobile = !ag?.user_mobile || !String(ag.user_mobile).trim()

        if (isMissingVendor || isMissingMobile || isMissingUserMobile) {
          const userMobile = String(ag?.user_mobile || "")

          return (
            <AgencyProfileIncomplete
              session={session}
              agencyName={String(ag?.name || agencyName)}
              existingVendorCode={String(ag?.vendor_code || "")}
              existingMobileNumber={String(ag?.mobile_number || "")}
              existingUserMobile={userMobile}
              missingFields={{
                vendorCode: isMissingVendor,
                mobileNumber: isMissingMobile,
              }}
            />
          )
        }
      }
    } catch (profileCheckErr) {
      console.warn("Agency profile completeness check notice:", profileCheckErr)
    }
  }

  // Fetch permissions, tenant config, and user feedback concurrently in parallel
  const [permsResult, tenantResult, feedbackResult] = await Promise.allSettled([
    roleStorage.getPermissionsForRole(session.role, session.cccCode || "").catch(() => null),
    session.cccCode ? getTenantConfig(session.cccCode).catch(() => null) : Promise.resolve(null),
    getUserFeedback(session.username, session.cccCode).catch(() => null),
  ])

  let permissions: Record<string, string[]> = {}
  if (permsResult.status === "fulfilled" && permsResult.value) {
    permissions = expandRolePermissions(session.role, permsResult.value) || {}
  }

  let cccName = ""
  if (tenantResult.status === "fulfilled" && tenantResult.value?.cccName) {
    cccName = tenantResult.value.cccName
  }

  let hasFeedback = false
  if (feedbackResult.status === "fulfilled" && feedbackResult.value?.comment) {
    hasFeedback = feedbackResult.value.comment.trim().length > 0
  }

  return (
    <DashboardClient 
      role={session.role} 
      agencies={session.agencies}
      initialPermissions={permissions}
      initialHasFeedback={hasFeedback}
      initialProfile={{
        name: session.name,
        username: session.username,
        cccCode: session.cccCode,
        cccName: cccName || session.cccCode || "",
        isSubscribed: session.isSubscribed,
        subscriptionExpiresAt: session.subscriptionExpiresAt,
        bypassSubscription: session.bypassSubscription,
      }}
    />
  )
}
