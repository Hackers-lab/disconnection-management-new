import { sheets as googleSheets } from "@googleapis/sheets"
import { getSpreadsheetId } from "./google-sheets-api"
import { db } from "./db"

const SHEET_ID = process.env.USERS_SHEET!
const SHEET_NAME = "AppRoles"

async function getSheetsClient() {
  const { auth } = await import("./google-drive")
  return googleSheets({ version: "v4", auth })
}

export interface RolePermissions {
  role: string
  disconnection: string[]
  reconnection: string[]
  deemed: string[]
  dtr: string[]
  meter: string[]
  nsc: string[]
  consumer_master: string[]
  admin: string[]
  meter_replacement: string[]
  dtr_painting: string[]
  material: string[]
  osd?: string[]
  safety?: string[]
  misc_inspection?: string[]
  icds?: string[]
}

const MODULES = [
  "disconnection",
  "reconnection",
  "deemed",
  "dtr",
  "meter",
  "nsc",
  "consumer_master",
  "admin",
  "meter_replacement",
  "dtr_painting",
  "material",
  "osd",
  "safety",
  "misc_inspection",
  "icds",
] as const

const DEFAULT_ROLES: RolePermissions[] = [
  {
    role: "admin",
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete", "inspect", "process", "project_create", "po_entry", "agency_complete", "admin_approve"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: ["read", "create", "update", "delete"],
    meter_replacement: ["read", "create", "update", "delete", "issue", "install", "return", "finalize"],
    dtr_painting: ["read", "create", "update", "delete"],
    material: ["read", "create", "update", "delete", "receive", "issue", "stock", "settings"],
    osd: ["read", "download"],
    safety: ["read", "create", "update", "delete", "approve_notesheet", "issue_po", "finalize"],
    misc_inspection: ["read", "create", "update", "delete", "inspect", "finalize"],
    icds: ["read", "create", "update", "delete", "inspect", "install", "certify"],
  },
  {
    role: "viewer",
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read"],
    dtr_painting: ["read"],
    material: ["read", "stock"],
    osd: ["read", "download"],
    safety: ["read"],
    misc_inspection: ["read"],
    icds: ["read"],
  },
  {
    role: "agency",
    disconnection: ["read", "update"],
    reconnection: ["read", "update"],
    deemed: ["read", "update"],
    dtr: ["read", "update"],
    meter: ["read", "update"],
    nsc: ["read", "inspect", "agency_complete"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: [],
    dtr_painting: ["read", "update"],
    material: ["read", "update", "receive", "issue", "stock"],
    osd: ["read", "download"],
    safety: ["read", "create", "update"],
    misc_inspection: ["read", "inspect", "update"],
    icds: ["read", "inspect", "install", "certify", "update"],
  },
  {
    role: "technical",
    disconnection: [],
    reconnection: [],
    deemed: [],
    dtr: ["read", "update"],
    meter: [],
    nsc: [],
    consumer_master: [],
    admin: [],
    meter_replacement: [],
    dtr_painting: [],
    material: ["read", "create", "update", "delete", "receive", "issue", "stock", "settings"],
    osd: ["read", "download"],
    safety: ["read", "create", "update"],
    misc_inspection: ["read", "inspect", "update"],
  },
  {
    role: "painter",
    disconnection: [],
    reconnection: [],
    deemed: [],
    dtr: [],
    meter: [],
    nsc: [],
    consumer_master: [],
    admin: [],
    meter_replacement: [],
    dtr_painting: ["read", "update"],
    material: [],
    osd: ["read", "download"],
    safety: [],
  },
  {
    role: "executive",
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete", "inspect", "process", "project_create", "po_entry", "admin_approve"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: [],
    meter_replacement: ["read", "create", "update", "delete", "issue", "install", "return", "finalize"],
    dtr_painting: ["read", "create", "update", "delete"],
    material: ["read", "create", "update", "delete", "receive", "issue", "stock", "settings"],
    osd: ["read", "download"],
    safety: ["read", "create", "update", "approve_notesheet", "issue_po", "finalize"],
    misc_inspection: ["read", "create", "update", "delete", "inspect", "finalize"],
  },
  {
    role: "division_viewer",
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: [],
    meter: [],
    nsc: [],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: [],
    dtr_painting: [],
    material: [],
    osd: ["read", "download"],
  },
]



export class RoleStorage {
  static instance: RoleStorage
  // In-memory cache per spreadsheet with 5-minute TTL
  private _cache: Record<string, RolePermissions[]> = {}
  private _cacheTimestamp: Record<string, number> = {}
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache TTL

  static getInstance() {
    if (!RoleStorage.instance) RoleStorage.instance = new RoleStorage()
    return RoleStorage.instance
  }

  invalidateCache(spreadsheetId?: string) {
    if (spreadsheetId) {
      delete this._cache[spreadsheetId]
      delete this._cacheTimestamp[spreadsheetId]
    } else {
      this._cache = {}
      this._cacheTimestamp = {}
    }
  }

  private _parseRows(rows: any[][]): RolePermissions[] {
    return rows
      .filter((row) => row && row.length > 0 && row[0])
      .map(([role, ...perms]) => {
        const result: Partial<RolePermissions> = { role: String(role).trim() }
        MODULES.forEach((mod, idx) => {
          const val = perms[idx] ? String(perms[idx]).trim() : ""
          result[mod] = val ? val.split(",").map((s) => s.trim()).filter(Boolean) : []
        })
        return result as RolePermissions
      })
  }

  private async _ensureTab(sheets: any, spreadsheetId: string) {
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
      const tabExists = spreadsheet.data.sheets?.some(
        (s: any) => s.properties?.title === SHEET_NAME
      )

      if (!tabExists) {
        console.log(`Creating missing tab "${SHEET_NAME}" in spreadsheet ${spreadsheetId}...`)
        // Add tab
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
          },
        })

        // Add headers and defaults
        const headers = ["Role", ...MODULES]
        const values = [
          headers,
          ...DEFAULT_ROLES.map((r) => [
            r.role,
            ...MODULES.map((mod) => (r[mod] || []).join(",")),
          ]),
        ]

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: "RAW",
          requestBody: { values },
        })
      } else {
        // Tab exists. Let's check headers.
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${SHEET_NAME}!A1:Z`,
        })
        const allRows = res.data.values || []
        const headers = allRows[0] || []

        if (!headers.includes("meter_replacement") || !headers.includes("dtr_painting") || !headers.includes("material")) {
          console.log(`Updating "${SHEET_NAME}" with new headers and default permissions for missing columns in ${spreadsheetId}...`)
          
          // 1. Update header row
          const newHeaders = ["Role", ...MODULES]
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${SHEET_NAME}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [newHeaders] },
          })

          // 2. Update existing rows with defaults for new columns if they exist
          const dataRows = allRows.slice(1)
          const updatedRows = dataRows.map((row: any[]) => {
            const roleName = String(row[0] || "").trim()
            const defaultRole = DEFAULT_ROLES.find(dr => dr.role.toLowerCase() === roleName.toLowerCase())
            
            const rowValues = [roleName]
            MODULES.forEach((mod, idx) => {
              if (idx < row.length - 1) {
                rowValues.push(row[idx + 1] || "")
              } else {
                const defaultPerms = defaultRole ? (defaultRole[mod] || []) : []
                rowValues.push(defaultPerms.join(","))
              }
            })
            return rowValues
          })

          if (updatedRows.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${SHEET_NAME}!A2`,
              valueInputOption: "RAW",
              requestBody: { values: updatedRows },
            })
          }
        }
      }
    } catch (e) {
      console.error("Failed to ensure roles tab exists:", e)
    }
  }

  async getRoles(spreadsheetId: string = getSpreadsheetId()): Promise<RolePermissions[]> {
    const now = Date.now()
    if (this._cache[spreadsheetId] && (now - (this._cacheTimestamp[spreadsheetId] || 0) < this.CACHE_TTL_MS)) {
      return this._cache[spreadsheetId]
    }

    // 1. Query 2-table inheritance from Turso (system_default_roles + ccc_role_overrides)
    try {
      // Find CCC ID from spreadsheetId or cccCode if available
      let cccId: number | null = null
      if (spreadsheetId) {
        const cccRes = await db.execute({
          sql: "SELECT id FROM ccc_registry WHERE spreadsheet_id = ? OR ccc_code = ? OR LOWER(ccc_code) = LOWER(?) LIMIT 1",
          args: [spreadsheetId, spreadsheetId, spreadsheetId]
        })
        cccId = (cccRes.rows[0]?.id as number) || null
      }

      // Query default roles joined with tenant overrides:
      // When a tenant override row exists (o.id IS NOT NULL), take the tenant's exact permissions (even if empty string "")
      const query = cccId
        ? `SELECT 
            d.role,
            CASE WHEN o.id IS NOT NULL THEN o.disconnection ELSE d.disconnection END as disconnection,
            CASE WHEN o.id IS NOT NULL THEN o.reconnection ELSE d.reconnection END as reconnection,
            CASE WHEN o.id IS NOT NULL THEN o.deemed ELSE d.deemed END as deemed,
            CASE WHEN o.id IS NOT NULL THEN o.dtr ELSE d.dtr END as dtr,
            CASE WHEN o.id IS NOT NULL THEN o.meter ELSE d.meter END as meter,
            CASE WHEN o.id IS NOT NULL THEN o.nsc ELSE d.nsc END as nsc,
            CASE WHEN o.id IS NOT NULL THEN o.consumer_master ELSE d.consumer_master END as consumer_master,
            CASE WHEN o.id IS NOT NULL THEN o.admin ELSE d.admin END as admin,
            CASE WHEN o.id IS NOT NULL THEN o.meter_replacement ELSE d.meter_replacement END as meter_replacement,
            CASE WHEN o.id IS NOT NULL THEN o.dtr_painting ELSE d.dtr_painting END as dtr_painting,
            CASE WHEN o.id IS NOT NULL THEN o.material ELSE d.material END as material,
            CASE WHEN o.id IS NOT NULL THEN o.osd ELSE d.osd END as osd,
            CASE WHEN o.id IS NOT NULL THEN o.safety ELSE d.safety END as safety,
            CASE WHEN o.id IS NOT NULL THEN o.misc_inspection ELSE d.misc_inspection END as misc_inspection,
            CASE WHEN o.id IS NOT NULL THEN o.icds ELSE d.icds END as icds
          FROM system_default_roles d
          LEFT JOIN ccc_role_overrides o ON o.role = d.role AND o.ccc_id = ?
          UNION
          SELECT 
            o.role,
            o.disconnection, o.reconnection, o.deemed, o.dtr, o.meter, o.nsc,
            o.consumer_master, o.admin, o.meter_replacement, o.dtr_painting,
            o.material, o.osd, o.safety, o.misc_inspection, o.icds
          FROM ccc_role_overrides o
          WHERE o.ccc_id = ? AND o.role NOT IN (SELECT role FROM system_default_roles)`
        : `SELECT 
            role, disconnection, reconnection, deemed, dtr, meter, nsc,
            consumer_master, admin, meter_replacement, dtr_painting,
            material, osd, safety, misc_inspection, icds
          FROM system_default_roles`

      const res = await db.execute({
        sql: query,
        args: cccId ? [cccId, cccId] : []
      })

      if (res.rows && res.rows.length > 0) {
        const roles: RolePermissions[] = res.rows.map((row: any) => {
          const role = String(row.role || "").trim()
          const permObj: any = { role }
          MODULES.forEach(mod => {
            const val = row[mod] ? String(row[mod]).trim() : ""
            permObj[mod] = val ? val.split(",").map((s: string) => s.trim()).filter(Boolean) : []
          })
          return permObj as RolePermissions
        })

        this._cache[spreadsheetId] = roles
        this._cacheTimestamp[spreadsheetId] = now
        return roles
      }
    } catch (err) {
      console.warn("Turso 2-table role query failed, falling back to Sheets:", err)
    }

    // Fallback: Google Sheets
    const sheets = await getSheetsClient()
    await this._ensureTab(sheets, spreadsheetId)

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:Z`,
    })
    const rows = res.data.values || []
    const roles = this._parseRows(rows)

    // Ensure at least admin exists if sheet was manually emptied
    if (roles.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              "admin",
              ...MODULES.map((mod) => "read,create,update,delete"),
            ],
          ],
        },
      })
      this.invalidateCache(spreadsheetId)
      return this.getRoles(spreadsheetId)
    }

    this._cache[spreadsheetId] = roles
    this._cacheTimestamp[spreadsheetId] = now
    return roles
  }

  async getPermissionsForRole(roleName: string, spreadsheetId: string = getSpreadsheetId()): Promise<Record<string, string[]> | null> {
    const roles = await this.getRoles(spreadsheetId)
    const r = roles.find((x) => x.role.toLowerCase() === roleName.toLowerCase())
    if (!r) return null

    const perms: Record<string, string[]> = {}
    MODULES.forEach((mod) => {
      perms[mod] = r[mod] || []
    })
    return perms
  }

  async addOrUpdateRole(role: RolePermissions, spreadsheetId: string = getSpreadsheetId()) {
    // 1. Save to Turso (system_default_roles or ccc_role_overrides)
    try {
      let cccId: number | null = null
      if (spreadsheetId) {
        const cccRes = await db.execute({
          sql: "SELECT id FROM ccc_registry WHERE spreadsheet_id = ? LIMIT 1",
          args: [spreadsheetId]
        })
        cccId = (cccRes.rows[0]?.id as number) || null
      }

      const roleName = role.role.toLowerCase().trim()
      const modValues: Record<string, string> = {}
      MODULES.forEach(mod => {
        modValues[mod] = (role[mod] || []).join(",")
      })

      if (cccId) {
        // Save as tenant override in ccc_role_overrides
        await db.execute({
          sql: `INSERT INTO ccc_role_overrides (
                  ccc_id, role, disconnection, reconnection, deemed, dtr, meter, nsc,
                  consumer_master, admin, meter_replacement, dtr_painting, material,
                  osd, safety, misc_inspection, icds
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ccc_id, role) DO UPDATE SET
                  disconnection = excluded.disconnection,
                  reconnection = excluded.reconnection,
                  deemed = excluded.deemed,
                  dtr = excluded.dtr,
                  meter = excluded.meter,
                  nsc = excluded.nsc,
                  consumer_master = excluded.consumer_master,
                  admin = excluded.admin,
                  meter_replacement = excluded.meter_replacement,
                  dtr_painting = excluded.dtr_painting,
                  material = excluded.material,
                  osd = excluded.osd,
                  safety = excluded.safety,
                  misc_inspection = excluded.misc_inspection,
                  icds = excluded.icds,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [
            cccId, roleName,
            modValues.disconnection || '', modValues.reconnection || '', modValues.deemed || '',
            modValues.dtr || '', modValues.meter || '', modValues.nsc || '',
            modValues.consumer_master || '', modValues.admin || '', modValues.meter_replacement || '',
            modValues.dtr_painting || '', modValues.material || '', modValues.osd || '',
            modValues.safety || '', modValues.misc_inspection || '', modValues.icds || ''
          ]
        })
      } else {
        // Save into system_default_roles
        await db.execute({
          sql: `INSERT INTO system_default_roles (
                  role, disconnection, reconnection, deemed, dtr, meter, nsc,
                  consumer_master, admin, meter_replacement, dtr_painting, material,
                  osd, safety, misc_inspection, icds
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(role) DO UPDATE SET
                  disconnection = excluded.disconnection,
                  reconnection = excluded.reconnection,
                  deemed = excluded.deemed,
                  dtr = excluded.dtr,
                  meter = excluded.meter,
                  nsc = excluded.nsc,
                  consumer_master = excluded.consumer_master,
                  admin = excluded.admin,
                  meter_replacement = excluded.meter_replacement,
                  dtr_painting = excluded.dtr_painting,
                  material = excluded.material,
                  osd = excluded.osd,
                  safety = excluded.safety,
                  misc_inspection = excluded.misc_inspection,
                  icds = excluded.icds,
                  updated_at = CURRENT_TIMESTAMP`,
          args: [
            roleName,
            modValues.disconnection || '', modValues.reconnection || '', modValues.deemed || '',
            modValues.dtr || '', modValues.meter || '', modValues.nsc || '',
            modValues.consumer_master || '', modValues.admin || '', modValues.meter_replacement || '',
            modValues.dtr_painting || '', modValues.material || '', modValues.osd || '',
            modValues.safety || '', modValues.misc_inspection || '', modValues.icds || ''
          ]
        })
      }
    } catch (err) {
      console.warn("Turso role save notice:", err)
    }

    // Google Sheets dual-write
    try {
      const sheets = await getSheetsClient()
      await this._ensureTab(sheets, spreadsheetId)
      const roles = await this.getRoles(spreadsheetId)

      const idx = roles.findIndex(
        (x) => x.role.toLowerCase() === role.role.toLowerCase()
      )
      const rowValues = [role.role, ...MODULES.map((mod) => (role[mod] || []).join(","))]

      if (idx === -1) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${SHEET_NAME}!A:Z`,
          valueInputOption: "RAW",
          requestBody: { values: [rowValues] },
        })
      } else {
        const rowNum = idx + 2
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!A${rowNum}:Z${rowNum}`,
          valueInputOption: "RAW",
          requestBody: { values: [rowValues] },
        })
      }
    } catch (e) {
      console.warn("Sheets dual-write notice:", e)
    }

    this.invalidateCache(spreadsheetId)
    return role
  }

  async deleteRole(roleName: string, spreadsheetId: string = getSpreadsheetId()) {
    try {
      let cccId: number | null = null
      if (spreadsheetId) {
        const cccRes = await db.execute({
          sql: "SELECT id FROM ccc_registry WHERE spreadsheet_id = ? LIMIT 1",
          args: [spreadsheetId]
        })
        cccId = (cccRes.rows[0]?.id as number) || null
      }

      if (cccId) {
        await db.execute({
          sql: "DELETE FROM ccc_role_overrides WHERE ccc_id = ? AND role = ?",
          args: [cccId, roleName.toLowerCase().trim()]
        })
      }
    } catch (err) {
      console.warn("Turso delete role notice:", err)
    }

    // Google Sheets dual-delete
    try {
      const sheets = await getSheetsClient()
      await this._ensureTab(sheets, spreadsheetId)
      const roles = await this.getRoles(spreadsheetId)
      const idx = roles.findIndex(
        (x) => x.role.toLowerCase() === roleName.toLowerCase()
      )
      if (idx !== -1) {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
        const sheet = spreadsheet.data.sheets?.find(
          (s: any) => s.properties?.title === SHEET_NAME
        )
        const targetSheetId = sheet?.properties?.sheetId
        if (targetSheetId !== undefined && targetSheetId !== null) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: targetSheetId,
                      dimension: "ROWS",
                      startIndex: idx + 1,
                      endIndex: idx + 2,
                    },
                  },
                },
              ],
            },
          })
        }
      }
    } catch (e) {
      console.warn("Sheets dual-delete notice:", e)
    }

    this.invalidateCache(spreadsheetId)
    return { role: roleName }
  }
}

export const roleStorage = RoleStorage.getInstance()

