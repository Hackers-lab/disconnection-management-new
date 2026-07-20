import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchApplications, createApplication } from "@/lib/nsc-service"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("nsc", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  const id = getSpreadsheetId()
  const all = await fetchApplications(id)

  if (session.agencies && session.agencies.length > 0) {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(a => upper.includes((a.agency || "").toUpperCase())), {
      headers: { "Cache-Control": "no-store" },
    })
  }
  return NextResponse.json(all, {
    headers: { "Cache-Control": "no-store" },
  })
})
export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("nsc", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    if (!body.applicantName) return NextResponse.json({ error: "Applicant name required" }, { status: 400 })
    if (!body.address)       return NextResponse.json({ error: "Address required" }, { status: 400 })
    if (!body.mobile)        return NextResponse.json({ error: "Mobile required" }, { status: 400 })
    if (!body.appliedClass)  return NextResponse.json({ error: "Applied class required" }, { status: 400 })
    if (!body.phase)         return NextResponse.json({ error: "Phase required" }, { status: 400 })
    if (!body.agency)        return NextResponse.json({ error: "Agency required" }, { status: 400 })

    if (isAgencyScopeRestricted(session, body.agency)) {
      return NextResponse.json({ error: "Forbidden: Target agency is outside your scope" }, { status: 403 })
    }

    const receiveNo = await createApplication({
      applicantName: body.applicantName,
      careOf:        body.careOf        || "",
      address:       body.address,
      mobile:        body.mobile,
      appliedClass:  body.appliedClass,
      phase:         body.phase,
      agency:        body.agency,
      createdBy:     `${session.role}:${session.username}`,
      officeRefNo:   body.officeRefNo   || "",
      applicationFormUrl: body.applicationFormUrl || "",
    })
    return NextResponse.json({ success: true, receiveNo })
  } catch (e: any) {
    console.error("NSC create error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

