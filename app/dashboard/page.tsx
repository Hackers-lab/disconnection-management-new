import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import DashboardClient from "@/components/dashboard-client"
import { roleStorage } from "@/lib/role-storage"
import { expandRolePermissions } from "@/lib/permissions"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { getUserFeedback } from "@/lib/feedback-service"

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    redirect("/login")
  }

  let permissions: Record<string, string[]> = {}
  try {
    const raw = await roleStorage.getPermissionsForRole(session.role)
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
