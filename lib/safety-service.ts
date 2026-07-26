export interface SafetyTicket {
  _syncStatus?: 'syncing' | 'error'
  _localEditedAt?: number
  safetyId: string
  reportedDate: string
  reportedBy: string
  offCode?: string
  hazardCategories: string[]
  severity: "Critical" | "High" | "Medium" | "Low"
  priority: "urgent" | "normal"
  latitude: number
  longitude: number
  address: string
  dtrCode?: string
  beforeImageUrl?: string
  drawingUrl?: string
  agency: string
  physicalStatus: "pending" | "rectified"
  adminStatus: "pending_notesheet" | "notesheet_done" | "po_done" | "not_required"
  noteSheetNo?: string
  noteSheetDate?: string
  noteSheetAmount?: string
  poNumber?: string
  poDate?: string
  poAmount?: string
  afterImageUrl?: string
  completionRemarks?: string
  completionDate?: string
  lastUpdated?: string
  remarks?: string
}

async function getSheetsClient() {
  const { sheets: googleSheets } = await import("@googleapis/sheets")
  const { auth } = await import("./google-drive")
  return googleSheets({ version: "v4", auth: auth as any })
}

export const SAFETY_TAB = "Safety_Module"

export const SAFETY_HEADERS = [
  "Safety ID",
  "Reported Date",
  "Reported By",
  "Office Code",
  "Hazard Categories",
  "Severity",
  "Priority",
  "Latitude",
  "Longitude",
  "Address",
  "DTR Code",
  "Before Image URL",
  "Drawing URL",
  "Agency",
  "Physical Status",
  "Admin Status",
  "Note Sheet No",
  "Note Sheet Date",
  "Note Sheet Amount",
  "PO Number",
  "PO Date",
  "PO Amount",
  "After Image URL",
  "Completion Remarks",
  "Completion Date",
  "Last Updated",
  "Remarks",
]

const SAFETY_MEMO_TTL_MS = 60_000
let safetyMemo: Record<string, { at: number; data: SafetyTicket[] }> = {}

export function invalidateSafetyCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    delete safetyMemo[spreadsheetId]
  } else {
    safetyMemo = {}
  }
}

function nowDate(): string {
  return new Date().toISOString().split("T")[0]
}

export async function ensureSafetyTab(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s: any) => s.properties?.title === SAFETY_TAB)

  if (!sheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SAFETY_TAB } } }],
      },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SAFETY_TAB}!A1:AA1`,
      valueInputOption: "RAW",
      requestBody: { values: [SAFETY_HEADERS] },
    })
  }
}

export async function _fetchSafetyTicketsRaw(spreadsheetId: string): Promise<SafetyTicket[]> {
  const memo = safetyMemo[spreadsheetId]
  if (memo && Date.now() - memo.at < SAFETY_MEMO_TTL_MS) {
    return memo.data
  }

  await ensureSafetyTab(spreadsheetId)
  const sheets = await getSheetsClient()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SAFETY_TAB}!A:AA`,
    valueRenderOption: "FORMATTED_VALUE",
  })

  const rows = (res.data.values || []) as string[][]
  if (rows.length < 2) return []

  const tickets: SafetyTicket[] = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || []
    const safetyId = r[0]?.trim()
    if (!safetyId) continue

    const hazardStr = r[4] || ""
    const hazardCategories = hazardStr ? hazardStr.split(",").map((s: string) => s.trim()).filter(Boolean) : []

    tickets.push({
      safetyId,
      reportedDate:       r[1] || "",
      reportedBy:         r[2] || "",
      offCode:            r[3] || "",
      hazardCategories,
      severity:           (r[5] as any) || "Medium",
      priority:           (r[6] as any) || "normal",
      latitude:           parseFloat(r[7] || "0") || 0,
      longitude:          parseFloat(r[8] || "0") || 0,
      address:            r[9] || "",
      dtrCode:            r[10] || "",
      beforeImageUrl:     r[11] || "",
      drawingUrl:         r[12] || "",
      agency:             r[13] || "",
      physicalStatus:     (r[14] as any) || "pending",
      adminStatus:        (r[15] as any) || "pending_notesheet",
      noteSheetNo:        r[16] || "",
      noteSheetDate:      r[17] || "",
      noteSheetAmount:    r[18] || "",
      poNumber:           r[19] || "",
      poDate:             r[20] || "",
      poAmount:           r[21] || "",
      afterImageUrl:      r[22] || "",
      completionRemarks:  r[23] || "",
      completionDate:     r[24] || "",
      lastUpdated:        r[25] || "",
      remarks:            r[26] || "",
    })
  }

  safetyMemo[spreadsheetId] = { at: Date.now(), data: tickets }
  return tickets
}

export async function fetchSafetyTickets(spreadsheetId: string): Promise<SafetyTicket[]> {
  return _fetchSafetyTicketsRaw(spreadsheetId)
}

export async function createSafetyTicket(
  spreadsheetId: string,
  req: {
    reportedBy: string
    offCode?: string
    hazardCategories: string[]
    severity?: "Critical" | "High" | "Medium" | "Low"
    priority?: "urgent" | "normal"
    latitude: number
    longitude: number
    address: string
    dtrCode?: string
    beforeImageUrl?: string
    drawingUrl?: string
    agency: string
    remarks?: string
  }
): Promise<string> {
  await ensureSafetyTab(spreadsheetId)
  const existing = await _fetchSafetyTicketsRaw(spreadsheetId)
  const sheets = await getSheetsClient()
  
  const count = existing.length + 1
  const safetyId = `SAF-${new Date().getFullYear()}-${String(count).padStart(4, "0")}`
  const today = nowDate()

  const row = [
    safetyId,
    today,
    req.reportedBy || "",
    req.offCode || "",
    (req.hazardCategories || []).join(", "),
    req.severity || "Medium",
    req.priority || "normal",
    String(req.latitude || 0),
    String(req.longitude || 0),
    req.address || "",
    req.dtrCode || "",
    req.beforeImageUrl || "",
    req.drawingUrl || "",
    req.agency || "",
    "pending",            // Physical status
    "pending_notesheet",  // Admin status
    "", "", "", "", "", "", // Note sheet & PO fields
    "", "", "",           // After image, completion remarks, date
    today,
    req.remarks || "",
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SAFETY_TAB}!A:AA`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  })

  invalidateSafetyCache(spreadsheetId)
  return safetyId
}

export async function updateSafetyRectification(
  spreadsheetId: string,
  req: {
    safetyId: string
    afterImageUrl: string
    completionRemarks: string
    drawingUrl?: string
    completedBy: string
  }
): Promise<void> {
  const existing = await _fetchSafetyTicketsRaw(spreadsheetId)
  const idx = existing.findIndex(t => t.safetyId === req.safetyId)
  if (idx === -1) throw new Error("Safety ticket not found")

  const sheets = await getSheetsClient()
  const row = idx + 2
  const today = nowDate()
  const currentDrawing = existing[idx].drawingUrl || ""
  const drawingToSave = req.drawingUrl || currentDrawing

  const updates = [
    { range: `${SAFETY_TAB}!M${row}`, values: [[drawingToSave]] },
    { range: `${SAFETY_TAB}!O${row}`, values: [["rectified"]] },
    { range: `${SAFETY_TAB}!W${row}`, values: [[req.afterImageUrl]] },
    { range: `${SAFETY_TAB}!X${row}`, values: [[req.completionRemarks]] },
    { range: `${SAFETY_TAB}!Y${row}`, values: [[today]] },
    { range: `${SAFETY_TAB}!Z${row}`, values: [[today]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  })

  invalidateSafetyCache(spreadsheetId)
}

export async function updateNoteSheetDetails(
  spreadsheetId: string,
  req: {
    safetyId: string
    noteSheetNo: string
    noteSheetDate?: string
    noteSheetAmount?: string
    remarks?: string
  }
): Promise<void> {
  const existing = await _fetchSafetyTicketsRaw(spreadsheetId)
  const idx = existing.findIndex(t => t.safetyId === req.safetyId)
  if (idx === -1) throw new Error("Safety ticket not found")

  const sheets = await getSheetsClient()
  const row = idx + 2
  const today = nowDate()

  const updates = [
    { range: `${SAFETY_TAB}!P${row}`, values: [["notesheet_done"]] },
    { range: `${SAFETY_TAB}!Q${row}`, values: [[req.noteSheetNo]] },
    { range: `${SAFETY_TAB}!R${row}`, values: [[req.noteSheetDate || today]] },
    { range: `${SAFETY_TAB}!S${row}`, values: [[req.noteSheetAmount || ""]] },
    { range: `${SAFETY_TAB}!Z${row}`, values: [[today]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  })

  invalidateSafetyCache(spreadsheetId)
}

export async function updatePODetails(
  spreadsheetId: string,
  req: {
    safetyId: string
    poNumber: string
    poDate?: string
    poAmount?: string
  }
): Promise<void> {
  const existing = await _fetchSafetyTicketsRaw(spreadsheetId)
  const idx = existing.findIndex(t => t.safetyId === req.safetyId)
  if (idx === -1) throw new Error("Safety ticket not found")

  const sheets = await getSheetsClient()
  const row = idx + 2
  const today = nowDate()

  const updates = [
    { range: `${SAFETY_TAB}!P${row}`, values: [["po_done"]] },
    { range: `${SAFETY_TAB}!T${row}`, values: [[req.poNumber]] },
    { range: `${SAFETY_TAB}!U${row}`, values: [[req.poDate || today]] },
    { range: `${SAFETY_TAB}!V${row}`, values: [[req.poAmount || ""]] },
    { range: `${SAFETY_TAB}!Z${row}`, values: [[today]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  })

  invalidateSafetyCache(spreadsheetId)
}

export async function markPONotRequired(
  spreadsheetId: string,
  safetyId: string
): Promise<void> {
  const existing = await _fetchSafetyTicketsRaw(spreadsheetId)
  const idx = existing.findIndex(t => t.safetyId === safetyId)
  if (idx === -1) throw new Error("Safety ticket not found")

  const sheets = await getSheetsClient()
  const row = idx + 2
  const today = nowDate()

  const updates = [
    { range: `${SAFETY_TAB}!P${row}`, values: [["not_required"]] },
    { range: `${SAFETY_TAB}!Z${row}`, values: [[today]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  })

  invalidateSafetyCache(spreadsheetId)
}

export async function updateSafetyAgency(
  spreadsheetId: string,
  safetyId: string,
  agency: string
): Promise<void> {
  const existing = await _fetchSafetyTicketsRaw(spreadsheetId)
  const idx = existing.findIndex(t => t.safetyId === safetyId)
  if (idx === -1) throw new Error("Safety ticket not found")

  const sheets = await getSheetsClient()
  const row = idx + 2
  const today = nowDate()

  const updates = [
    { range: `${SAFETY_TAB}!N${row}`, values: [[agency]] },
    { range: `${SAFETY_TAB}!Z${row}`, values: [[today]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  })

  invalidateSafetyCache(spreadsheetId)
}
