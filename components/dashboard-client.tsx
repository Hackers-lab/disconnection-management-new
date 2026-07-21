"use client"

import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { getFromCache, saveToCache, getCccPrefix } from "@/lib/indexed-db"
import { logout } from "@/app/actions/auth"
import { DashboardShell } from "@/components/dashboard-shell"
import { ViewType } from "@/components/app-sidebar"
import { DashboardProvider } from "@/components/dashboard-context"
import { DashboardMenu } from "@/components/dashboard-menu" 
import type { ConsumerData } from "@/lib/google-sheets"
// Heavy libraries loaded dynamically in download functions
// import jsPDF / autoTable / XLSX — see handleDownloadConfirm, generateStatusReport, downloadPDF

// Lazy-load view components to reduce initial bundle from ~3800 to ~800 modules
const ConsumerList = dynamic(() => import("@/components/consumer-list").then(m => ({ default: m.ConsumerList })), { ssr: false })
const AdminPanel = dynamic(() => import("@/components/admin-panel").then(m => ({ default: m.AdminPanel })), { ssr: false })
const DDList = dynamic(() => import("@/components/dd-list").then(m => ({ default: m.DDList })), { ssr: false })
const AnalysisDashboard = dynamic(() => import("@/components/analysis-dashboard").then(m => ({ default: m.AnalysisDashboard })), { ssr: false })
const ReconnectionList = dynamic(() => import("@/components/reconnection-list").then(m => ({ default: m.ReconnectionList })), { ssr: false })
const MeterList = dynamic(() => import("@/components/meter-list").then(m => ({ default: m.MeterList })), { ssr: false })
const NscList = dynamic(() => import("@/components/nsc-list").then(m => ({ default: m.NscList })), { ssr: false })
const AgencyUpdatesReport = dynamic(() => import("@/components/agency-updates-report").then(m => ({ default: m.AgencyUpdatesReport })), { ssr: false })
const ConsumerMaster = dynamic(() => import("@/components/consumer-master").then(m => ({ default: m.ConsumerMaster })), { ssr: false })
const DTRList = dynamic(() => import("@/components/dtr-list").then(m => ({ default: m.DTRList })), { ssr: false })
const DTRPaintingList = dynamic(() => import("@/components/dtr-painting-list").then(m => ({ default: m.DTRPaintingList })), { ssr: false })
const MeterReplacementList = dynamic(() => import("@/components/meter-replacement-list").then(m => ({ default: m.MeterReplacementList })), { ssr: false })
const MaterialList = dynamic(() => import("@/components/material-list").then(m => ({ default: m.MaterialList })), { ssr: false })

import { Loader2, AlertTriangle, KeyRound, CheckCircle2, User, ArrowLeft } from "lucide-react"

// UI Components for the Dialog
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Helper type for PDF generation
type TableCell = string | { content: string; colSpan?: number; styles?: any };

interface DashboardClientProps {
  role: string
  agencies: string[]
}

export default function DashboardClient({ role, agencies }: DashboardClientProps) {
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [activeView, setActiveViewInternal] = useState<ViewType | "home">("home")
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)

  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(true)
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState("")
  const [profileName, setProfileName] = useState("")
  const [bypassSubscription, setBypassSubscription] = useState(false)
  const [profileCccCode, setProfileCccCode] = useState("")

  // Check if tenant is linked to Google Drive/Sheets on mount
  useEffect(() => {
    if (role !== "admin") return
    const checkTenantStatus = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const isSuccess = params.get("success") === "true"
        const url = isSuccess ? "/api/admin/tenant-status?bypassCache=true" : "/api/admin/tenant-status"
        
        const res = await fetch(url)
        if (res.ok) {
          const status = await res.json()
          if (status && status.linked === false) {
            setShowOnboardingModal(true)
          }
        }
      } catch (e) {
        console.error("Failed to check tenant status", e)
      }
    }
    checkTenantStatus()
  }, [role])

  // Check for success=true query parameter on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("success") === "true") {
        setShowSuccessModal(true)
        // Clean up search params to avoid popping up again on refresh
        const cleanUrl = window.location.pathname + window.location.hash
        window.history.replaceState(null, "", cleanUrl)
      }
    }
  }, [])

  // Handle setting active view and updating hash/history
  const setActiveView = (newView: ViewType | "home") => {
    setActiveViewInternal(newView)
    if (typeof window === "undefined") return

    const expectedHash = newView === "home" ? "" : `#${newView}`
    const currentHash = window.location.hash
    const currentBaseHash = currentHash.split("/")[0]

    if (currentBaseHash !== expectedHash) {
      if (newView === "home") {
        window.history.pushState(null, "", window.location.pathname)
      } else {
        window.history.pushState(null, "", expectedHash)
      }
    }
  }

  // Sync activeView with hash on mount/popstate/hashchange
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleHashChange = () => {
      const hash = window.location.hash.substring(1) // e.g. "reconnection/create"
      const [hashModule] = hash.split("/")

      if (hashModule) {
        if (hashModule !== activeView) {
          setActiveViewInternal(hashModule as ViewType | "home")
        }
      } else {
        if (activeView !== "home") {
          setActiveViewInternal("home")
        }
      }
    }

    // Set initial view from hash if present
    handleHashChange()

    window.addEventListener("hashchange", handleHashChange)
    window.addEventListener("popstate", handleHashChange)
    return () => {
      window.removeEventListener("hashchange", handleHashChange)
      window.removeEventListener("popstate", handleHashChange)
    }
  }, [activeView])

  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [permsLoaded, setPermsLoaded] = useState(false)
  const [loadingText, setLoadingText] = useState("Securing connection...")

  // Cycle loading text messages dynamically
  useEffect(() => {
    if (permsLoaded) return
    const messages = [
      "Securing connection...",
      "Fetching role configurations...",
      "Authorizing workspace modules...",
      "Decrypting access tokens...",
      "Preparing dashboard workspace...",
      "Validating active sessions..."
    ]
    let idx = 0
    const interval = setInterval(() => {
      idx = (idx + 1) % messages.length
      setLoadingText(messages[idx])
    }, 1000)
    return () => clearInterval(interval)
  }, [permsLoaded])

  // Fetch dynamic permissions map
  useEffect(() => {
    let active = true

    // Load cached permissions from sessionStorage
    try {
      const cached = sessionStorage.getItem("user_permissions")
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed) {
          setPermissions(parsed)
          setPermsLoaded(true)
        }
      }
    } catch (e) {
      console.error("Failed to read permissions from sessionStorage", e)
    }

    fetch("/api/auth/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) {
          if (data?.permissions) {
            setPermissions(data.permissions)
            try {
              sessionStorage.setItem("user_permissions", JSON.stringify(data.permissions))
            } catch (e) {
              console.error("Failed to save permissions to sessionStorage", e)
            }
          }
          if (data && typeof data.isSubscribed === "boolean") {
            setIsSubscribed(data.isSubscribed)
            setSubscriptionExpiresAt(data.subscriptionExpiresAt || "")
            setProfileName(data.name || "")
            setBypassSubscription(!!data.bypassSubscription)
            setProfileCccCode(data.cccCode || "")
            try {
              localStorage.setItem("user_ccc_code", data.cccCode || "")
              sessionStorage.setItem("user_ccc_code", data.cccCode || "")
            } catch (e) {
              console.error("Failed to save cccCode to storage", e)
            }
          }
        }
      })
      .catch((e) => console.error("Failed to load permissions", e))
      .finally(() => {
        if (active) setPermsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])
  
  // --- DOWNLOAD DIALOG STATE ---
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false)
  const [downloadCount, setDownloadCount] = useState("50")
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "excel">("pdf")
  // "defaulters" = top-N OSD; "remarks" = group-by-remarks with date filter
  const [reportType, setReportType] = useState<"defaulters" | "status">("defaulters")
  const [remarksDateFrom, setRemarksDateFrom] = useState("")
  const [remarksDateTo, setRemarksDateTo] = useState("")

  // Reference to ConsumerList to access data
  const consumerListRef = useRef<{ getCurrentConsumers: () => ConsumerData[] }>(null)

  // Daily session heartbeat — logs once per day for users who stay logged in.
  // Gate client-side on localStorage so we don't even invoke the function on
  // repeat dashboard mounts within the same day (server also no-ops via cookie).
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0]
    if (localStorage.getItem("_hb_date") === today) return
    fetch("/api/auth/heartbeat")
      .then(() => localStorage.setItem("_hb_date", today))
      .catch(() => {})
  }, [])

  // Background prefetch: warm up IndexedDB as soon as user is on dashboard
  useEffect(() => {
    const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
    const CACHE_KEY = "consumers_data_cache"
    const ROW_COUNT_KEY = `${prefix}consumer_row_count`
    const CONSUMER_VERSION_KEY = `${prefix}consumer_version_hash`
    const BASE_DATE_KEY = "consumers_base_date"

    async function prefetch() {
      try {
        const [cachedData, countRes] = await Promise.all([
          getFromCache<any[]>(CACHE_KEY),
          fetch("/api/system/row-count?type=consumer"),
        ])
        if (!countRes.ok) return
        const { count: serverCount, version: serverVersion } = await countRes.json()
        const localCount = parseInt(localStorage.getItem(ROW_COUNT_KEY) || "0")
        const localVersion = localStorage.getItem(CONSUMER_VERSION_KEY) || null
        const needsUpdate = !cachedData || cachedData.length === 0 || serverCount !== localCount || serverVersion !== localVersion
        if (!needsUpdate) return

        const baseRes = await fetch(`/api/consumers/base?v=${serverCount}`)
        if (!baseRes.ok) return
        const cacheControl = baseRes.headers.get("Cache-Control")
        const baseData = await baseRes.json()
        await saveToCache(CACHE_KEY, baseData)
        if (cacheControl !== "no-store") {
          await saveToCache(BASE_DATE_KEY, new Date().toISOString().split("T")[0])
          localStorage.setItem(ROW_COUNT_KEY, serverCount.toString())
          if (serverVersion) localStorage.setItem(CONSUMER_VERSION_KEY, serverVersion)
        }
      } catch {
        // Prefetch is best-effort — errors are intentionally swallowed
      }
    }

    prefetch()
  }, [])

  // --- HELPER FUNCTIONS ---
  const calculateAgencyPerformance = (consumers: ConsumerData[]) => {
    const excludedStatuses = ["connected", "not found"];
    return consumers.reduce((acc, c) => {
      const status = (c.disconStatus || "").toLowerCase();
      if (excludedStatuses.includes(status)) return acc;
      const agency = c.agency || "Unknown";
      const amount = Number.parseFloat(c.d2NetOS || "0");
      if (!acc[agency]) acc[agency] = { totalOSD: 0, statusCounts: {}, totalConsumers: 0 };
      acc[agency].totalOSD += amount;
      acc[agency].totalConsumers++;
      acc[agency].statusCounts[status] = (acc[agency].statusCounts[status] || 0) + 1;
      return acc;
    }, {} as Record<string, { totalOSD: number; statusCounts: Record<string, number>; totalConsumers: number }>);
  };

  const getStatusColorForPDF = (status: string) => {
    if (!status) return [200,200,200];
    switch (status.toLowerCase()) {
      case "connected": return [200, 230, 200];
      case "disconnected": return [255, 200, 200];
      case "pending": return [255, 255, 200];
      case "deemed disconnection": return [255, 220, 200];
      case "temprory disconnected": return [220, 200, 255];
      default: return [200, 200, 200];
    }
  };

  // --- 1. OPEN DOWNLOAD DIALOG ---
  const openDownloadDialog = () => {
    if (activeView !== "disconnection" || !consumerListRef.current) {
      alert("Please open the Disconnection List to download data.");
      return;
    }
    const consumers = consumerListRef.current.getCurrentConsumers();
    if (consumers.length === 0) {
      alert("No consumer data available.");
      return;
    }
    setIsDownloadDialogOpen(true);
  };

  // --- 2. EXECUTE DOWNLOAD ---
  const handleDownloadConfirm = async () => {
    const topN = parseInt(downloadCount, 10);
    if (!topN || topN <= 0) {
      alert("Invalid number entered.");
      return;
    }

    if (!consumerListRef.current) return;
    const consumers = [...consumerListRef.current.getCurrentConsumers()];

    // Sort by OSD high → low
    const sorted = consumers.sort((a, b) => 
      Number(b.d2NetOS || 0) - Number(a.d2NetOS || 0)
    );
    const topConsumers = sorted.slice(0, topN);

    if (downloadFormat === "excel") {
      // --- EXCEL LOGIC (dynamic import) ---
      const XLSX = await import("xlsx")
      const excelData = topConsumers.map((c, index) => ({
        "Rank": index + 1,
        "Consumer ID": c.consumerId,
        "Name": c.name,
        "Address": c.address,
        "Mobile": c.mobileNumber,
        "Outstanding Dues": Number(c.d2NetOS || 0),
        "Agency": c.agency,
        "Class": c.baseClass,
        "Status": c.disconStatus,
        "Due Date": c.osDuedateRange,
        "Device": c.device,
        "Meter Reading": c.reading || "-",
        "Notes": c.notes,
      }));

      // Create Worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Auto-width columns (Optional polish)
      const wscols = [
        { wch: 6 },  // Rank
        { wch: 15 }, // ID
        { wch: 25 }, // Name
        { wch: 30 }, // Address
        { wch: 12 }, // Mobile
        { wch: 15 }, // OSD
        { wch: 15 }, // Agency
        { wch: 10 }, // Class
        { wch: 15 }, // Status
        { wch: 15 }, // Due Date
        { wch: 10 }, // Device
        { wch: 12 }, // Meter Reading
        { wch: 30 }, // Notes
      ];
      worksheet['!cols'] = wscols;

      // Create Workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Top Defaulters");
      
      // Download
      XLSX.writeFile(workbook, `Top_${topN}_Defaulters_${new Date().toISOString().slice(0,10)}.xlsx`);

    } else {
      // --- PDF LOGIC (dynamic import) ---
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.setTextColor(40, 53, 147);
      doc.text(`Top ${topN} Defaulters`, doc.internal.pageSize.width / 2, 15, { align: "center" });

      const tableColumn = ["#", "Con ID", "Name", "Address", "Phone", "Device", "Class", "Due Date", "OSD", "Agency", "Status", "Reading", "Notes"];
      const tableRows = topConsumers.map((c, index) => [
        index + 1,
        c.consumerId || "-",
        c.name || "-",
        c.address ? c.address.substring(0, 35) + (c.address.length > 35 ? "..." : "") : "-",
        {
          content: c.mobileNumber || "-",
          styles: { textColor: [0, 0, 255] },
          link: c.mobileNumber ? `tel:${c.mobileNumber}` : undefined
        },
        c.device || "-",
        c.baseClass || "-",
        c.osDuedateRange || "-",
        {
          content: `${Math.round(Number(c.d2NetOS || "0")).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
          styles: { fontStyle: "bold", halign: "right" }
        },
        c.agency || "-",
        {
          content: c.disconStatus || "-",
          styles: { fillColor: getStatusColorForPDF(c.disconStatus), textColor: [0, 0, 0] }
        },
        c.reading || "-",
        { content: c.notes || "-" },
      ]);

      autoTable(doc, {
        startY: 25,
        head: [tableColumn],
        body: tableRows as any,
        styles: { fontSize: 7, font: "helvetica" },
        didDrawPage: function(data) {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
      });

      doc.save(`Top_${topN}_Defaulters_${new Date().toISOString().slice(0,10)}.pdf`);
    }

    // Close dialog
    setIsDownloadDialogOpen(false);
  };

  // --- STATUS REPORT ---
  const generateStatusReport = async () => {
    if (!consumerListRef.current) return;
    let consumers = [...consumerListRef.current.getCurrentConsumers()];

    const normDate = (s: string) => {
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
        const [d, m, y] = s.split("-"); return `${y}-${m}-${d}`;
      }
      const p = new Date(s); return isNaN(p.getTime()) ? null : p.toISOString().slice(0, 10);
    };
    if (remarksDateFrom || remarksDateTo) {
      consumers = consumers.filter(c => {
        const d = normDate(c.disconDate);
        if (!d) return false;
        if (remarksDateFrom && d < remarksDateFrom) return false;
        if (remarksDateTo   && d > remarksDateTo)   return false;
        return true;
      });
    }

    if (consumers.length === 0) {
      alert("No consumers found for the selected date range.");
      return;
    }

    // Group by status
    const groups: Record<string, ConsumerData[]> = {};
    consumers.forEach(c => {
      const key = (c.disconStatus || "Unknown").trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    if (downloadFormat === "excel") {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new();
      // Sheet 1: all rows
      const allRows = consumers.map((c, i) => ({
        "#": i + 1,
        "Consumer ID": /^\d+$/.test(c.consumerId) ? Number(c.consumerId) : c.consumerId,
        "Name": c.name,
        "Address": c.address,
        "Mobile": c.mobileNumber,
        "Agency": c.agency || "-",
        "Class": c.baseClass || "-",
        "Status": c.disconStatus,
        "Discon Date": c.disconDate || "-",
        "OSD (₹)": Number(c.d2NetOS || 0),
        "Paid Amount (₹)": c.paidAmount && c.paidAmount.trim() !== "" ? Number(c.paidAmount) : "",
        "Meter Reading": c.reading || "-",
        "Remarks": c.notes || "-",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), "All Records");

      // Sheet 2: summary per status
      const summaryRows = Object.entries(groups)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([status, rows]) => ({
          "Status": status,
          "Count": rows.length,
          "Total OSD (₹)": rows.reduce((s, c) => s + Number(c.d2NetOS || 0), 0),
          "Total Paid Amount (₹)": rows.reduce((s, c) => s + (c.paidAmount && c.paidAmount.trim() !== "" ? Number(c.paidAmount) : 0), 0),
        }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Status Summary");

      XLSX.writeFile(wb, `Status_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else {
      // PDF — one page per status group
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.width;
      let firstPage = true;

      Object.entries(groups)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([status, rows]) => {
          if (!firstPage) doc.addPage();
          firstPage = false;

          doc.setFontSize(13);
          doc.setTextColor(40, 53, 147);
          doc.text("Status Report", pageW / 2, 12, { align: "center" });

          const dateLabel = (remarksDateFrom || remarksDateTo)
            ? ` | ${remarksDateFrom || "—"} to ${remarksDateTo || "—"}`
            : "";
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}${dateLabel}`, pageW - 14, 12, { align: "right" });

          doc.setFontSize(10);
          doc.setTextColor(30, 30, 30);
          doc.setFont("helvetica", "bold");
          doc.text(`Status: ${status}`, 14, 20);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.text(`${rows.length} consumer(s)  |  Total OSD: ₹${Math.round(rows.reduce((s, c) => s + Number(c.d2NetOS || 0), 0)).toLocaleString("en-IN")}`, 14, 26);

          const cols = ["#", "Con ID", "Name", "Address", "Mobile", "Agency", "Class", "Status", "Date", "OSD", "Reading", "Remarks"];
          const body = rows.map((c, i) => [
            i + 1,
            c.consumerId || "-",
            c.name || "-",
            c.address ? c.address.substring(0, 28) + (c.address.length > 28 ? "…" : "") : "-",
            c.mobileNumber || "-",
            c.agency || "-",
            c.baseClass || "-",
            { content: c.disconStatus || "-", styles: { fillColor: getStatusColorForPDF(c.disconStatus), textColor: [0,0,0] } },
            c.disconDate || "-",
            { content: Math.round(Number(c.d2NetOS||0)).toLocaleString("en-IN"), styles: { fontStyle: "bold", halign: "right" } },
            c.reading || "-",
            { content: (c.notes || "-").substring(0, 35), styles: { fontStyle: "italic" } },
          ]);

          autoTable(doc, {
            startY: 30,
            head: [cols],
            body: body as any,
            styles: { fontSize: 6.5, font: "helvetica" },
            columnStyles: { 3: { cellWidth: 30 }, 11: { cellWidth: 30 } },
            didDrawPage: (data: any) => {
              doc.setFontSize(7);
              doc.setTextColor(120);
              doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 6);
            },
          });
        });

      doc.save(`Status_Report_${new Date().toISOString().slice(0,10)}.pdf`);
    }

    setIsDownloadDialogOpen(false);
  };

  // --- STANDARD REPORT PDF (Unchanged) ---
  const downloadPDF = async () => {
    if (activeView !== "disconnection" || !consumerListRef.current) {
      alert("Please open the Disconnection List to download data.");
      return;
    }
    
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    const consumers = [...consumerListRef.current.getCurrentConsumers()];
    const doc = new jsPDF({ orientation: "landscape" });
    const isAdmin = role === "admin" || role === "viewer" || role === "executive";
    let heading = "Disconnection Summary Dashboard";
    
    const officeCode = consumers.length > 0 ? consumers[0].offCode : "";
    if (officeCode === "6612107") {
      heading = "Kushida";
    } else if (officeCode === "6612104") {
      heading = "Chanchal";
    }
      else if (officeCode === "6612102") {
      heading = "Samsi";
    } else if (officeCode === "6612105") { 
      heading = "Malatipur";
    }

    const sections: { title: string; page: number }[] = [];

    consumers.sort((a, b) => {
      const agencyCompare = (a.agency || "").localeCompare(b.agency || "");
      if (agencyCompare !== 0) return agencyCompare;
      const aOsd = Number.parseFloat(a.d2NetOS || "0");
      const bOsd = Number.parseFloat(b.d2NetOS || "0");
      return bOsd - aOsd;
    });

    const agencyNames = [...new Set(consumers.map(c => c.agency))].filter((a): a is string => typeof a === "string" && !!a);
    const statuses = [...new Set(consumers.map(c => c.disconStatus))].filter(Boolean);
    const totalOSD = consumers.reduce((sum, c) => sum + Number.parseFloat(c.d2NetOS || "0"), 0);

    const formatAgencyNames = (agencies: string[]) => {
      const maxLineLength = 150;
      let result: string[] = [];
      let currentLine = "";
      agencies.forEach((agency, index) => {
        if (currentLine.length + agency.length + 2 > maxLineLength) {
          result.push(currentLine);
          currentLine = agency;
        } else {
          currentLine += (currentLine ? ", " : "") + agency;
        }
        if (index === agencies.length - 1) {
          result.push(currentLine);
        }
      });
      return result;
    };

    if (isAdmin) {
      sections.push({ title: "Summary Dashboard", page: doc.getNumberOfPages() });  

      doc.setFontSize(20);
      doc.setTextColor(40, 53, 147);
      doc.text(`Disconnection Report For ${heading} CCC`, doc.internal.pageSize.width / 2, 20, { align: "center" });

      const agencyLines = formatAgencyNames(agencyNames);
      doc.setFontSize(10);
      doc.setTextColor(81, 81, 81);
      agencyLines.forEach((line, i) => {
        doc.text(`Agencies: ${line}`, doc.internal.pageSize.width / 2, 30 + (i * 5), { align: "center" });
      });

      const statusStats = consumers.reduce((acc, c) => {
        const status = c.disconStatus || "Unknown";
        const amount = Number.parseFloat(c.d2NetOS || "0");
        if (!acc[status]) acc[status] = { count: 0, amount: 0 };
        acc[status].count++;
        acc[status].amount += amount;
        return acc;
      }, {} as Record<string, { count: number; amount: number }>);

      const chartStatuses = Object.keys(statusStats);
      const maxCount = Math.max(...chartStatuses.map(s => statusStats[s].count));
      const chartWidth = 180;
      const chartHeight = 60;
      const chartX = (doc.internal.pageSize.width - chartWidth) / 2;
      const chartY = 60;
      const barWidth = chartWidth / chartStatuses.length;

      doc.setFontSize(12);
      doc.text("Status Overview", doc.internal.pageSize.width / 2, chartY - 10, { align: "center" });

      const colorPalette = [                                                          
        [65, 105, 225], [220, 20, 60], [255, 140, 0], [46, 139, 87],
        [138, 43, 226], [255, 215, 0], [34, 139, 34], [218, 165, 32]
      ];

      chartStatuses.forEach((status, i) => {
        const stat = statusStats[status];
        const barHeight = (stat.count / maxCount) * chartHeight;
        const x = chartX + (i * barWidth);
        const y = chartY + (chartHeight - barHeight);
        const color = colorPalette[i % colorPalette.length];

        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(x, y, barWidth - 5, barHeight, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.rect(x, y, barWidth - 5, barHeight, 'S');

        doc.setFontSize(7);
        doc.text(status.substring(0, 12).toUpperCase(), x + (barWidth/2) - 5, chartY + chartHeight + 5, { 
          align: "center",
          maxWidth: barWidth - 5
        });

        const percentage = ((stat.count / consumers.length) * 100).toFixed(1);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(`${stat.count} (${percentage}%)`, x + (barWidth/2) - 2, y - 5, { align: "center" });

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(
          `${Math.round(stat.amount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`,
          x + (barWidth/2) - 5,
          chartY + chartHeight + 10,
          { align: "center", maxWidth: barWidth - 5 }
        );
      });

      doc.setFontSize(12);
      doc.setFont("helvetica", "italic");
      doc.text(`Total Consumers: ${consumers.length.toLocaleString('en-IN')}`, 30, 150);
      doc.text(`Total Outstanding: ${Math.round(totalOSD).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, 30, 155);
      const formatDate = (date: Date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
      };

      doc.text(
        `Generated on: ${formatDate(new Date())}`, 
        30, 
        160
      );
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.setFont("helvetica", "italic");
      doc.text(`For error reporting contact: je.kushidaccc@gmail.com`, 30, 165);
    }

    const consumersByAgency: Record<string, ConsumerData[]> = {};
    consumers.forEach(c => {
      const agency = c.agency || "Un-Allocated";
      if (!consumersByAgency[agency]) consumersByAgency[agency] = [];
      consumersByAgency[agency].push(c);
    });

    Object.entries(consumersByAgency).forEach(([agency, agencyConsumers]) => {
      sections.push({ title: `Disconnection List - ${agency}`, page: doc.getNumberOfPages() + 1 });
      if(isAdmin){ doc.addPage(); }
      doc.setFontSize(16);
      doc.setTextColor(40, 53, 147);
      doc.text(`${agency} - Disconnection List`, 14, 14);
      doc.setFontSize(10);
      doc.text(`Total Consumers: ${agencyConsumers.length}`, 14, 20);

      const tableColumn = ["#", "Con ID", "Name", "Address", "Phone", "Device", "Class", "Due Date", "OSD", "Status", "Reading", "Remarks"];
      const tableRows = agencyConsumers.map((c, index) => [
        index + 1,
        c.consumerId || "-",
        c.name || "-",
        c.address ? c.address.substring(0, 30) + (c.address.length > 30 ? "..." : "") : "-",
        {
          content: c.mobileNumber || "-",
          styles: { textColor: [0, 0, 255] },
          link: c.mobileNumber ? `tel:${c.mobileNumber}` : undefined
        },
        c.device || "-",
        c.baseClass || "-",
        c.osDuedateRange || "-",
        { content: `${Math.round(Number(c.d2NetOS || "0")).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, styles: { fontStyle: "bold", halign: "right" } },
        { content: c.disconStatus || "-", styles: { fillColor: getStatusColorForPDF(c.disconStatus), textColor: [0,0,0] } },
        c.reading || "-",
        { content: (c.notes || "-").substring(0, 35), styles: { fontStyle: "italic" } },
      ]);

      autoTable(doc, { startY: 25, head: [tableColumn], body: tableRows as any, styles: { fontSize: isAdmin ? 7 : 7, font: "helvetica" },
      didDrawPage: function(data) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        if(isAdmin){
          doc.text(
            `Page ${doc.getNumberOfPages()+1}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        } else {
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text(
          "For error reporting contact: je.kushidaccc@gmail.com",
          doc.internal.pageSize.width - 10,
          doc.internal.pageSize.height - 10,
          { align: "right" }
        );
      }
      });
    });

    if (isAdmin) {
      sections.push({ title: "Agency Performance Ranking", page: doc.getNumberOfPages() + 1 });
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Agency Performance Ranking", doc.internal.pageSize.width / 2, 20, { align: "center" });
      
      const performanceData = calculateAgencyPerformance(consumers);

      const rankedAgencies = Object.entries(performanceData)
        .map(([agency, data]) => ({
          agency,
          ...data
        }))
        .sort((a, b) => b.totalOSD - a.totalOSD);

      const performanceStatuses = [...new Set(
        rankedAgencies.flatMap(a => Object.keys(a.statusCounts))
      )].filter(s => !["connected", "not found"].includes(s.toLowerCase()));

      const performanceRows = [
        [
          "RANK",
          "AGENCY",
          "TOTAL OSD",
          "TOTAL ATTENDED",
          ...performanceStatuses.map(s => s.toUpperCase())
        ],
        ...rankedAgencies.map((agency, index) => [
          index + 1,
          agency.agency,
          `${Math.round(agency.totalOSD).toLocaleString('en-IN', {maximumFractionDigits: 0})}`,
          agency.totalConsumers,
          ...performanceStatuses.map(status => 
            agency.statusCounts[status] || "0"
          )
        ])
      ];

      autoTable(doc, {
        startY: 30,
        head: [performanceRows[0]],
        body: performanceRows.slice(1),
        styles: {
          fontSize: 8,
          cellPadding: 2,
          font: "helvetica"
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: 7,
          fontStyle: "bold"
        },
        columnStyles: {
          0: { cellWidth: 15, halign: "center" },
          1: { cellWidth: 40 },
          2: { cellWidth: 35, halign: "center" },
          3: { cellWidth: 30, halign: "center" },
          ...Object.fromEntries(
            performanceStatuses.map((_, i) => [
              i + 4,
              { cellWidth: 30, halign: "center" }
            ])
          )
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { left: 10, right: 10 },
        didDrawPage: function(data) {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(
            `Page ${doc.getNumberOfPages() + 1}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
      });
    }

    if (isAdmin) {
      sections.push({ title: "Summary Statistics", page: doc.getNumberOfPages() + 1 });
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Summary Statistics", doc.internal.pageSize.width / 2, 20, { align: "center" });

      const crossTabData: Record<string, Record<string, { count: number; amount: number }>> = {};
      
      agencyNames.forEach(agency => {
        crossTabData[agency] = {};
        statuses.forEach(status => {
          crossTabData[agency][status] = { count: 0, amount: 0 };
        });
      });

      consumers.forEach(c => {
        const agency = c.agency || "Unknown";
        const status = c.disconStatus || "Unknown";
        const amount = Number.parseFloat(c.d2NetOS || "0");
        
        if (!crossTabData[agency]) {
          crossTabData[agency] = {};
        }
        if (!crossTabData[agency][status]) {
          crossTabData[agency][status] = { count: 0, amount: 0 };
        }
        
        crossTabData[agency][status].count++;
        crossTabData[agency][status].amount += amount;
      });

      const summaryRows: any[] = [];
      const headerRow: TableCell[] = ["Agency"];
      
      statuses.forEach(status => {
        headerRow.push({
          content: status.toUpperCase(),
          colSpan: 2,
          styles: {
            halign: 'center',
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold'
          }
        });
      });

      headerRow.push("Total Count", "Total Amount");

      const subHeaderRow = [""];
      statuses.forEach(() => {
        subHeaderRow.push("Count", "Amount");
      });
      subHeaderRow.push("Count", "Amount");

      summaryRows.push(headerRow);
      summaryRows.push(subHeaderRow);

      agencyNames.forEach(agency => {
        const row = [agency];
        let agencyTotalCount = 0;
        let agencyTotalAmount = 0;
        
        statuses.forEach(status => {
          const stat = crossTabData[agency][status] || { count: 0, amount: 0 };
          row.push(stat.count.toString());
          row.push(`${Math.round(stat.amount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
          agencyTotalCount += stat.count;
          agencyTotalAmount += stat.amount;
        });
        
        row.push(agencyTotalCount.toString());
        row.push(`${Math.round(agencyTotalAmount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
        summaryRows.push(row);
      });

      const footerRow = ["Grand Total"];
      let grandTotalCount = 0;
      let grandTotalAmount = 0;

      statuses.forEach(status => {
        const statusTotalCount = agencyNames.reduce((sum, agency) => 
          sum + ((crossTabData[agency][status]?.count) || 0), 0);
        const statusTotalAmount = agencyNames.reduce((sum, agency) => 
          sum + ((crossTabData[agency][status]?.amount) || 0), 0);
        
        footerRow.push(statusTotalCount.toString());
        footerRow.push(`${Math.round(statusTotalAmount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
        grandTotalCount += statusTotalCount;
        grandTotalAmount += statusTotalAmount;
      });

      footerRow.push(grandTotalCount.toString());
      footerRow.push(`${Math.round(grandTotalAmount).toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
      summaryRows.push(footerRow);

      autoTable(doc, {
        startY: 30,
        head: [summaryRows[0]],
        body: [summaryRows[1], ...summaryRows.slice(2, -1)],
        foot: [summaryRows[summaryRows.length - 1]],
        styles: { 
          fontSize: 7,
          cellPadding: 3,
          font: "helvetica",
          lineWidth: 0.1,
          lineColor: [200, 200, 200]
        },
        headStyles: { 
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: 7,
          fontStyle: "bold",
          cellPadding: 4
        },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        footStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: 7,
          fontStyle: "bold",
          cellPadding: 4
        },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: "bold", halign: "left" },
          ...Object.fromEntries(
            Array.from({ length: statuses.length * 2 + 2 }, (_, i) => 
              [i * 2 + 1, { halign: "right" }]
            )
          )
        },
        margin: { left: 10, right: 10 },
        tableWidth: "auto",
        theme: "grid",
      });
    }

    if (isAdmin) {
      doc.insertPage(1);
      doc.setFontSize(20);
      doc.setTextColor(40, 53, 147);
      doc.text(`Disconnection Report for ${heading} CCC`, doc.internal.pageSize.width / 2, 15, { align: "center" });
      doc.setFontSize(20);
      doc.setTextColor(255, 0, 0);
      doc.text(`Table of Contents`, doc.internal.pageSize.width / 2, 25, { align: "center" });

      doc.setFontSize(12);
      doc.setFont("helvetica", "italic");
      let y = 40;
      sections.forEach(s => {
        doc.setTextColor(0, 0, 255);
        doc.textWithLink(`${s.title} ..........Page - ${s.page+1}`, 20, y, { pageNumber: s.page+1 });
        y += 7;
      });
    }

    doc.save(`Disconnection_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const handleAdminClose = () => {
    setShowAdminPanel(false);
    if (activeView === "admin") setActiveView("home");
  }

  if (!permsLoaded) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-slate-950 overflow-hidden select-none">
        {/* Decorative Floating Glowing Blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-300" />
        
        {/* Premium Glassmorphic Card */}
        <div className="relative z-10 px-8 py-10 rounded-3xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 shadow-2xl flex flex-col items-center gap-8 max-w-sm w-full mx-4 transition-all duration-300">
          
          {/* Dynamic Colored Loader Icon */}
          <div className="relative flex items-center justify-center w-24 h-24">
            {/* Outer spinning ring with dual color gradient */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-600 animate-spin p-[3px]">
              <div className="w-full h-full bg-slate-950 rounded-full" />
            </div>
            
            {/* Pulsing inner glow */}
            <div className="absolute w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 opacity-20 blur-md animate-ping" />
            
            {/* Inner dynamic rotating icon */}
            <Loader2 className="relative h-8 w-8 animate-spin text-indigo-400" />
          </div>

          {/* Evolving Text Messages */}
          <div className="text-center space-y-2.5">
            <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase">
              Access Authorization
            </h3>
            <p className="text-xs font-medium text-indigo-300/80 tracking-wide min-h-[16px] transition-all duration-500 animate-pulse">
              {loadingText}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <DashboardProvider value={{ activeView, setActiveView }}>
      <DashboardShell
        role={role}
        agencies={agencies}
        showAdminPanel={showAdminPanel}
        openAdmin={() => setShowAdminPanel(true)}
        closeAdmin={handleAdminClose}
        activeView={activeView}
        setActiveView={setActiveView}
        onDownload={downloadPDF}
        onDownloadDefaulters={openDownloadDialog}
        permissions={permissions}
      >
        {/* DOWNLOAD DIALOG */}
        <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Download Report</DialogTitle>
              <DialogDescription>
                Choose the report type and format.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Report type */}
              <div className="grid gap-2">
                <Label>Report Type</Label>
                <RadioGroup
                  value={reportType}
                  onValueChange={(v: "defaulters" | "status") => setReportType(v)}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="defaulters" id="rt-def" />
                    <Label htmlFor="rt-def">Top Defaulters (by outstanding dues)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="status" id="rt-sta" />
                    <Label htmlFor="rt-sta">Status Report (grouped by status)</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Top-N count — only for defaulters */}
              {reportType === "defaulters" && (
                <div className="grid gap-2">
                  <Label htmlFor="count">Number of Consumers</Label>
                  <Input
                    id="count"
                    type="number"
                    value={downloadCount}
                    onChange={(e) => setDownloadCount(e.target.value)}
                    placeholder="e.g. 50"
                    min="1"
                  />
                </div>
              )}

              {/* Date range — only for status report */}
              {reportType === "status" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="r-from" className="text-xs uppercase text-gray-500">From Date</Label>
                    <Input id="r-from" type="date" value={remarksDateFrom}
                      onChange={(e) => setRemarksDateFrom(e.target.value)} className="h-8" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="r-to" className="text-xs uppercase text-gray-500">To Date</Label>
                    <Input id="r-to" type="date" value={remarksDateTo}
                      onChange={(e) => setRemarksDateTo(e.target.value)} className="h-8" />
                  </div>
                  <p className="col-span-2 text-xs text-gray-400">Leave blank to include all dates.</p>
                </div>
              )}

              {/* Format */}
              <div className="grid gap-2">
                <Label>Format</Label>
                <RadioGroup
                  value={downloadFormat}
                  onValueChange={(val: "pdf" | "excel") => setDownloadFormat(val)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pdf" id="fmt-pdf" />
                    <Label htmlFor="fmt-pdf">PDF</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="excel" id="fmt-excel" />
                    <Label htmlFor="fmt-excel">Excel</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                if (reportType === "status") generateStatusReport();
                else handleDownloadConfirm();
              }}>
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* VIEW SWITCHING LOGIC */}
        
        {activeView === "home" && (
          <DashboardMenu onSelect={setActiveView} userRole={role} userAgencies={agencies} permissions={permissions} />
        )}

        {activeView === "disconnection" && (
          <ConsumerList
            ref={consumerListRef}
            userRole={role}
            userAgencies={agencies}
            onAdminClick={() => setShowAdminPanel(true)}
            showAdminPanel={showAdminPanel}
            onCloseAdminPanel={handleAdminClose}
            onDownload={downloadPDF}
            onDownloadDefaulters={openDownloadDialog}
            onGoToReconnection={() => setActiveView("reconnection")}
          />
        )}

        {activeView === "reconnection" && (
          <ReconnectionList
            userRole={role}
            userAgencies={agencies}
            username={(agencies[0] || role)}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "dtr" && (
          <DTRList
            userRole={role}
            userAgencies={agencies}
            username={(agencies[0] || role)}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "dtr-painting" && (
          <DTRPaintingList
            userRole={role}
            userAgencies={agencies}
            username={(agencies[0] || role)}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "deemed" && (
           <DDList userRole={role} userAgencies={agencies} permissions={permissions} />
        )}

        {activeView === "meter" && (
          <MeterList
            userRole={role}
            userAgencies={agencies}
            username={agencies[0] || role}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "nsc" && (
          <NscList
            userRole={role}
            userAgencies={agencies}
            username={agencies[0] || role}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "agency-updates" && (role === "admin" || role === "executive" || role === "viewer") && (
          <AgencyUpdatesReport userRole={role} />
        )}

        {activeView === "consumer-master" && (role === "admin" || role === "executive" || role === "agency") && (
          <ConsumerMaster role={role} />
        )}

        {activeView === "meter-replacement" && (
          <MeterReplacementList
            userRole={role}
            userAgencies={agencies}
            username={agencies[0] || role}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "material" && (
          <MaterialList
            userRole={role}
            userAgencies={agencies}
            username={agencies[0] || role}
            permissions={permissions}
          />
        )}

        {activeView === "analysis" && role === "admin" && (
           <AnalysisDashboard userRole={role} />
        )}

        {activeView === "admin" && (
           <AdminPanel onClose={() => setActiveView("home")} />
        )}

        {activeView === "profile" && (
          <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-200 pb-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveView("home")} 
                className="h-9 w-9 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Profile</h1>
                <p className="text-sm text-slate-500">Manage account credentials and billing subscriptions.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Profile Details Card */}
              <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-500" />
                  Account Details
                </h2>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-400 font-medium">Full Name:</span>
                  <span className="col-span-2 font-semibold text-slate-800">{profileName || "N/A"}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-400 font-medium">Agency ID:</span>
                  <span className="col-span-2 font-mono font-semibold text-slate-700">{(agencies[0] || role)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-400 font-medium">Subdivision:</span>
                  <span className="col-span-2 font-mono font-semibold text-blue-600">{profileCccCode || "SYSTEM"}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-400 font-medium">Access Role:</span>
                  <span className="col-span-2 capitalize font-semibold text-slate-700">{role}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-400 font-medium">Assigned Scope:</span>
                  <span className="col-span-2 text-xs font-semibold text-slate-700">
                    {agencies && agencies.length > 0 ? agencies.join(", ") : "None (All Access)"}
                  </span>
                </div>
              </div>

              {/* Billing / Subscription Info Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between h-full min-h-[300px]">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                    Subscription Status
                  </h2>
                  <div className="space-y-3">
                    {(() => {
                      const roleLower = role.toLowerCase()
                      const isExempt = roleLower === "admin" || roleLower === "superuser" || roleLower === "monitor" || bypassSubscription
                      const billingStartDate = new Date("2026-09-01T00:00:00")
                      const isTrial = Date.now() < billingStartDate.getTime()

                      if (isExempt) {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                              Bypassed / Free Access
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">Your role or user account has been exempted from billing.</p>
                          </div>
                        )
                      } else if (isTrial) {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 animate-pulse">
                              Trial Period Active
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">Billing starts on <strong>01-09-2026</strong>. You have unrestricted trial access until then.</p>
                          </div>
                        )
                      } else if (isSubscribed) {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Active Subscription
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Expires on: <strong>{subscriptionExpiresAt}</strong>
                            </p>
                          </div>
                        )
                      } else {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-red-50 text-red-700 border border-red-100">
                              Subscription Expired
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">Your subscription is inactive. Please subscribe below to restore full access.</p>
                          </div>
                        )
                      }
                    })()}
                  </div>
                </div>

                {/* Simulated Payment Action inside Profile */}
                {!(role === "admin" || role === "superuser" || role === "monitor" || bypassSubscription) && (
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                    <div className="p-3 rounded-lg border border-indigo-100 bg-indigo-50/20 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Promo Offer</span>
                        <span className="text-lg font-bold text-slate-800">₹99 <span className="text-xs text-slate-400 line-through">₹199</span></span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">/ month</span>
                    </div>
                    <Button 
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/billing/checkout", { method: "POST" })
                          if (res.ok) {
                            const data = await res.json()
                            if (data.success) {
                              window.location.reload()
                            }
                          }
                        } catch (e) {
                          console.error("Simulation failed", e)
                        }
                      }}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold py-2 rounded-lg"
                    >
                      {isSubscribed ? "Extend Subscription" : "Activate Subscription"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Global Onboarding Required Dialog Modal */}
        <Dialog open={showOnboardingModal} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-100 dark" aria-describedby="onboarding-description">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-yellow-500 font-bold text-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-500 animate-bounce" />
                Google Integration Required
              </DialogTitle>
              <DialogDescription id="onboarding-description" className="text-slate-400 pt-2 text-sm leading-relaxed">
                This subdivision Customer Care Center (CCC) has not been linked to a Google Spreadsheet database or Drive folder yet.
                {role === "admin" ? (
                  <>
                    <br /><br />
                    As an <strong>Administrator</strong>, you must authenticate with your Google Account to duplicate the master database template and begin managing consumer records.
                  </>
                ) : (
                  <>
                    <br /><br />
                    Please request an <strong>Administrator</strong> of your office to log in and authorize the application to link your database.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-col">
              {role === "admin" ? (
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2">
                  <a href="/api/auth/google/login">
                    <KeyRound className="h-4 w-4 mr-2" />
                    Link Google Account Now
                  </a>
                </Button>
              ) : (
                <div className="w-full text-center py-2 px-3 bg-slate-800/50 rounded-lg text-slate-400 text-xs italic">
                  Awaiting Admin Authentication
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Global Onboarding Success Dialog Modal */}
        <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
          <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-100 dark" aria-describedby="success-description">
            <DialogHeader className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 mt-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-pulse" />
              </div>
              <DialogTitle className="text-xl font-bold text-slate-100 text-center">
                Onboarding Completed!
              </DialogTitle>
              <DialogDescription id="success-description" className="text-slate-400 pt-2 text-sm leading-relaxed text-center">
                Your subdivision Customer Care Center (CCC) database has been set up successfully.
                <br /><br />
                The system has cloned the master spreadsheet template and created your cloud storage folders. You can now start managing records.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6">
              <Button onClick={() => setShowSuccessModal(false)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2">
                Go to Dashboard Home
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Global Subscription Required Dialog Modal */}
        <Dialog open={!isSubscribed && permsLoaded} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-[425px] bg-slate-950 border-slate-800 text-slate-100 dark backdrop-blur-md" aria-describedby="subscription-description">
            <DialogHeader className="flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 mt-2 border border-indigo-500/20">
                <AlertTriangle className="h-7 w-7 text-indigo-400 animate-pulse" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-slate-100 text-center">
                Workspace Subscription Required
              </DialogTitle>
              <DialogDescription id="subscription-description" className="text-slate-400 pt-2 text-sm leading-relaxed text-center">
                Your account subscription is currently inactive. Please activate to continue accessing your subdivision Customer Care Center (CCC) modules.
              </DialogDescription>
            </DialogHeader>

            {/* Premium Pricing Card */}
            <div className="my-5 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex flex-col items-center justify-center relative overflow-hidden">
              <span className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-bl-lg">
                Save 50%
              </span>
              <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider mb-1">Special Promotional Offer</p>
              <div className="flex items-baseline gap-2.5">
                <span className="text-4xl font-extrabold text-white tracking-tight">₹99</span>
                <span className="text-sm text-slate-400">/ month</span>
                <span className="text-sm text-slate-500 line-through font-medium">₹199</span>
              </div>
              {subscriptionExpiresAt && (
                <span className="block mt-3 text-[10px] text-red-400 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                  Last session expired: {subscriptionExpiresAt}
                </span>
              )}
            </div>

            <DialogFooter className="mt-2 flex flex-col gap-2.5 sm:flex-col w-full">
              <Button 
                onClick={async () => {
                  try {
                    const res = await fetch("/api/billing/checkout", { method: "POST" })
                    if (res.ok) {
                      const data = await res.json()
                      if (data.success) {
                        window.location.reload()
                      }
                    }
                  } catch (e) {
                    console.error("Simulation failed", e)
                  }
                }} 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2.5 rounded-lg shadow-md hover:shadow-indigo-500/10 transition-all duration-200"
              >
                Simulate Payment & Activate
              </Button>
              <Button 
                onClick={async () => {
                  await logout()
                  window.location.href = "/"
                }}
                variant="outline"
                className="w-full bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white font-semibold py-2.5 rounded-lg transition-all duration-150"
              >
                Logout Securely
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </DashboardShell>
    </DashboardProvider>
  )
}