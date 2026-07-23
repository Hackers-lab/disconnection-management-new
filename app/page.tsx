import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import LoginPage from "./login/page"

export default async function Home() {
  const session = await verifySession()

  if (session) {
    redirect("/dashboard")
  }

  return <LoginPage />
}
