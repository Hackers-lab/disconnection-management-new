import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import DashboardClient from "@/components/dashboard-client"
import { SubscriptionPaywall } from "@/components/subscription-paywall"
import { AgencyProfileIncomplete } from "@/components/agency-profile-incomplete"
import { db } from "@/lib/db"
import { roleStorage } from "@/lib/role-storage"
import { expandRolePermissions } from "@/lib/permissions"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { getUserFeedback } from "@/lib/feedback-service"

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    redirect("/login")
  }

  // Server-side subscription paywall: unsubscribed users NEVER see the dashboard
  if (!session.isSubscribed) {
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
                FROM agencies a
                JOIN ccc_registry c ON a.ccc_id = c.id
                LEFT JOIN users u ON u.id = ?
                WHERE c.ccc_code = ? COLLATE NOCASE
                  AND (a.name = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE)
                LIMIT 1`,
          args: [session.userId, cccCode, agencyName, session.username]
        })

        let ag: any = (agencyRes.rows && agencyRes.rows.length > 0) ? agencyRes.rows[0] : null
        const isMissingVendor = !ag?.vendor_code || !String(ag.vendor_code).trim()
        const isMissingMobile = !ag?.mobile_number || !String(ag.mobile_number).trim()

        if (isMissingVendor || isMissingMobile) {
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

  let permissions: Record<string, string[]> = {}
  try {
    const raw = await roleStorage.getPermissionsForRole(session.role, session.cccCode || "")
    permissions = expandRolePermissions(session.role, raw) || {}
  } catch (e) {
    // fallback
  }

  let cccName = ""
  if (session.cccCode) {
    try {
      const registry = await getTenantRegistry()
      const tenant = registry[session.cccCode] || registry[session.cccCode.toUpperCase()]
      if (tenant) {
        cccName = tenant.cccName
      }
    } catch (e) {}
  }

  let hasFeedback = false
  try {
    const fb = await getUserFeedback(session.username, session.cccCode)
    hasFeedback = !!(fb && fb.comment && fb.comment.trim().length > 0)
  } catch (e) {}

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
