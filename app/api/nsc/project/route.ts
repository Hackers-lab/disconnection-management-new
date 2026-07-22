import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import {
  fetchProjects,
  createProject,
  updateProjectPO,
  agencyCompleteProject,
  adminApproveProject,
  addAppsToProject,
} from "@/lib/nsc-project-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const id = getSpreadsheetId()
    const all = await fetchProjects(id)
    if (session.role === "agency") {
      const upper = (session.agencies || []).map((a: string) => a.toUpperCase())
      return NextResponse.json(all.filter(p => upper.includes(p.agency.toUpperCase())))
    }
    return NextResponse.json(all)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { action } = body

    // Agency users may only mark their own projects complete
    if (session.role === "agency" && action !== "agency_complete") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!["admin", "executive", "agency"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (action === "create") {
      if (!body.projectId)           return NextResponse.json({ error: "Project ID required" }, { status: 400 })
      if (!body.workTypes?.length)   return NextResponse.json({ error: "Work types required" }, { status: 400 })
      if (!body.agency)              return NextResponse.json({ error: "Agency required" }, { status: 400 })
      if (!body.linkedApps?.length)  return NextResponse.json({ error: "At least one application required" }, { status: 400 })
      const projectId = await createProject({
        projectId:  body.projectId,
        workTypes:  body.workTypes,
        agency:     body.agency,
        linkedApps: body.linkedApps,
        createdBy:  `${session.role}:${session.username}`,
      })
      return NextResponse.json({ success: true, projectId })
    }

    if (action === "update_po") {
      if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 })
      await updateProjectPO(body.projectId, body.poNumber || "")
      return NextResponse.json({ success: true })
    }

    if (action === "add_apps") {
      if (!body.projectId || !body.newApps?.length) {
        return NextResponse.json({ error: "projectId and newApps required" }, { status: 400 })
      }
      await addAppsToProject(body.projectId, body.newApps)
      return NextResponse.json({ success: true })
    }

    if (action === "agency_complete") {
      // Agency can complete their own project
      if (session.role === "agency") {
        const upper = (session.agencies || []).map((a: string) => a.toUpperCase())
        const id = getSpreadsheetId()
        const all = await fetchProjects(id)
        const project = all.find(p => p.projectId === body.projectId)
        if (!project || !upper.includes(project.agency.toUpperCase())) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
      }
      if (!body.sitePhotoUrl) return NextResponse.json({ error: "Site photo required" }, { status: 400 })
      await agencyCompleteProject({
        projectId:     body.projectId,
        agencyRemarks: body.agencyRemarks || "",
        sitePhotoUrl:  body.sitePhotoUrl,
        completedBy:   `${session.role}:${session.username}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === "admin_approve") {
      if (!["admin", "executive"].includes(session.role)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      await adminApproveProject({
        projectId:    body.projectId,
        adminRemarks: body.adminRemarks || "",
        approvedBy:   `${session.role}:${session.username}`,
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    console.error("NSC project error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})
