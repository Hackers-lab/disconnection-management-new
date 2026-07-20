// Material Management — shared types & pre-seeded catalogue
// Import this in client components; never import material-service.ts directly.

// ── Units ───────────────────────────────────────────────────────────────────────
export type MaterialUnit = "nos" | "km" | "kg" | "meters" | "sets"

// ── Catalogue (master material) ─────────────────────────────────────────────────
export interface Material {
  materialId:   string
  materialNo:   string   // SAP / official code
  description:  string
  unit:         MaterialUnit
  category:     string
  isActive:     boolean
  createdDate:  string
  createdBy:    string
  threshold:    number
  photoUrl?:    string
}

// ── Inward transaction ──────────────────────────────────────────────────────────
export interface MaterialReceive {
  receiveId:    string   // MAT-R-0001
  materialId:   string
  materialDesc: string
  quantity:     number
  unit:         string
  challanRef:   string
  receivedDate: string
  receivedFrom: string
  photoUrl:     string
  remarks:      string
  createdBy:    string
  createdAt:    string
}

// ── Outward transaction ─────────────────────────────────────────────────────────
export interface MaterialIssue {
  issueId:      string   // MAT-I-0001
  materialId:   string
  materialDesc: string
  quantity:     number
  unit:         string
  recipientName:        string
  recipientDesignation: string
  purpose:      string
  issueDate:    string
  photoUrl:     string
  remarks:      string
  issuedBy:     string
  createdAt:    string
}

// ── Computed stock row ──────────────────────────────────────────────────────────
export interface MaterialStock {
  materialId:   string
  materialNo:   string
  description:  string
  unit:         MaterialUnit
  category:     string
  totalReceived: number
  totalIssued:   number
  currentStock:  number
  threshold:    number
  photoUrl?:    string
}

// ── Pre-seeded catalogue from MATERIAL.XLS ──────────────────────────────────────
export interface SeedMaterial {
  materialNo:  string
  description: string
  unit:        MaterialUnit
  category:    string
  threshold?:  number
}

export const SEED_MATERIALS: SeedMaterial[] = [
  // ── Bolts & Clamps ────────────────────────────────────────────────────────────
  { materialNo: "114070341", description: "G.I. STUD BOLT & NUT 9\" X 3/8\"",             unit: "nos", category: "Bolts & Clamps" },
  { materialNo: "505010641", description: "PG CLMP-WSL/RBT.(30/50SMM)",                   unit: "nos", category: "Bolts & Clamps" },
  { materialNo: "505031541", description: "D IRON CLAMP 3\" X 3.5\"",                     unit: "nos", category: "Bolts & Clamps" },
  { materialNo: "597011541", description: "UH-CLAMP FOR 8M PCC POLE",                     unit: "nos", category: "Bolts & Clamps" },
  { materialNo: "597011741", description: "UH-D IRON CLAMP 3\" X 3.5\"",                  unit: "nos", category: "Bolts & Clamps" },

  // ── Brackets ──────────────────────────────────────────────────────────────────
  { materialNo: "195021741", description: "UH-MS BRACKET-4WIRE",                           unit: "nos", category: "Brackets" },

  // ── Switchgear & Contacts ─────────────────────────────────────────────────────
  { materialNo: "304042532", description: "FXD & MVG CONTACT (11KV 200A TPGO) R-TYPE",    unit: "nos", category: "Switchgear" },
  { materialNo: "304042632", description: "FXD & MVG CONTACT (11KV 200A TPGO) K-TYPE",    unit: "nos", category: "Switchgear" },
  { materialNo: "304043341", description: "CU FLEX.BRAIDED TAPE (11KV 200A TPGO)",        unit: "nos", category: "Switchgear" },

  // ── Insulators & Arresters ────────────────────────────────────────────────────
  { materialNo: "309011041", description: "LA 12KV STNCLASS 10KA (PORCELAIN)",            unit: "nos", category: "Insulators" },
  { materialNo: "508020341", description: "11 KV PST INS",                                 unit: "nos", category: "Insulators" },
  { materialNo: "593110341", description: "UH-SHACKLE INS",                                unit: "nos", category: "Insulators" },

  // ── Cables ────────────────────────────────────────────────────────────────────
  { materialNo: "501013021", description: "1.1KV PVC 2X6 SMM AL CABLE",                   unit: "km",  category: "Cables" },
  { materialNo: "501017421", description: "1.1KV PVC 4C 10SMM AL CABLE",                  unit: "km",  category: "Cables" },
  { materialNo: "501017821", description: "1.1KV PVC 4C 25 SMM AL CABLE",                 unit: "km",  category: "Cables" },
  { materialNo: "501022321", description: "1.1KV XLPE 4C 50SMM CABLE",                    unit: "km",  category: "Cables" },
  { materialNo: "501022421", description: "1.1KV XLPE 4C 120SMM CABLE",                   unit: "km",  category: "Cables" },
  { materialNo: "501022521", description: "1.1KV XLPE 4C 185SMM CABLE",                   unit: "km",  category: "Cables" },
  { materialNo: "501030521", description: "1.1KV AB CABLE 3CX70+1C16+1CX50 SQMM",        unit: "km",  category: "Cables" },

  // ── Fuse Wire ─────────────────────────────────────────────────────────────────
  { materialNo: "503060312", description: "FUSE WIRE T.C. - 12SWG",                       unit: "kg",  category: "Fuse Wire" },
  { materialNo: "503060412", description: "FUSE WIRE T.C. - 14SWG",                       unit: "kg",  category: "Fuse Wire" },
  { materialNo: "503060512", description: "FUSE WIRE T.C. - 16SWG",                       unit: "kg",  category: "Fuse Wire" },
  { materialNo: "503060712", description: "FUSE WIRE T.C. - 18SWG",                       unit: "kg",  category: "Fuse Wire" },
  { materialNo: "503060812", description: "FUSE WIRE T.C. - 20SWG",                       unit: "kg",  category: "Fuse Wire" },
  { materialNo: "503060912", description: "FUSE WIRE T.C. - 22SWG",                       unit: "kg",  category: "Fuse Wire" },
  { materialNo: "503061412", description: "FUSE WIRE T.C. - 28SWG",                       unit: "kg",  category: "Fuse Wire" },

  // ── Connectors & Accessories ──────────────────────────────────────────────────
  { materialNo: "504026741", description: "INS. PIERCE CON.(ABC) 50-70 SQ.MM.",           unit: "nos", category: "Connectors" },
  { materialNo: "504060941", description: "LT DIST BOX 3PH CON.WH ST.STRAP&BUCKLE-ABC",  unit: "nos", category: "Connectors" },
  { materialNo: "504070341", description: "LT SPACER - 1PH",                               unit: "nos", category: "Connectors" },
  { materialNo: "504070441", description: "LT SPACER - 3PH-4WIRE",                         unit: "nos", category: "Connectors" },
  { materialNo: "504080541", description: "ALU. CRIMPING SOCKET (CAB) - 95SQ.MM",         unit: "nos", category: "Connectors" },
  { materialNo: "504080641", description: "ALU. CRIMPING SOCKET (CAB) - 120SQ.MM",        unit: "nos", category: "Connectors" },
  { materialNo: "504080741", description: "ALU. CRIMPING SOCKET (CAB) - 150SQ.MM",        unit: "nos", category: "Connectors" },
  { materialNo: "504080841", description: "ALU. CRIMPING SOCKET (CAB) - 185SQ.MM",        unit: "nos", category: "Connectors" },

  // ── Conductors ────────────────────────────────────────────────────────────────
  { materialNo: "592010321", description: "UH-COND ACSR SQURL 20SMM",                     unit: "km",  category: "Conductors" },
  { materialNo: "592010621", description: "UH-COND ACSR WSL 30SMM",                       unit: "km",  category: "Conductors" },
  { materialNo: "592030321", description: "UH-COND AA 25SQMM GNAT",                       unit: "km",  category: "Conductors" },
]

// All unique categories from the seed data
export const MATERIAL_CATEGORIES = [
  "Bolts & Clamps",
  "Brackets",
  "Cables",
  "Conductors",
  "Connectors",
  "Fuse Wire",
  "Insulators",
  "Switchgear",
  "Other",
] as const

export type MaterialCategory = typeof MATERIAL_CATEGORIES[number]

// Designation options for issue recipients
export const RECIPIENT_DESIGNATIONS = [
  "JE", "AE", "Lineman", "Helper", "Agency", "Contractor", "Other"
] as const
