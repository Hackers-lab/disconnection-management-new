import { verifySession } from "./session"
import { roleStorage } from "./role-storage"
import { getTenantConfig } from "./tenant-resolver"

export interface AuthResult {
  authorized: boolean
  error?: string
  status?: number
  session?: any
}

// Module key normalizer to handle aliases (e.g. meter_replacement -> meter, dtr_painting -> dtr)
function getModulePermKeys(module: string): string[] {
  const norm = module.toLowerCase().trim().replace(/-/g, "_")
  const keys = [norm]

  if (norm === "meter_replacement" || norm === "meter") {
    keys.push("meter_replacement", "meter")
  }
  if (norm === "dtr_painting" || norm === "dtr") {
    keys.push("dtr_painting", "dtr")
  }
  if (norm === "disconnection" || norm === "consumer_master") {
    keys.push("disconnection", "consumer_master")
  }

  return Array.from(new Set(keys))
}

/**
 * Automatically expands legacy "update" permissions into site vs. office sub-actions
 * so existing 200+ users across 58 CCCs experience zero disruption.
 */
export function expandRolePermissions(roleName: string, perms: Record<string, string[]> | null): Record<string, string[]> {
  if (!perms) return {}
  const roleLower = (roleName || "").toLowerCase()
  const isAgency = roleLower === "agency" || roleLower.includes("agency")
  const isAdminOrExec = roleLower === "admin" || roleLower === "executive" || roleLower === "superuser"

  const expanded: Record<string, string[]> = {}

  for (const [mod, list] of Object.entries(perms)) {
    const actSet = new Set(list || [])

    // NSC Auto-Expansion
    if (mod === "nsc") {
      if (actSet.has("update")) {
        if (isAgency) {
          actSet.add("inspect")
          actSet.add("agency_complete")
        } else {
          actSet.add("inspect")
          actSet.add("process")
          actSet.add("project_create")
          actSet.add("po_entry")
          actSet.add("admin_approve")
        }
      }
      if (isAdminOrExec) {
        actSet.add("inspect")
        actSet.add("process")
        actSet.add("project_create")
        actSet.add("po_entry")
        actSet.add("admin_approve")
      }
    }

    // Meter Replacement Auto-Expansion
    if (mod === "meter" || mod === "meter_replacement") {
      if (actSet.has("update")) {
        if (isAgency) {
          actSet.add("install")
        } else {
          actSet.add("create")
          actSet.add("issue")
          actSet.add("install")
          actSet.add("return")
          actSet.add("finalize")
        }
      }
      if (isAdminOrExec) {
        actSet.add("create")
        actSet.add("issue")
        actSet.add("install")
        actSet.add("return")
        actSet.add("finalize")
      }
    }

    expanded[mod] = Array.from(actSet)
  }

  return expanded
}

/**
 * Verifies if the active session has the requested module permission.
 * Admins & Superusers bypass all checks.
 */
export async function checkApiPermission(module: string, action: string | string[]): Promise<AuthResult> {
  const session = await verifySession()
  if (!session) {
    return { authorized: false, error: "Unauthorized", status: 401 }
  }

  // Block users without an active subscription
  if (!session.isSubscribed) {
    return { authorized: false, error: "Subscription required", status: 402, session }
  }

  const userRoleLower = (session.role || "").toLowerCase()
  // Admin & Superuser bypass
  if (userRoleLower === "admin" || userRoleLower === "superuser") {
    return { authorized: true, session }
  }

  try {
    const tenantConfig = await getTenantConfig(session.cccCode)
    // Load permissions for session role
    const rawPermissions = await roleStorage.getPermissionsForRole(session.role, tenantConfig.spreadsheetId)
    if (!rawPermissions) {
      return { authorized: false, error: `Forbidden: Role '${session.role}' not configured`, status: 403, session }
    }
    const permissions = expandRolePermissions(session.role, rawPermissions)

    const possibleKeys = getModulePermKeys(module)
    let modulePerms: string[] = []
    for (const key of possibleKeys) {
      if (permissions[key] && permissions[key].length > 0) {
        modulePerms = [...modulePerms, ...permissions[key]]
      }
    }

    const actions = Array.isArray(action) ? action : [action]
    const hasAccess = actions.some(act => modulePerms.includes(act))

    if (!hasAccess) {
      return { authorized: false, error: `Forbidden: No ${actions.join(" or ")} access to module '${module}'`, status: 403, session }
    }

    return { authorized: true, session }
  } catch (e: any) {
    return { authorized: false, error: `Tenant config error: ${e.message}`, status: 500, session }
  }
}

/**
 * Returns true if the user's role is restricted to a set of agencies
 * and the record's agency does not match any of them.
 */
export function isAgencyScopeRestricted(session: any, recordAgency: string | undefined): boolean {
  if (!session) return true
  const roleLower = (session.role || "").toLowerCase()
  if (roleLower === "admin" || roleLower === "superuser") return false // Admins are never restricted

  // If user has assigned agencies (e.g. Agency, Executive roles), enforce they can only see/update theirs
  if (session.agencies && session.agencies.length > 0) {
    const cleanRecord = String(recordAgency || "").trim().toUpperCase()
    const userAgenciesUpper = session.agencies.map((a: string) => String(a || "").trim().toUpperCase())
    
    // If the record has no agency assigned, restrict agency users from editing/viewing it unless it maps to them
    return !userAgenciesUpper.includes(cleanRecord)
  }

  // If the user has no assigned agencies but has a role like agency, it should restrict them by default
  if (roleLower === "agency") {
    return true
  }

  return false
}
