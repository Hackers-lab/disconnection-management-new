"use server"

import { redirect } from "next/navigation"
import { createSession, deleteSession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

// Function to get a specific user by credentials
export async function getUserByCredentials(username: string, password: string) {
  return await userStorage.findUserByCredentials(username, password)
}

export async function login(formData: FormData) {
  const overallStart = performance.now()
  const username = ((formData.get("username") as string) || "").trim()
  const password = ((formData.get("password") as string) || "").trim()
  const deviceId = (formData.get("deviceId") as string) || undefined

  if (!username || !password) {
    return { error: "Username and password are required" }
  }

  console.log(`\n🔑 ─── [LOGIN ATTEMPT STARTED] ───`)
  console.log(`👤 Username: '${username}'`)

  const lookupStart = performance.now()
  const user = await getUserByCredentials(username, password)
  const lookupTime = (performance.now() - lookupStart).toFixed(1)

  if (!user) {
    console.log(`❌ [LOGIN FAILED] Invalid credentials for '${username}' (${lookupTime}ms)\n`)
    return { error: "Invalid username or password" }
  }

  // Detect first-time login for newly provisioned agencies (using temporary 6-digit SAP vendor code)
  const digitsOnly = username.replace(/\D/g, "")
  const isTempVendorCode = /^\d{6}$/.test(user.password) && user.role === "agency"
  if (isTempVendorCode || user.mustChangePassword) {
    console.log(`⚠️ [FIRST LOGIN] Mandatory OTP password setup required for agency user '${username}'`)
    return {
      success: false,
      requireFirstLoginReset: true,
      mobileNumber: digitsOnly.length === 10 ? digitsOnly : user.username.replace(/\D/g, '').slice(-10),
      username: user.username,
      name: user.name,
      message: "First-time login detected. Please verify OTP and create your permanent password."
    }
  }

  const sessionStart = performance.now()
  await createSession(
    user.id, username, user.role, user.agencies, user.cccCode,
    user.name || username,
    user.subscriptionStatus || "active",
    user.subscriptionExpiresAt || "",
    user.bypassSubscription || false
  )
  const sessionTime = (performance.now() - sessionStart).toFixed(1)

  // Record user presence asynchronously so user login is not delayed by an extra network round-trip
  import("@/lib/presence-service")
    .then(({ trackUserPresence }) => {
      trackUserPresence({
        userId: user.id,
        username,
        name: user.name || username,
        role: user.role,
        cccCode: user.cccCode || "",
        agencies: user.agencies || [],
        activeModule: user.role === "superuser" ? "superuser" : "dashboard",
        lastAction: "Logged In",
        lastSeen: Date.now(),
      }).catch((presenceErr) => {
        console.warn("Could not log user presence:", presenceErr)
      })
    })
    .catch(() => {})

  const totalLoginTime = (performance.now() - overallStart).toFixed(1)
  console.log(`⏱️ ─── [LOGIN BENCHMARK BREAKDOWN] ───`)
  console.log(`├── 1. User DB Lookup:     ${lookupTime}ms`)
  console.log(`├── 2. JWT Cookie Session: ${sessionTime}ms`)
  console.log(`└── 🚀 Total Server Login Time: ${totalLoginTime}ms (Role: ${user.role}, CCC: ${user.cccCode || "N/A"})\n`)

  const redirectTo = user.role === "superuser" ? "/superuser" : "/dashboard"
  return {
    success: true,
    redirectTo,
    benchmark: {
      dbSource: "Turso DB",
      lookupTimeMs: Number(lookupTime),
      sessionTimeMs: Number(sessionTime),
      totalServerTimeMs: Number(totalLoginTime),
      username,
      role: user.role,
      cccCode: user.cccCode || "",
    }
  }
}

export async function logout() {
  try {
    const { cookies } = await import("next/headers")
    const { decrypt } = await import("@/lib/session")
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")?.value
    if (sessionCookie) {
      const payload = await decrypt(sessionCookie)
      if (payload?.userId) {
        // Fire-and-forget presence cleanup so it doesn't block logout redirect
        import("@/lib/presence-service")
          .then(({ removeUserPresence }) => removeUserPresence(payload.userId))
          .catch(() => {})
      }
    }
  } catch {}

  await deleteSession()
  redirect("/login")
}
