/**
 * Pure client-safe utility functions for agency matching and permission expansion.
 * Contains ZERO server-only imports (no next/headers, no next/cache).
 */

// Module key normalizer to handle aliases (e.g. meter_replacement -> meter, dtr_painting -> dtr)
export function getModulePermKeys(module: string): string[] {
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
  if (norm === "misc_inspection" || norm === "misc" || norm === "misc_inspections") {
    keys.push("misc_inspection", "misc", "misc_inspections")
  }
  if (norm === "icds" || norm === "icds_electrification") {
    keys.push("icds", "icds_electrification")
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

    // Misc Inspection Auto-Expansion
    if (mod === "misc_inspection" || mod === "misc" || mod === "misc_inspections") {
      if (actSet.has("update") || actSet.has("inspect")) {
        actSet.add("update")
        actSet.add("inspect")
        actSet.add("read")
      }
      if (isAdminOrExec) {
        actSet.add("update")
        actSet.add("create")
        actSet.add("read")
        actSet.add("inspect")
        actSet.add("finalize")
        actSet.add("delete")
      }
    }

    // NSC Auto-Expansion
    if (mod === "nsc") {
      if (actSet.has("update") || actSet.has("inspect") || actSet.has("agency_complete") || actSet.has("process")) {
        actSet.add("update")
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
        actSet.add("read")
        actSet.add("create")
        actSet.add("update")
        actSet.add("delete")
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

    // Safety Module Auto-Expansion
    if (mod === "safety") {
      if (actSet.has("update")) {
        actSet.add("create")
        actSet.add("read")
      }
      if (isAdminOrExec) {
        actSet.add("create")
        actSet.add("read")
        actSet.add("update")
        actSet.add("delete")
        actSet.add("approve_notesheet")
        actSet.add("issue_po")
        actSet.add("finalize")
      }
    }

    // ICDS Electrification Auto-Expansion
    if (mod === "icds" || mod === "icds_electrification") {
      if (actSet.size > 0) {
        actSet.add("read")
      }
      if (actSet.has("update") || actSet.has("execute") || actSet.has("install")) {
        actSet.add("execute")
        actSet.add("install")
      }
    }

    expanded[mod] = Array.from(actSet)
  }

  // Ensure nsc default fallback if not explicitly defined in perms
  if (!expanded.nsc || expanded.nsc.length === 0) {
    if (isAgency) {
      expanded.nsc = ["read", "inspect", "agency_complete", "update"]
    } else if (isAdminOrExec) {
      expanded.nsc = ["read", "create", "update", "delete", "inspect", "process", "project_create", "po_entry", "admin_approve"]
    } else if (roleLower === "viewer") {
      expanded.nsc = ["read"]
    }
  }

  // Ensure misc_inspection default fallback if not explicitly defined in perms
  if (!expanded.misc_inspection || expanded.misc_inspection.length === 0) {
    if (isAgency) {
      expanded.misc_inspection = ["read", "inspect", "update"]
    } else if (isAdminOrExec) {
      expanded.misc_inspection = ["read", "create", "update", "delete", "inspect", "finalize"]
    } else if (roleLower === "viewer") {
      expanded.misc_inspection = ["read"]
    }
  }

  // Ensure meter_replacement default fallback if not explicitly defined in perms
  if (!expanded.meter_replacement || expanded.meter_replacement.length === 0) {
    if (isAgency) {
      expanded.meter_replacement = []
    } else if (isAdminOrExec) {
      expanded.meter_replacement = ["read", "create", "update", "delete", "issue", "install", "return", "finalize"]
    } else if (roleLower === "viewer") {
      expanded.meter_replacement = ["read"]
    }
  }

  // Ensure icds default fallback only if not explicitly defined in perms
  if (perms.icds === undefined && perms.icds_electrification === undefined) {
    if (isAgency) {
      expanded.icds = ["read", "inspect", "execute", "install", "certify"]
    } else if (isAdminOrExec) {
      expanded.icds = ["read", "create", "update", "delete", "inspect", "process", "execute", "install", "certify"]
    } else if (roleLower === "viewer" || roleLower === "reader") {
      expanded.icds = ["read"]
    } else if (roleLower === "store_keeper") {
      expanded.icds = ["read", "process"]
    }
  }

  return expanded
}

/**
 * Safely tests whether a record agency matches a user/assigned agency identifier.
 * Uses exact case-insensitive match or whole-word token matching.
 * Guarantees that short names like "SA" do NOT match "SAMAD", while still
 * matching "SA" with "SA Agency" or "M/S SA".
 */
export function matchesAgency(recordAgency?: string, userAgency?: string): boolean {
  const rec = String(recordAgency || "").trim().toLowerCase()
  const usr = String(userAgency || "").trim().toLowerCase()
  if (!rec || !usr) return false
  if (rec === usr) return true

  // Word boundary regex: ensures 'sa' only matches 'sa' or 'sa agency' / 'm/s sa', never 'samad'
  const escapedUsr = usr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const wordBoundaryRegex = new RegExp(`(^|\\s|[-_/.,])${escapedUsr}($|\\s|[-_/.,])`, "i")
  if (wordBoundaryRegex.test(rec)) return true

  const escapedRec = rec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const recBoundaryRegex = new RegExp(`(^|\\s|[-_/.,])${escapedRec}($|\\s|[-_/.,])`, "i")
  if (recBoundaryRegex.test(usr)) return true

  return false
}

/**
 * Returns true if the user's role is restricted to a set of agencies
 * and the record's agency does not match any of them.
 */
export function isAgencyScopeRestricted(session: any, recordAgency: string | undefined): boolean {
  if (!session) return true
  const roleLower = (session.role || "").toLowerCase()
  if (roleLower === "admin" || roleLower === "superuser") return false // Admins are never restricted

  const cleanRecord = String(recordAgency || "").trim()

  // Collect all possible agency identifiers for the user (assigned agencies + username)
  const userAgencies: string[] = []
  if (session.agencies && Array.isArray(session.agencies)) {
    session.agencies.forEach((a: string) => {
      if (a && typeof a === "string" && a.trim()) {
        userAgencies.push(a.trim())
      }
    })
  }
  if (session.username && typeof session.username === "string" && session.username.trim()) {
    userAgencies.push(session.username.trim())
  }

  // If user has assigned agencies (e.g. Agency, Executive roles), enforce they can only see/update theirs
  if (userAgencies.length > 0) {
    if (!cleanRecord) return true
    const isMatch = userAgencies.some((ua) => matchesAgency(cleanRecord, ua))
    return !isMatch
  }

  // If the user has no assigned agencies but has a role like agency, it should restrict them by default
  if (roleLower === "agency") {
    return true
  }

  return false
}
