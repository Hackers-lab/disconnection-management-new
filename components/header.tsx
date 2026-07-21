"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import {
  Power,
  HomeIcon,
  User,
  Settings,
  Download,
  LogOut,
  List,
  Building2,
  Calendar,
  Clock,
  LayoutDashboard,
  MoreVertical,
  FileDown,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Eye,
  EyeOff,
  Zap,
  RotateCcw,
  Gauge,
  ClipboardCheck,
  CalendarDays,
  BarChart3,
  Upload,
  Loader2,
} from "lucide-react"
import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AppSidebar, ViewType } from "@/components/app-sidebar"
import { HistoryReportsDialog } from "@/components/history-reports-dialog"
import { useDashboard } from "@/components/dashboard-context"
import { getAgencyDescription } from "@/app/actions/agency-details"
import { getFromCache, saveToCache, clearAllCache, getCccPrefix } from "@/lib/indexed-db"

interface HeaderProps {
  userRole: string
  userAgencies?: string[]
  onAdminClick?: () => void
  onDownload?: () => void
  onDownloadDefaulters?: () => void
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
  permissions?: Record<string, string[]>
}

export function Header({ userRole, userAgencies = [], onAdminClick, onDownload, onDownloadDefaulters, activeView: propsActiveView, setActiveView: propsSetActiveView, permissions }: HeaderProps) {
  const dashboard = useDashboard()
  const setActiveView = dashboard?.setActiveView || propsSetActiveView || (() => {})
  const activeView = dashboard?.activeView || propsActiveView
  const [showAgencyUpdates, setShowAgencyUpdates] = useState(false)
  const [agencyLastUpdates, setAgencyLastUpdates] = useState<{name: string, lastUpdate: string; lastUpdateCount: number}[]>([])
  const [loading, setLoading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportDateRange, setReportDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  })
  const [reportAgency, setReportAgency] = useState<string>("All Agencies")
  const [availableAgencies, setAvailableAgencies] = useState<string[]>(["All Agencies"])
  const [cachedAgencyDescription, setCachedAgencyDescription] = useState<string | null>(null)
  const [showChangePwdDialog, setShowChangePwdDialog] = useState(false)
  const [changePwdCurrent, setChangePwdCurrent] = useState("")
  const [changePwdNew, setChangePwdNew] = useState("")
  const [changePwdConfirm, setChangePwdConfirm] = useState("")
  const [showPwdCurrent, setShowPwdCurrent] = useState(false)
  const [showPwdNew, setShowPwdNew] = useState(false)
  const [showPwdConfirm, setShowPwdConfirm] = useState(false)
  const [changePwdError, setChangePwdError] = useState<string | null>(null)
  const [changePwdSuccess, setChangePwdSuccess] = useState(false)
  const [changePwdLoading, setChangePwdLoading] = useState(false)
  const [showHistoryReportDialog, setShowHistoryReportDialog] = useState(false)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [profileData, setProfileData] = useState<any>(null)

  useEffect(() => {
    console.log("🚀 Disconnection Management Web App - version 1.1.0 loaded");
    fetch("/api/auth/permissions")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setProfileData(data)
      })
      .catch(e => console.error("Failed to load profile", e))
  }, [])



  const openChangePwdDialog = () => {
    setChangePwdCurrent("")
    setChangePwdNew("")
    setChangePwdConfirm("")
    setShowPwdCurrent(false)
    setShowPwdNew(false)
    setShowPwdConfirm(false)
    setChangePwdError(null)
    setChangePwdSuccess(false)
    setShowChangePwdDialog(true)
  }

  const handleChangePassword = async () => {
    if (!changePwdCurrent || !changePwdNew || !changePwdConfirm) {
      setChangePwdError("All fields are required")
      return
    }
    if (changePwdNew !== changePwdConfirm) {
      setChangePwdError("New passwords do not match")
      return
    }
    setChangePwdLoading(true)
    setChangePwdError(null)
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: changePwdCurrent, newPassword: changePwdNew }),
      })
      const data = await res.json()
      if (!res.ok) {
        setChangePwdError(data.error || "Failed to change password")
      } else {
        setChangePwdSuccess(true)
        setTimeout(() => setShowChangePwdDialog(false), 1500)
      }
    } catch {
      setChangePwdError("Failed to change password")
    } finally {
      setChangePwdLoading(false)
    }
  }

  const isDisconnectionView = activeView === "disconnection";
  const isDDView = activeView === 'deemed';
  const showDownloadButton = isDisconnectionView || isDDView || activeView === "nsc";

  // --- Date helpers ---
  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(p => parseInt(p, 10));
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  };
  
  const handleGenerateDDReport = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setLoading(true);

    try {
        const data = await getFromCache<any[]>("dd_data_cache");
        if (!data || data.length === 0) {
            alert("No DD data available to generate a report.");
            setLoading(false);
            return;
        }

        // 1. Filter data based on user role
        const filteredData = (userRole === "admin" || userRole === "viewer")
            ? data
            : data.filter(item => userAgencies.includes(item.agency));
        
        if (filteredData.length === 0) {
            alert("No records found for your agency/agencies.");
            setLoading(false);
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Pop-up blocked. Please allow pop-ups for this site to generate reports.");
            setLoading(false);
            return;
        }

        const getStatusBadge = (status: string) => {
            const s = (status || "").toLowerCase();
            let backgroundColor = "#eff6ff"; // Default blue
            let color = "#1e40af";

            if (s === "deemed disconnected") { backgroundColor = "#fef2f2"; color = "#991b1b"; }
            else if (s === "connected (meter running)" || s === "physically live") { backgroundColor = "#fefce8"; color = "#854d0e"; }
            else if (s === "disconnected (using neighbor source)" || s.includes("enjoying power")) { backgroundColor = "#fff7ed"; color = "#9a3412"; }
            else if (s === "permanently disconnected" || s === "disconnected") { backgroundColor = "#f0fdf4"; color = "#166534"; }
            else if (s === "premises locked") { backgroundColor = "#eff6ff"; color = "#1e40af"; }
            else if (s === "consumer not found" || s === "not found") { backgroundColor = "#f9fafb"; color = "#374151"; }

            return `<span style="background-color: ${backgroundColor}; color: ${color}; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; white-space: nowrap;">${status}</span>`;
        };

        let reportBody = '';

        // 2. Role-based content generation
        if (userRole === "admin" || userRole === "viewer") {
            const groupedByAgency: { [key: string]: any[] } = filteredData.reduce((acc, item) => {
                const agency = item.agency || "Unassigned";
                if (!acc[agency]) acc[agency] = [];
                acc[agency].push(item);
                return acc;
            }, {} as { [key: string]: any[] });

            const agencyKeys = Object.keys(groupedByAgency).sort();

            agencyKeys.forEach((agency, index) => {
                const items = groupedByAgency[agency];
                const isLast = index === agencyKeys.length - 1;
                reportBody += `
                    <div class="report-page ${!isLast ? 'page-break' : ''}">
                        <div class="header">
                            <h1>${agency}</h1>
                            <h2>Deemed Visit Report</h2>
                            <h3>Total Records: ${items.length}</h3>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Consumer ID</th>
                                    <th>Name</th>
                                    <th>Address</th>
                                    <th>Class</th>
                                    <th>Device</th>
                                    <th>Mobile</th>
                                    <th>Amount (₹)</th>
                                    <th>Status</th>
                                    <th>Discon Date</th>
                                    <th>Visit Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map((item, i) => `
                                    <tr>
                                        <td>${i + 1}</td>
                                        <td>${item.consumerId || ''}</td>
                                        <td>${item.name || ''}</td>
                                        <td>${item.address || ''}</td>
                                        <td>${item.baseClass || ''}</td>
                                        <td>${item.device || ''}</td>
                                        <td>${item.mobileNumber || ''}</td>
                                        <td class="text-right">${item.totalArrears ? Number(item.totalArrears).toLocaleString() : '0'}</td>
                                        <td>${getStatusBadge(item.disconStatus)}</td>
                                        <td>${item.disconDate || ''}</td>
                                        <td>${item.visitDate || ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            });
        } else {
            // For Agency user
            reportBody += `
                <div class="report-page">
                    <div class="header">
                        <h1>Deemed Visit Report</h1>
                        <h2>Total Records: ${filteredData.length}</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Consumer ID</th>
                                <th>Name</th>
                                <th>Address</th>
                                <th>Class</th>
                                <th>Device</th>
                                <th>Mobile</th>
                                <th>Amount (₹)</th>
                                <th>Status</th>
                                <th>Discon Date</th>
                                <th>Visit Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredData.map((item, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${item.consumerId || ''}</td>
                                    <td>${item.name || ''}</td>
                                    <td>${item.address || ''}</td>
                                    <td>${item.baseClass || ''}</td>
                                    <td>${item.device || ''}</td>
                                    <td>${item.mobileNumber || ''}</td>
                                    <td class="text-right">${item.totalArrears ? Number(item.totalArrears).toLocaleString() : '0'}</td>
                                    <td>${getStatusBadge(item.disconStatus)}</td>
                                    <td>${item.disconDate || ''}</td>
                                    <td>${item.visitDate || ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        const reportContent = `
            <html>
                <head>
                    <title>Deemed Visit Report</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
                    <style>
                        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; }
                        .report-page { width: 100%; }
                        .page-break { page-break-after: always; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .header h1 { font-size: 22px; font-weight: 700; margin: 5px 0; }
                        .header h2 { font-size: 16px; font-weight: 500; margin: 5px 0; color: #444; }
                        .header h3 { font-size: 12px; font-weight: 600; margin: 5px 0; color: #555; }
                        table { width: 100%; border-collapse: collapse; font-size: 9px; }
                        th, td { border: 1px solid #ccc; padding: 5px; text-align: left; }
                        th { background-color: #f0f0f0; font-weight: 600; text-transform: uppercase; }
                        .text-right { text-align: right; }
                        @media print {
                            @page { size: A4 landscape; margin: 10mm; }
                            .page-break { page-break-after: always; }
                        }
                    </style>
                </head>
                <body>
                    <div id="report-content">${reportBody}</div>
                    <script>
                        window.onload = function() {
                            const element = document.getElementById('report-content');
                            const opt = {
                                margin: 8,
                                filename: 'DD_Report_${new Date().toISOString().split('T')[0]}.pdf',
                                image: { type: 'jpeg', quality: 0.98 },
                                html2canvas: { scale: 2, useCORS: true },
                                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
                            };
                            html2pdf().set(opt).from(element).save().then(() => {
                                setTimeout(() => window.close(), 500);
                            });
                        }
                    </script>
                </body>
            </html>
        `;

        printWindow.document.write(reportContent);
        printWindow.document.close();

    } catch (error) {
        console.error("Failed to generate DD report:", error);
        alert("An error occurred while generating the report.");
    } finally {
        setLoading(false);
    }
  };

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const getRowColor = (dateStr: string) => {
    const parsed = parseDate(dateStr);
    if (!parsed) return "bg-gray-50 border border-gray-200";

    const d = startOfDay(parsed);
    const today = startOfDay(new Date());
    const yesterday = startOfDay(new Date());
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(d, today)) return "bg-green-100 border border-green-200 hover:bg-green-100";
    if (sameDay(d, yesterday)) return "bg-yellow-100 border border-yellow-200 hover:bg-yellow-100";
    return "bg-red-100 border border-red-200 hover:bg-red-100";
  };

  const getBadgeColor = (dateStr: string) => {
    const parsed = parseDate(dateStr);
    if (!parsed) return "bg-gray-200 text-gray-700";
    const d = startOfDay(parsed);
    const today = startOfDay(new Date());
    const yesterday = startOfDay(new Date());
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(d, today)) return "bg-green-200 text-green-800";
    if (sameDay(d, yesterday)) return "bg-yellow-200 text-yellow-800";
    return "bg-red-200 text-red-800";
  };

  // Fetch agencies for admin report selector
  useEffect(() => {
    if (userRole === "admin" && showReportDialog) {
      const loadAgencies = async () => {
        // 1. Try Cache first for immediate display
        try {
          const cached = await getFromCache<string[]>("agencies_data_cache")
          if (cached && Array.isArray(cached)) {
            setAvailableAgencies(["All Agencies", ...cached])
          }
        } catch (e) { /* ignore cache error */ }

        // 2. Fetch Fresh from API
        try {
          const res = await fetch("/api/admin/agencies")
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              const names = data.filter((a: any) => a.isActive === true || String(a.isActive).toLowerCase() === 'true').map((a: any) => a.name)
              setAvailableAgencies(["All Agencies", ...names])
            }
          }
        } catch (e) { console.warn("Failed to fetch agencies", e) }
      }
      loadAgencies()
    }
  }, [userRole, showReportDialog])

  // --- Actions ---
  const handleLogout = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    try {
      setLoggingOut(true);
      sessionStorage.removeItem("user_permissions");
      await logout();
    } catch (err) {
      setLoggingOut(false);
    }
  };

  const handleGlobalRefresh = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    if (confirm("Sync fresh data from server? This will reload the page.")) {
      await clearAllCache()
      
      const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
      localStorage.removeItem(`${prefix}dd_row_count`)
      sessionStorage.removeItem("consumers_synced_session")
      window.location.reload()
    }
  }

  const handleUpload = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setShowAgencyUpdates(true);
    setLoading(true);
    setAgencyLastUpdates([]);

    // 1. Try to calculate from consumers_data_cache (Local Base+Patch Data)
    try {
      console.log("🔄 [Local DB] Attempting to calculate agency updates from local cache...");
      const consumers = await getFromCache<any[]>("consumers_data_cache");
      
      if (consumers && Array.isArray(consumers) && consumers.length > 0) {
        console.log("✅ [Local DB] Cache hit. Calculating updates locally.");
        
        const agencyData = new Map<string, any[]>();
        consumers.forEach(item => {
            if (!item.agency) return;
            const agency = item.agency;
            if (!agencyData.has(agency)) {
                agencyData.set(agency, []);
            }
            agencyData.get(agency)!.push(item);
        });

        const derivedUpdates = Array.from(agencyData.entries()).map(([name, items]) => {
            if (items.length === 0) {
                return { name, lastUpdate: "", lastUpdateCount: 0 };
            }

            let latestTs = 0;
            let latestDateStr = "";

            // Find the latest date string in this agency's items
            items.forEach(item => {
                if (item.disconDate) {
                    let ts = 0;
                    if (item.disconDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
                        const [day, month, year] = item.disconDate.split('-').map(Number);
                        ts = new Date(year, month - 1, day).getTime();
                    } else if (item.disconDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        ts = new Date(item.disconDate).getTime();
                    }

                    if (ts > latestTs) {
                        latestTs = ts;
                        latestDateStr = item.disconDate;
                    }
                }
            });

            if (latestDateStr === "") {
              return { name, lastUpdate: "", lastUpdateCount: 0 };
            }

            // Count items that have the latest date string
            const count = items.filter(item => item.disconDate === latestDateStr).length;

            return {
                name,
                lastUpdate: latestDateStr,
                lastUpdateCount: count
            };
        });

        // Filter based on role
        const filteredData = (userRole === "admin" || userRole === "viewer" || userRole === "executive" || userRole === "agency")
          ? derivedUpdates
          : derivedUpdates.filter((agency) => userAgencies.includes(agency.name));

        setAgencyLastUpdates(filteredData);
        setLoading(false);
        return; // Stop here, do not fetch from API
      } else {
        console.log(" M [Local DB] Cache miss or empty. Falling back to network.");
      }
    } catch (error) {
      console.warn("⚠️ [Local DB] Could not calculate updates from local cache, falling back to network.", error);
    }

    // 2. Fallback to Network if local cache is empty or fails
    try {
      console.log("🔄 [Network] Fetching fresh agency updates from server...");
      const response = await fetch("/api/agency-last-updates");
      if (!response.ok) throw new Error("API request failed");
      
      const data = await response.json();
      
      // Filter based on role
      const filteredData = (userRole === "admin" || userRole === "viewer" || userRole === "executive" || userRole === "agency")
          ? data
          : data.filter((agency: { name: string, lastUpdate: string }) => userAgencies.includes(agency.name));

      setAgencyLastUpdates(filteredData);
      console.log("✅ [Network] Successfully loaded fresh updates from server.");
    } catch (error) {
      console.error("❌ [Network] Error fetching fresh agency updates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    setLoading(true)
    try {
      // Fetch Agency Description
      const targetAgency = userRole === "admin" ? reportAgency : (userAgencies.length === 1 ? userAgencies[0] : "All Agencies")
      const agencyDescriptions: Record<string, string> = {}
      
      if (targetAgency === "All Agencies") {
          try {
             const res = await fetch("/api/admin/agencies")
             if (res.ok) {
                 const data = await res.json()
                 data.forEach((a: any) => {
                     if (a.name) agencyDescriptions[a.name] = a.description || "Disconnection & Recovery Services"
                 })
             }
          } catch (e) { console.warn("Could not fetch agency descriptions", e) }
      } else {
          try {
              const desc = await getAgencyDescription(targetAgency)
              if (desc) agencyDescriptions[targetAgency] = desc
          } catch (e) { console.warn(e) }
      }

      const cachedData = await getFromCache<any[]>("consumers_data_cache") || []
      
      const fromDate = new Date(reportDateRange.from)
      fromDate.setHours(0, 0, 0, 0)
      const toDate = new Date(reportDateRange.to)
      toDate.setHours(23, 59, 59, 999)

      const filtered = cachedData.filter(item => {
        // Agency Check
        if (targetAgency !== "All Agencies" && item.agency !== targetAgency) return false
        if (userRole !== "admin" && targetAgency === "All Agencies") {
             if (userAgencies.length > 0 && !userAgencies.includes(item.agency)) return false
        }
        
        if (!item.disconDate) return false
        
        // Parse Date (DD-MM-YYYY or YYYY-MM-DD)
        let d = null
        if (item.disconDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const [day, month, year] = item.disconDate.split('-').map(Number)
            d = new Date(year, month - 1, day)
        } else if (item.disconDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            d = new Date(item.disconDate)
        }
        
        if (!d || isNaN(d.getTime())) return false
        
        return d >= fromDate && d <= toDate
      }).sort((a, b) => {
         // Sort Old to New
         const parse = (dateStr: string) => {
             if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                 const [day, month, year] = dateStr.split('-').map(Number)
                 return new Date(year, month - 1, day).getTime()
             }
             return new Date(dateStr).getTime()
         }
         return parse(a.disconDate) - parse(b.disconDate)
      })

      if (filtered.length === 0) {
          alert("No records found for this date range.")
          setLoading(false)
          return
      }

      // Group by Agency
      const groupedData: Record<string, any[]> = {}
      filtered.forEach(item => {
          const agency = item.agency || "Unknown Agency"
          if (!groupedData[agency]) groupedData[agency] = []
          groupedData[agency].push(item)
      })

      const agencyKeys = Object.keys(groupedData).sort()

      // Helper for summary
      const generateSummary = (items: any[]) => {
          const stats: Record<string, { count: number; amount: number }> = {}
          let total = 0
          items.forEach(item => {
            const status = item.disconStatus || "Unknown"
            if (!stats[status]) stats[status] = { count: 0, amount: 0 }
            const amount = parseFloat(String(item.d2NetOS || "0").replace(/,/g, "")) || 0
            stats[status].count++
            stats[status].amount += amount
            total += amount
          })
          return { stats, total }
      }

      // Print Window
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
          alert("Pop-up blocked. Please allow pop-ups.")
          setLoading(false)
          return
      }

      const reportContent = agencyKeys.map((agencyName, index) => {
          const items = groupedData[agencyName].sort((a, b) => {
             const parse = (dateStr: string) => {
                 if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                     const [day, month, year] = dateStr.split('-').map(Number)
                     return new Date(year, month - 1, day).getTime()
                 }
                 return new Date(dateStr).getTime()
             }
             return parse(a.disconDate) - parse(b.disconDate)
          })
          
          // Determine Office Name (CCC) based on offCode
          const officeCode = items.length > 0 ? items[0].offCode : "";
          let heading = "";
          if (officeCode === "6612107") {
            heading = "Kushida";
          } else if (officeCode === "6612104") {
            heading = "Chanchal";
          } else if (officeCode === "6612102") {
            heading = "Samsi";
          } else if (officeCode === "6612105") { 
            heading = "Malatipur";
          }

          const { stats, total } = generateSummary(items)
          const desc = agencyDescriptions[agencyName] || "Disconnection & Recovery Services"
          const isLast = index === agencyKeys.length - 1

          const formatDate = (d: string) => {
             if (!d) return ""
             if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
                 const [y, m, day] = d.split('-')
                 return `${day}.${m}.${y}`
             }
             return d.replace(/-/g, '.')
          }

          return `
            <div class="report-page ${!isLast ? 'page-break' : ''}">
                <div class="header">
                  <div class="report-title">DAILY DISCONNECTION REPORT</div>
                  <h1>${agencyName}</h1>
                  <h2>${desc}</h2>
                  ${heading ? `<h3>Under ${heading} CCC</h3>` : ''}
                </div>
                
                <div class="meta">
                  <div><strong>Date Range:</strong> ${formatDate(reportDateRange.from)} to ${formatDate(reportDateRange.to)}</div>
                  <div><strong>Total Records:</strong> ${items.length}</div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style="width: 30px;">#</th>
                      <th>Consumer ID</th>
                      <th>Name</th>
                      <th style="text-align: right;">OSD (₹)</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th style="width: 70px;">Date</th>
                      <th>Reading</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map((item, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td>${item.consumerId}</td>
                        <td>${item.name}</td>
                        <td style="text-align: right;">${Number(item.d2NetOS).toLocaleString()}</td>
                        <td>${item.baseClass || '-'}</td>
                        <td>${item.disconStatus}</td>
                        <td>${formatDate(item.disconDate)}</td>
                        <td>${item.reading || '-'}</td>
                        <td>${item.notes || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>

                <div class="summary-section">
                  <h3 style="font-size: 11px; margin-bottom: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Status Summary</h3>
                  <table class="summary-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        ${Object.keys(stats).sort().map(status => `<th class="text-right" style="text-transform: capitalize;">${status}</th>`).join('')}
                        <th class="text-right" style="font-weight: 800;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Count</strong></td>
                        ${Object.keys(stats).sort().map(status => `
                          <td class="text-right">${stats[status].count}</td>
                        `).join('')}
                        <td class="text-right" style="font-weight: 800;">${items.length}</td>
                      </tr>
                      <tr>
                        <td><strong>Amount</strong></td>
                        ${Object.keys(stats).sort().map(status => `
                          <td class="text-right">${stats[status].amount.toLocaleString()}</td>
                        `).join('')}
                        <td class="text-right" style="font-weight: 800;">${total.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="footer">
                  <div>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                  </div>
                  <div class="stamp-area">
                    <div class="stamp-box">Stamp</div>
                    <p><strong>Authorised Signatory</strong></p>
                  </div>
                </div>
            </div>
          `
      }).join('')

      printWindow.document.write(`
        <html>
          <head>
            <title>Daily Disconnection Report</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
              .report-page { margin-bottom: 40px; }
              .page-break { page-break-after: always; }
              .header { text-align: center; margin-bottom: 40px; }
              .header h1 { font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 10px 0 0; color: #000; }
              .header h2 { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; margin: 5px 0 0; color: #666; }
              .header h3 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 4px 0 0; color: #444; }
              .report-title { text-align: center; font-size: 16px; font-weight: 700; text-transform: uppercase; text-decoration: underline; text-underline-offset: 4px; margin: 0; letter-spacing: 1px; border: none; padding: 0; }
              .meta { font-size: 10px; margin-bottom: 20px; color: #555; }
              .meta div { margin-bottom: 3px; }
              
              /* Clean Table Styles (Matching Summary) */
              table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; border-top: 2px solid #000; }
              th { text-align: left; border: none; border-bottom: 1px solid #ccc; background: transparent; padding: 8px 4px; font-weight: 700; text-transform: uppercase; color: #000; white-space: nowrap; }
              td { border: none; border-bottom: 1px solid #eee; padding: 8px 4px; vertical-align: top; color: #444; }
              
              .text-right { text-align: right; }
              .summary-section { margin-top: 30px; page-break-inside: avoid; }
              .summary-table { width: auto; min-width: 50%; }
              
              .footer { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #666; }
              .stamp-area { text-align: center; }
              .stamp-box { width: 120px; height: 60px; border: 1px dashed #ccc; margin-bottom: 5px; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 9px; }
              @media print {
                @page { size: A4 portrait; margin: 10mm; }
                .no-print { display: none; }
                .page-break { page-break-after: always; }
              }
            </style>
          </head>
          <body>
            <div id="report-content">
              ${reportContent}
            </div>
            <script>
              window.onload = function() { 
                const element = document.getElementById('report-content');
                const opt = {
                  margin: 10,
                  filename: 'Daily_Disconnection_Report.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2 },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().set(opt).from(element).save();
              }
            </script>
          </body>
        </html>
      `)
      printWindow.document.close()

    } catch (e) {
      console.error(e)
      alert("Failed to generate report")
    } finally {
      setLoading(false)
      setShowReportDialog(false)
    }
  }

  // Helper variables for permissions
  const isAdminUser = userRole === "admin" || !!(permissions && permissions.admin?.includes("read"));
  const canSeeAgencyUpdates = userRole === "admin" || userRole === "executive" || userRole === "viewer" || userRole === "agency" || !!(permissions && permissions.disconnection?.includes("read"));
  const canDownloadDefaulters = canSeeAgencyUpdates;
  const displayAgencyName = (userAgencies && userAgencies.length > 0)
    ? (userAgencies.length === 1 ? userAgencies[0] : `${userAgencies[0]} (+${userAgencies.length - 1})`)
    : null;

  return (
    <header className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-2.5 sm:py-4">
          
          {/* LEFT SIDE: Sidebar & Logo */}
          <div className="flex items-center space-x-2">
            <AppSidebar 
              isMobile={true} 
              activeView={activeView} 
              setActiveView={setActiveView} 
              userRole={userRole} 
              permissions={permissions}
            />
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setActiveView("home")
              }}
            >
              <HomeIcon className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-semibold text-gray-900 hidden xs:inline">Report</span>
            </div>
          </div>

          {/* RIGHT SIDE: Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* User Info / Profile Link (Available on both desktop & mobile) */}
            <div 
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setActiveView("profile")
              }}
              className="flex items-center space-x-2 text-sm text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 px-2.5 py-1.5 rounded-full border border-blue-200 cursor-pointer transition-colors"
              title="View Profile & Subscription"
            >
              <User className="h-4 w-4 text-blue-600" />
              <span className="capitalize inline truncate max-w-[120px] font-semibold">{displayAgencyName || userRole}</span>
            </div>

            {/* --- DESKTOP VIEW (Hidden on Mobile) --- */}
            <div className="hidden md:flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setActiveView("home")
                }}
                title="Home Dashboard"
              >
                <LayoutDashboard className="h-4 w-4" />
              </Button>

              {(showDownloadButton || activeView === "dtr" || activeView === "dtr-painting") && (
                <div className="relative">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                      setShowDownloadMenu(!showDownloadMenu)
                    }}
                    title={activeView === "dtr" || activeView === "dtr-painting" ? "More Actions" : "Download Options"}
                  >
                    {activeView === "dtr" || activeView === "dtr-painting" ? (
                      <MoreVertical className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>

                  {showDownloadMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-white border rounded-lg shadow-lg z-50 animate-in fade-in zoom-in-95 duration-200">
                      {activeView === "dtr" && (
                        <>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-800"
                            onClick={() => {
                              setShowDownloadMenu(false);
                              window.dispatchEvent(new CustomEvent("dtr-action", { detail: { action: "refresh" } }))
                            }}
                          >
                            Refresh List
                          </button>
                          {(userRole === "admin" || (permissions && permissions.dtr?.includes("create"))) && (
                            <button
                              type="button"
                              className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-indigo-650 border-t"
                              onClick={() => {
                                setShowDownloadMenu(false);
                                window.dispatchEvent(new CustomEvent("dtr-action", { detail: { action: "upload" } }))
                              }}
                            >
                              Upload DTR List
                            </button>
                          )}
                        </>
                      )}

                      {activeView === "dtr-painting" && (
                        <>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-800"
                            onClick={() => {
                              setShowDownloadMenu(false);
                              window.dispatchEvent(new CustomEvent("dtr-painting-action", { detail: { action: "refresh" } }))
                            }}
                          >
                            Refresh Painting List
                          </button>
                          {userRole === "admin" && (
                            <button
                              type="button"
                              className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-blue-650 border-t"
                              onClick={() => {
                                setShowDownloadMenu(false);
                                window.dispatchEvent(new CustomEvent("dtr-painting-action", { detail: { action: "report" } }))
                              }}
                            >
                              Agency Painting Report
                            </button>
                          )}
                        </>
                      )}

                      {isDisconnectionView && (
                        <>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                              setShowDownloadMenu(false);
                              onDownload && onDownload();
                            }}
                          >
                            Download DC List
                          </button>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                              setShowDownloadMenu(false);
                              setShowReportDialog(true);
                            }}
                          >
                            Daily Report (Print)
                          </button>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm font-medium text-blue-700"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                              setShowDownloadMenu(false);
                              onDownloadDefaulters && onDownloadDefaulters();
                            }}
                          >
                            Download Report
                          </button>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm font-medium text-indigo-700 border-t border-slate-100"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                              setShowDownloadMenu(false);
                              setShowHistoryReportDialog(true);
                            }}
                          >
                            History Report
                          </button>
                        </>
                      )}
                      {isDDView && (
                        <button
                          className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                          onClick={() => { setShowDownloadMenu(false); handleGenerateDDReport(); }}
                        >
                          Download DD List (PDF)
                        </button>
                      )}
                      {activeView === "nsc" && (
                        <>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm font-semibold text-slate-800"
                            onClick={() => {
                              setShowDownloadMenu(false);
                              window.dispatchEvent(new CustomEvent("nsc-action", { detail: { action: "export" } }))
                            }}
                          >
                            Export NSC Data
                          </button>
                          {isAdminUser && (
                            <button
                              type="button"
                              className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-indigo-650 border-t"
                              onClick={() => {
                                setShowDownloadMenu(false);
                                window.dispatchEvent(new CustomEvent("nsc-action", { detail: { action: "import-legacy" } }))
                              }}
                            >
                              Import Legacy Apps
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* View-specific Admin buttons */}
              {isDisconnectionView && (
                <>
                  {canSeeAgencyUpdates && (
                    <Button variant="ghost" size="sm" onClick={handleUpload} title="Agency Last Updates" disabled={loading}>
                      <List className="h-4 w-4" />
                    </Button>
                  )}
                  {canSeeAgencyUpdates && (
                    <Button variant="ghost" size="sm" onClick={() => setActiveView("agency-updates")} title="Agency Updates Report">
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  )}
                  {isAdminUser && (
                    <Button variant="ghost" size="sm" onClick={() => setActiveView("analysis")} title="Analysis Dashboard">
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  )}
                  {isAdminUser && (
                    <Button variant="ghost" size="sm" onClick={() => window.open("/api/sheet-redirect", "_blank")} title="Edit DC List">
                      <FileSpreadsheet className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}

              {isDDView && (
                 <>
                  {isAdminUser && (
                    <Button variant="ghost" size="sm" onClick={() => window.open("/api/dd-sheet-redirect", "_blank")} title="Edit DD List">
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
              
              {/* Global Admin Buttons */}
              {isAdminUser && onAdminClick && (
                <Button variant="ghost" size="sm" onClick={onAdminClick} title="Admin Panel">
                  <Settings className="h-4 w-4" />
                </Button>
              )}

              {isAdminUser && (
                 <Button variant="ghost" size="sm" onClick={handleGlobalRefresh} title="Sync Fresh Data">
                   <RefreshCw className="h-4 w-4" />
                 </Button>
              )}




              <Button
                variant="ghost"
                size="sm"
                onClick={openChangePwdDialog}
                title="Change Password"
              >
                <KeyRound className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                title="Logout"
                disabled={loggingOut}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* --- MOBILE VIEW (Dropdown Menu) --- */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                  }}>
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {showDownloadButton && (
                    <>
                      <DropdownMenuLabel>Downloads</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {isDisconnectionView && (
                    <>
                      <DropdownMenuItem onClick={() => onDownload && onDownload()}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>Download DC List</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>Daily Report (Print)</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => onDownloadDefaulters && onDownloadDefaulters()}>
                        <Download className="mr-2 h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-700">Download Report</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowHistoryReportDialog(true)}>
                        <Clock className="mr-2 h-4 w-4 text-indigo-600" />
                        <span className="font-medium text-indigo-700">History Report</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  {activeView === "dtr" && (
                    <>
                      <DropdownMenuLabel>DTR Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        window.dispatchEvent(new CustomEvent("dtr-action", { detail: { action: "refresh" } }))
                      }}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>Refresh List</span>
                      </DropdownMenuItem>
                      {(userRole === "admin" || (permissions && permissions.dtr?.includes("create"))) && (
                        <DropdownMenuItem onClick={() => {
                          window.dispatchEvent(new CustomEvent("dtr-action", { detail: { action: "upload" } }))
                        }}>
                          <Upload className="mr-2 h-4 w-4 text-indigo-600" />
                          <span className="text-indigo-700 font-medium">Upload DTR List</span>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {activeView === "dtr-painting" && (
                    <>
                      <DropdownMenuLabel>DTR Painting Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        window.dispatchEvent(new CustomEvent("dtr-painting-action", { detail: { action: "refresh" } }))
                      }}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>Refresh Painting List</span>
                      </DropdownMenuItem>
                      {userRole === "admin" && (
                        <DropdownMenuItem onClick={() => {
                          window.dispatchEvent(new CustomEvent("dtr-painting-action", { detail: { action: "report" } }))
                        }}>
                          <Building2 className="mr-2 h-4 w-4 text-blue-600" />
                          <span className="text-blue-700 font-medium">Agency Painting Report</span>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {isDDView && (
                    <DropdownMenuItem onClick={handleGenerateDDReport}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>Download DD List</span>
                    </DropdownMenuItem>
                  )}

                  {activeView === "nsc" && (
                    <>
                      <DropdownMenuItem onClick={() => {
                        window.dispatchEvent(new CustomEvent("nsc-action", { detail: { action: "export" } }))
                      }}>
                        <Download className="mr-2 h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-700">Export NSC Data</span>
                      </DropdownMenuItem>
                      {isAdminUser && (
                        <DropdownMenuItem onClick={() => {
                          window.dispatchEvent(new CustomEvent("nsc-action", { detail: { action: "import-legacy" } }))
                        }}>
                          <Upload className="mr-2 h-4 w-4 text-indigo-600" />
                          <span className="text-indigo-700 font-medium">Import Legacy Apps</span>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {isDisconnectionView && canSeeAgencyUpdates && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Updates</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleUpload}>
                        <List className="mr-2 h-4 w-4" />
                        <span>Agency Last Updates</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveView("agency-updates")}>
                        <CalendarDays className="mr-2 h-4 w-4 text-indigo-500" />
                        <span className="font-medium">Agency Updates Report</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  {isDisconnectionView && isAdminUser && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Analysis</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setActiveView("analysis")}>
                        <BarChart3 className="mr-2 h-4 w-4 text-blue-500" />
                        <span>Analysis Dashboard</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  {isAdminUser && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Admin</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      {isDisconnectionView && (
                        <DropdownMenuItem onClick={() => window.open("/api/sheet-redirect", "_blank")}>
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          <span>Edit DC List</span>
                        </DropdownMenuItem>
                      )}

                      {isDDView && (
                        <DropdownMenuItem onClick={() => window.open("/api/dd-sheet-redirect", "_blank")}>
                          <FileText className="mr-2 h-4 w-4" />
                          <span>Edit DD List</span>
                        </DropdownMenuItem>
                      )}

                      {onAdminClick && (
                        <DropdownMenuItem onClick={onAdminClick}>
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Admin Settings</span>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem onClick={handleGlobalRefresh}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>Sync Fresh Data</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openChangePwdDialog}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    <span>Change Password</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

          </div>
        </div>
      </div>

      {/* Agency Updates Dialog */}
      <Dialog open={showAgencyUpdates} onOpenChange={setShowAgencyUpdates}>
        <DialogContent className="max-w-2xl rounded-xl shadow-xl w-[95vw] sm:w-full">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center space-x-3">
              <Building2 className="h-6 w-6 text-blue-600" />
              <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-800">
                Agency Last Updates
              </DialogTitle>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Last update status for all agencies
            </p>
          </DialogHeader>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4"></div>
              <p className="text-gray-600">Loading agency updates...</p>
            </div>
          )}

          {/* Agency List */}
          {!loading && agencyLastUpdates.length > 0 && (
            <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
              {[...agencyLastUpdates]
                .sort((a, b) => {
                  const dateA = parseDate(a.lastUpdate) || new Date(0);
                  const dateB = parseDate(b.lastUpdate) || new Date(0);
                  if (dateB.getTime() !== dateA.getTime()) {
                    return dateB.getTime() - dateA.getTime();
                  }
                  const countA = a.lastUpdateCount || 0;
                  const countB = b.lastUpdateCount || 0;
                  return countB - countA;
                })
                .map(agency => {
                  const sameDateCount = agency.lastUpdateCount || 0;
                  return (
                    <div
                      key={agency.name}
                      className={`flex items-center justify-between p-2 rounded-lg transition-all duration-200 border ${getRowColor(agency.lastUpdate)}`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-current opacity-60 flex-shrink-0"></div>
                        <span className="font-medium text-gray-900 truncate text-sm sm:text-base">{agency.name}</span>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                        <Clock className="h-3 w-3 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-700">
                          {agency.lastUpdate || "No updates"}
                        </span>
                        {agency.lastUpdate && sameDateCount > 0 && (
                          <span className={`text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full ${getBadgeColor(agency.lastUpdate)}`}>
                            {sameDateCount}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Empty state */}
          {!loading && agencyLastUpdates.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No update data available</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={() => setShowAgencyUpdates(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md rounded-xl">
            <DialogHeader>
                <DialogTitle>Generate Daily Report</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                {isAdminUser && (
                  <div className="space-y-2">
                    <Label>Select Agency</Label>
                    <Select value={reportAgency} onValueChange={setReportAgency}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Agency" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgencies.map((agency) => (
                          <SelectItem key={agency} value={agency}>{agency}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>From Date</Label>
                        <Input type="date" value={reportDateRange.from} onChange={(e) => setReportDateRange({...reportDateRange, from: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                        <Label>To Date</Label>
                        <Input type="date" value={reportDateRange.to} onChange={(e) => setReportDateRange({...reportDateRange, to: e.target.value})} />
                    </div>
                </div>
                <Button onClick={handleGenerateReport} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                    {loading ? "Generating..." : "Print Report"}
                </Button>
            </div>
        </DialogContent>
      </Dialog>

      {loggingOut && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white bg-opacity-80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-lg font-medium text-gray-700">Logging out...</p>
          </div>
        </div>
      )}

      {/* Change Password Dialog — available to all roles */}
      <Dialog open={showChangePwdDialog} onOpenChange={(open) => { if (!open) setShowChangePwdDialog(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Change Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {changePwdSuccess ? (
              <p className="text-sm text-green-600 font-medium text-center py-4">Password changed successfully!</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <div className="relative">
                    <Input
                      type={showPwdCurrent ? "text" : "password"}
                      value={changePwdCurrent}
                      onChange={(e) => setChangePwdCurrent(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwdCurrent(!showPwdCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPwdCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input
                      type={showPwdNew ? "text" : "password"}
                      value={changePwdNew}
                      onChange={(e) => setChangePwdNew(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwdNew(!showPwdNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPwdNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      type={showPwdConfirm ? "text" : "password"}
                      value={changePwdConfirm}
                      onChange={(e) => setChangePwdConfirm(e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwdConfirm(!showPwdConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPwdConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {changePwdNew && changePwdConfirm && changePwdNew !== changePwdConfirm && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
                {changePwdError && (
                  <p className="text-xs text-red-500">{changePwdError}</p>
                )}
              </>
            )}
          </div>
          {!changePwdSuccess && (
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowChangePwdDialog(false)} disabled={changePwdLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={changePwdLoading || !changePwdCurrent || !changePwdNew || !changePwdConfirm || changePwdNew !== changePwdConfirm}
              >
                {changePwdLoading ? "Saving..." : "Save Password"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Profile & Subscription Status Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-400" />
              My Profile & Workspace Status
            </DialogTitle>
          </DialogHeader>
          {profileData ? (
            <div className="space-y-4 py-3 text-sm text-slate-300">
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-medium">Name:</span>
                <span className="col-span-2 font-semibold text-slate-100">{profileData.name || "N/A"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-medium">Agency ID:</span>
                <span className="col-span-2 font-mono font-semibold text-slate-200">{profileData.username}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-medium">Subdivision:</span>
                <span className="col-span-2 font-mono font-semibold text-blue-400">{profileData.cccCode}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-medium">Role:</span>
                <span className="col-span-2 capitalize font-semibold text-slate-200">{profileData.role}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-medium">Assigned:</span>
                <span className="col-span-2 text-xs font-semibold text-slate-200">
                  {profileData.agencies && profileData.agencies.length > 0
                    ? profileData.agencies.join(", ")
                    : "None (All Access)"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-1">
                <span className="text-slate-400 font-medium">Subscription:</span>
                <span className="col-span-2">
                  {(() => {
                    const roleLower = (profileData.role || "").toLowerCase()
                    const isExempt = roleLower === "admin" || roleLower === "superuser" || roleLower === "monitor" || profileData.bypassSubscription
                    const billingStartDate = new Date("2026-09-01T00:00:00")
                    const isTrial = Date.now() < billingStartDate.getTime()

                    if (isExempt) {
                      return (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          Free Pass / Bypassed
                        </span>
                      )
                    } else if (isTrial) {
                      return (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse">
                          Under Trial (Starts 01-09-2026)
                        </span>
                      )
                    } else if (profileData.subscriptionStatus === "active") {
                      return (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                          {profileData.subscriptionExpiresAt && (
                            <span className="text-[10px] text-slate-500 font-semibold">
                              Expires: {profileData.subscriptionExpiresAt}
                            </span>
                          )}
                        </div>
                      )
                    } else {
                      return (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          Expired / Inactive
                        </span>
                      )
                    }
                  })()}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          )}
          <DialogFooter>
            <Button className="bg-slate-800 text-white hover:bg-slate-700 w-full font-semibold" onClick={() => setShowProfileDialog(false)}>
              Close Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dynamic History reports Dialog */}
      <HistoryReportsDialog
        open={showHistoryReportDialog}
        onOpenChange={setShowHistoryReportDialog}
        userRole={userRole}
        userAgencies={userAgencies}
      />
    </header>
  )
}