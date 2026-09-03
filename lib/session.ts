import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { isBillingActive } from "./billing-config"

const secretKey = process.env.SESSION_SECRET
if (!secretKey) {
  throw new Error("FATAL: SESSION_SECRET environment variable is required. Cannot start without a secure signing key.")
}
const encodedKey = new TextEncoder().encode(secretKey)

export interface SessionPayload {
  userId: string
  username: string
  role: string
  cccCode: string
  agencies: string[]
  expiresAt: Date
  name: string
  subscriptionStatus: string
  subscriptionExpiresAt: string
  bypassSubscription: boolean
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

export async function createSession(
  userId: string,
  username: string,
  role: string,
  agencies: string[],
  cccCode: string,
  name: string,
  subscriptionStatus: string,
  subscriptionExpiresAt: string,
  bypassSubscription: boolean
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ 
    userId, 
    username, 
    role, 
    agencies, 
    cccCode, 
    expiresAt,
    name,
    subscriptionStatus,
    subscriptionExpiresAt,
    bypassSubscription
  })
  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === "production"

  cookieStore.set("session", session, {
    httpOnly: true,
    secure: isProduction,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })

  cookieStore.set("cccCode", cccCode, {
    httpOnly: false,
    secure: isProduction,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })

  cookieStore.set("username", username.toLowerCase(), {
    httpOnly: false,
    secure: isProduction,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })

  cookieStore.set("userRole", role.toLowerCase(), {
    httpOnly: false,
    secure: isProduction,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete({ name: "session", path: "/" })
  cookieStore.delete({ name: "cccCode", path: "/" })
  cookieStore.delete({ name: "username", path: "/" })
  cookieStore.delete({ name: "userRole", path: "/" })
}

export async function verifySession() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get("session")?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    return null
  }

  let isSubscribed = true
  const roleLower = (session.role || "").toLowerCase()
  
  const isExempt =
    roleLower === "admin" ||
    roleLower === "superuser" ||
    roleLower === "monitor" ||
    session.bypassSubscription ||
    !isBillingActive()

  let subscriptionExpiresAt = session.subscriptionExpiresAt || ""
  let subscriptionStatus = session.subscriptionStatus || "active"

  if (!isExempt) {
    if (roleLower === "agency" || (session.agencies && session.agencies.length > 0)) {
      // Dynamic lookup from agencies table (Single Source of Truth)
      const rawAgencies = session.agencies || []
      const agencyCandidates = rawAgencies.length > 0 ? rawAgencies : [session.name || session.username]
      const cccCode = session.cccCode || ""
      
      if (cccCode && agencyCandidates.length > 0) {
        try {
          const { isAgencySubscribed } = await import("./agency-storage")
          let anyActive = false
          let lastSubDetails: any = null

          for (const ag of agencyCandidates) {
            if (!ag) continue
            const sub = await isAgencySubscribed(cccCode, ag)
            lastSubDetails = sub
            if (sub.subscribed) {
              anyActive = true
              subscriptionExpiresAt = sub.expiresAt || ""
              subscriptionStatus = "active"
              break
            }
          }

          isSubscribed = anyActive
          if (!anyActive && lastSubDetails) {
            subscriptionExpiresAt = lastSubDetails.expiresAt || ""
            subscriptionStatus = lastSubDetails.reason === "expired" ? "expired" : "inactive"
          }
        } catch (subErr) {
          console.warn("Dynamic agency subscription check warning:", subErr)
        }
      }
    } else {
      // Non-agency roles (station staff, executive, etc.) are allowed into their workspace.
      // Their write/update actions are gated per agency on the mutation APIs.
      isSubscribed = true
    }
  }

  return {
    userId: session.userId,
    username: session.username,
    role: session.role,
    cccCode: session.cccCode,
    agencies: session.agencies,
    isSubscribed,
    subscriptionExpiresAt,
    name: session.name || "",
    bypassSubscription: session.bypassSubscription || false,
    subscriptionStatus,
  }
}
