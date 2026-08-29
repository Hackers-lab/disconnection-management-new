import { verifySession } from "./session"
import { roleStorage } from "./role-storage"
import { getSpreadsheetId } from "./google-sheets-api"
import { expandRolePermissions, getModulePermKeys } from "./permission-utils"

export * from "./permission-utils"

export interface AuthResult {
  authorized: boolean
  error?: string
  status?: number
  session?: any
}

/**
 * Verifies if the active session has the requested module permission.
 * Admins & Superusers bypass all checks.
 * SERVER-SIDE ONLY: Used in API routes (/app/api/*).
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
    let spreadsheetId = ""
    try {
      spreadsheetId = getSpreadsheetId()
    } catch {
      // Fallback if tenant resolution or env var missing
    }

    const rawPermissions = await roleStorage.getPermissionsForRole(session.role, session.cccCode || spreadsheetId).catch(() => null)

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
    return { authorized: false, error: `Permission check error: ${e.message}`, status: 403, session }
  }
}
