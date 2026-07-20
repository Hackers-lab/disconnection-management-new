"use server"

import { redirect } from "next/navigation"
import { createSession, deleteSession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

// Function to get a specific user by credentials
export async function getUserByCredentials(username: string, password: string) {
  return await userStorage.findUserByCredentials(username, password)
}

export async function login(formData: FormData) {
  const username = (formData.get("username") as string) || ""
  const password = (formData.get("password") as string) || ""
  const deviceId = (formData.get("deviceId") as string) || undefined

  if (!username || !password) {
    return { error: "Username and password are required" }
  }

  console.log("🔍 Login attempt for:", username)

  const user = await getUserByCredentials(username, password)

  if (!user) {
    console.log("❌ Login failed for:", username)
    return { error: "Invalid username or password" }
  }

  console.log("✅ Login successful for:", username, "Role:", user.role)
  await createSession(user.id, username, user.role, user.agencies, user.cccCode)

  if (user.role === "superuser") {
    redirect("/superuser")
  } else {
    redirect("/dashboard")
  }
}

export async function logout() {
  await deleteSession()
  redirect("/login")
}
