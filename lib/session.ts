import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { userStorage } from "./user-storage"

const secretKey = process.env.SESSION_SECRET || "pramod"
const encodedKey = new TextEncoder().encode(secretKey)

export interface SessionPayload {
  userId: string
  username: string
  role: string
  cccCode: string
  agencies: string[]
  expiresAt: Date
  [key: string]: any
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    })
    return payload as SessionPayload
  } catch (error) {
    console.log("Failed to verify session")
    return null
  }
}

export async function createSession(userId: string, username: string, role: string, agencies: string[], cccCode: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ userId, username, role, agencies, cccCode, expiresAt })
  const cookieStore = await cookies()

  cookieStore.set("session", session, {
    httpOnly: true,
    secure: true,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })

  // Set cccCode cookie (non-httpOnly) so client-side code can read it for caching scoping
  cookieStore.set("cccCode", cccCode, {
    httpOnly: false,
    secure: true,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete({ name: "session", path: "/" })
  cookieStore.delete({ name: "cccCode", path: "/" })
}

export async function verifySession() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get("session")?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    return null
  }

  let isSubscribed = true
  let subscriptionExpiresAt = ""
  let name = ""
  let bypassSubscription = false
  let subscriptionStatus = ""

  try {
    const users = await userStorage.getUsers()
    const user = users.find(u => u.id === session.userId)
    if (user) {
      name = user.name || ""
      bypassSubscription = user.bypassSubscription || false
      subscriptionStatus = user.subscriptionStatus || "active"
      subscriptionExpiresAt = user.subscriptionExpiresAt || ""
      const roleLower = user.role.toLowerCase()
      
      const billingStartDate = new Date("2026-09-01T00:00:00")
      const isExempt =
        roleLower === "admin" ||
        roleLower === "superuser" ||
        roleLower === "monitor" ||
        user.bypassSubscription ||
        Date.now() < billingStartDate.getTime()

      if (!isExempt) {
        if (user.subscriptionStatus === "active") {
          if (user.subscriptionExpiresAt) {
            const expiry = new Date(user.subscriptionExpiresAt)
            expiry.setHours(23, 59, 59, 999)
            if (Date.now() > expiry.getTime()) {
              isSubscribed = false
            }
          }
          // If no expiry is set, they remain active (isSubscribed is initialized to true)
        } else {
          isSubscribed = false
        }

        // Inheritance Fallback: Check if the Admin of this subdivision (cccCode) has an active trial/subscription
        if (!isSubscribed && user.cccCode) {
          const adminUser = users.find(u => u.cccCode?.toUpperCase() === user.cccCode.toUpperCase() && u.role.toLowerCase() === "admin")
          if (adminUser && adminUser.subscriptionStatus === "active" && adminUser.subscriptionExpiresAt) {
            const adminExpiry = new Date(adminUser.subscriptionExpiresAt)
            adminExpiry.setHours(23, 59, 59, 999)
            if (Date.now() <= adminExpiry.getTime()) {
              isSubscribed = true
              subscriptionExpiresAt = `Derived from Admin Trial (Expires: ${adminUser.subscriptionExpiresAt})`
            }
          }
        }
      }
    } else {
      // User not found in storage, check role from session payload as fallback
      const roleLower = (session.role || "").toLowerCase()
      const billingStartDate = new Date("2026-09-01T00:00:00")
      const isExempt =
        roleLower === "admin" ||
        roleLower === "superuser" ||
        roleLower === "monitor" ||
        Date.now() < billingStartDate.getTime()

      if (!isExempt) {
        isSubscribed = false
      }
    }
  } catch (err) {
    console.error("Subscription validation error in verifySession:", err)
  }

  return {
    userId: session.userId,
    username: session.username,
    role: session.role,
    cccCode: session.cccCode,
    agencies: session.agencies,
    isSubscribed,
    subscriptionExpiresAt,
    name,
    bypassSubscription,
    subscriptionStatus,
  }
}
