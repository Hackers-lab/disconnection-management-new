export type SuperadminTab =
  | "overview"
  | "revenue_analytics"
  | "registrations"
  | "online_users"
  | "module_versions"
  | "agency_tracker"
  | "vercel_usage"
  | "subscriptions"

export interface Tenant {
  id?: string | number
  cccCode: string
  cccName: string
  spreadsheetId?: string
  driveFolderId?: string
  googleDriveRefreshToken?: boolean
  contactPerson?: string
  mobileNumber?: string
  createdAt?: string
  updatedAt?: string
  adminUsername?: string
  isSelfRegistered?: boolean
}

export interface User {
  id: string
  username: string
  password?: string
  role: string
  cccCode: string
  name: string
  agencies: string[]
  subscriptionStatus?: string
  subscriptionExpiresAt?: string
  bypassSubscription?: boolean
}

export interface TenantStats {
  dcCount: number
  zoneCount: number
}

export interface NewTenantForm {
  cccCode: string
  cccName: string
  spreadsheetId: string
  contactPerson: string
  mobileNumber: string
}

export interface NewUserForm {
  username: string
  password: string
  role: string
  cccCode: string
  name: string
  agencies: string
  subscriptionStatus: string
  subscriptionExpiresAt: string
  bypassSubscription: boolean
}

export interface EditUserForm {
  id: string
  username: string
  name: string
  password: string
  role: string
  cccCode: string
  agencies: string
  subscriptionStatus: string
  subscriptionExpiresAt: string
  bypassSubscription: boolean
}

export function formatRegistrationDate(dateStr?: string): { formatted: string; relative: string } {
  if (!dateStr) return { formatted: "N/A", relative: "Legacy / Sheet" }
  try {
    const iso =
      dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("T")
        ? dateStr
        : dateStr.replace(" ", "T") + "Z"
    const d = new Date(iso)
    if (isNaN(d.getTime())) return { formatted: dateStr, relative: "" }

    const formatted =
      d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " IST"

    const diffMs = Date.now() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHour / 24)

    let relative = "Just now"
    if (diffDays > 0) relative = `${diffDays}d ago`
    else if (diffHour > 0) relative = `${diffHour}h ago`
    else if (diffMin > 0) relative = `${diffMin}m ago`

    return { formatted, relative }
  } catch {
    return { formatted: dateStr, relative: "" }
  }
}

export function parseRegistrationTimestamp(dateStr?: string): number {
  if (!dateStr) return 0
  const iso =
    dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("T")
      ? dateStr
      : dateStr.replace(" ", "T") + "Z"
  const t = new Date(iso).getTime()
  return isNaN(t) ? 0 : t
}
