import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import { SuperuserDashboard } from "@/components/superuser-dashboard"

export const dynamic = "force-dynamic"

export default async function SuperuserPage() {
  const session = await verifySession()

  if (!session) {
    redirect("/login")
  }

  if (session.role !== "superuser") {
    redirect("/dashboard")
  }

  return <SuperuserDashboard />
}
