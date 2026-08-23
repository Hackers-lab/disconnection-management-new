import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import DashboardClient from "@/components/dashboard-client"

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    redirect("/login")
  }

  return <DashboardClient role={session.role} agencies={session.agencies} />
}
