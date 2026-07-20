import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { OAuth2Client } from "google-auth-library"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  let redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!redirectUri) {
    const host = request.headers.get("host") || "localhost:3000"
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https"
    redirectUri = `${protocol}://${host}/api/auth/google/callback`
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 500 }
    )
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)

  // Generate the consent URL requesting offline access to get the refresh token
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    state: session.cccCode, // State contains cccCode to prevent CSRF and identify tenant
  })

  return NextResponse.redirect(url)
}
