import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const secretKey = process.env.SESSION_SECRET || "pramod"
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
  const billingStartDate = new Date("2026-09-16T00:00:00")
  
  const isExempt =
    roleLower === "admin" ||
    roleLower === "superuser" ||
    roleLower === "monitor" ||
    session.bypassSubscription ||
    Date.now() < billingStartDate.getTime()

  if (!isExempt) {
    if (session.subscriptionStatus === "active") {
      if (session.subscriptionExpiresAt) {
        const expiry = new Date(session.subscriptionExpiresAt)
        expiry.setHours(23, 59, 59, 999)
        if (Date.now() > expiry.getTime()) {
          isSubscribed = false
        }
      }
    } else {
      isSubscribed = false
    }
  }

  return {
    userId: session.userId,
    username: session.username,
    role: session.role,
    cccCode: session.cccCode,
    agencies: session.agencies,
    isSubscribed,
    subscriptionExpiresAt: session.subscriptionExpiresAt || "",
    name: session.name || "",
    bypassSubscription: session.bypassSubscription || false,
    subscriptionStatus: session.subscriptionStatus || "active",
  }
}
