// Server-only — imports @googleapis/sheets. Never import in "use client" components.
import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { nowTs } from "./date-utils"
import type { NSCProject } from "./nsc-types"
import { updateNSCProjectLink } from "./nsc-service"

export type { NSCProject }

const sheets = googleSheets({ version: "v4", auth })

export const PROJECT_TAB = "NSC_Projects"
const PROJECT_TAG        = "nsc-projects"
const PROJECT_REVALIDATE = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache

const PROJECT_HEADERS = [
  "Project ID", "Created At", "Created By",
  "Work Types",   // comma-separated: pole, line, dtr
  "PO Number",
  "Agency",
  "Linked Apps",  // comma-separated receiveNos
  "Status",       // ongoing | done | approved
  "Agency Remarks",
  "Site Photo URL",
  "Completed At", "Completed By",
  "Admin Remarks",
  "Approved At", "Approved By",
]

let tabReady = false

async function ensureTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = (meta.data.sheets || []).map(s => s.properties?.title)
  if (!existing.includes(PROJECT_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: PROJECT_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${PROJECT_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [PROJECT_HEADERS] },
    })
  }
  tabReady = true
}

function parseRow(r: string[]): NSCProject {
  return {
    projectId:     r[0]  || "",
    createdAt:     r[1]  || "",
    createdBy:     r[2]  || "",
    workTypes:     r[3]  || "",
    poNumber:      r[4]  || "",
    agency:        r[5]  || "",
    linkedApps:    r[6]  || "",
    status:        (r[7] || "ongoing") as NSCProject["status"],
    agencyRemarks: r[8]  || "",
    sitePhotoUrl:  r[9]  || "",
    completedAt:   r[10] || "",
    completedBy:   r[11] || "",
    adminRemarks:  r[12] || "",
    approvedAt:    r[13] || "",
    approvedBy:    r[14] || "",
  }
}

// ── Raw fetch ─────────────────────────────────────────────────────────────────
async function _fetchProjectsRaw(spreadsheetId: string): Promise<NSCProject[]> {
  await ensureTab(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PROJECT_TAB}!A:O` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseRow(r.map(String)))
}

export const fetchProjects = unstable_cache(
  async (spreadsheetId: string) => _fetchProjectsRaw(spreadsheetId),
  ["nsc-projects-data"],
  { revalidate: PROJECT_REVALIDATE, tags: [PROJECT_TAG] },
)

export function invalidateProjectCache() { revalidateTag(PROJECT_TAG) }

// ── Create project ────────────────────────────────────────────────────────────
export async function createProject(req: {
  projectId:   string     // user-provided, e.g. "NPC/6612107/04/25/001"
  workTypes:   string[]   // ["pole","line"] etc.
  agency:      string
  linkedApps:  string[]   // receiveNos to link
  createdBy:   string
}): Promise<string> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const projectId = req.projectId
  const now = nowTs()
  const row = new Array(15).fill("")
  row[0] = projectId
  row[1] = now
  row[2] = req.createdBy
  row[3] = req.workTypes.join(",")
  row[5] = req.agency
  row[6] = req.linkedApps.join(",")
  row[7] = "ongoing"
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${PROJECT_TAB}!A:O`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  })
  // Mark each linked application as project_required and set projectId
  await Promise.all(req.linkedApps.map(rn => updateNSCProjectLink(rn, projectId, "project_required")))
  invalidateProjectCache()
  return projectId
}

// ── Update PO number ──────────────────────────────────────────────────────────
export async function updateProjectPO(projectId: string, poNumber: string): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchProjectsRaw(id)
  const idx = all.findIndex(p => p.projectId === projectId)
  if (idx === -1) throw new Error("Project not found")
  const row = idx + 2
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${PROJECT_TAB}!E${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[poNumber]] },
  })
  invalidateProjectCache()
}

// ── Agency marks work complete ────────────────────────────────────────────────
export async function agencyCompleteProject(req: {
  projectId:     string
  agencyRemarks: string
  sitePhotoUrl:  string
  completedBy:   string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchProjectsRaw(id)
  const idx = all.findIndex(p => p.projectId === req.projectId)
  if (idx === -1) throw new Error("Project not found")
  const row = idx + 2
  const now = nowTs()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PROJECT_TAB}!H${row}`,  values: [["done"]] },
        { range: `${PROJECT_TAB}!I${row}`,  values: [[req.agencyRemarks]] },
        { range: `${PROJECT_TAB}!J${row}`,  values: [[req.sitePhotoUrl]] },
        { range: `${PROJECT_TAB}!K${row}`,  values: [[now]] },
        { range: `${PROJECT_TAB}!L${row}`,  values: [[req.completedBy]] },
      ],
    },
  })
  // Update linked apps to project_ongoing (admin approval pending)
  const project = all[idx]
  const linkedApps = project.linkedApps.split(",").map(s => s.trim()).filter(Boolean)
  await Promise.all(linkedApps.map(rn => updateNSCProjectLink(rn, req.projectId, "project_ongoing")))
  invalidateProjectCache()
}

// ── Admin approves project ────────────────────────────────────────────────────
export async function adminApproveProject(req: {
  projectId:    string
  adminRemarks: string
  approvedBy:   string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchProjectsRaw(id)
  const idx = all.findIndex(p => p.projectId === req.projectId)
  if (idx === -1) throw new Error("Project not found")
  const row = idx + 2
  const now = nowTs()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PROJECT_TAB}!H${row}`,  values: [["approved"]] },
        { range: `${PROJECT_TAB}!M${row}`,  values: [[req.adminRemarks]] },
        { range: `${PROJECT_TAB}!N${row}`,  values: [[now]] },
        { range: `${PROJECT_TAB}!O${row}`,  values: [[req.approvedBy]] },
      ],
    },
  })
  // Approved → all linked apps become "project_done" = ready for meter issue
  const project = all[idx]
  const linkedApps = project.linkedApps.split(",").map(s => s.trim()).filter(Boolean)
  await Promise.all(linkedApps.map(rn => updateNSCProjectLink(rn, req.projectId, "project_done")))
  invalidateProjectCache()
}

// ── Link more applications to an existing project ─────────────────────────────
export async function addAppsToProject(projectId: string, newApps: string[]): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchProjectsRaw(id)
  const idx = all.findIndex(p => p.projectId === projectId)
  if (idx === -1) throw new Error("Project not found")
  const project = all[idx]
  const existing = project.linkedApps.split(",").map(s => s.trim()).filter(Boolean)
  const merged   = [...new Set([...existing, ...newApps])].join(",")
  const row      = idx + 2
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${PROJECT_TAB}!G${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[merged]] },
  })
  // Mark newly linked apps
  await Promise.all(newApps.map(rn => updateNSCProjectLink(rn, projectId, "project_required")))
  invalidateProjectCache()
}
