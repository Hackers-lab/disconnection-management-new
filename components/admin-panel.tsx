"use client"


import Papa from "papaparse";
// xlsx loaded dynamically inside various handlers to optimize initial bundle size
import { useHashState } from "@/hooks/use-hash-state";
import { getFromCache, saveToCache } from "@/lib/indexed-db";
import { Table, TableHeader, TableRow, TableHead, TableCell, TableBody } from "@/components/ui/table";
import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Building2, Upload, List, ArrowLeft, Trash2, Edit, Plus, X, Save, AlertCircle, AlertTriangle, CheckCircle2, Loader2, Eye, EyeOff, KeyRound, Filter, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, Bell, UserPlus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Condition, Group, Operator, rowMatchesGroups, isNumericOp, OPERATOR_LABELS } from "@/lib/upload-filter"
import { userStorage } from "@/lib/user-storage";
import { BroadcastPushModal } from "@/components/broadcast-push-modal"
import { AdminSetupGuideBanner } from "@/components/admin-setup-guide"
import { expandRolePermissions } from "@/lib/permission-utils"

// Optional filter-only source columns (mapped for filtering/conflict, never uploaded).
const FILTER_COLUMNS = ["Class", "Gov/Non-Gov", "Discon Status"] as const

// Header-name synonyms (normalized) used to auto-suggest the upload column mapping.
const HEADER_SYNONYMS: Record<string, string[]> = {
  "off_code": ["off_code", "offcode", "off code"],
  "MRU": ["mru"],
  "Consumer Id": ["consumer id", "consumerid", "consumer_id", "ca", "account"],
  "Name": ["name", "consumer name"],
  "Address": ["address"],
  "Base Class": ["base class", "baseclass", "bclass/phase", "bclass", "bclassphase", "phase"],
  "Device": ["device", "meter", "meter no", "meter number"],
  "O/S Duedate Range": ["o/s duedate range", "o/s due date range", "os duedate range", "due date range", "duedate range"],
  "D2 Net O/S": ["d2 net o/s", "d2 net os", "net o/s", "net os", "outstanding"],
  "Mobile Number": ["mobile number", "mobile", "phone", "mobile no"],
  "Latitude": ["latitude", "lat", "lat_coord", "lat coord"],
  "Longitude": ["longitude", "long", "lng", "lon", "long_coord", "long coord"],
  "Class": ["class"],
  "Gov/Non-Gov": ["gov/non-gov", "gov non gov", "govnongov", "gov", "government"],
  "Discon Status": ["discon status", "disconnection status", "status"],
}

const ROLE_TEMPLATES: Record<string, Record<string, string[]>> = {
  admin: {
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
    safety: ["read", "create", "update", "delete", "approve_notesheet", "issue_po", "finalize"],
    misc_inspection: ["read", "create", "update", "delete"],
    icds: ["read", "create", "update", "delete", "inspect", "process", "execute", "install", "certify"],
    permanent_disconnection: ["read", "create", "update", "delete", "issue", "install", "return", "finalize"],
  },
  executive: {
    disconnection: ["read", "create", "update"],
    reconnection: ["read", "create", "update"],
    deemed: ["read", "create", "update"],
    dtr: ["read", "create", "update"],
    meter: ["read", "create", "update"],
    nsc: ["read", "create", "update", "inspect", "process", "project_create", "po_entry", "admin_approve"],
    consumer_master: ["read", "create", "update"],
    admin: [],
    meter_replacement: ["read", "create", "update", "issue", "install", "return", "finalize"],
    dtr_painting: ["read", "create", "update"],
    material: ["read", "create", "update", "receive", "issue", "stock"],
    safety: ["read", "create", "update", "approve_notesheet", "issue_po", "finalize"],
    misc_inspection: ["read", "create", "update"],
    icds: ["read", "create", "update", "inspect", "process", "execute", "install", "certify"],
    permanent_disconnection: ["read", "create", "update", "issue", "install", "return", "finalize"],
  },
  agency: {
    disconnection: ["read", "update"],
    reconnection: ["read", "update"],
    deemed: ["read", "update"],
    dtr: ["read", "update"],
    meter: ["read", "update"],
    nsc: ["read", "inspect", "agency_complete"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "install"],
    dtr_painting: ["read", "update"],
    material: ["read", "update", "receive", "issue", "stock"],
    safety: ["read", "create", "update"],
    misc_inspection: ["read", "create", "update"],
    icds: ["read", "inspect", "execute", "install", "certify"],
    permanent_disconnection: ["read", "install", "update"],
  },
  store_keeper: {
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read", "create", "update"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "create", "issue", "return"],
    dtr_painting: ["read"],
    material: ["read", "create", "update", "receive", "issue", "stock"],
    misc_inspection: ["read"],
    icds: ["read", "process"],
    permanent_disconnection: ["read", "return"],
  },
  reader: {
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "create"],
    dtr_painting: ["read"],
    material: ["read"],
    misc_inspection: ["read"],
    icds: ["read"],
    permanent_disconnection: ["read", "create"],
  },
  viewer: {
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
    material: ["read"],
    misc_inspection: ["read"],
    icds: ["read"],
    permanent_disconnection: ["read"],
  },
}

// Existing-consumer statuses that are "protected" — these reappearing in a new
// upload trigger the conflict-resolution UI. Mirrors the server-side sets.
const PROTECTED_STATUSES = new Set([
  "disconnected", "paid", "agency paid", "visited", "not found",
  "deemed disconnected", "temprory disconnected", "bill dispute", "office team",
])

// Categorical filter fields offer multi-select of distinct file values;
// numeric fields offer comparison inputs.
const NUMERIC_FILTER_FIELDS = new Set(["D2 Net O/S"])

const normalizeHeader = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "")

interface AdminPanelProps {
  onClose: () => void
  initialView?: ViewType
}

type ViewType = "menu" | "users" | "agencies" | "payments" | "dcList" | "zoneMap" | "roles" | "google-onboarding"

interface User {
  id: string
  username: string
  password: string
  role: string
  agencies: string[]
  subscriptionStatus?: string
  subscriptionExpiresAt?: string
  bypassSubscription?: boolean
  mobileNumber?: string
  vendorCode?: string
}

interface Agency {
  id: string
  name: string
  description?: string
  vendorCode?: string
  mobileNumber?: string
  email?: string
  isActive: boolean
  subscriptionStatus?: string
  subscriptionExpiresAt?: string
}



export function AdminPanel({ onClose, initialView }: AdminPanelProps) {
    const [showPushModal, setShowPushModal] = useState(false);
    const [sheetName, setSheetName] = useState("Sheet1"); // Default sheet name
    const [isUploading, setIsUploading] = useState(false);
    const expectedColumns = [
        "off_code",
        "MRU",
        "Consumer Id",
        "Name",
        "Address",
        "Base Class",
        "Device",
        "O/S Duedate Range",
        "D2 Net O/S",
        "Mobile Number",
        "Latitude",
        "Longitude"
        ] as const;

    const uploadToGoogleSheet = async () => {
        if (finalUploadRows.length === 0) {
            setMessage({ type: "error", text: "No rows to upload (check mapping/filters)" });
            return;
        }
        setIsUploading(true);
        setDcUploadResult(null);
        try {
            const CHUNK_SIZE = 1000;
            const total = finalUploadRows.length;
            const allUploadIds = finalUploadRows.map(row => String(row[2] || "").trim()).filter(Boolean);
            
            let inserted = 0;
            let updated = 0;
            let protectedStatusSkipped = 0;
            let autoAssigned = 0;
            let deletedNotInUpload = 0;

            for (let i = 0; i < total; i += CHUNK_SIZE) {
                const chunkRows = finalUploadRows.slice(i, i + CHUNK_SIZE);
                const isLastChunk = (i + CHUNK_SIZE) >= total;
                
                setMessage({
                    type: "default" as any,
                    text: `Uploading rows ${i + 1} to ${Math.min(i + CHUNK_SIZE, total)} of ${total}...`
                });

                const payload: any = {
                    rows: chunkRows,
                    appendMode: isAppendMode,
                    overrides: conflictOverrides,
                    isChunk: true,
                    isLastChunk,
                };

                if (isLastChunk) {
                    payload.allUploadIds = allUploadIds;
                }

                const response = await fetch("/api/consumers/bulk-upsert", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const contentType = response.headers.get("content-type") || "";
                let result;
                if (contentType.includes("application/json")) {
                    result = await response.json();
                } else {
                    const text = await response.text();
                    throw new Error(text || `Server returned status ${response.status}`);
                }

                if (!response.ok || !result.success) {
                    throw new Error(result.error || "Failed to upload data chunk");
                }

                const s = result.summary;
                inserted += s.inserted || 0;
                updated += s.updated || 0;
                protectedStatusSkipped += s.protectedStatusSkipped || 0;
                autoAssigned += s.autoAssigned || 0;
                deletedNotInUpload += s.deletedNotInUpload || 0;
            }

            const finalSummary = {
                total,
                inserted,
                updated,
                protectedStatusSkipped,
                autoAssigned,
                deletedNotInUpload,
            };

            setDcUploadResult(finalSummary);
            setMessage({
                type: "success",
                text: isAppendMode
                  ? `Upload complete: ${inserted} new consumers added, ${updated} existing updated, ${autoAssigned} auto-assigned agency.`
                  : `Upload complete: ${inserted} new, ${updated} updated, ${autoAssigned} auto-assigned agency, ${deletedNotInUpload} removed.`,
            });
        } catch (error) {
            console.error("Upload error:", error);
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to upload data",
            });
        } finally {
            setIsUploading(false);
        }
    };

    // Download the current DC list from IndexedDB cache as a CSV backup.
    // Runs entirely in the browser — no server call, no extra CPU.
    const downloadCacheBackup = async () => {
        setBackupDownloading(true);
        try {
            const cached = await getFromCache<any[]>("consumers_data_cache");
            if (!cached || cached.length === 0) {
                setMessage({ type: "error", text: "No cached data found. Please open the Disconnection List first so data loads into your browser." });
                return;
            }
            const XLSX = await import("xlsx")
            // Convert to CSV using XLSX (already in deps)
            const headers = [
                "off_code","MRU","Consumer Id","Name","Address","Base Class","Class",
                "Nature of Conn","Gov/Non-Gov","Device","O/S Duedate Range","D2 Net O/S",
                "Discon Status","Discon Date","GIS Pole","Mobile Number","Latitude","Longitude",
                "Agency","Reading","Image","Notes","Last Updated","Upload Date","Priority",
                "Paid Amount","Paid Date","Paid Type","Outstanding After","Next Payment Date","Payment Source",
            ];
            const rows = cached.map(c => [
                c.offCode,c.mru,c.consumerId,c.name,c.address,c.baseClass,c.class,
                c.natureOfConn,c.govNonGov,c.device,c.osDuedateRange,c.d2NetOS,
                c.disconStatus,c.disconDate,c.gisPole,c.mobileNumber,c.latitude,c.longitude,
                c.agency,c.reading,c.imageUrl,c.notes,c.lastUpdated,c.uploadDate || "",c.priority,
                c.paidAmount,c.paidDate,c.paidType,c.outstandingAfter,c.nextPaymentDate,c.paymentSource,
            ]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "DC Backup");
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `DC_Backup_${dateStr}.xlsx`);
            setMessage({ type: "success", text: `✅ Backup downloaded: DC_Backup_${dateStr}.xlsx (${cached.length} consumers from your browser cache)` });
        } catch (e) {
            setMessage({ type: "error", text: "Backup failed: " + (e instanceof Error ? e.message : String(e)) });
        } finally {
            setBackupDownloading(false);
        }
    };

    // Refresh lat/long in DC list from Consumer Master (VLOOKUP-style)
    const refreshLatLong = async () => {
        if (!confirm(
            "This will look up each consumer in the DC list against the Consumer Master and fill in their latitude/longitude.\n\nOnly consumers missing both lat & long will be updated. Continue?"
        )) return;
        setLatLongRefreshing(true);
        setLatLongResult(null);
        try {
            const resp = await fetch("/api/consumers/refresh-latlong", { method: "POST" });
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data?.error || "Refresh failed");
            setLatLongResult(data.summary);
            setMessage({ type: "success", text: `✅ Lat/Long refresh complete: ${data.summary.updated} consumers updated from Consumer Master.` });
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Failed to refresh lat/long" });
        } finally {
            setLatLongRefreshing(false);
        }
    };

  const columnRegexMap: Record<string, RegExp> = {
    "off_code": /^\d{7}$/,
    "MRU": /^[A-Z0-9]{6}MR$/,
    "Consumer Id": /^\d{9}$/,
    "Name": /^(?!.*\b(dom|rural|urban)\b)[a-z\s,.'-]+$/i,
    "Address": /^(?=.*[A-Za-z]).{16,}$/,
    "Base Class": /^[A-Z]\s*-\d\s*PHASE$/i,
    "Device": /^[A-Z0-9_]{5,11}[0-9]$/,
    "O/S Duedate Range": /^\d{2}[./-]\d{2}[./-]\d{4}\s*-\s*\d{2}[./-]\d{2}[./-]\d{4}$/,
    "D2 Net O/S": /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/,
    "Mobile Number": /^[6-9]\d{9}$/,
    "Latitude": /^-?\d+(\.\d+)?$/,
    "Longitude": /^-?\d+(\.\d+)?$/,
    };

    const [parsedData, setParsedData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [fileName, setFileName] = useState<string>("");
    const [dcUploadResult, setDcUploadResult] = useState<{ total: number; inserted: number; updated: number; protectedStatusSkipped: number; autoAssigned: number; deletedNotInUpload: number } | null>(null);
    const [isAppendMode, setIsAppendMode] = useState(false);
    const [showDuplicatesList, setShowDuplicatesList] = useState(false);
    const [backupDownloading, setBackupDownloading] = useState(false);
    const [latLongRefreshing, setLatLongRefreshing] = useState(false);
    const [latLongResult, setLatLongResult] = useState<{ matched: number; updated: number; alreadyHad: number; noMaster: number } | null>(null);

    // --- DC upload: smart mapping + filters + conflict resolution ---
    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<string[][]>([]);
    // mapping: target/filter column name -> CSV column index (-1 = unmapped)
    const [mapping, setMapping] = useState<Record<string, number>>({});
    const [mappingConfidence, setMappingConfidence] = useState<Record<string, "name" | "pattern" | "unmatched">>({});
    const [mappingConfirmed, setMappingConfirmed] = useState(false);
    // filter rule engine
    const [ruleGroups, setRuleGroups] = useState<Group[]>([]);
    const [presets, setPresets] = useState<{ name: string; groups: Group[] }[]>([]);
    const [presetName, setPresetName] = useState("");
    const [savingPreset, setSavingPreset] = useState(false);
    // conflict resolution
    const [conflictOverrides, setConflictOverrides] = useState<Record<string, "keep" | "replace">>({});
    const [expandedStatuses, setExpandedStatuses] = useState<Record<string, boolean>>({});
    const [cachedConsumers, setCachedConsumers] = useState<any[]>([]);

    const ZONE_MAP_CACHE_KEY = "zone_map_cache";

    // --- ZONE MAP STATE (item 12) ---
    const [zoneMapRows, setZoneMapRows] = useState<{ zone: string; agency: string; address?: string; updatedOn?: string }[]>([]);
    const [zoneMapLoading, setZoneMapLoading] = useState(false);
    const [zoneMapSaving, setZoneMapSaving] = useState(false);
    const [newZone, setNewZone] = useState("");
    const [newZoneAgency, setNewZoneAgency] = useState("");
    const [availableMrus, setAvailableMrus] = useState<string[]>([]);
    const [zoneUploadMode, setZoneUploadMode] = useState<"manual" | "csv">("manual");
    const [zoneUploadRows, setZoneUploadRows] = useState<{ zone: string; agency: string; address?: string }[]>([]);
    const [zoneUploadFileName, setZoneUploadFileName] = useState("");
    const [showZoneGuide, setShowZoneGuide] = useState(false);
    const [newZoneAddress, setNewZoneAddress] = useState("");
    const [zoneAgencyFilter, setZoneAgencyFilter] = useState("All");
    const [zoneViewMode, setZoneViewMode] = useState<"flat" | "agency">("agency");
    const [mruSearch, setMruSearch] = useState("");
    const [resyncing, setResyncing] = useState(false);
    const [resyncResult, setResyncResult] = useState<{ scanned: number; reassigned: number; skippedProtected: number; unchanged: number; unmapped: number } | null>(null);

    // Auto-suggest the column mapping using a 3-tier match:
    //  1. exact header-name match (synonyms, normalized)
    //  2. substring header-name match (still skipping claimed columns)
    //  3. regex value detection over up to 20 samples (80% / 30% for mobile)
    // Returns mapping (target -> csv idx, -1 if none) + per-target confidence.
    const autoSuggestMapping = (headers: string[], dataRows: string[][]) => {
      const normHeaders = headers.map(normalizeHeader)
      const claimed = new Set<number>()
      const map: Record<string, number> = {}
      const conf: Record<string, "name" | "pattern" | "unmatched"> = {}
      const allTargets = [...expectedColumns, ...FILTER_COLUMNS]
      const synFor = (col: string) => (HEADER_SYNONYMS[col] || [col]).map(normalizeHeader)

      // Pass 1: exact name match
      for (const col of allTargets) {
        const syns = synFor(col)
        const found = normHeaders.findIndex((h, i) => !claimed.has(i) && syns.includes(h))
        if (found !== -1) { map[col] = found; conf[col] = "name"; claimed.add(found) }
      }
      // Pass 2: substring name match
      for (const col of allTargets) {
        if (map[col] !== undefined) continue
        const syns = synFor(col)
        const found = normHeaders.findIndex((h, i) =>
          !claimed.has(i) && h.length > 1 && syns.some(s => h.includes(s) || s.includes(h)))
        if (found !== -1) { map[col] = found; conf[col] = "name"; claimed.add(found) }
      }
      // Pass 3: regex value detection (target columns only)
      for (const col of expectedColumns) {
        if (map[col] !== undefined) continue
        const regex = columnRegexMap[col]
        if (!regex) continue
        const threshold = col === "Mobile Number" ? 0.3 : 0.8
        for (let i = 0; i < headers.length; i++) {
          if (claimed.has(i)) continue
          const sample = dataRows.slice(0, 20).map(r => String(r[i] ?? "").trim()).filter(Boolean)
          if (sample.length === 0) continue
          const hit = sample.filter(v => regex.test(v)).length / sample.length
          if (hit > threshold) { map[col] = i; conf[col] = "pattern"; claimed.add(i); break }
        }
      }
      // Fill the rest as unmatched
      for (const col of allTargets) {
        if (map[col] === undefined) { map[col] = -1; conf[col] = "unmatched" }
      }
      return { map, conf }
    }

    // Unified ingest for both CSV and Excel: store the raw grid + auto-suggested
    // mapping, then let the user confirm/correct before any upload is built.
    const ingestParsed = (headers: string[], dataRows: string[][], name: string) => {
      const cleanRows = dataRows.filter(r => Array.isArray(r) && r.length > 1)
      const { map, conf } = autoSuggestMapping(headers, cleanRows)
      setRawHeaders(headers.map(String))
      setRawRows(cleanRows.map(r => r.map(c => String(c ?? ""))))
      setMapping(map)
      setMappingConfidence(conf)
      setMappingConfirmed(false)
      setRuleGroups([])
      setConflictOverrides({})
      setExpandedStatuses({})
      setParsedData([])
      setColumnMapping({})
      setDcUploadResult(null)
      setFileName(name)
    }

    const handleFileUpload = (file: File) => {
      Papa.parse(file, {
        complete: (results: Papa.ParseResult<any[]>) => {
          const rows = (results.data as any[][]) || []
          if (rows.length === 0) return
          ingestParsed(rows[0] as string[], rows.slice(1) as string[][], file.name)
        },
        header: false,
        skipEmptyLines: true,
      })
    }

  const [view, setView] = useHashState<ViewType>("admin", initialView || "menu")
  useEffect(() => {
    if (initialView) {
      setView(initialView)
    }
  }, [initialView, setView])
  const [users, setUsers] = useState<User[]>([])

  // Google integration status state
  const [tenantStatus, setTenantStatus] = useState<{ linked: boolean; driveFolderId?: string; spreadsheetId?: string; cccName?: string; cccCode?: string } | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  const fetchTenantStatus = async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch("/api/admin/tenant-status")
      if (res.ok) {
        setTenantStatus(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    if (view === "google-onboarding") {
      fetchTenantStatus()
    }
  }, [view])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [selectedRole, setSelectedRole] = useState<string>("agency")
  const [newRoleName, setNewRoleName] = useState("")
  const [showAddRole, setShowAddRole] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddAgency, setShowAddAgency] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(null)
  const [changingPasswordUser, setChangingPasswordUser] = useState<User | null>(null)
  const [changePasswordValue, setChangePasswordValue] = useState("")
  const [changePasswordConfirm, setChangePasswordConfirm] = useState("")
  const [showChangePwdField, setShowChangePwdField] = useState(false)
  const [showChangePwdConfirm, setShowChangePwdConfirm] = useState(false)

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "agency",
    agencies: [] as string[],
    mobileNumber: "",
  })

  const [newAgency, setNewAgency] = useState({
    name: "",
    description: "",
    vendorCode: "",
    mobileNumber: "",
    isActive: true,
  })

  const [agencyFilter, setAgencyFilter] = useState<"all" | "missing" | "completed">("all")
  const [agencyCreatedPrompt, setAgencyCreatedPrompt] = useState<{ name: string; mobileNumber: string } | null>(null)

  // --- PAYMENT UPLOAD STATE (items 3 + 13) ---
  type PaymentParsed = { consumerId: string; paidAmount: number; paidDate: string }
  const [paymentSource, setPaymentSource] = useState<"Cash Desk" | "Portal">("Cash Desk")
  const [paymentFileName, setPaymentFileName] = useState<string>("")
  const [paymentRows, setPaymentRows] = useState<PaymentParsed[]>([])
  const [paymentParseError, setPaymentParseError] = useState<string | null>(null)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentResult, setPaymentResult] = useState<{
    receivedRows: number; uniqueConsumers: number; matched: number; notFound: number;
    fullPayments: number; partialPayments: number; notFoundIds: string[];
  } | null>(null)

  // Auto-detect which columns hold consumer id, amount, date.
  const detectPaymentColumns = (headers: string[]) => {
    const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    const idCandidates = ["consumerid", "conid", "id", "account", "ca"]
    const amtCandidates = ["paidamount", "amount", "amountpaid", "paid", "received", "credit"]
    const dateCandidates = ["paiddate", "date", "paymentdate", "txndate", "transactiondate"]
    const findOne = (cands: string[]) =>
      headers.findIndex((h) => cands.some((c) => norm(h).includes(c)))
    return {
      idIdx: findOne(idCandidates),
      amtIdx: findOne(amtCandidates),
      dateIdx: findOne(dateCandidates),
    }
  }

  // Convert Excel serial date or string to DD-MM-YYYY (matches app convention).
  const normalizeDate = (raw: any, XLSX?: any): string => {
    if (raw === null || raw === undefined || raw === "") return ""
    // Excel serial number
    if (typeof raw === "number") {
      if (XLSX) {
        const d = XLSX.SSF.parse_date_code(raw)
        if (d) {
          const dd = String(d.d).padStart(2, "0")
          const mm = String(d.m).padStart(2, "0")
          return `${dd}-${mm}-${d.y}`
        }
      }
    }
    const s = String(raw).trim()
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split("-")
      return `${d}-${m}-${y.slice(0, 4)}`
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.replace(/\//g, "-")
    // Last resort: let Date parse it
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) {
      const dd = String(parsed.getDate()).padStart(2, "0")
      const mm = String(parsed.getMonth() + 1).padStart(2, "0")
      return `${dd}-${mm}-${parsed.getFullYear()}`
    }
    return s
  }

  const parsePaymentFile = (file: File) => {
    setPaymentFileName(file.name)
    setPaymentParseError(null)
    setPaymentResult(null)
    setPaymentRows([])

    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    if (isExcel) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const XLSX = await import("xlsx")
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: "array", cellDates: false })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" })
          if (!rows || rows.length < 2) {
            setPaymentParseError("Excel must have at least a header row and one data row.")
            return
          }
          await processPaymentRows(rows as any[][])
        } catch (err: any) {
          setPaymentParseError(`Excel parse failed: ${err?.message || err}`)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      Papa.parse<any[]>(file, {
        header: false,
        skipEmptyLines: true,
        complete: async (res: any) => {
          const rows = (res.data as any[][]) || []
          if (rows.length < 2) {
            setPaymentParseError("CSV must have at least a header row and one data row.")
            return
          }
          await processPaymentRows(rows)
        },
        error: (err: any) => setPaymentParseError(`CSV parse failed: ${err?.message || err}`),
      })
    }
  }

  const processPaymentRows = async (rows: any[][]) => {
    const headers = (rows[0] || []).map((h) => String(h ?? ""))
    const { idIdx, amtIdx, dateIdx } = detectPaymentColumns(headers)
    if (idIdx === -1 || amtIdx === -1) {
      setPaymentParseError(
        `Could not auto-detect required columns. Found headers: [${headers.join(", ")}]. Need at least a Consumer ID and Amount column.`
      )
      return
    }
    const XLSX = await import("xlsx")
    const parsed: PaymentParsed[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || []
      const id = String(r[idIdx] ?? "").trim()
      if (!id) continue
      const amtRaw = String(r[amtIdx] ?? "0").replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")
      const amt = parseFloat(amtRaw)
      if (!isFinite(amt) || amt <= 0) continue
      const dateRaw = dateIdx !== -1 ? r[dateIdx] : ""
      parsed.push({ consumerId: id, paidAmount: amt, paidDate: normalizeDate(dateRaw, XLSX) })
    }
    setPaymentRows(parsed)
  }

  const submitPayments = async () => {
    if (paymentRows.length === 0) return
    setPaymentSubmitting(true)
    setPaymentResult(null)
    try {
      const CHUNK_SIZE = 1000;
      const total = paymentRows.length;
      
      let receivedRows = 0;
      let uniqueConsumers = 0;
      let matched = 0;
      let notFound = 0;
      let fullPayments = 0;
      let partialPayments = 0;
      const aggregatedNotFoundIds: string[] = [];

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunkPayments = paymentRows.slice(i, i + CHUNK_SIZE);
        
        setMessage({
          type: "default" as any,
          text: `Applying payments ${i + 1} to ${Math.min(i + CHUNK_SIZE, total)} of ${total}...`
        });

        const resp = await fetch("/api/payments/bulk-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: paymentSource, payments: chunkPayments }),
        });

        const contentType = resp.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
          data = await resp.json();
        } else {
          const text = await resp.text();
          throw new Error(text || `Server returned status ${resp.status}`);
        }

        if (!resp.ok || !data.success) {
          throw new Error(data?.error || "Bulk apply failed for payment chunk");
        }

        const s = data.summary;
        receivedRows += s.receivedRows || 0;
        uniqueConsumers += s.uniqueConsumers || 0;
        matched += s.matched || 0;
        notFound += s.notFound || 0;
        fullPayments += s.fullPayments || 0;
        partialPayments += s.partialPayments || 0;
        if (Array.isArray(data.notFoundIds)) {
          aggregatedNotFoundIds.push(...data.notFoundIds);
        }
      }

      setPaymentResult({
        receivedRows,
        uniqueConsumers,
        matched,
        notFound,
        fullPayments,
        partialPayments,
        notFoundIds: aggregatedNotFoundIds.slice(0, 50), // cap display size
      });

      setMessage({
        type: "success",
        text: `Successfully applied payments: ${matched} matched, ${notFound} unmatched.`,
      });
    } catch (err: any) {
      console.error("Payment submit error:", err);
      setMessage({ type: "error", text: err?.message || "Bulk apply failed" })
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // Zone map load/save — with IndexedDB cache for instant loading.
  // Cache is invalidated only when admin explicitly saves changes.
  const loadZoneMap = async () => {
    setZoneMapLoading(true)

    // 1. Show cached data immediately (zero server cost, instant display).
    try {
      const cached = await getFromCache<typeof zoneMapRows>(ZONE_MAP_CACHE_KEY)
      if (cached && cached.length > 0) {
        setZoneMapRows(cached)
        setZoneMapLoading(false) // stop spinner so user sees data right away
      }
    } catch { /* ignore cache errors */ }

    // 2. Refresh from server in background (always keep map + MRUs fresh).
    try {
      const [mapResp, mruResp] = await Promise.all([
        fetch("/api/zone-map"),
        fetch("/api/zone-map/mrus"),
      ])
      if (mapResp.ok) {
        const fresh = await mapResp.json()
        setZoneMapRows(fresh)
        await saveToCache(ZONE_MAP_CACHE_KEY, fresh)
      }
      if (mruResp.ok) setAvailableMrus(await mruResp.json())
    } catch { /* silent — cached data still shown */ }
    finally { setZoneMapLoading(false) }
  }

  const saveZoneMap = async (rows: { zone: string; agency: string; address?: string }[]) => {
    setZoneMapSaving(true)
    try {
      const resp = await fetch("/api/zone-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.success !== false) {
        const updated = rows.map(r => ({ ...r, updatedOn: new Date().toLocaleDateString("en-IN") }))
        setZoneMapRows(updated)
        // Update cache immediately with new data so next open is instant.
        await saveToCache(ZONE_MAP_CACHE_KEY, updated)
        setMessage({ type: "success", text: `Zone map saved successfully (${rows.length} mappings).` })
      } else {
        setMessage({ type: "error", text: data?.error || "Failed to save zone map" })
      }
    } catch (err: any) {
      console.error("Zone map save error:", err)
      setMessage({ type: "error", text: err?.message || "Failed to communicate with server to save zone map" })
    } finally {
      setZoneMapSaving(false)
    }
  }

  // Re-apply the current zone map to existing consumers without a DC re-upload.
  // Reassigns consumers whose mapped agency differs; skips protected statuses.
  const resyncAgencies = async () => {
    if (!confirm(
      "Re-apply the current zone map to all existing consumers?\n\n" +
      "Consumers whose mapped agency has changed will be reassigned. " +
      "Consumers in a protected status (disconnected, paid, visited, etc.) are skipped. " +
      "No DC list upload is needed."
    )) return
    setResyncing(true)
    setResyncResult(null)
    try {
      const resp = await fetch("/api/zone-map/resync", { method: "POST" })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data?.error || "Re-sync failed")
      setResyncResult(data.summary)
      setMessage({ type: "success", text: `Re-sync complete: ${data.summary.reassigned} consumers reassigned.` })
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Re-sync failed" })
    } finally {
      setResyncing(false)
    }
  }

  const parseZoneCsv = (file: File) => {
    setZoneUploadFileName(file.name)
    Papa.parse<any[]>(file, {
      header: false, skipEmptyLines: true,
      complete: (res: any) => {
        const rows = res.data as any[][]
        if (!rows || rows.length < 2) return
        // Expect: Zone (col 0), Agency (col 1)
        const parsed = rows.slice(1)
          .map(r => ({ zone: String(r[0] || "").trim().toUpperCase(), agency: String(r[1] || "").trim().toUpperCase() }))
          .filter(r => r.zone && r.agency)
        setZoneUploadRows(parsed)
      },
      error: () => setMessage({ type: "error", text: "Failed to parse zone map CSV" }),
    })
  }

  useEffect(() => { if (view === "zoneMap") loadZoneMap() }, [view])

  // Load agencies when component mounts and when view changes to users
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/agencies")
        if (response.ok) {
          const data = await response.json()
          setAgencies(data)
        }
      } catch (error) {
        console.error("Error loading agencies:", error)
        setMessage({ type: "error", text: "Failed to load agencies" })
      } finally {
        setLoading(false)
      }
    }

    if (view === "users" || view === "agencies" || view === "zoneMap") {
      loadAgencies()
    }
  }, [view])

  // Load users when view changes to users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/users")
        if (response.ok) {
          const data = await response.json()
          setUsers(data)
        }
      } catch (error) {
        console.error("Error loading users:", error)
        setMessage({ type: "error", text: "Failed to load users" })
      } finally {
        setLoading(false)
      }
    }

    if (view === "users") {
      loadUsers()
    }
  }, [view])

  const loadRoles = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/roles")
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
      }
    } catch (e) {
      console.error("Failed to load roles:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (view === "users" || view === "roles") {
      loadRoles()
    }
  }, [view])

  const saveRolePermissions = async (roleName: string, updatedPerms: Record<string, string[]>) => {
    try {
      setLoading(true)
      const payload = {
        role: roleName,
        ...updatedPerms
      }
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        await loadRoles()
        setMessage({ type: "success", text: `Role permissions for '${roleName}' saved successfully.` })
      } else {
        throw new Error("Failed to save role permissions")
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to save permissions" })
    } finally {
      setLoading(false)
    }
  }

  const createNewRole = async () => {
    const name = newRoleName.trim().toLowerCase()
    if (!name) return
    
    // Check if already exists
    if (roles.some(r => r.role.toLowerCase() === name)) {
      setMessage({ type: "error", text: "Role already exists" })
      return
    }

    const defaultPerms: Record<string, string[]> = {
      disconnection: ["read"],
      reconnection: ["read"],
      deemed: ["read"],
      dtr: ["read"],
      meter: ["read"],
      nsc: ["read"],
      consumer_master: ["read"],
      meter_replacement: ["read"],
      dtr_painting: ["read"],
      material: ["read"],
      safety: ["read"],
      misc_inspection: ["read"],
      icds: ["read"],
      permanent_disconnection: ["read"],
      osd: ["read"],
      admin: []
    }
    
    await saveRolePermissions(name, defaultPerms)
    setSelectedRole(name)
    setNewRoleName("")
    setShowAddRole(false)
  }

  const deleteRole = async (roleName: string) => {
    if (roleName.toLowerCase() === "admin") return
    if (!confirm(`Are you sure you want to delete the role '${roleName}'?`)) return
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/roles?role=${roleName}`, {
        method: "DELETE"
      })
      if (res.ok) {
        await loadRoles()
        setSelectedRole("agency")
        setMessage({ type: "success", text: `Role '${roleName}' deleted successfully.` })
      } else {
        throw new Error("Failed to delete role")
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to delete role" })
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (view === "menu") {
      onClose()
    } else {
      setView("menu")
      setEditingUser(null)
      setEditingAgency(null)
      setShowAddUser(false)
      setShowAddAgency(false)
    }
  }

  // Create new user
  const addUser = async () => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })

      if (response.ok) {
        setNewUser({ username: "", password: "", role: "agency", agencies: [], mobileNumber: "" })
        setShowAddUser(false)
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User added successfully" })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add user")
      }
    } catch (error) {
      console.error("Error adding user:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add user" })
    }
  }

  // Update user
  const updateUser = async (user: User) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })

      if (response.ok) {
        setEditingUser(null)
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User updated successfully" })
      } else {
        throw new Error("Failed to update user")
      }
    } catch (error) {
      console.error("Error updating user:", error)
      setMessage({ type: "error", text: "Failed to update user" })
    }
  }

  const changePassword = async () => {
    if (!changingPasswordUser || !changePasswordValue) return
    if (changePasswordValue !== changePasswordConfirm) {
      setMessage({ type: "error", text: "Passwords do not match" })
      return
    }
    await updateUser({ ...changingPasswordUser, password: changePasswordValue })
    setChangingPasswordUser(null)
    setChangePasswordValue("")
    setChangePasswordConfirm("")
    setShowChangePwdField(false)
    setShowChangePwdConfirm(false)
  }

  // Delete user
  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return
    
    try {
      const response = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" })
      
      if (response.ok) {
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User deleted successfully" })
      } else {
        throw new Error("Failed to delete user")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      setMessage({ type: "error", text: "Failed to delete user" })
    }
  }

  // Create new agency
  const addAgency = async () => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgency),
      })

      if (response.ok) {
        const result = await response.json()
        const addedName = newAgency.name.toUpperCase().trim()
        const addedMobile = newAgency.mobileNumber.trim()
        const createdAgency: Agency = result.agency || {
          id: String(Date.now()),
          name: addedName,
          description: newAgency.description || "",
          isActive: newAgency.isActive,
          vendorCode: newAgency.vendorCode ? newAgency.vendorCode.trim() : undefined,
          mobileNumber: addedMobile || undefined,
        }

        // Immediately update local agencies state so it is instantly available across all views
        setAgencies((prev) => {
          const filtered = prev.filter((a) => a.name.toUpperCase().trim() !== addedName)
          return [...filtered, createdAgency]
        })

        setNewAgency({ name: "", description: "", vendorCode: "", mobileNumber: "", isActive: true })
        setShowAddAgency(false)

        // Background sync to ensure full parity with server
        fetch("/api/admin/agencies").then((r) => r.ok && r.json()).then((data) => { if (data) setAgencies(data) }).catch(() => {})
        fetch("/api/admin/users").then((r) => r.ok && r.json()).then((data) => { if (data) setUsers(data) }).catch(() => {})

        setAgencyCreatedPrompt({ name: addedName, mobileNumber: addedMobile })
        setMessage({ type: "success", text: `Agency '${addedName}' added successfully!` })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add agency")
      }
    } catch (error) {
      console.error("Error adding agency:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add agency" })
    }
  }

  // Update agency
  const updateAgency = async (agency: Agency) => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agency),
      })

      if (response.ok) {
        setEditingAgency(null)
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "Agency updated successfully" })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to update agency")
      }
    } catch (error) {
      console.error("Error updating agency:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to update agency" })
    }
  }

  // Delete agency
  const deleteAgency = async (id: string) => {
    if (!confirm("Are you sure you want to delete this agency? This will affect users assigned to this agency.")) return
    
    try {
      const response = await fetch(`/api/admin/agencies?id=${id}`, { method: "DELETE" })
      
      if (response.ok) {
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "Agency deleted successfully" })
      } else {
        throw new Error("Failed to delete agency")
      }
    } catch (error) {
      console.error("Error deleting agency:", error)
      setMessage({ type: "error", text: "Failed to delete agency" })
    }
  }

  const toggleAgency = (agencies: string[], agency: string) => {
    if (agencies.includes(agency)) {
      return agencies.filter((a) => a !== agency)
    } else {
      return [...agencies, agency]
    }
  }

  const activeAgencies = agencies.filter((a) => a.isActive)

  // ---- DC upload derived data (all client-side, zero server CPU) ----

  // Resolve a raw row's value for a mapped field name.
  const getFieldValue = (row: string[], field: string): string => {
    const idx = mapping[field]
    return idx != null && idx >= 0 ? String(row[idx] ?? "") : ""
  }

  // Fields the user can filter on — those that are actually mapped.
  const filterableFields = useMemo(() => {
    const candidates = ["Class", "Gov/Non-Gov", "Discon Status", "Base Class", "D2 Net O/S", "off_code", "MRU"]
    return candidates.filter(f => (mapping[f] ?? -1) >= 0)
  }, [mapping])

  // Distinct values for a categorical field (for multi-select chips).
  const distinctValues = (field: string): string[] => {
    const idx = mapping[field]
    if (idx == null || idx < 0) return []
    const set = new Set<string>()
    for (const r of rawRows) { const v = String(r[idx] ?? "").trim(); if (v) set.add(v) }
    return Array.from(set).sort()
  }

  // Rows that pass the current filter rules.
  const passingRows = useMemo(
    () => rawRows.filter(r => rowMatchesGroups(f => getFieldValue(r, f), ruleGroups)),
    [rawRows, ruleGroups, mapping]
  )

  // Final upload payload — fixed 10-column order expected by the server.
  const finalUploadRows = useMemo(
    () => passingRows.map(r => expectedColumns.map(col => {
      const idx = mapping[col]
      return idx != null && idx >= 0 ? String(r[idx] ?? "") : ""
    })),
    [passingRows, mapping]
  )

  // Conflicts: passing consumers that already exist with a protected status.
  const conflicts = useMemo(() => {
    const idIdx = mapping["Consumer Id"]
    if (idIdx == null || idIdx < 0 || cachedConsumers.length === 0) return [] as { consumerId: string; name: string; status: string }[]
    const existingById = new Map(cachedConsumers.map(c => [String(c.consumerId), c]))
    const out: { consumerId: string; name: string; status: string }[] = []
    for (const r of passingRows) {
      const id = String(r[idIdx] ?? "").trim()
      if (!id) continue
      const ex = existingById.get(id)
      const status = ex ? String(ex.disconStatus || "").toLowerCase().trim() : ""
      if (ex && PROTECTED_STATUSES.has(status)) {
        out.push({ consumerId: id, name: ex.name || "", status })
      }
    }
    return out
  }, [passingRows, cachedConsumers, mapping])

  // Existing duplicates: passing consumers that already exist in the disconnection list
  const existingDuplicates = useMemo(() => {
    const idIdx = mapping["Consumer Id"]
    const nameIdx = mapping["Name"]
    if (idIdx == null || idIdx < 0 || cachedConsumers.length === 0) return [] as { consumerId: string; name: string; status: string }[]
    const existingById = new Map(cachedConsumers.map(c => [String(c.consumerId).trim(), c]))
    const seen = new Set<string>()
    const dupes: { consumerId: string; name: string; status: string }[] = []
    for (const r of passingRows) {
      const id = String(r[idIdx] ?? "").trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const ex = existingById.get(id)
      if (ex) {
        dupes.push({
          consumerId: id,
          name: ex.name || (nameIdx != null && nameIdx >= 0 ? String(r[nameIdx] ?? "") : ""),
          status: ex.disconStatus || "connected",
        })
      }
    }
    return dupes
  }, [passingRows, cachedConsumers, mapping])

  // Duplicates within the uploaded file itself
  const fileDuplicates = useMemo(() => {
    const idIdx = mapping["Consumer Id"]
    if (idIdx == null || idIdx < 0) return [] as string[]
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const r of passingRows) {
      const id = String(r[idIdx] ?? "").trim()
      if (!id) continue
      if (seen.has(id)) {
        dupes.add(id)
      } else {
        seen.add(id)
      }
    }
    return Array.from(dupes)
  }, [passingRows, mapping])

  // Group conflicts by existing status for the status-level controls.
  const conflictsByStatus = useMemo(() => {
    const m: Record<string, { consumerId: string; name: string; status: string }[]> = {}
    for (const c of conflicts) { (m[c.status] ||= []).push(c) }
    return m
  }, [conflicts])

  // The decision shown for a status group: keep / replace / mixed.
  const statusDecision = (status: string): "keep" | "replace" | "mixed" => {
    const ids = (conflictsByStatus[status] || []).map(c => c.consumerId)
    if (ids.length === 0) return "keep"
    const vals = ids.map(id => conflictOverrides[id] === "replace" ? "replace" : "keep")
    if (vals.every(v => v === "replace")) return "replace"
    if (vals.every(v => v === "keep")) return "keep"
    return "mixed"
  }

  const setStatusDecision = (status: string, decision: "keep" | "replace") => {
    setConflictOverrides(prev => {
      const next = { ...prev }
      for (const c of (conflictsByStatus[status] || [])) next[c.consumerId] = decision
      return next
    })
  }

  const setConsumerDecision = (consumerId: string, decision: "keep" | "replace") => {
    setConflictOverrides(prev => ({ ...prev, [consumerId]: decision }))
  }

  // Load cached consumers + saved presets when the upload view opens.
  useEffect(() => {
    if (view !== "dcList") return
    let cancelled = false
    ;(async () => {
      try {
        const cached = await getFromCache<any[]>("consumers_data_cache")
        if (!cancelled && Array.isArray(cached)) setCachedConsumers(cached)
      } catch { /* ignore */ }
      try {
        const resp = await fetch("/api/admin/upload-rules")
        if (resp.ok && !cancelled) setPresets(await resp.json())
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [view])

  // ---- Filter rule builder mutators ----
  const addRuleGroup = () => setRuleGroups(g => [...g, { conditions: [] }])
  const removeRuleGroup = (gi: number) => setRuleGroups(g => g.filter((_, i) => i !== gi))
  const addCondition = (gi: number) => {
    const field = filterableFields[0] || ""
    const numeric = NUMERIC_FILTER_FIELDS.has(field)
    const cond: Condition = numeric ? { field, op: "gt", value: "0" } : { field, op: "in", value: [] }
    setRuleGroups(g => g.map((grp, i) => i === gi ? { conditions: [...grp.conditions, cond] } : grp))
  }
  const updateCondition = (gi: number, ci: number, patch: Partial<Condition>) => {
    setRuleGroups(g => g.map((grp, i) => i !== gi ? grp : {
      conditions: grp.conditions.map((c, j) => j === ci ? { ...c, ...patch } : c),
    }))
  }
  const removeCondition = (gi: number, ci: number) => {
    setRuleGroups(g => g.map((grp, i) => i !== gi ? grp : {
      conditions: grp.conditions.filter((_, j) => j !== ci),
    }))
  }

  const applyPreset = (name: string) => {
    const p = presets.find(x => x.name === name)
    if (p) setRuleGroups(Array.isArray(p.groups) ? p.groups : [])
  }

  const savePreset = async () => {
    if (!presetName.trim()) return
    setSavingPreset(true)
    try {
      const resp = await fetch("/api/admin/upload-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presetName.trim(), groups: ruleGroups }),
      })
      if (resp.ok) {
        setMessage({ type: "success", text: `Preset "${presetName.trim()}" saved` })
        const list = await fetch("/api/admin/upload-rules")
        if (list.ok) setPresets(await list.json())
        setPresetName("")
      } else {
        const e = await resp.json().catch(() => ({}))
        throw new Error(e.error || "Failed to save preset")
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save preset" })
    } finally {
      setSavingPreset(false)
    }
  }

  const deletePreset = async (name: string) => {
    try {
      const resp = await fetch(`/api/admin/upload-rules?name=${encodeURIComponent(name)}`, { method: "DELETE" })
      if (resp.ok) setPresets(p => p.filter(x => x.name !== name))
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Back Button */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Interactive Guidance Banner for missing mobile number / officer profile details */}
      <AdminSetupGuideBanner />

      {view === "menu" && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <DashboardCard
            icon={<Users className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />}
            bgColor="bg-blue-50"
            title="Manage Users"
            onClick={() => setView("users")}
          />
          <DashboardCard
            icon={<Building2 className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />}
            bgColor="bg-emerald-50"
            title="Manage Agencies"
            onClick={() => setView("agencies")}
          />
          <DashboardCard
            icon={<Upload className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />}
            bgColor="bg-purple-50"
            title="Upload Payment Data"
            onClick={() => setView("payments")} 
          />
          <DashboardCard
            icon={<List className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />}
            bgColor="bg-amber-50"
            title="Upload DC List"
            onClick={() => setView("dcList")}
          />
          <DashboardCard
            icon={<Building2 className="h-5 w-5 md:h-6 md:w-6 text-teal-600" />}
            bgColor="bg-teal-50"
            title="Agency Zone Map"
            onClick={() => setView("zoneMap")}
          />
          <DashboardCard
            icon={<ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-rose-600" />}
            bgColor="bg-rose-50"
            title="Manage Roles"
            onClick={() => setView("roles")}
          />
          <DashboardCard
            icon={<Bell className="h-5 w-5 md:h-6 md:w-6 text-cyan-600" />}
            bgColor="bg-cyan-50"
            title="Broadcast Alert"
            onClick={() => setShowPushModal(true)}
          />
          <DashboardCard
            icon={<KeyRound className="h-5 w-5 md:h-6 md:w-6 text-indigo-600" />}
            bgColor="bg-indigo-50"
            title="Google Integration"
            onClick={() => setView("google-onboarding")}
          />
        </div>
      )}

      {/* Broadcast Push Modal for Tenant Admin */}
      <BroadcastPushModal
        isOpen={showPushModal}
        onClose={() => setShowPushModal(false)}
        isSuperuser={false}
        currentCccCode={tenantStatus?.cccCode || "SYSTEM"}
      />

      {view === "google-onboarding" && (
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-6 w-6 text-blue-600" />
              Google Workspace Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingStatus ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : tenantStatus ? (
              <div className="space-y-6">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">CCC Code:</span>
                    <span className="text-sm font-semibold">{tenantStatus.cccCode}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">CCC Name:</span>
                    <span className="text-sm font-semibold">{tenantStatus.cccName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">Connection Status:</span>
                    <Badge variant={tenantStatus.linked ? "default" : "destructive"}>
                      {tenantStatus.linked ? "Linked & Active" : "Not Linked"}
                    </Badge>
                  </div>
                </div>

                {tenantStatus.linked ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-green-200 bg-green-50/50 dark:bg-green-950/20 text-sm space-y-3">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold">
                        <CheckCircle2 className="h-5 w-5" />
                        Google Drive Storage Configured Successfully
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Uploaded image receipts and documents are saved directly to your linked Google Account.
                      </p>
                      <div className="space-y-1 font-mono text-xs text-slate-500">
                        {tenantStatus.driveFolderId && (
                          <div className="flex items-center gap-1">
                            <span>Folder ID:</span>
                            <a
                              href={`https://drive.google.com/drive/folders/${tenantStatus.driveFolderId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline break-all"
                            >
                              {tenantStatus.driveFolderId}
                            </a>
                          </div>
                        )}
                        {tenantStatus.spreadsheetId && (
                          <div className="flex items-center gap-1">
                            <span>Spreadsheet:</span>
                            <a
                              href={`https://docs.google.com/spreadsheets/d/${tenantStatus.spreadsheetId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline break-all"
                            >
                              {tenantStatus.spreadsheetId}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-2">
                      <Button asChild variant="outline" className="w-full">
                        <a href="/api/auth/google/login">Re-link Google Account</a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20 text-sm space-y-2">
                      <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-semibold">
                        <AlertCircle className="h-5 w-5" />
                        Action Required: Link Google Drive
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        To store uploaded images (e.g. meter replacement files and disconnection proofs) under your own Google API limits, you must authorize this application. We will automatically provision a folder named <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-semibold">Disconnection_App_Storage</code> in your Drive.
                      </p>
                    </div>
                    <Button asChild className="w-full">
                      <a href="/api/auth/google/login">
                        <KeyRound className="h-4 w-4 mr-2" />
                        Link Google Account
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500">Failed to load tenant status configuration.</p>
            )}
          </CardContent>
        </Card>
      )}

  {view === "users" && (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Manage Users</h2>
        <Button onClick={() => setShowAddUser(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Add User Form */}
      {showAddUser && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Add New User
              <Button variant="ghost" size="sm" onClick={() => setShowAddUser(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username <span className="text-rose-500">*</span></Label>
                <Input
                  id="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userMobile">10-Digit Mobile Number</Label>
                <Input
                  id="userMobile"
                  value={newUser.mobileNumber}
                  onChange={(e) => setNewUser({ ...newUser, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder="10-digit phone for mobile login"
                  maxLength={10}
                />
                {(() => {
                  const cleanMob = newUser.mobileNumber?.replace(/\D/g, '').slice(-10)
                  if (!cleanMob || cleanMob.length !== 10) return null
                  const conflict = users.find(u => u.mobileNumber === cleanMob || u.username === cleanMob)
                  if (!conflict) return null
                  return (
                    <p className="text-xs text-rose-600 font-medium">
                      ⚠️ Mobile registered to <strong>{conflict.username}</strong> ({conflict.role.toUpperCase()}). Every user must have a unique number.
                    </p>
                  )
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showNewPassword ? "text" : "password"}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Enter password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.length > 0 ? (
                    roles.map((r) => (
                      <SelectItem key={r.role} value={r.role}>
                        <span className="capitalize">{r.role}</span>
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {newUser.role !== "admin" && newUser.role !== "viewer" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Assigned Agencies</Label>
                  <span className="text-[11px] text-muted-foreground">Bound to agency work scope & subscription</span>
                </div>
                {(() => {
                  // Ensure any agency selected in newUser.agencies is present in the list even if background re-fetch is in flight
                  const displayAgencies = [...activeAgencies]
                  newUser.agencies.forEach((selectedName) => {
                    if (
                      selectedName &&
                      !displayAgencies.some((a) => a.name.trim().toUpperCase() === selectedName.trim().toUpperCase())
                    ) {
                      displayAgencies.push({
                        id: `auto-${selectedName}`,
                        name: selectedName,
                        isActive: true,
                        description: "",
                      } as Agency)
                    }
                  })

                  if (displayAgencies.length === 0) {
                    return <p className="text-sm text-gray-500">No active agencies available</p>
                  }

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {displayAgencies.map((agency) => {
                        const isChecked = newUser.agencies.some(
                          (a) => a.trim().toUpperCase() === agency.name.trim().toUpperCase()
                        )
                        return (
                          <div key={agency.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`new-${agency.id}`}
                              checked={isChecked}
                              onChange={() =>
                                setNewUser({
                                  ...newUser,
                                  agencies: isChecked
                                    ? newUser.agencies.filter(
                                        (a) => a.trim().toUpperCase() !== agency.name.trim().toUpperCase()
                                      )
                                    : [...newUser.agencies, agency.name],
                                })
                              }
                              className="rounded"
                            />
                            <label htmlFor={`new-${agency.id}`} className="text-sm">
                              {agency.name}
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="flex space-x-2">
              <Button 
                onClick={addUser} 
                disabled={
                  !newUser.username || 
                  !newUser.password ||
                  (Boolean(newUser.mobileNumber) && newUser.mobileNumber.length !== 10) ||
                  Boolean(newUser.mobileNumber && users.some(u => u.mobileNumber === newUser.mobileNumber.replace(/\D/g, '').slice(-10) || u.username === newUser.mobileNumber.replace(/\D/g, '').slice(-10)))
                }
              >
                <Save className="h-4 w-4 mr-2" />
                Add User
              </Button>
              <Button variant="outline" onClick={() => setShowAddUser(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

          {/* Users List */}
          <div className="space-y-2">
            {users.map((user) => (
              <Card key={user.id} className="p-3">
                {editingUser?.id === user.id ? (
                  <div className="space-y-4 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Username</Label>
                        <Input
                          value={editingUser.username}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, username: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>10-Digit Mobile Number</Label>
                        <Input
                          value={editingUser.mobileNumber || ""}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })
                          }
                          placeholder="10-digit mobile"
                          maxLength={10}
                        />
                        {(() => {
                          const cleanMob = editingUser.mobileNumber?.replace(/\D/g, '').slice(-10)
                          if (!cleanMob || cleanMob.length !== 10) return null
                          const conflict = users.find(u => u.id !== editingUser.id && (u.mobileNumber === cleanMob || u.username === cleanMob))
                          if (!conflict) return null
                          return (
                            <p className="text-xs text-rose-600 font-medium">
                              ⚠️ Already registered to <strong>{conflict.username}</strong> ({conflict.role.toUpperCase()})
                            </p>
                          )
                        })()}
                      </div>
                      <div className="space-y-2">
                        <Label>Password</Label>
                        {editingUser.role === "agency" ? (
                          <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-muted/50">
                            <span className="text-sm text-muted-foreground font-mono">•••••••• (Vendor Private)</span>
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              type={showEditPassword ? "text" : "password"}
                              value={editingUser.password}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, password: e.target.value })
                              }
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPassword(!showEditPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              tabIndex={-1}
                            >
                              {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                          value={editingUser.role}
                          onValueChange={(value) =>
                            setEditingUser({ ...editingUser, role: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.length > 0 ? (
                              roles.map((r) => (
                                <SelectItem key={r.role} value={r.role}>
                                  <span className="capitalize">{r.role}</span>
                                </SelectItem>
                              ))
                            ) : (
                              <>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="agency">Agency</SelectItem>
                                <SelectItem value="executive">Executive</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {editingUser.role !== "admin" && editingUser.role !== "viewer" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Assigned Agencies</Label>
                          <span className="text-[11px] text-muted-foreground">Bound to agency work scope & subscription</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {activeAgencies.map((agency) => (
                            <div key={agency.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`edit-${user.id}-${agency.id}`}
                                checked={editingUser.agencies.includes(agency.name)}
                                onChange={() =>
                                  setEditingUser({
                                    ...editingUser,
                                    agencies: toggleAgency(editingUser.agencies, agency.name),
                                  })
                                }
                                className="rounded"
                              />
                              <label htmlFor={`edit-${user.id}-${agency.id}`} className="text-sm">
                                {agency.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2">
                      <Button 
                        onClick={() => updateUser(editingUser)}
                        disabled={
                          !editingUser.username ||
                          (Boolean(editingUser.mobileNumber) && editingUser.mobileNumber.length !== 10) ||
                          Boolean(editingUser.mobileNumber && users.some(u => u.id !== editingUser.id && (u.mobileNumber === editingUser.mobileNumber?.replace(/\D/g, '').slice(-10) || u.username === editingUser.mobileNumber?.replace(/\D/g, '').slice(-10))))
                        }
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingUser(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{user.username}</span>
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                        {user.mobileNumber && (
                          <span className="text-xs text-slate-500 font-mono">
                            📞 {user.mobileNumber}
                          </span>
                        )}
                      </div>

                      {user.agencies?.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          {user.agencies.map((a) => (
                            <Badge key={a} variant="outline" className="text-[10px] bg-slate-50 text-slate-600">{a}</Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-gray-500 font-mono">
                          {user.role === "agency" 
                            ? "•••••••• (Vendor Private)"
                            : (visiblePasswordId === user.id ? user.password : "••••••••")}
                        </span>
                        {user.role !== "agency" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => setVisiblePasswordId(visiblePasswordId === user.id ? null : user.id)}
                            title={visiblePasswordId === user.id ? "Hide password" : "Show password"}
                          >
                            {visiblePasswordId === user.id
                              ? <EyeOff className="h-3 w-3 text-gray-400" />
                              : <Eye className="h-3 w-3 text-gray-400" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={user.role === "agency"}
                        title={user.role === "agency" ? "Vendor passwords cannot be changed by Admins. Vendors manage their passwords via mobile OTP." : "Change Password"}
                        onClick={() => {
                          if (user.role === "agency") {
                            setMessage({
                              type: "error",
                              text: "🔒 Vendor passwords are encrypted and managed directly by the vendor via Mobile OTP (Forgot Password)."
                            })
                            return
                          }
                          setChangingPasswordUser({ ...user })
                          setChangePasswordValue("")
                          setChangePasswordConfirm("")
                          setShowChangePwdField(false)
                          setShowChangePwdConfirm(false)
                        }}
                      >
                        <KeyRound className={`h-4 w-4 ${user.role === "agency" ? "text-slate-300" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser({ ...user })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {user.username !== "admin" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {view === "agencies" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Manage Agencies</h2>
            <Button onClick={() => setShowAddAgency(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Agency
            </Button>
          </div>

          {/* Post-Agency Creation Prompt to Add Login User */}
          {agencyCreatedPrompt && (
            <div className="mb-4 p-3.5 sm:p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in-50 duration-200">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Agency &lsquo;{agencyCreatedPrompt.name}&rsquo; added!
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Would you like to create a login user account with this agency auto-assigned?
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAgencyCreatedPrompt(null)}
                  className="text-xs h-8 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const targetAgency = agencyCreatedPrompt.name
                    const targetMobile = agencyCreatedPrompt.mobileNumber || ""
                    setAgencyCreatedPrompt(null)
                    setView("users")
                    setShowAddUser(true)
                    setNewUser({
                      username: targetMobile || targetAgency.toLowerCase().replace(/[^a-z0-9]/g, ''),
                      password: "",
                      role: "agency",
                      agencies: [targetAgency],
                      mobileNumber: targetMobile,
                    })
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 font-semibold rounded-xl cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Create Login Account
                </Button>
              </div>
            </div>
          )}

          {/* Alert Banner for Incomplete Agencies */}
          {(() => {
            const missingCount = agencies.filter(a => a.isActive && (!a.vendorCode || a.vendorCode.length < 6 || !a.mobileNumber || a.mobileNumber.length < 10)).length
            if (missingCount === 0) return null
            return (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:px-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-slate-800 dark:text-slate-200">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {missingCount} {missingCount === 1 ? 'Agency requires' : 'Agencies require'} Vendor Code & Mobile
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Field operations are paused until completed. Vendors can also self-activate upon login.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAgencyFilter("missing")}
                  className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline shrink-0 self-end sm:self-auto cursor-pointer"
                >
                  View Incomplete ({missingCount}) →
                </button>
              </div>
            )
          })()}

          {/* Add Agency Form */}
          {showAddAgency && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Add New Agency
                  <Button variant="ghost" size="sm" onClick={() => setShowAddAgency(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyName">Agency Name <span className="text-rose-500">*</span></Label>
                    <Input
                      id="agencyName"
                      value={newAgency.name}
                      onChange={(e) => setNewAgency({ ...newAgency, name: e.target.value })}
                      placeholder="e.g. ALOKE, M/S RAM KUMAR SINHAL"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agencyVendorCode">Vendor Code <span className="text-rose-500">*</span></Label>
                    <Input
                      id="agencyVendorCode"
                      value={newAgency.vendorCode}
                      onChange={(e) => setNewAgency({ ...newAgency, vendorCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      placeholder="6-digit Vendor Code (e.g. 500287)"
                      maxLength={6}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyMobile">10-Digit Mobile Number <span className="text-rose-500">*</span></Label>
                    <Input
                      id="agencyMobile"
                      value={newAgency.mobileNumber}
                      onChange={(e) => setNewAgency({ ...newAgency, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      placeholder="10-digit contractor phone for OTP/Login"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agencyDescription">Description / Notes</Label>
                    <Input
                      id="agencyDescription"
                      value={newAgency.description}
                      onChange={(e) => setNewAgency({ ...newAgency, description: e.target.value })}
                      placeholder="Contact Person / Assigned Feeder / Zone"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="agencyActive"
                    checked={newAgency.isActive}
                    onChange={(e) => setNewAgency({ ...newAgency, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="agencyActive" className="text-sm">
                    Active
                  </label>
                </div>

                <div className="flex space-x-2">
                  <Button 
                    onClick={addAgency} 
                    disabled={
                      !newAgency.name || 
                      !newAgency.vendorCode || 
                      newAgency.vendorCode.length < 6 || 
                      !newAgency.mobileNumber || 
                      newAgency.mobileNumber.length < 10
                    }
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Add Agency
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddAgency(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filter Pills & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setAgencyFilter("all")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
                  agencyFilter === "all"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                All ({agencies.length})
              </button>
              <button
                type="button"
                onClick={() => setAgencyFilter("missing")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-all flex items-center gap-1 ${
                  agencyFilter === "missing"
                    ? "bg-amber-500 text-white shadow-2xs font-semibold"
                    : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                }`}
              >
                <span>Missing Code/Phone</span>
                <span className="bg-amber-600/20 text-current text-[10px] px-1.5 py-0.2 rounded-full">
                  {agencies.filter(a => !a.vendorCode || a.vendorCode.length < 6 || !a.mobileNumber || a.mobileNumber.length < 10).length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAgencyFilter("completed")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-all flex items-center gap-1 ${
                  agencyFilter === "completed"
                    ? "bg-emerald-600 text-white shadow-2xs font-semibold"
                    : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                }`}
              >
                <span>Completed</span>
                <span className="bg-emerald-600/20 text-current text-[10px] px-1.5 py-0.2 rounded-full">
                  {agencies.filter(a => a.vendorCode && a.vendorCode.length >= 6 && a.mobileNumber && a.mobileNumber.length >= 10).length}
                </span>
              </button>
            </div>
          </div>

          {/* Agencies List */}
          <div className="space-y-2">
            {agencies
              .filter(a => {
                const isComplete = Boolean(a.vendorCode && a.vendorCode.length >= 6 && a.mobileNumber && a.mobileNumber.length >= 10)
                if (agencyFilter === "missing") return !isComplete
                if (agencyFilter === "completed") return isComplete
                return true
              })
              .map((agency: any) => {
                const billingStartDate = new Date("2026-09-07T00:00:00").getTime()
                const isBillingStarted = Date.now() >= billingStartDate
                const isAgencySubscribed = Boolean(
                  agency.subscriptionExpiresAt && 
                  new Date(agency.subscriptionExpiresAt).getTime() > Date.now() && 
                  (agency.subscriptionStatus === "active" || agency.subscriptionStatus === "paid")
                )
                const isExpiredAgency = Boolean(
                  isBillingStarted &&
                  (agency.subscriptionStatus === "expired" ||
                   !agency.subscriptionExpiresAt ||
                   new Date(agency.subscriptionExpiresAt).getTime() <= Date.now())
                )
                const hasExistingVendor = Boolean(agency.vendorCode && String(agency.vendorCode).trim().length >= 6)
                const isPaidAgency = isAgencySubscribed && isBillingStarted
                const isVendorLocked = isAgencySubscribed && isBillingStarted && hasExistingVendor
                const isIncomplete = !agency.vendorCode || agency.vendorCode.length < 6 || !agency.mobileNumber || agency.mobileNumber.length < 10
                const initials = (agency.name || "AG").split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase()
                return (
              <div
                key={agency.id}
                className={`rounded-2xl border transition-all duration-200 p-3.5 sm:p-4 bg-white dark:bg-slate-900/70 shadow-2xs hover:shadow-xs ${
                  editingAgency?.id === agency.id
                    ? "border-indigo-500/40 ring-2 ring-indigo-500/10"
                    : isIncomplete
                    ? "border-amber-500/30 dark:border-amber-500/20 hover:border-amber-500/50"
                    : "border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {editingAgency?.id === agency.id ? (
                  <div className="space-y-4 p-1">
                    {isVendorLocked && (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                        <span className="font-semibold">🔒 Protected Agency:</span>
                        <span>This agency has an active paid subscription until <strong>{agency.subscriptionExpiresAt}</strong>. Agency Name and Vendor Code are locked to prevent license transfer.</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                          <span>Agency Name <span className="text-rose-500">*</span></span>
                          {isVendorLocked && <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">🔒 Locked</span>}
                        </Label>
                        <Input
                          value={editingAgency.name}
                          disabled={isVendorLocked}
                          className={isVendorLocked ? "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed" : ""}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                          <span>Vendor Code <span className="text-rose-500">*</span></span>
                          {isVendorLocked ? (
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">🔒 Locked</span>
                          ) : !hasExistingVendor ? (
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Required</span>
                          ) : null}
                        </Label>
                        <Input
                          value={editingAgency.vendorCode || ""}
                          disabled={isVendorLocked}
                          className={isVendorLocked ? "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed font-mono" : "font-mono"}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, vendorCode: e.target.value.replace(/\D/g, '').slice(0, 6) })
                          }
                          placeholder="6-digit Vendor Code"
                          maxLength={6}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">10-Digit Mobile Number <span className="text-rose-500">*</span></Label>
                        <Input
                          value={editingAgency.mobileNumber || ""}
                          className="font-mono"
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })
                          }
                          placeholder="10-digit contractor phone"
                          maxLength={10}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Description / Notes</Label>
                        <Input
                          value={editingAgency.description || ""}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, description: e.target.value })
                          }
                          placeholder="Contact person / feeder scope"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <input
                        type="checkbox"
                        id={`active-${agency.id}`}
                        checked={editingAgency.isActive}
                        onChange={(e) =>
                          setEditingAgency({ ...editingAgency, isActive: e.target.checked })
                        }
                        className="rounded"
                      />
                      <label htmlFor={`active-${agency.id}`} className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        Active
                      </label>
                    </div>

                    <div className="flex space-x-2 pt-2">
                      <Button onClick={() => updateAgency(editingAgency)} className="h-9 px-4 text-xs font-semibold rounded-xl">
                        <Save className="h-4 w-4 mr-1.5" />
                        Save Changes
                      </Button>
                      <Button variant="outline" onClick={() => setEditingAgency(null)} className="h-9 px-4 text-xs font-semibold rounded-xl">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Avatar + Details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 select-none ${
                        !agency.isActive
                          ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                          : isIncomplete
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                          : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                      }`}>
                        {initials || "AG"}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100 break-words leading-tight">
                            {agency.name}
                          </h3>
                          {!agency.isActive ? (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              Inactive
                            </span>
                          ) : isIncomplete ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Incomplete
                            </span>
                          ) : null}
                          {isExpiredAgency ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Expired ({agency.subscriptionExpiresAt || "Subscription Due"})
                            </span>
                          ) : isAgencySubscribed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Paid Active till {agency.subscriptionExpiresAt}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              Free Trial till {agency.subscriptionExpiresAt || "30 Days"}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                          {agency.vendorCode ? (
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              Code: <strong className="font-semibold">{agency.vendorCode}</strong>
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                              No vendor code
                            </span>
                          )}
                          <span className="text-slate-300 dark:text-slate-700 select-none">•</span>
                          {agency.mobileNumber ? (
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {agency.mobileNumber}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                              No mobile
                            </span>
                          )}
                          {agency.description && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700 select-none">•</span>
                              <span className="truncate max-w-[200px] sm:max-w-xs">{agency.description}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Clean Action Bar */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80 w-full sm:w-auto justify-end">
                      {isIncomplete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs font-semibold rounded-lg border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer"
                          onClick={() => setEditingAgency({ ...agency })}
                        >
                          Complete Setup
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        onClick={() => setEditingAgency({ ...agency })}
                        title="Edit Agency"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30 cursor-pointer"
                        disabled={isPaidAgency}
                        title={isPaidAgency ? "Cannot delete agency with active paid subscription" : "Delete Agency"}
                        onClick={() => deleteAgency(agency.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
                )
              })}
          </div>
        </div>
      )}

      {view === "payments" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Upload Payment Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload a Cash Desk or Portal payment file (Excel or CSV). Matched consumers
              are marked Paid with full/partial detection and outstanding balance.
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600 text-xs underline">Show file format guide</summary>
                <div className="mt-2 bg-blue-50 rounded p-3 text-xs space-y-1">
                  <p className="font-semibold text-blue-800">Required columns (auto-detected by name):</p>
                  <pre className="bg-white rounded p-2 overflow-auto">{`Consumer ID  |  Paid Amount  |  Paid Date (optional)
-----------     -----------     ----------
100000001       5000            15-05-2025
100000002       12000           15-05-2025`}</pre>
                  <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                    <li>Column names are matched loosely: "Consumer ID", "CA", "Account" all work for ID.</li>
                    <li>"Amount", "Paid Amount", "Credit" all work for amount.</li>
                    <li>"Date", "Paid Date", "Payment Date" work for date (leave blank to use today).</li>
                    <li>Rows with zero or non-numeric amount are skipped.</li>
                    <li>Unmatched consumer IDs are listed in the result — they are not created.</li>
                  </ul>
                </div>
              </details>
            </p>
          </div>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Source</Label>
                  <Select
                    value={paymentSource}
                    onValueChange={(v) => setPaymentSource(v as "Cash Desk" | "Portal")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash Desk">Cash Desk</SelectItem>
                      <SelectItem value="Portal">Portal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Payment File</Label>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv"
                    onChange={(e) => e.target.files && parsePaymentFile(e.target.files[0])}
                  />
                </div>
              </div>

              {paymentFileName && (
                <p className="text-xs text-gray-500">Selected: <span className="font-mono">{paymentFileName}</span></p>
              )}

              {paymentParseError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{paymentParseError}</AlertDescription>
                </Alert>
              )}

              {paymentRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Parsed Rows ({paymentRows.length})</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setPaymentRows([]); setPaymentFileName(""); setPaymentResult(null); }}
                    >
                      <X className="h-4 w-4 mr-1" /> Clear
                    </Button>
                  </div>
                  <div className="border rounded-md max-h-72 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Consumer ID</TableHead>
                          <TableHead className="text-right">Paid Amount</TableHead>
                          <TableHead>Paid Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentRows.slice(0, 50).map((r, i) => (
                          <TableRow key={`${r.consumerId}-${i}`}>
                            <TableCell className="font-mono">{r.consumerId}</TableCell>
                            <TableCell className="text-right">{r.paidAmount.toLocaleString("en-IN")}</TableCell>
                            <TableCell>{r.paidDate || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {paymentRows.length > 50 && (
                      <p className="text-xs text-gray-500 p-2 text-center">
                        Showing first 50 of {paymentRows.length} rows
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={submitPayments}
                    disabled={paymentSubmitting}
                    className="w-full sm:w-auto"
                  >
                    {paymentSubmitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying…</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Apply {paymentRows.length} Payments</>
                    )}
                  </Button>
                </div>
              )}

              {paymentResult && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div><strong>{paymentResult.matched}</strong> of <strong>{paymentResult.uniqueConsumers}</strong> consumers updated.</div>
                      <div className="text-xs">
                        {paymentResult.receivedRows} rows &rarr; {paymentResult.uniqueConsumers} consumers (duplicates summed) &middot; Full: {paymentResult.fullPayments} &middot; Partial: {paymentResult.partialPayments} &middot; Not found: {paymentResult.notFound}
                      </div>
                      {paymentResult.notFoundIds.length > 0 && (
                        <details className="text-xs mt-2">
                          <summary className="cursor-pointer">Show unmatched IDs (first {paymentResult.notFoundIds.length})</summary>
                          <div className="font-mono mt-1 max-h-32 overflow-auto break-all">
                            {paymentResult.notFoundIds.join(", ")}
                          </div>
                        </details>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "dcList" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold">Upload DC List</h2>
            <div className="flex gap-2 flex-wrap">
              {/* Backup: reads from IndexedDB, zero server cost */}
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={downloadCacheBackup}
                disabled={backupDownloading}
              >
                {backupDownloading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Preparing…</> : "⬇ Backup Current List"}
              </Button>
              {/* Refresh Lat/Long from Consumer Master — VLOOKUP style */}
              <Button
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={refreshLatLong}
                disabled={latLongRefreshing}
                title="Match Consumer IDs in DC list with Consumer Master and copy lat/long coordinates"
              >
                {latLongRefreshing
                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Refreshing…</>
                  : "📍 Refresh Lat/Long from Master"}
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                const XLSX = await import("xlsx")
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                  ["off_code", "MRU", "Consumer Id", "Name", "Address", "Base Class", "Device", "O/S Duedate Range", "D2 Net O/S", "Mobile Number", "Latitude", "Longitude"],
                  ["6612107", "AB01MR", "100000001", "CONSUMER NAME", "123 ROAD AREA DISTRICT", "L-1 PHASE", "METER001", "01-01-2024 - 31-03-2024", "5000", "9876543210", "24.791234", "85.001234"],
                  ["6612107", "AB01MR", "100000002", "ANOTHER CONSUMER", "456 STREET TOWN", "L-1 PHASE", "METER002", "01-01-2024 - 31-03-2024", "12000", "9876543211", "24.795678", "85.005678"],
                ]), "DC List")
                XLSX.writeFile(wb, "DC_List_Template.xlsx")
              }}>
                Download Template
              </Button>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mt-1">
              Upload a CSV or Excel DC list. New IDs are inserted; existing IDs are updated.
              Consumers removed from the new list are archived to <span className="font-mono">DC_History</span>.
              Statuses like Disconnected/Paid are protected — only billing data and coordinates are updated for them.
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600 text-xs underline">Show file format guide</summary>
                <div className="mt-2 bg-blue-50 rounded p-3 text-xs space-y-1">
                  <p className="font-semibold text-blue-800">Required &amp; Optional columns:</p>
                  <pre className="bg-white rounded p-2 overflow-auto text-[10px]">{`off_code | MRU      | Consumer Id | Name         | Address       | Base Class | Device    | O/S Duedate Range          | D2 Net O/S | Mobile Number | Latitude  | Longitude
6612107  | AB01MR   | 100000001   | CONSUMER NAME| 123 ROAD...   | L-1 PHASE  | METER001  | 01-01-2024 - 31-03-2024    | 5000       | 9876543210    | 24.791234 | 85.001234`}</pre>
                  <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                    <li>Columns are detected by flexible header matching &amp; regex pattern matching.</li>
                    <li>Latitude &amp; Longitude (optional) will be saved to Google Sheet &amp; browser cache for map routing.</li>
                    <li>Consumer ID, MRU, and D2 Net O/S are mandatory — rows without them are skipped.</li>
                    <li>Agency is auto-assigned from Zone Map based on MRU. Run Zone Map setup first.</li>
                    <li><strong>Protected statuses</strong> (Disconnected, Paid, Visited, etc.): OSD, base info &amp; Lat/Long are updated — status, date, notes, image are preserved.</li>
                    <li>Consumers in the sheet but not in this file are marked as removed and logged to DC_History.</li>
                  </ul>
                </div>
              </details>
            </div>
          </div>

          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="appendMode"
                  checked={isAppendMode}
                  onChange={(e) => setIsAppendMode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <label htmlFor="appendMode" className="font-semibold text-sm text-blue-950 cursor-pointer">
                    Add Disconnection List (Append Mode)
                  </label>
                  <p className="text-xs text-blue-800/80 mt-0.5">
                    Check this to <strong>append and merge</strong> this list into the existing disconnection database without deleting existing consumers.
                    Consumers already present in the list will have their billing info updated while preserving protected field statuses.
                    Uncheck only if you wish to perform a full sync/replacement (which archives unlisted consumers).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <Label>DC List File (CSV or Excel)</Label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv"
                  onChange={(e) => {
                    if (!e.target.files?.[0]) return
                    const file = e.target.files[0]
                    setDcUploadResult(null)
                    if (/\.(xlsx|xls)$/i.test(file.name)) {
                      const reader = new FileReader()
                      reader.onload = async (ev) => {
                        const XLSX = await import("xlsx")
                        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: "array" })
                        const ws = wb.Sheets[wb.SheetNames[0]]
                        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][]
                        if (rows.length >= 2) {
                          ingestParsed((rows[0] || []).map(String), rows.slice(1) as string[][], file.name)
                        }
                      }
                      reader.readAsArrayBuffer(file)
                    } else {
                      handleFileUpload(file)
                    }
                  }}
                />
                {fileName && <p className="text-xs text-gray-500">Selected: <span className="font-mono">{fileName}</span></p>}
              </div>

              {/* STEP 1 — Column mapping */}
              {rawHeaders.length > 0 && !mappingConfirmed && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Map columns — {rawRows.length} rows detected</h4>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setRawHeaders([]); setRawRows([]); setMapping({}); setMappingConfidence({})
                      setFileName(""); setMappingConfirmed(false); setDcUploadResult(null)
                    }}>
                      <X className="h-4 w-4 mr-1" /> Clear
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    We auto-matched your file's headers to the system columns. Fix any that are wrong.
                    The 10 system columns are uploaded; <span className="font-medium">Class / Gov-Non-Gov / Discon Status</span> are
                    optional and used only for filtering &amp; conflict checks.
                  </p>
                  <div className="border rounded-md divide-y">
                    {[...expectedColumns, ...FILTER_COLUMNS].map((col) => {
                      const isFilterCol = (FILTER_COLUMNS as readonly string[]).includes(col)
                      const idx = mapping[col] ?? -1
                      const c = mappingConfidence[col] || "unmatched"
                      const sample = idx >= 0 ? String(rawRows[0]?.[idx] ?? "") : ""
                      return (
                        <div key={col} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                          <div className="w-32 shrink-0 font-medium flex items-center gap-1">
                            {col}
                            {isFilterCol && <span className="text-[9px] text-gray-400">(filter)</span>}
                          </div>
                          <Select value={String(idx)} onValueChange={(v) => {
                            setMapping(m => ({ ...m, [col]: Number(v) }))
                            setMappingConfidence(mc => ({ ...mc, [col]: Number(v) >= 0 ? "name" : "unmatched" }))
                          }}>
                            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1">— Not mapped —</SelectItem>
                              {rawHeaders.map((h, i) => (
                                <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                            c === "name" ? "bg-green-100 text-green-700"
                            : c === "pattern" ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"}`}>
                            {c === "name" ? "matched" : c === "pattern" ? "by pattern" : "unmapped"}
                          </span>
                          <span className="w-28 shrink-0 truncate text-gray-400 font-mono">{sample}</span>
                        </div>
                      )
                    })}
                  </div>
                  {(() => {
                    const missing = ["Consumer Id", "MRU", "D2 Net O/S"].filter(c => (mapping[c] ?? -1) < 0)
                    return (
                      <>
                        {missing.length > 0 && (
                          <p className="text-xs text-red-600">Required columns unmapped: {missing.join(", ")}</p>
                        )}
                        <Button size="sm" disabled={missing.length > 0} onClick={() => setMappingConfirmed(true)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm Mapping
                        </Button>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* STEP 2 — Filters + conflicts + preview + upload */}
              {rawHeaders.length > 0 && mappingConfirmed && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-1"><Filter className="h-4 w-4" /> Filter rules</h4>
                    <Button size="sm" variant="ghost" onClick={() => setMappingConfirmed(false)}>
                      <ArrowLeft className="h-4 w-4 mr-1" /> Re-map columns
                    </Button>
                  </div>

                  {/* Presets */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-500">Presets:</span>
                    {presets.length === 0 && <span className="text-gray-400">none saved</span>}
                    {presets.map(p => (
                      <span key={p.name} className="inline-flex items-center gap-1 bg-gray-100 rounded-full pl-2 pr-1 py-0.5">
                        <button className="hover:underline" onClick={() => applyPreset(p.name)}>{p.name}</button>
                        <button className="text-gray-400 hover:text-red-500" onClick={() => deletePreset(p.name)}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>

                  {/* Rule groups */}
                  <div className="space-y-2">
                    {ruleGroups.length === 0 && (
                      <p className="text-xs text-gray-500">No rules — all {rawRows.length} rows will upload. Add a group to filter.</p>
                    )}
                    {ruleGroups.map((grp, gi) => (
                      <div key={gi} className="border rounded-md p-2 space-y-2 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-gray-600">
                            {gi > 0 && <span className="text-blue-600 mr-1">OR</span>}Group {gi + 1} <span className="text-gray-400">(all conditions must match)</span>
                          </span>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeRuleGroup(gi)}><X className="h-3 w-3" /></Button>
                        </div>
                        {grp.conditions.map((cond, ci) => {
                          const numeric = NUMERIC_FILTER_FIELDS.has(cond.field)
                          const ops: Operator[] = numeric ? ["gt", "lt", "gte", "lte", "between", "eq"] : ["in", "nin", "eq", "neq"]
                          return (
                            <div key={ci} className="flex flex-wrap items-center gap-1.5 text-xs">
                              {ci > 0 && <span className="text-[10px] text-gray-400">AND</span>}
                              <Select value={cond.field} onValueChange={(v) => {
                                const num = NUMERIC_FILTER_FIELDS.has(v)
                                updateCondition(gi, ci, { field: v, op: num ? "gt" : "in", value: num ? "0" : [] })
                              }}>
                                <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {filterableFields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Select value={cond.op} onValueChange={(v) => updateCondition(gi, ci, { op: v as Operator, value: isNumericOp(v as Operator) ? (v === "between" ? ["0", "0"] : "0") : [] })}>
                                <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ops.map(o => <SelectItem key={o} value={o}>{OPERATOR_LABELS[o]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {/* Value editor */}
                              {numeric ? (
                                cond.op === "between" ? (
                                  <div className="flex items-center gap-1">
                                    <Input className="h-7 w-20 text-xs" type="number" value={String((cond.value as any[])?.[0] ?? "")}
                                      onChange={(e) => updateCondition(gi, ci, { value: [e.target.value, String((cond.value as any[])?.[1] ?? "")] as any })} />
                                    <span className="text-gray-400">–</span>
                                    <Input className="h-7 w-20 text-xs" type="number" value={String((cond.value as any[])?.[1] ?? "")}
                                      onChange={(e) => updateCondition(gi, ci, { value: [String((cond.value as any[])?.[0] ?? ""), e.target.value] as any })} />
                                  </div>
                                ) : (
                                  <Input className="h-7 w-24 text-xs" type="number" value={String(cond.value ?? "")}
                                    onChange={(e) => updateCondition(gi, ci, { value: e.target.value })} />
                                )
                              ) : (
                                <div className="flex flex-wrap gap-1 max-w-md">
                                  {distinctValues(cond.field).map(v => {
                                    const selected = Array.isArray(cond.value) && (cond.value as string[]).includes(v)
                                    return (
                                      <button key={v} type="button"
                                        className={`px-1.5 py-0.5 rounded-full text-[10px] border ${selected ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-500"}`}
                                        onClick={() => {
                                          const cur = Array.isArray(cond.value) ? (cond.value as string[]) : []
                                          updateCondition(gi, ci, { value: selected ? cur.filter(x => x !== v) : [...cur, v] })
                                        }}>{v}</button>
                                    )
                                  })}
                                </div>
                              )}
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400" onClick={() => removeCondition(gi, ci)}><X className="h-3 w-3" /></Button>
                            </div>
                          )
                        })}
                        <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => addCondition(gi)} disabled={filterableFields.length === 0}>
                          <Plus className="h-3 w-3 mr-1" /> Add condition
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addRuleGroup}>
                      <Plus className="h-4 w-4 mr-1" /> Add rule group {ruleGroups.length > 0 && "(OR)"}
                    </Button>
                  </div>

                  {/* Save preset */}
                  <div className="flex items-center gap-2">
                    <Input className="h-7 w-44 text-xs" placeholder="Preset name…" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={savePreset} disabled={!presetName.trim() || savingPreset}>
                      {savingPreset ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save preset
                    </Button>
                  </div>

                  {/* Live count */}
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-xs text-blue-800">
                    <strong>{finalUploadRows.length}</strong> of {rawRows.length} rows will be uploaded.
                    {isAppendMode ? (
                      <span className="ml-1 text-blue-600 font-medium">(Append Mode: Existing consumers retained)</span>
                    ) : (
                      <span className="ml-1 text-amber-700 font-medium">(Replace Mode: Consumers not in this file will be archived/removed)</span>
                    )}
                  </div>

                  {/* Duplicate Consumer Warnings */}
                  {existingDuplicates.length > 0 && (
                    <Alert className="border-amber-300 bg-amber-50/90 text-amber-900">
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <AlertDescription>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-semibold text-xs sm:text-sm text-amber-950">
                              ⚠️ Warning: {existingDuplicates.length} Consumer ID{existingDuplicates.length > 1 ? "s" : ""} already exist in the disconnection list
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowDuplicatesList(!showDuplicatesList)}
                              className="h-6 text-xs text-amber-800 hover:text-amber-950 underline px-1.5"
                            >
                              {showDuplicatesList ? "Hide duplicate IDs" : "View duplicate IDs"}
                            </Button>
                          </div>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            {isAppendMode ? (
                              <>
                                In <strong>Append Mode</strong>, existing consumers will have their latest billing details (outstanding amount, contact info, etc.) updated while preserving their current disconnection/reconnection status.
                              </>
                            ) : (
                              <>
                                In <strong>Replace Mode</strong>, matching consumers will be updated while non-matching consumers will be removed.
                              </>
                            )}
                          </p>
                          {showDuplicatesList && (
                            <div className="mt-2 max-h-40 overflow-y-auto border border-amber-200 rounded-md bg-white p-2 text-xs divide-y">
                              {existingDuplicates.slice(0, 100).map((d) => (
                                <div key={d.consumerId} className="flex justify-between items-center py-1 gap-2">
                                  <span className="font-mono font-medium text-gray-800">{d.consumerId}</span>
                                  <span className="truncate flex-1 text-gray-600">{d.name}</span>
                                  <Badge variant="outline" className="text-[10px] uppercase font-normal">{d.status}</Badge>
                                </div>
                              ))}
                              {existingDuplicates.length > 100 && (
                                <p className="text-[10px] text-gray-400 italic pt-1">...and {existingDuplicates.length - 100} more</p>
                              )}
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {fileDuplicates.length > 0 && (
                    <Alert className="border-orange-300 bg-orange-50 text-orange-900">
                      <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                      <AlertDescription>
                        <p className="text-xs text-orange-800">
                          ⚠️ <strong>Duplicate rows in file:</strong> {fileDuplicates.length} Consumer ID{fileDuplicates.length > 1 ? "s" : ""} appeared multiple times in this uploaded file.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Conflict resolution */}
                  {conflicts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-1">
                        <ShieldAlert className="h-4 w-4 text-amber-600" /> {conflicts.length} protected consumers in this upload
                      </h4>
                      <p className="text-xs text-gray-500">
                        These already have a field/admin status. Choose <strong>Keep</strong> (protect existing) or
                        <strong> Replace</strong> (overwrite with new list). Default is Keep. Expand to decide per consumer.
                      </p>
                      {Object.entries(conflictsByStatus).map(([status, list]) => {
                        const decision = statusDecision(status)
                        const expanded = !!expandedStatuses[status]
                        return (
                          <div key={status} className="border rounded-md">
                            <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                              <button onClick={() => setExpandedStatuses(s => ({ ...s, [status]: !expanded }))} className="text-gray-500">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <span className="flex-1 font-medium capitalize">{status} <span className="text-gray-400">({list.length})</span></span>
                              <div className="flex gap-1">
                                <button onClick={() => setStatusDecision(status, "keep")}
                                  className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${decision === "keep" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                  <ShieldCheck className="h-3 w-3" /> Keep
                                </button>
                                <button onClick={() => setStatusDecision(status, "replace")}
                                  className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${decision === "replace" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                                  <Upload className="h-3 w-3" /> Replace
                                </button>
                                {decision === "mixed" && <span className="text-[10px] text-amber-600 self-center">mixed</span>}
                              </div>
                            </div>
                            {expanded && (
                              <div className="border-t divide-y max-h-48 overflow-auto">
                                {list.map(c => {
                                  const d = conflictOverrides[c.consumerId] === "replace" ? "replace" : "keep"
                                  return (
                                    <div key={c.consumerId} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                                      <span className="font-mono text-gray-500 w-24 shrink-0">{c.consumerId}</span>
                                      <span className="flex-1 truncate">{c.name}</span>
                                      <div className="flex gap-1">
                                        <button onClick={() => setConsumerDecision(c.consumerId, "keep")}
                                          className={`px-1.5 py-0.5 rounded-full ${d === "keep" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Keep</button>
                                        <button onClick={() => setConsumerDecision(c.consumerId, "replace")}
                                          className={`px-1.5 py-0.5 rounded-full ${d === "replace" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>Replace</button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Preview */}
                  {finalUploadRows.length > 0 && (
                    <>
                      <h4 className="font-semibold text-sm">Preview (first 5 of {finalUploadRows.length})</h4>
                      <div className="border rounded-md overflow-auto max-h-52">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {expectedColumns.map(c => <TableHead key={c} className="text-[11px] px-2 py-1 whitespace-nowrap">{c}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {finalUploadRows.slice(0, 5).map((row, i) => (
                              <TableRow key={i}>
                                {row.map((cell, j) => (
                                  <TableCell key={j} className="text-[11px] px-2 py-1 max-w-[100px] truncate">{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}

                  <Button className="w-full sm:w-auto" onClick={uploadToGoogleSheet} disabled={isUploading || finalUploadRows.length === 0}>
                    {isUploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                    ) : isAppendMode ? (
                      <><Upload className="h-4 w-4 mr-2" /> Add &amp; Append {finalUploadRows.length} rows to DC List</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Sync {finalUploadRows.length} rows to Sheet</>
                    )}
                  </Button>
                </div>
              )}

              {dcUploadResult && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1 text-sm">
                      <p><strong>{dcUploadResult.total}</strong> rows in file processed.</p>
                      <div className="flex flex-wrap gap-3 text-xs mt-1">
                        <span className="text-green-700">✓ {dcUploadResult.inserted} new inserted</span>
                        <span className="text-blue-700">✓ {dcUploadResult.updated} updated</span>
                        <span className="text-orange-700">⚠ {dcUploadResult.protectedStatusSkipped} had protected status (only OSD/base updated)</span>
                        <span className="text-purple-700">✓ {dcUploadResult.autoAssigned} auto-assigned agency</span>
                        {dcUploadResult.deletedNotInUpload > 0 && (
                          <span className="text-red-700">🗑 {dcUploadResult.deletedNotInUpload} not in new list → saved to history and deleted from sheet</span>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Lat/Long Refresh Result */}
          {latLongResult && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex flex-wrap gap-4 items-center">
              <span className="font-semibold">📍 Lat/Long Refresh Result:</span>
              <span className="text-green-700">✓ {latLongResult.updated} updated</span>
              <span className="text-gray-600">↩ {latLongResult.alreadyHad} already had coordinates</span>
              <span className="text-gray-500">✗ {latLongResult.noMaster} not in Consumer Master</span>
              <span className="text-blue-700">{latLongResult.matched} matched total</span>
            </div>
          )}
        </div>
      )}

      {view === "zoneMap" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold">Agency Zone Map</h2>
              <div className="text-sm text-gray-600 mt-1">
                Map MRUs to agencies. Used during DC list upload to auto-assign agency per consumer.
                Changes are tracked in <span className="font-mono text-xs">ZoneMapHistory</span>.
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={resyncing || zoneMapRows.length === 0}
                onClick={resyncAgencies} title="Apply the current zone map to existing consumers — no DC upload needed">
                {resyncing
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Re-syncing…</>
                  : <>Re-sync agencies</>}
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                const XLSX = await import("xlsx")
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                  ["MRU", "Agency", "Address"],
                  ["AB01MR", "AGENCY NAME", "Area / locality description"],
                  ["AB02MR", "AGENCY NAME 2", "North zone near substation"],
                ]), "ZoneMap")
                XLSX.writeFile(wb, "ZoneMap_Template.xlsx")
              }}>
                Download Template
              </Button>
            </div>
          </div>

          {resyncResult && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-purple-700">✓ {resyncResult.reassigned} reassigned</span>
                  <span className="text-orange-700">⚠ {resyncResult.skippedProtected} skipped (protected status)</span>
                  <span className="text-gray-600">{resyncResult.unchanged} already correct</span>
                  <span className="text-gray-400">{resyncResult.unmapped} unmapped MRU</span>
                  <span className="text-gray-400">({resyncResult.scanned} scanned)</span>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Guide */}
          <button className="text-xs text-blue-600 underline" onClick={() => setShowZoneGuide(g => !g)}>
            {showZoneGuide ? "Hide" : "Show"} format guide
          </button>
          {showZoneGuide && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-3 text-xs space-y-2">
                <p className="font-semibold text-blue-800">CSV / Excel format:</p>
                <pre className="bg-white rounded p-2 text-[11px] overflow-auto">{`MRU,Agency,Address\nAB01MR,AGENCY NAME 1,South Zone near main road\nAB02MR,AGENCY NAME 2,North industrial area`}</pre>
                <ul className="list-disc pl-4 text-gray-600 space-y-0.5">
                  <li><strong>MRU</strong>: Full MRU code from the DC list (e.g. <code>AB01MR</code>). Stored as-is — each MRU maps to one agency.</li>
                  <li><strong>Agency</strong>: Exact name as in Manage Agencies (case-insensitive match on upload).</li>
                  <li><strong>Address</strong>: Optional. Helps decide future agency allocation.</li>
                  <li>Header row required. Changes are logged to <code>ZoneMapHistory</code> sheet.</li>
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Add row + CSV upload tabs */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              {zoneMapLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button size="sm" variant={zoneUploadMode === "manual" ? "default" : "outline"} onClick={() => setZoneUploadMode("manual")}>Add / Edit</Button>
                    <Button size="sm" variant={zoneUploadMode === "csv" ? "default" : "outline"} onClick={() => setZoneUploadMode("csv")}>Bulk Upload</Button>
                  </div>

                  {/* Manual add row */}
                  {zoneUploadMode === "manual" && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">MRU</Label>
                        {availableMrus.length > 0 ? (
                          <Select value={newZone} onValueChange={setNewZone}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Select MRU" /></SelectTrigger>
                            <SelectContent>
                              {availableMrus.map(mru => (
                                <SelectItem key={mru} value={mru}>{mru}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input placeholder="AB01MR" value={newZone}
                            onChange={(e) => setNewZone(e.target.value.toUpperCase())} className="h-8 font-mono" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Agency</Label>
                        <Select value={newZoneAgency} onValueChange={setNewZoneAgency}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select agency" /></SelectTrigger>
                          <SelectContent>
                            {agencies.filter(a => a.isActive).map(a => (
                              <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Area / Address (optional)</Label>
                        <Input placeholder="e.g. South zone, near market"
                          value={newZoneAddress}
                          onChange={(e) => setNewZoneAddress(e.target.value)}
                          className="h-8 text-xs" />
                      </div>
                      <Button size="sm" className="h-8 self-end"
                        disabled={!newZone || !newZoneAgency || zoneMapSaving}
                        onClick={() => {
                          const mru = newZone.trim().toUpperCase()
                          const updated = [
                            ...zoneMapRows.filter(r => r.zone !== mru),
                            { zone: mru, agency: newZoneAgency.toUpperCase(), address: newZoneAddress },
                          ].sort((a, b) => a.zone.localeCompare(b.zone))
                          saveZoneMap(updated)
                          setNewZone(""); setNewZoneAgency(""); setNewZoneAddress("")
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  )}

                  {/* Bulk CSV/Excel upload */}
                  {zoneUploadMode === "csv" && (
                    <div className="space-y-2">
                      <Input type="file" accept=".csv,.xlsx,.xls,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setZoneUploadFileName(file.name)
                          if (/\.(xlsx|xls)$/i.test(file.name)) {
                            const reader = new FileReader()
                            reader.onload = async (ev) => {
                              const XLSX = await import("xlsx")
                              const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: "array" })
                              const ws = wb.Sheets[wb.SheetNames[0]]
                              const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][]
                              const parsed = rows.slice(1).map(r => ({
                                zone:    String(r[0] || "").trim().toUpperCase(), // full MRU, no truncation
                                agency:  String(r[1] || "").trim().toUpperCase(),
                                address: String(r[2] || "").trim(),
                              })).filter(r => r.zone && r.agency)
                              setZoneUploadRows(parsed)
                            }
                            reader.readAsArrayBuffer(file)
                          } else {
                            parseZoneCsv(file)
                          }
                        }}
                      />
                      {zoneUploadFileName && <p className="text-xs text-gray-500">{zoneUploadFileName}</p>}
                      {zoneUploadRows.length > 0 && (
                        <Button size="sm" disabled={zoneMapSaving}
                          onClick={() => {
                            const incoming = new Map(zoneUploadRows.map(r => [r.zone, r]))
                            const merged = [
                              ...zoneMapRows.filter(r => !incoming.has(r.zone)),
                              ...zoneUploadRows,
                            ].sort((a, b) => a.zone.localeCompare(b.zone))
                            saveZoneMap(merged)
                            setZoneUploadRows([]); setZoneUploadFileName("")
                          }}
                        >
                          {zoneMapSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Saving {zoneUploadRows.length} mappings...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-1" />
                              Apply {zoneUploadRows.length} mappings
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                  {zoneMapSaving && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving and synchronizing zone mappings with Google Sheets, please wait...
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Zone view table — always shown, even when empty */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* MRU Search */}
              <div className="relative">
                <Input
                  placeholder="Search MRU / zone…"
                  value={mruSearch}
                  onChange={(e) => setMruSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                {mruSearch && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    onClick={() => setMruSearch("")}>✕</button>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2">
                  <Button size="sm" variant={zoneViewMode === "agency" ? "default" : "outline"} onClick={() => setZoneViewMode("agency")}>By Agency</Button>
                  <Button size="sm" variant={zoneViewMode === "flat" ? "default" : "outline"} onClick={() => setZoneViewMode("flat")}>All Zones</Button>
                </div>
                {zoneViewMode === "agency" && zoneMapRows.length > 0 && (
                  <Select value={zoneAgencyFilter} onValueChange={setZoneAgencyFilter}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Agencies</SelectItem>
                      {Array.from(new Set(zoneMapRows.map(r => r.agency))).sort().map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {zoneMapRows.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No zone mappings yet. Add one above.</p>
              )}

              {(() => {
                // Apply MRU search filter once, shared by both views
                const searchLc = mruSearch.trim().toLowerCase()
                const visibleRows = searchLc
                  ? zoneMapRows.filter(r =>
                      r.zone.toLowerCase().includes(searchLc) ||
                      r.agency.toLowerCase().includes(searchLc) ||
                      (r.address || "").toLowerCase().includes(searchLc)
                    )
                  : zoneMapRows

                if (visibleRows.length === 0 && mruSearch) {
                  return <p className="text-xs text-gray-400 text-center py-2">No zones match &quot;{mruSearch}&quot;</p>
                }

                return (
                  <>
                    {/* Flat table */}
                    {zoneViewMode === "flat" && visibleRows.length > 0 && (
                      <div className="border rounded-md overflow-auto max-h-80">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Zone / MRU</TableHead>
                              <TableHead className="text-xs">Agency</TableHead>
                              <TableHead className="text-xs">Address / Area</TableHead>
                              <TableHead className="text-xs">Updated</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleRows.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{row.zone}</TableCell>
                                <TableCell className="text-xs">{row.agency}</TableCell>
                                <TableCell className="text-xs text-gray-500 max-w-[160px] truncate">{row.address || "—"}</TableCell>
                                <TableCell className="text-xs text-gray-400">{row.updatedOn || "—"}</TableCell>
                                <TableCell>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                                    onClick={() => saveZoneMap(zoneMapRows.filter(r => r.zone !== row.zone || r.agency !== row.agency))}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Agency-wise grouped */}
                    {zoneViewMode === "agency" && visibleRows.length > 0 && (
                      <ZoneAgencyGrouped
                        zoneMapRows={visibleRows}
                        agencyFilter={zoneAgencyFilter}
                        onDelete={(zone, agency) => saveZoneMap(zoneMapRows.filter(r => !(r.zone === zone && r.agency === agency)))}
                      />
                    )}
                  </>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}
      {view === "roles" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold">Manage Roles & Permissions</h2>
              <p className="text-sm text-gray-500 mt-1">Configure module-level actions for roles</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Role name..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="h-9 w-40 text-xs"
              />
              <Button size="sm" onClick={createNewRole} disabled={!newRoleName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add Role
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Sidebar roles list */}
            <Card className="md:col-span-1">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Available Roles</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {roles.map((r) => (
                  <div
                    key={r.role}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs font-semibold ${
                      selectedRole === r.role
                        ? "bg-blue-100 text-blue-800"
                        : "hover:bg-gray-100 text-gray-700"
                    }`}
                    onClick={() => setSelectedRole(r.role)}
                  >
                    <span className="capitalize">{r.role}</span>
                    {r.role !== "admin" && (
                      <button
                        className="text-gray-400 hover:text-red-500 p-0.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteRole(r.role)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Permissions Checkbox Grid */}
            <Card className="md:col-span-3">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">
                    Permissions Grid for: <span className="capitalize font-bold text-blue-700">{selectedRole}</span>
                  </CardTitle>

                  {selectedRole !== "admin" && (
                    <Select onValueChange={(tplKey) => {
                      const tpl = ROLE_TEMPLATES[tplKey]
                      if (tpl) {
                        setRoles(prev => prev.map(x => x.role === selectedRole ? { ...x, ...tpl } : x))
                        setMessage({ type: "success", text: `Loaded '${tplKey}' template presets for ${selectedRole}. Click 'Save Grid' to apply.` })
                      }
                    }}>
                      <SelectTrigger className="h-7 w-44 text-xs bg-slate-50 border-slate-200 font-semibold">
                        <SelectValue placeholder="Load Role Template…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="executive" className="text-xs">Executive / Officer</SelectItem>
                        <SelectItem value="agency" className="text-xs">Field Agency (Site)</SelectItem>
                        <SelectItem value="store_keeper" className="text-xs">Store Keeper</SelectItem>
                        <SelectItem value="reader" className="text-xs">Inspector / Reader</SelectItem>
                        <SelectItem value="viewer" className="text-xs">Viewer (Read Only)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedRole !== "admin" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const r = roles.find((x) => x.role === selectedRole)
                      if (r) {
                        const { role, ...perms } = r
                        saveRolePermissions(selectedRole, perms)
                      }
                    }}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save Grid
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {(() => {
                  const roleData = roles.find((x) => x.role === selectedRole)
                  if (!roleData) return <div className="p-4 text-center text-xs text-gray-500">Select a role</div>

                  // Compute effective permissions (including defaults) for display
                  const { role: roleName, ...rawPerms } = roleData
                  const effectivePerms = expandRolePermissions(roleName, rawPerms)

                  // Helper: check if a module's permissions are coming from defaults (not explicitly saved)
                  const isDefaultPerm = (mod: string, act: string) => {
                    const raw = rawPerms[mod] || []
                    const eff = effectivePerms[mod] || []
                    return !raw.includes(act) && eff.includes(act)
                  }

                  const modulesList = [
                    { id: "disconnection", name: "Disconnection" },
                    { id: "reconnection", name: "Reconnection" },
                    { id: "deemed", name: "Deemed Visit" },
                    { id: "dtr", name: "DTR Verification" },
                    { id: "dtr_painting", name: "DTR Painting" },
                    { id: "safety", name: "Safety Inspection" },
                    { id: "misc_inspection", name: "Misc Inspections" },
                    { id: "icds", name: "ICDS Electrification" },
                    { id: "meter", name: "Meter Management" },
                    { id: "meter_replacement", name: "Replacement List" },
                    { id: "permanent_disconnection", name: "Permanent Disconnection" },
                    { id: "nsc", name: "NSC Management" },
                    { id: "consumer_master", name: "Consumer Master" },
                    { id: "material", name: "Material Management" },
                    { id: "osd", name: "Live OSD Check" },
                    { id: "admin", name: "Admin Panel" },
                  ]

                  const togglePerm = (mod: string, act: string) => {
                    if (selectedRole === "admin") return

                    const cur = roleData[mod] || []
                    const next = cur.includes(act)
                      ? cur.filter((x: string) => x !== act)
                      : [...cur, act]

                    setRoles((prev) =>
                      prev.map((x) =>
                        x.role === selectedRole ? { ...x, [mod]: next } : x
                      )
                    )
                  }

                  return (
                    <div className="overflow-x-auto p-4 space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-1/3">Standard Modules</TableHead>
                            <TableHead className="text-xs text-center">Read (View)</TableHead>
                            <TableHead className="text-xs text-center">Create (+ Add)</TableHead>
                            <TableHead className="text-xs text-center">Update Status</TableHead>
                            <TableHead className="text-xs text-center">Delete</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {modulesList.filter(m => !["nsc", "meter_replacement", "icds", "permanent_disconnection"].includes(m.id)).map((mod) => {
                            const effPerms = effectivePerms[mod.id] || []
                            return (
                              <TableRow key={mod.id}>
                                <TableCell className="text-xs font-semibold text-gray-800">{mod.name}</TableCell>
                                {["read", "create", "update", "delete"].map((actId) => {
                                  const checked = effPerms.includes(actId)
                                  const isDefault = isDefaultPerm(mod.id, actId)
                                  const disabled = selectedRole === "admin"
                                  return (
                                    <TableCell key={actId} className="text-center py-2">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={disabled}
                                          onChange={() => togglePerm(mod.id, actId)}
                                          className={`h-4 w-4 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50 cursor-pointer ${isDefault ? "accent-amber-500" : "text-blue-600"}`}
                                        />
                                        {isDefault && <span className="text-[9px] text-amber-600 font-medium leading-none">default</span>}
                                      </div>
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>

                      {/* Granular Sub-Actions Section for Workflow Modules */}
                      <div className="pt-2 border-t space-y-4">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Workflow Specific Sub-Action Permissions</h4>
                        
                        {/* Permanent Disconnection Granular */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-rose-800">Permanent Disconnection (PD) Flow Sub-Actions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                            {[
                              { id: "read", label: "Read (View Only)" },
                              { id: "create", label: "Propose for PD" },
                              { id: "issue", label: "Issue to Agency" },
                              { id: "install", label: "Mark Disconnected (Site)" },
                              { id: "return", label: "Return Meter to Store" },
                              { id: "finalize", label: "Add / Edit Note Sheet" },
                            ].map(sub => {
                              const checked = (effectivePerms["permanent_disconnection"] || []).includes(sub.id)
                              const isDefault = isDefaultPerm("permanent_disconnection", sub.id)
                              return (
                                <label key={sub.id} className={`flex items-center gap-2 p-1.5 bg-white rounded border cursor-pointer hover:bg-rose-50/50 ${isDefault ? "border-amber-300" : "border-slate-200"}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={selectedRole === "admin"}
                                    onChange={() => togglePerm("permanent_disconnection", sub.id)}
                                    className={`h-3.5 w-3.5 rounded ${isDefault ? "accent-amber-500" : "text-rose-600"}`}
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{sub.label}</span>
                                  {isDefault && <span className="text-[9px] text-amber-600 font-medium ml-auto">default</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {/* ICDS Electrification Granular */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-emerald-800">ICDS Electrification Flow Sub-Actions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                              { id: "read", label: "Read (View Centers & Reports)" },
                              { id: "create", label: "Create / Bulk Upload Centers" },
                              { id: "update", label: "Edit Master Data (Pencil)" },
                              { id: "delete", label: "Delete Center Record" },
                              { id: "inspect", label: "Stage 1: Primary Feasibility Inspection" },
                              { id: "process", label: "Stage 2: Admin CRM & WO Issue" },
                              { id: "execute", label: "Stage 3: Physical Meter & CSR Wiring" },
                              { id: "certify", label: "Stage 4: Handover & PDF Certificate" },
                            ].map(sub => {
                              const checked = (effectivePerms["icds"] || []).includes(sub.id)
                              const isDefault = isDefaultPerm("icds", sub.id)
                              return (
                                <label key={sub.id} className={`flex items-center gap-2 p-1.5 bg-white rounded border cursor-pointer hover:bg-emerald-50/50 ${isDefault ? "border-amber-300" : "border-slate-200"}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={selectedRole === "admin"}
                                    onChange={() => togglePerm("icds", sub.id)}
                                    className={`h-3.5 w-3.5 rounded ${isDefault ? "accent-amber-500" : "text-emerald-600"}`}
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{sub.label}</span>
                                  {isDefault && <span className="text-[9px] text-amber-600 font-medium ml-auto">default</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {/* NSC Granular */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-blue-800">NSC Management Sub-Actions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                              { id: "read", label: "Read (View Only)" },
                              { id: "create", label: "Create Application (+ Add NSC)" },
                              { id: "inspect", label: "Start Site Inspection" },
                              { id: "process", label: "Process & Sanction Application" },
                              { id: "project_create", label: "Create Project (NPC/...)" },
                              { id: "po_entry", label: "Enter PO Number" },
                              { id: "agency_complete", label: "Mark Project Work Complete" },
                              { id: "admin_approve", label: "Approve Project Completion" },
                            ].map(sub => {
                              const checked = (effectivePerms["nsc"] || []).includes(sub.id)
                              const isDefault = isDefaultPerm("nsc", sub.id)
                              return (
                                <label key={sub.id} className={`flex items-center gap-2 p-1.5 bg-white rounded border cursor-pointer hover:bg-blue-50/50 ${isDefault ? "border-amber-300" : "border-slate-200"}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={selectedRole === "admin"}
                                    onChange={() => togglePerm("nsc", sub.id)}
                                    className={`h-3.5 w-3.5 rounded ${isDefault ? "accent-amber-500" : "text-blue-600"}`}
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{sub.label}</span>
                                  {isDefault && <span className="text-[9px] text-amber-600 font-medium ml-auto">default</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {/* Meter Replacement Granular */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-purple-800">Meter Replacement Sub-Actions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                            {[
                              { id: "read", label: "Read (View Only)" },
                              { id: "create", label: "Propose Meter Replacement" },
                              { id: "issue", label: "Issue Meter from Stock" },
                              { id: "install", label: "Mark Installed (Site)" },
                              { id: "return", label: "Return Meter to Store" },
                              { id: "finalize", label: "Finalize Replacement" },
                            ].map(sub => {
                              const checked = (effectivePerms["meter_replacement"] || []).includes(sub.id)
                              const isDefault = isDefaultPerm("meter_replacement", sub.id)
                              return (
                                <label key={sub.id} className={`flex items-center gap-2 p-1.5 bg-white rounded border cursor-pointer hover:bg-purple-50/50 ${isDefault ? "border-amber-300" : "border-slate-200"}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={selectedRole === "admin"}
                                    onChange={() => togglePerm("meter_replacement", sub.id)}
                                    className={`h-3.5 w-3.5 rounded ${isDefault ? "accent-amber-500" : "text-purple-600"}`}
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{sub.label}</span>
                                  {isDefault && <span className="text-[9px] text-amber-600 font-medium ml-auto">default</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Change Password Dialog */}
      <Dialog open={!!changingPasswordUser} onOpenChange={(open) => { if (!open) setChangingPasswordUser(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password — {changingPasswordUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showChangePwdField ? "text" : "password"}
                  value={changePasswordValue}
                  onChange={(e) => setChangePasswordValue(e.target.value)}
                  placeholder="Enter new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowChangePwdField(!showChangePwdField)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showChangePwdField ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showChangePwdConfirm ? "text" : "password"}
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowChangePwdConfirm(!showChangePwdConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showChangePwdConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {changePasswordValue && changePasswordConfirm && changePasswordValue !== changePasswordConfirm && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setChangingPasswordUser(null)}>Cancel</Button>
            <Button
              onClick={changePassword}
              disabled={!changePasswordValue || !changePasswordConfirm || changePasswordValue !== changePasswordConfirm}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ZoneAgencyGrouped({
  zoneMapRows,
  agencyFilter,
  onDelete,
}: {
  zoneMapRows: { zone: string; agency: string; address?: string; updatedOn?: string }[]
  agencyFilter: string
  onDelete: (zone: string, agency: string) => void
}) {
  const agencyNames = Array.from(new Set(zoneMapRows.map(r => r.agency))).sort()
  const filtered = agencyFilter === "All" ? agencyNames : agencyNames.filter(a => a === agencyFilter)
  return (
    <div className="space-y-4">
      {filtered.map(agencyName => {
        const rows = zoneMapRows.filter(r => r.agency === agencyName)
        return (
          <div key={agencyName}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{agencyName}</span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{rows.length} zones</span>
            </div>
            <div className="border rounded-md overflow-auto max-h-52">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1">Zone / MRU</TableHead>
                    <TableHead className="text-xs py-1">Address / Area</TableHead>
                    <TableHead className="text-xs py-1">Updated</TableHead>
                    <TableHead className="w-10 py-1"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs py-1">{row.zone}</TableCell>
                      <TableCell className="text-xs text-gray-500 py-1 max-w-[200px] truncate">{row.address || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-400 py-1">{row.updatedOn || "—"}</TableCell>
                      <TableCell className="py-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                          onClick={() => onDelete(row.zone, agencyName)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DashboardCard({
  icon,
  bgColor = "bg-slate-50",
  title,
  onClick,
}: {
  icon: React.ReactNode
  bgColor?: string
  title: string
  onClick: () => void
}) {
  return (
    <div
      onClick={() => {
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
        onClick()
      }}
      className="group relative cursor-pointer transition-all duration-300 hover:-translate-y-1 active:scale-95 rounded-2xl bg-gradient-to-b from-white via-white to-slate-50/80 border border-black/[0.08] hover:border-black/[0.22] shadow-[0_4px_12px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-3.5 md:p-6 flex flex-col justify-between md:justify-center md:items-center md:text-center min-h-[96px] md:min-h-[175px] select-none overflow-hidden"
    >
      {/* Icon Container */}
      <div className="flex items-start md:items-center justify-between md:justify-center w-full">
        <div className={`w-10 h-10 md:w-16 md:h-16 rounded-[10px] md:rounded-2xl ${bgColor} border border-black/[0.04] flex items-center justify-center shrink-0 shadow-2xs transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 [&_svg]:h-5 [&_svg]:w-5 md:[&_svg]:h-8 md:[&_svg]:w-8`}>
          {icon}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug mt-2 md:mt-4 tracking-tight line-clamp-2">
        {title}
      </h3>
    </div>
  )
}