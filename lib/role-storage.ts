import { sheets as googleSheets } from "@googleapis/sheets"
import { getSpreadsheetId } from "./google-sheets-api"

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
] as const

const DEFAULT_ROLES: RolePermissions[] = [
  {
    role: "admin",
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: ["read", "create", "update", "delete"],
    meter_replacement: ["read", "create", "update", "delete"],
    dtr_painting: ["read", "create", "update", "delete"],
    material: ["read", "create", "update", "delete", "receive", "issue", "stock", "settings"],
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
  },
  {
    role: "agency",
    disconnection: ["read", "update"],
    reconnection: ["read", "update"],
    deemed: ["read", "update"],
    dtr: ["read", "update"],
    meter: ["read", "update"],
    nsc: ["read", "update"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "update"],
    dtr_painting: ["read", "update"],
    material: ["read", "update", "receive", "issue", "stock"],
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
  },
  {
    role: "executive",
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: [],
    meter_replacement: ["read", "create", "update", "delete"],
    dtr_painting: ["read", "create", "update", "delete"],
    material: ["read", "create", "update", "delete", "receive", "issue", "stock", "settings"],
  },
]



export class RoleStorage {
  static instance: RoleStorage
  // Infinite in-memory cache per spreadsheet — never expires by time.
  // Only cleared when a role is saved/deleted (write-invalidated).
  private _cache: Record<string, RolePermissions[]> = {}

  static getInstance() {
    if (!RoleStorage.instance) RoleStorage.instance = new RoleStorage()
    return RoleStorage.instance
  }

  invalidateCache(spreadsheetId?: string) {
    if (spreadsheetId) {
      delete this._cache[spreadsheetId]
    } else {
      this._cache = {}
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
            ...MODULES.map((mod) => r[mod].join(",")),
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
    // Serve from infinite cache — only cleared when a role is written
    if (this._cache[spreadsheetId]) {
      return this._cache[spreadsheetId]
    }
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

    // Cache indefinitely until a write invalidates it
    this._cache[spreadsheetId] = roles
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
    const sheets = await getSheetsClient()
    await this._ensureTab(sheets, spreadsheetId)
    const roles = await this.getRoles(spreadsheetId)

    const idx = roles.findIndex(
      (x) => x.role.toLowerCase() === role.role.toLowerCase()
    )
    const rowValues = [role.role, ...MODULES.map((mod) => (role[mod] || []).join(","))]

    if (idx === -1) {
      // Append
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:Z`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowValues],
        },
      })
    } else {
      // Update
      const rowNum = idx + 2 // A2 starts at index 0, so row is index + 2
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A${rowNum}:Z${rowNum}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowValues],
        },
      })
    }
    this.invalidateCache(spreadsheetId)
    return role
  }

  async deleteRole(roleName: string, spreadsheetId: string = getSpreadsheetId()) {
    const sheets = await getSheetsClient()
    await this._ensureTab(sheets, spreadsheetId)
    const roles = await this.getRoles(spreadsheetId)
    const idx = roles.findIndex(
      (x) => x.role.toLowerCase() === roleName.toLowerCase()
    )
    if (idx === -1) return null

    // Get spreadsheet tab property sheetId for deletion batch update
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title === SHEET_NAME
    )
    const targetSheetId = sheet?.properties?.sheetId

    if (targetSheetId === undefined || targetSheetId === null) {
      throw new Error(`Sheet tab "${SHEET_NAME}" not found`)
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: targetSheetId,
                dimension: "ROWS",
                startIndex: idx + 1, // 0-based: Row 2 (A2) is index 1
                endIndex: idx + 2,
              },
            },
          },
        ],
      },
    })
    this.invalidateCache(spreadsheetId)
    return roles[idx]
  }
}

export const roleStorage = RoleStorage.getInstance()
