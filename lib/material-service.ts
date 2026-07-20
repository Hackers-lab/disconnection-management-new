// Server-only — imports @googleapis/sheets. Never import this in "use client" components.
// Client components should import types from lib/material-types.ts instead.
import { sheets as googleSheets } from "@googleapis/sheets"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth, uploadImageToDrive } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { nowDate, nowTs } from "./date-utils"
import {
  SEED_MATERIALS,
  type Material,
  type MaterialReceive,
  type MaterialIssue,
  type MaterialStock,
  type MaterialUnit,
} from "./material-types"

const sheets = googleSheets({ version: "v4", auth })

// ─── Sheet names ──────────────────────────────────────────────────────────────
const CAT_TAB     = "Mat_Catalogue"
const RECEIVE_TAB = "Mat_Receive"
const ISSUE_TAB   = "Mat_Issue"

const CAT_HEADERS = [
  "Material ID", "Material Number", "Description", "Unit",
  "Category", "Is Active", "Created Date", "Created By", "Min Threshold", "Photo URL",
]
const RECEIVE_HEADERS = [
  "Receive ID", "Material ID", "Material Desc", "Quantity", "Unit",
  "Challan Ref", "Received Date", "Received From", "Photo URL",
  "Remarks", "Created By", "Created At",
]
const ISSUE_HEADERS = [
  "Issue ID", "Material ID", "Material Desc", "Quantity", "Unit",
  "Recipient Name", "Recipient Designation", "Purpose", "Issue Date",
  "Photo URL", "Remarks", "Issued By", "Created At",
]

// ─── Cache ────────────────────────────────────────────────────────────────────
const MATERIAL_TAG = "material"
const REVALIDATE_S = 30 * 24 * 60 * 60 // 30 days — write-invalidated infinite cache
let tabsReady = false
let ensureTabsPromise: Promise<void> | null = null

export function invalidateMaterialCache() { revalidateTag(MATERIAL_TAG) }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTabs(id: string) {
  if (tabsReady) return
  if (ensureTabsPromise) return ensureTabsPromise

  ensureTabsPromise = (async () => {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
      const existing = meta.data.sheets?.map(s => s.properties?.title) || []
      const toCreate = [CAT_TAB, RECEIVE_TAB, ISSUE_TAB].filter(t => !existing.includes(t))

      if (toCreate.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          requestBody: {
            requests: toCreate.map(t => ({ addSheet: { properties: { title: t } } })),
          },
        })
        for (const tab of toCreate) {
          const headers = tab === CAT_TAB ? CAT_HEADERS
            : tab === RECEIVE_TAB ? RECEIVE_HEADERS
            : ISSUE_HEADERS
          await sheets.spreadsheets.values.update({
            spreadsheetId: id,
            range: `${tab}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [headers] },
          })
        }
      }

      // Seed catalogue if empty
      if (toCreate.includes(CAT_TAB) || !existing.includes(CAT_TAB)) {
        // Check if catalogue is empty (just header)
        const catRows = await sheets.spreadsheets.values.get({
          spreadsheetId: id,
          range: `${CAT_TAB}!A:A`,
        })
        const rowCount = (catRows.data.values || []).length
        if (rowCount <= 1) {
          // Seed with default materials
          const seedRows = SEED_MATERIALS.map((m, i) => [
            `MAT-${String(i + 1).padStart(4, "0")}`, // Material ID
            m.materialNo,
            m.description,
            m.unit,
            m.category,
            "yes",
            nowDate(),
            "system",
          ])
          if (seedRows.length > 0) {
            await sheets.spreadsheets.values.append({
              spreadsheetId: id,
              range: `${CAT_TAB}!A2`,
              valueInputOption: "RAW",
              requestBody: { values: seedRows },
            })
          }
        }
      }

      // Migration check for Min Threshold column
      if (existing.includes(CAT_TAB)) {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: id,
          range: `${CAT_TAB}!A1:I1`,
        })
        const headers = res.data.values?.[0] || []
        if (!headers.includes("Min Threshold")) {
          console.log("Migrating Mat_Catalogue sheet to include Min Threshold...")
          await sheets.spreadsheets.values.update({
            spreadsheetId: id,
            range: `${CAT_TAB}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [CAT_HEADERS] },
          })
          const allRes = await sheets.spreadsheets.values.get({
            spreadsheetId: id,
            range: `${CAT_TAB}!A2:H`,
          })
          const rows = allRes.data.values || []
          const updatedRows = rows.map(r => {
            const nr = [...r]
            while (nr.length < 8) nr.push("")
            nr.push("0")
            return nr
          })
          if (updatedRows.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: id,
              range: `${CAT_TAB}!A2`,
              valueInputOption: "RAW",
              requestBody: { values: updatedRows },
            })
          }
        }
      }

      // Migration check for Photo URL column
      if (existing.includes(CAT_TAB)) {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: id,
          range: `${CAT_TAB}!A1:J1`,
        })
        const headers = res.data.values?.[0] || []
        if (!headers.includes("Photo URL")) {
          console.log("Migrating Mat_Catalogue sheet to include Photo URL...")
          await sheets.spreadsheets.values.update({
            spreadsheetId: id,
            range: `${CAT_TAB}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [CAT_HEADERS] },
          })
          const allRes = await sheets.spreadsheets.values.get({
            spreadsheetId: id,
            range: `${CAT_TAB}!A2:I`,
          })
          const rows = allRes.data.values || []
          const updatedRows = rows.map(r => {
            const nr = [...r]
            while (nr.length < 9) nr.push("")
            nr.push("")
            return nr
          })
          if (updatedRows.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: id,
              range: `${CAT_TAB}!A2`,
              valueInputOption: "RAW",
              requestBody: { values: updatedRows },
            })
          }
        }
      }

      tabsReady = true
    } catch (err) {
      ensureTabsPromise = null
      throw err
    }
  })()

  return ensureTabsPromise
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseCatalogue(r: string[]): Material {
  return {
    materialId:  r[0] || "",
    materialNo:  r[1] || "",
    description: r[2] || "",
    unit:        (r[3] || "nos") as MaterialUnit,
    category:    r[4] || "Other",
    isActive:    (r[5] || "yes").toLowerCase() === "yes",
    createdDate: r[6] || "",
    createdBy:   r[7] || "",
    threshold:   parseFloat(r[8] || "0"),
    photoUrl:    r[9] || "",
  }
}

function parseReceive(r: string[]): MaterialReceive {
  return {
    receiveId:    r[0]  || "",
    materialId:   r[1]  || "",
    materialDesc: r[2]  || "",
    quantity:     parseFloat(r[3] || "0"),
    unit:         r[4]  || "",
    challanRef:   r[5]  || "",
    receivedDate: r[6]  || "",
    receivedFrom: r[7]  || "",
    photoUrl:     r[8]  || "",
    remarks:      r[9]  || "",
    createdBy:    r[10] || "",
    createdAt:    r[11] || "",
  }
}

function parseIssue(r: string[]): MaterialIssue {
  return {
    issueId:              r[0]  || "",
    materialId:           r[1]  || "",
    materialDesc:         r[2]  || "",
    quantity:             parseFloat(r[3] || "0"),
    unit:                 r[4]  || "",
    recipientName:        r[5]  || "",
    recipientDesignation: r[6]  || "",
    purpose:              r[7]  || "",
    issueDate:            r[8]  || "",
    photoUrl:             r[9]  || "",
    remarks:              r[10] || "",
    issuedBy:             r[11] || "",
    createdAt:            r[12] || "",
  }
}

// ─── Raw reads (live, for writes) ─────────────────────────────────────────────
async function rawCatalogue(spreadsheetId: string) {
  await ensureTabs(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${CAT_TAB}!A2:J`,
  })
  const items = (res.data.values || []).map(parseCatalogue)
  const seenIds = new Set<string>()
  const seenNos = new Set<string>()
  const seenDescs = new Set<string>()
  return items.filter(item => {
    if (!item.materialId) return false
    if (seenIds.has(item.materialId)) return false
    
    if (item.materialNo && item.materialNo.trim()) {
      const noKey = item.materialNo.trim()
      if (seenNos.has(noKey)) return false
      seenNos.add(noKey)
    }
    
    const descKey = item.description.toLowerCase().trim()
    if (seenDescs.has(descKey)) return false

    seenIds.add(item.materialId)
    seenDescs.add(descKey)
    return true
  })
}

async function rawReceives(spreadsheetId: string) {
  await ensureTabs(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${RECEIVE_TAB}!A2:L`,
  })
  return (res.data.values || []).map(parseReceive)
}

async function rawIssues(spreadsheetId: string) {
  await ensureTabs(spreadsheetId)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ISSUE_TAB}!A2:M`,
  })
  return (res.data.values || []).map(parseIssue)
}

// ─── Cached reads ─────────────────────────────────────────────────────────────
export const getCatalogue = unstable_cache(
  async (spreadsheetId: string) => rawCatalogue(spreadsheetId),
  ["material-catalogue"],
  { tags: [MATERIAL_TAG], revalidate: REVALIDATE_S }
)

export const getReceiveHistory = unstable_cache(
  async (spreadsheetId: string) => rawReceives(spreadsheetId),
  ["material-receives"],
  { tags: [MATERIAL_TAG], revalidate: REVALIDATE_S }
)

export const getIssueHistory = unstable_cache(
  async (spreadsheetId: string) => rawIssues(spreadsheetId),
  ["material-issues"],
  { tags: [MATERIAL_TAG], revalidate: REVALIDATE_S }
)

// ─── Computed stock ───────────────────────────────────────────────────────────
export async function getStock(spreadsheetId: string): Promise<MaterialStock[]> {
  const [catalogue, receives, issues] = await Promise.all([
    getCatalogue(spreadsheetId),
    getReceiveHistory(spreadsheetId),
    getIssueHistory(spreadsheetId),
  ])

  const receiveMap = new Map<string, number>()
  for (const r of receives) {
    receiveMap.set(r.materialId, (receiveMap.get(r.materialId) || 0) + r.quantity)
  }

  const issueMap = new Map<string, number>()
  for (const i of issues) {
    issueMap.set(i.materialId, (issueMap.get(i.materialId) || 0) + i.quantity)
  }

  return catalogue
    .filter(m => m.isActive)
    .map(m => {
      const totalReceived = receiveMap.get(m.materialId) || 0
      const totalIssued = issueMap.get(m.materialId) || 0
      return {
        materialId:    m.materialId,
        materialNo:    m.materialNo,
        description:   m.description,
        unit:          m.unit,
        category:      m.category,
        totalReceived,
        totalIssued,
        currentStock:  Math.round((totalReceived - totalIssued) * 1000) / 1000,
        threshold:     m.threshold || 0,
        photoUrl:      m.photoUrl || "",
      }
    })
}

// ─── Next ID helpers ──────────────────────────────────────────────────────────
async function nextCatalogueId(): Promise<string> {
  const catalogue = await rawCatalogue()
  let maxNum = catalogue.length
  for (const m of catalogue) {
    const match = m.materialId.match(/MAT-(\d+)/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]))
  }
  return `MAT-${String(maxNum + 1).padStart(4, "0")}`
}

async function nextReceiveId(): Promise<string> {
  const receives = await rawReceives()
  let maxNum = receives.length
  for (const r of receives) {
    const match = r.receiveId.match(/MAT-R-(\d+)/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]))
  }
  return `MAT-R-${String(maxNum + 1).padStart(4, "0")}`
}

async function nextIssueId(): Promise<string> {
  const issues = await rawIssues()
  let maxNum = issues.length
  for (const i of issues) {
    const match = i.issueId.match(/MAT-I-(\d+)/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]))
  }
  return `MAT-I-${String(maxNum + 1).padStart(4, "0")}`
}

// ─── Write operations ─────────────────────────────────────────────────────────

/** Add a new material to the catalogue */
export async function addMaterial(data: {
  materialNo: string
  description: string
  unit: MaterialUnit
  category: string
  createdBy: string
  threshold: number
  photoUrl?: string
}): Promise<Material> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const materialId = await nextCatalogueId()

  const row = [
    materialId,
    data.materialNo,
    data.description,
    data.unit,
    data.category,
    "yes",
    nowDate(),
    data.createdBy,
    String(data.threshold || 0),
    data.photoUrl || "",
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${CAT_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  })

  invalidateMaterialCache()
  return parseCatalogue(row)
}

/** Record material receipts (batch/multi-item) from divisional store */
export async function addReceives(data: {
  items: { materialId: string; quantity: number }[]
  challanRef: string
  receivedDate: string
  receivedFrom: string
  photoFile?: File | null
  remarks: string
  createdBy: string
}): Promise<{ receiveId: string; count: number }> {
  const id = getSpreadsheetId()
  await ensureTabs(id)

  const catalogue = await rawCatalogue()
  const receiveId = await nextReceiveId()

  // Upload photo if provided
  let photoUrl = ""
  if (data.photoFile) {
    photoUrl = await uploadImageToDrive(data.photoFile, `MAT-RECV-${receiveId}`)
  }

  const rows = data.items.map(item => {
    const material = catalogue.find(m => m.materialId === item.materialId)
    if (!material) throw new Error(`Material ${item.materialId} not found`)
    return [
      receiveId,
      item.materialId,
      material.description,
      String(item.quantity),
      material.unit,
      data.challanRef,
      data.receivedDate || nowDate(),
      data.receivedFrom,
      photoUrl,
      data.remarks,
      data.createdBy,
      nowTs(),
    ]
  })

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${RECEIVE_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })

  invalidateMaterialCache()
  return { receiveId, count: rows.length }
}

// Single-item compatibility wrapper
export async function addReceive(data: {
  materialId: string
  quantity: number
  challanRef: string
  receivedDate: string
  receivedFrom: string
  photoFile?: File | null
  remarks: string
  createdBy: string
}): Promise<MaterialReceive> {
  const result = await addReceives({
    items: [{ materialId: data.materialId, quantity: data.quantity }],
    challanRef: data.challanRef,
    receivedDate: data.receivedDate,
    receivedFrom: data.receivedFrom,
    photoFile: data.photoFile,
    remarks: data.remarks,
    createdBy: data.createdBy,
  })
  return {
    receiveId: result.receiveId,
    materialId: data.materialId,
    materialDesc: "", // caller doesn't strictly need it, or we can look it up
    quantity: data.quantity,
    unit: "",
    challanRef: data.challanRef,
    receivedDate: data.receivedDate,
    receivedFrom: data.receivedFrom,
    photoUrl: "",
    remarks: data.remarks,
    createdBy: data.createdBy,
    createdAt: nowTs(),
  }
}

/** Issue materials (batch/multi-item) to a recipient */
export async function addIssues(data: {
  items: { materialId: string; quantity: number }[]
  recipientName: string
  recipientDesignation: string
  purpose: string
  issueDate: string
  photoFile?: File | null
  remarks: string
  issuedBy: string
}): Promise<{ issueId: string; count: number }> {
  const id = getSpreadsheetId()
  await ensureTabs(id)

  const catalogue = await rawCatalogue()
  const [receives, issues] = await Promise.all([rawReceives(), rawIssues()])
  const issueId = await nextIssueId()

  // Upload photo if provided
  let photoUrl = ""
  if (data.photoFile) {
    photoUrl = await uploadImageToDrive(data.photoFile, `MAT-ISSUE-${issueId}`)
  }

  const rows = data.items.map(item => {
    const material = catalogue.find(m => m.materialId === item.materialId)
    if (!material) throw new Error(`Material ${item.materialId} not found`)

    // Validate stock
    const totalReceived = receives
      .filter(r => r.materialId === item.materialId)
      .reduce((s, r) => s + r.quantity, 0)
    const totalIssued = issues
      .filter(i => i.materialId === item.materialId)
      .reduce((s, i) => s + i.quantity, 0)
    const currentStock = totalReceived - totalIssued

    if (item.quantity > currentStock) {
      throw new Error(`Insufficient stock for ${material.description}. Available: ${currentStock} ${material.unit}, Requested: ${item.quantity} ${material.unit}`)
    }

    return [
      issueId,
      item.materialId,
      material.description,
      String(item.quantity),
      material.unit,
      data.recipientName,
      data.recipientDesignation,
      data.purpose,
      data.issueDate || nowDate(),
      photoUrl,
      data.remarks,
      data.issuedBy,
      nowTs(),
    ]
  })

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${ISSUE_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })

  invalidateMaterialCache()
  return { issueId, count: rows.length }
}

// Single-item compatibility wrapper
export async function addIssue(data: {
  materialId: string
  quantity: number
  recipientName: string
  recipientDesignation: string
  purpose: string
  issueDate: string
  photoFile?: File | null
  remarks: string
  issuedBy: string
}): Promise<MaterialIssue> {
  const result = await addIssues({
    items: [{ materialId: data.materialId, quantity: data.quantity }],
    recipientName: data.recipientName,
    recipientDesignation: data.recipientDesignation,
    purpose: data.purpose,
    issueDate: data.issueDate,
    photoFile: data.photoFile,
    remarks: data.remarks,
    issuedBy: data.issuedBy,
  })
  return {
    issueId: result.issueId,
    materialId: data.materialId,
    materialDesc: "",
    quantity: data.quantity,
    unit: "",
    recipientName: data.recipientName,
    recipientDesignation: data.recipientDesignation,
    purpose: data.purpose,
    issueDate: data.issueDate,
    photoUrl: "",
    remarks: data.remarks,
    issuedBy: data.issuedBy,
    createdAt: nowTs(),
  }
}

/** Admin deletes a receive transaction entirely (removes all matching rows) */
export async function deleteReceive(receiveId: string): Promise<boolean> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${RECEIVE_TAB}!A2:L`,
  })
  const rows = res.data.values || []
  const filtered = rows.filter(r => r[0] !== receiveId)

  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `${RECEIVE_TAB}!A2:L`,
  })

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${RECEIVE_TAB}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: filtered },
    })
  }
  invalidateMaterialCache()
  return true
}

/** Admin deletes an issue transaction entirely (removes all matching rows) */
export async function deleteIssue(issueId: string): Promise<boolean> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${ISSUE_TAB}!A2:M`,
  })
  const rows = res.data.values || []
  const filtered = rows.filter(r => r[0] !== issueId)

  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `${ISSUE_TAB}!A2:M`,
  })

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${ISSUE_TAB}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: filtered },
    })
  }
  invalidateMaterialCache()
  return true
}

/** Admin deletes a catalogue item (soft-deactivates or deletes) */
export async function deleteMaterialFromCatalogue(materialId: string): Promise<boolean> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${CAT_TAB}!A2:J`,
  })
  const rows = res.data.values || []
  
  // Actually delete the row completely
  const filtered = rows.filter(r => r[0] !== materialId)

  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `${CAT_TAB}!A2:J`,
  })

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${CAT_TAB}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: filtered },
    })
  }
  invalidateMaterialCache()
  return true
}

/** Update an existing material's fields in the catalogue */
export async function updateMaterial(
  materialId: string,
  data: {
    materialNo: string
    description: string
    unit: MaterialUnit
    category: string
    threshold: number
    photoUrl?: string
  }
): Promise<Material> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${CAT_TAB}!A2:J`,
  })
  const rows = res.data.values || []

  let found = false
  const updatedRows = rows.map(r => {
    if (r[0] === materialId) {
      found = true
      return [
        materialId,
        data.materialNo,
        data.description,
        data.unit,
        data.category,
        r[5] || "yes", // keep active status
        r[6] || nowDate(),
        r[7] || "system",
        String(data.threshold || 0),
        data.photoUrl !== undefined ? data.photoUrl : (r[9] || ""),
      ]
    }
    return r
  })

  if (!found) throw new Error(`Material ${materialId} not found`)

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${CAT_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: updatedRows },
  })

  invalidateMaterialCache()
  return parseCatalogue([
    materialId,
    data.materialNo,
    data.description,
    data.unit,
    data.category,
    "yes",
    nowDate(),
    "system",
    String(data.threshold || 0),
    data.photoUrl || "",
  ])
}

/** Get per-material transaction history (receives + issues interleaved) */
export async function getMaterialHistory(materialId: string, spreadsheetId: string) {
  const [receives, issues] = await Promise.all([
    getReceiveHistory(spreadsheetId),
    getIssueHistory(spreadsheetId),
  ])

  const matReceives = receives
    .filter(r => r.materialId === materialId)
    .map(r => ({ type: "receive" as const, ...r, date: r.receivedDate, by: r.createdBy }))

  const matIssues = issues
    .filter(i => i.materialId === materialId)
    .map(i => ({ type: "issue" as const, ...i, date: i.issueDate, by: i.issuedBy }))

  // Combine and sort by date (newest first)
  const combined = [...matReceives, ...matIssues]
  // Simple sort — dates are DD-MM-YYYY so we convert for comparison
  combined.sort((a, b) => {
    const parseD = (d: string) => {
      if (!d) return 0
      const [dd, mm, yy] = d.split("-").map(Number)
      return new Date(yy, mm - 1, dd).getTime()
    }
    return parseD(b.date) - parseD(a.date)
  })

  return combined
}
