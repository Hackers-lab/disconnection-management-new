import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"

export default async function Home() {
  const session = await verifySession()

  if (session) {
    redirect("/dashboard")
  } else {
    redirect("/login")
  }
}
