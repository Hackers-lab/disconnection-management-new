import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { getAgencies } from "@/lib/agency-storage"
import { userStorage } from "@/lib/user-storage"
import { sheets as googleSheets } from "@googleapis/sheets"
import { auth } from "@/lib/google-drive"

export const dynamic = "force-dynamic"

const sheets = googleSheets({ version: "v4", auth })

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const context = getTenantContext()
  const cccCode = session.cccCode || context?.cccCode || ""

  let isLinked = false
  let spreadsheetId: string | null = null
  let cccName = ""

  try {
    const bypassCache = request.nextUrl.searchParams.get("bypassCache") === "true"
    const config = await getTenantConfig(cccCode, bypassCache)
    cccName = config.cccName || cccCode
    spreadsheetId = config.spreadsheetId || null
    isLinked = !!(config.driveFolderId && config.googleDriveRefreshToken && config.spreadsheetId)
  } catch (e: any) {
    console.warn("Onboarding checklist: Failed to get tenant config", e?.message)
  }

  // If not linked to Google Drive, all sheet steps are pending
  let hasAgencies = false
  let agencyCount = 0
  let hasUsers = false
  let userCount = 0
  let hasZoneMap = false
  let zoneMapCount = 0
  let hasDcList = false
  let dcCount = 0
  let hasMasterData = false
  let masterCount = 0

  // 1. Check Agencies
  try {
    const agencies = await getAgencies()
    agencyCount = (agencies || []).filter(a => a.isActive !== false).length
    hasAgencies = agencyCount > 0
  } catch (e) {
    console.warn("Checklist: Error checking agencies", e)
  }

  // 2. Check Users (excluding main admin)
  try {
    const allUsers = await userStorage.getUsers()
    const tenantUsers = allUsers.filter(u => u.cccCode === cccCode)
    const operationalUsers = tenantUsers.filter(
      u => u.role !== "admin" && u.role !== "superadmin" && u.role !== "superuser" && u.username !== "admin"
    )
    userCount = operationalUsers.length
    hasUsers = operationalUsers.length > 0 || tenantUsers.length > 1
  } catch (e) {
    console.warn("Checklist: Error checking users", e)
  }

  // 3, 4, 5. Check Sheet data if spreadsheet is linked
  if (spreadsheetId) {
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      })
      const sheetTitles = (meta.data.sheets || []).map(s => s.properties?.title || "")

      // Check Zone Map
      const zoneTab = sheetTitles.find(t => /^(agencyzonemap|zonemap|zone_map)$/i.test(t)) || "AgencyZoneMap"
      if (sheetTitles.includes(zoneTab)) {
        try {
          const zoneResp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${zoneTab}'!A2:B10`,
          })
          const rows = (zoneResp.data.values || []).filter(r => r[0] && r[1])
          zoneMapCount = rows.length
          hasZoneMap = zoneMapCount > 0
        } catch {}
      }

      // Check DC List (Sheet1 / Disconnection)
      const dcTab = sheetTitles.find(t => /^(sheet1|disconnection)$/i.test(t)) || "Sheet1"
      if (sheetTitles.includes(dcTab)) {
        try {
          const dcResp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${dcTab}'!C2:D10`,
          })
          const rows = (dcResp.data.values || []).filter(r => r[0])
          dcCount = rows.length
          hasDcList = dcCount > 0
        } catch {}
      }

      // Check Master Data (DD / ConsumerMaster / DDMaster)
      const masterTab = sheetTitles.find(t => /^(consumermaster|dd|ddmaster|master)$/i.test(t)) || "ConsumerMaster"
      if (sheetTitles.includes(masterTab)) {
        try {
          const masterResp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${masterTab}'!A2:C10`,
          })
          const rows = (masterResp.data.values || []).filter(r => r[0])
          masterCount = rows.length
          hasMasterData = masterCount > 0
        } catch {}
      }
    } catch (e: any) {
      console.warn("Checklist: Error inspecting spreadsheet data", e?.message)
    }
  }

  const steps = [
    {
      id: "agencies",
      stepNumber: 1,
      title: "Create Agencies",
      description: "Add field agencies or contractor teams in the Admin Panel to execute field actions.",
      completed: hasAgencies,
      count: agencyCount,
      targetView: "admin:agencies",
      buttonText: hasAgencies ? "Manage Agencies" : "Create Agency",
    },
    {
      id: "users",
      stepNumber: 2,
      title: "Create Users & Assign Agencies",
      description: "Create field staff or sub-user accounts and assign their respective agency scope.",
      completed: hasUsers,
      count: userCount,
      targetView: "admin:users",
      buttonText: hasUsers ? "Manage Users" : "Create User",
    },
    {
      id: "zoneMap",
      stepNumber: 3,
      title: "Configure Zone / MRU Map",
      description: "Map MRU zones to agencies for automated work allocation during DC list upload.",
      completed: hasZoneMap,
      count: zoneMapCount,
      targetView: "admin:zoneMap",
      buttonText: hasZoneMap ? "View Zone Map" : "Set Up Zone Map",
    },
    {
      id: "dcList",
      stepNumber: 4,
      title: "Upload Disconnection List",
      description: "Upload your current cycle Disconnection consumer list from Excel / CSV.",
      completed: hasDcList,
      count: dcCount,
      targetView: "admin:dcList",
      buttonText: hasDcList ? "Re-upload / Manage DC List" : "Upload DC List",
    },
    {
      id: "masterData",
      stepNumber: 5,
      title: "Upload Consumer Master Data",
      description: "Upload the master database for complete consumer lookup, geocoding & reference.",
      completed: hasMasterData,
      count: masterCount,
      targetView: "consumerMaster",
      buttonText: hasMasterData ? "View Consumer Master" : "Upload Master Data",
    },
  ]

  const completedCount = steps.filter(s => s.completed).length
  const totalSteps = steps.length
  const allCompleted = completedCount === totalSteps

  return NextResponse.json(
    {
      cccCode,
      cccName,
      isLinked,
      steps,
      completedCount,
      totalSteps,
      allCompleted,
      progressPercent: Math.round((completedCount / totalSteps) * 100),
    },
    {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    }
  )
})
