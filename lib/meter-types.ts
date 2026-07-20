// Pure type/constant file — no Node.js dependencies, safe to import in client components.

export const METER_TYPES = [
  { phase: "1P",  ampere: "5-30A",   smart: false, label: "1P 5-30A Standard"  },
  { phase: "1P",  ampere: "5-30A",   smart: true,  label: "1P 5-30A Smart"     },
  { phase: "3P",  ampere: "5-30A",   smart: false, label: "3P 5-30A Standard"  },
  { phase: "3P",  ampere: "5-30A",   smart: true,  label: "3P 5-30A Smart"     },
  { phase: "3P",  ampere: "10-60A",  smart: false, label: "3P 10-60A Standard" },
  { phase: "3P",  ampere: "10-60A",  smart: true,  label: "3P 10-60A Smart"    },
  { phase: "3P",  ampere: "20-100A", smart: false, label: "3P 20-100A Standard"},
  { phase: "3P",  ampere: "20-100A", smart: true,  label: "3P 20-100A Smart"   },
] as const

export type MeterTypeLabel = typeof METER_TYPES[number]["label"]
export type MeterCondition = "available" | "issued" | "installed" | "faulty"
export type IssuePurpose   = "faulty_replacement" | "burnt_replacement" | "slow_fast" | "nsc"
export type IssueStatus    = "issued" | "installation_done" | "installed" | "returned"

export interface MeterStock {
  serialNo:      string
  typeLabel:     MeterTypeLabel
  phase:         string
  ampere:        string
  smart:         boolean
  condition:     MeterCondition
  receivedDate:  string
  batchRemarks:  string
  lastUpdated:   string
}

export interface MeterIssue {
  issueId:        string
  issueDate:      string
  purpose:        IssuePurpose
  consumerId:     string
  nscReceiveNo:   string
  consumerName:   string
  agency:         string
  serialNo:       string
  meterType:      string
  status:         IssueStatus
  beforeImage:    string
  afterImage:     string
  lastReading:    string
  newReading:     string
  completionRef:  string
  installationNo: string
  completedAt:    string
  completedBy:    string
  remarks:        string
  address:        string
  mobile:         string
}

export interface StockSummary {
  label:     MeterTypeLabel
  available: number
  issued:    number
  installed: number
  faulty:    number
  total:     number
}
