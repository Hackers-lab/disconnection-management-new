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
  FileCheck2,
  Star,
  MessageSquarePlus,
  Share2,
  Bell,
  Phone,
  Hash,
  Pencil,
  Check,
  AlertCircle,
  AlertTriangle,
  Crown,
  Sparkles,
  ShieldCheck,
} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { FeedbackDialog } from "@/components/feedback-dialog"
import { BroadcastPushModal } from "@/components/broadcast-push-modal"
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
import { OsdDetailsDialog } from "@/components/osd-details-dialog"
import { useDashboard } from "@/components/dashboard-context"
import { getAgencyDescription } from "@/app/actions/agency-details"
import { getFromCache, saveToCache, clearAllCache, getCccPrefix } from "@/lib/indexed-db"
import { generateAndShareAgencyUpdatesJPEG } from "@/lib/agency-update-image"
import { unlockSpotAiSession } from "@/lib/spotai-guard"
import { LanguageToggle } from "@/components/language-toggle"
import { useModuleTheme, ModuleTheme } from "@/lib/module-theme"
import { Palette } from "lucide-react"

interface HeaderProps {
  userRole: string
  userAgencies?: string[]
  onAdminClick?: () => void
  onDownload?: () => void
  onDownloadExcel?: () => void
  onDownloadDefaulters?: () => void
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
  permissions?: Record<string, string[]>
}

export function Header({ userRole, userAgencies = [], onAdminClick, onDownload, onDownloadExcel, onDownloadDefaulters, activeView: propsActiveView, setActiveView: propsSetActiveView, permissions }: HeaderProps) {
  const dashboard = useDashboard()
  const setActiveView = dashboard?.setActiveView || propsSetActiveView || (() => {})
  const activeView = dashboard?.activeView || propsActiveView
  const [showAgencyUpdates, setShowAgencyUpdates] = useState(false)
  const [agencyLastUpdates, setAgencyLastUpdates] = useState<{name: string, lastUpdate: string; lastUpdateCount: number}[]>([])
  const [loading, setLoading] = useState(false)
  const [isSharingAgencyImage, setIsSharingAgencyImage] = useState(false)

  const handleShareAgencyUpdates = async () => {
    if (!agencyLastUpdates || agencyLastUpdates.length === 0 || isSharingAgencyImage) return
    setIsSharingAgencyImage(true)
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
      const ccc = profileData?.cccCode || (typeof window !== "undefined" ? localStorage.getItem("user_ccc_code") : "") || "CCC"
      await generateAndShareAgencyUpdatesJPEG(agencyLastUpdates, ccc)
    } catch (err) {
      console.error("Failed to share agency updates image:", err)
    } finally {
      setIsSharingAgencyImage(false)
    }
  }
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
  const [showBroadcastPushModal, setShowBroadcastPushModal] = useState(false)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [showOsdDialog, setShowOsdDialog] = useState(false)
  const [profileData, setProfileData] = useState<any>(null)
  const [clientCccCode, setClientCccCode] = useState<string>("")
  const [clientUsername, setClientUsername] = useState<string>("")
  const { theme: currentModuleTheme, changeTheme: setModuleTheme, options: moduleThemeOptions } = useModuleTheme()
  const [showThemeModal, setShowThemeModal] = useState(false)

  // Profile Edit Modal / Inline State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileEditName, setProfileEditName] = useState("")
  const [profileEditMobile, setProfileEditMobile] = useState("")
  const [profileEditVendor, setProfileEditVendor] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false)

  const loadUserProfile = async () => {
    try {
      const res = await fetch("/api/user/profile")
      if (res.ok) {
        const data = await res.json()
        setProfileData(data)
        if (data?.cccCode) {
          setClientCccCode(data.cccCode)
          if (typeof window !== "undefined") {
            localStorage.setItem("user_ccc_code", data.cccCode)
          }
        }
        return data
      }
    } catch (e) {
      console.warn("Failed to fetch user profile, falling back to permissions", e)
    }

    // Fallback: Use permissions endpoint if /api/user/profile fails
    try {
      const pRes = await fetch("/api/auth/permissions")
      if (pRes.ok) {
        const pData = await pRes.json()
        setProfileData((prev: any) => ({
          ...prev,
          name: pData.name || pData.username,
          username: pData.username,
          cccCode: pData.cccCode,
          cccName: pData.cccName,
          role: pData.role,
          agencies: pData.agencies,
          subscriptionStatus: pData.subscriptionStatus,
          subscriptionExpiresAt: pData.subscriptionExpiresAt,
          bypassSubscription: pData.bypassSubscription,
          mobileNumber: pData.mobileNumber,
          userMobile: pData.mobileNumber,
          vendorCode: pData.vendorCode,
        }))
        return pData
      }
    } catch (err) {
      console.error("Failed to load permissions fallback", err)
    }
  }

  const startEditProfile = () => {
    setProfileEditName(profileData?.name || profileData?.fullName || "")
    setProfileEditMobile(profileData?.userMobile || profileData?.mobileNumber || "")
    setProfileSaveError(null)
    setProfileSaveSuccess(false)
    setIsEditingProfile(true)
  }

  const handleSaveProfileDetails = async () => {
    const cleanMob = profileEditMobile.trim()
    const cleanName = profileEditName.trim()

    if (cleanMob && !/^\d{10}$/.test(cleanMob)) {
      setProfileSaveError("Personal login mobile number must be exactly 10 digits")
      return
    }

    setProfileSaving(true)
    setProfileSaveError(null)
    setProfileSaveSuccess(false)

    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: cleanName || null,
          userMobile: cleanMob || null,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update profile")
      }

      setProfileSaveSuccess(true)
      await loadUserProfile()
      setTimeout(() => {
        setIsEditingProfile(false)
        setProfileSaveSuccess(false)
      }, 1000)
    } catch (err: any) {
      setProfileSaveError(err.message || "Failed to save profile")
    } finally {
      setProfileSaving(false)
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setClientCccCode(localStorage.getItem("user_ccc_code") || "")
      setClientUsername(localStorage.getItem("user_username") || "")
    }
    loadUserProfile()

    const handleChangePwdEvent = () => {
      openChangePwdDialog()
    }
    window.addEventListener("open-change-password", handleChangePwdEvent)
    return () => {
      window.removeEventListener("open-change-password", handleChangePwdEvent)
    }
  }, [])
  const homeLongPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isLongPressRef = useRef(false)

  const handleHomeTouchStart = () => {
    isLongPressRef.current = false
    homeLongPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      unlockSpotAiSession()
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([40, 60, 60])
      }
      setActiveView("spotai")
    }, 2000) // 2.0s long press threshold
  }

  const handleHomeTouchEnd = () => {
    if (homeLongPressTimerRef.current) {
      clearTimeout(homeLongPressTimerRef.current)
      homeLongPressTimerRef.current = null
    }
  }

  const handleHomeClick = (e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      e.preventDefault()
      e.stopPropagation()
      isLongPressRef.current = false
      return
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    setActiveView("home")
  }

  useEffect(() => {
    console.log("🚀 Disconnection Management Web App - version 1.1.0 loaded");
  }, [])

  useEffect(() => {
    if (activeView === "osd") {
      setShowOsdDialog(true)
    }
  }, [activeView])





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
    if (changePwdNew.length < 4) {
      setChangePwdError("New password must be at least 4 characters")
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
        body: JSON.stringify({
          currentPassword: changePwdCurrent,
          newPassword: changePwdNew,
        }),
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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    try {
      setLoggingOut(true);
      try {
        sessionStorage.clear()
        localStorage.removeItem("user_ccc_code")
        localStorage.removeItem("user_username")
        localStorage.removeItem("user_permissions")
        localStorage.removeItem("_hb_date")
      } catch (e) {
        // ignore storage errors
      }
      await logout();
    } catch (err) {
      setLoggingOut(false);
    }
  };

  const handleGlobalRefresh = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    if (confirm("Sync fresh data from server? This will reload the page.")) {
      if (userRole === "admin" || userRole === "executive" || isAdminUser) {
        await fetch("/api/system/reset-base?moduleKey=all", { method: "POST" }).catch(() => {})
      }
      await clearAllCache()
      
      const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
      localStorage.removeItem(`${prefix}dd_row_count`)
      sessionStorage.removeItem("consumers_synced_session")
      window.location.reload()
    }
  }

  const handleUpload = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
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

  const isAdminUser = userRole === "admin" || !!(permissions && permissions.admin?.includes("read"));
  const canSeeAgencyUpdates = userRole === "admin" || userRole === "executive" || userRole === "viewer" || userRole === "agency" || !!(permissions && permissions.disconnection?.includes("read"));
  const canDownloadDefaulters = canSeeAgencyUpdates;
  const displayAgencyName = (userAgencies && userAgencies.length > 0)
    ? (userAgencies.length === 1 ? userAgencies[0] : `${userAgencies[0]} (+${userAgencies.length - 1})`)
    : null;
  const cccCode = profileData?.cccCode || clientCccCode || "";
  const loginDisplayName = profileData?.name || profileData?.username || displayAgencyName || clientUsername || userRole;

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
              className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity select-none"
              onClick={handleHomeClick}
              onMouseDown={handleHomeTouchStart}
              onMouseUp={handleHomeTouchEnd}
              onMouseLeave={handleHomeTouchEnd}
              onTouchStart={handleHomeTouchStart}
              onTouchEnd={handleHomeTouchEnd}
              onTouchCancel={handleHomeTouchEnd}
              title="Home (Long press to open SpotAI Intelligence)"
            >
              <HomeIcon className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-semibold text-gray-900 hidden xs:inline">Report</span>
            </div>
          </div>

          {/* RIGHT SIDE: Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* Language Toggle (Bilingual English <-> Bengali) */}
            <LanguageToggle />

            {/* User Info / Profile Link (Available on both desktop & mobile) */}
            <div 
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                setActiveView("profile")
              }}
              className={`relative rounded-xl cursor-pointer select-none p-[1.5px] overflow-hidden group transition-all duration-300 ${
                profileData?.isPaid ? "shadow-xs shadow-amber-500/15 hover:shadow-amber-500/25" : ""
              }`}
              title={`User: ${loginDisplayName} | Office (CCC): ${cccCode || "Default"}${profileData?.isPaid ? " | 👑 PRO SUBSCRIBER" : ""}`}
            >
              {profileData?.isPaid ? (
                <>
                  {/* Circulating perimeter beam: Spinning conic gradient with radiant comet head */}
                  <span
                    className="absolute -inset-[100%] m-auto aspect-square w-[250%] animate-spin opacity-100 transition-opacity"
                    style={{
                      background: "conic-gradient(from 0deg, transparent 0deg, transparent 250deg, rgba(245, 158, 11, 0.25) 280deg, rgba(245, 158, 11, 0.8) 315deg, #fef08a 345deg, #ffffff 358deg, #f59e0b 360deg)",
                      animationDuration: "2.8s",
                      animationTimingFunction: "linear",
                    }}
                  />
                  {/* Subtle static gold base border track */}
                  <span className="absolute inset-0 rounded-xl border border-amber-300/40 pointer-events-none" />
                </>
              ) : null}

              <div className={`relative flex items-center gap-2 text-right px-2.5 py-1 rounded-[10.5px] transition-colors ${
                profileData?.isPaid
                  ? "bg-gradient-to-r from-amber-100/95 via-yellow-100/90 to-amber-100/95 hover:from-amber-200/90 hover:to-yellow-200/85 text-slate-900 border border-amber-300/70"
                  : "hover:bg-slate-100/80 bg-transparent text-slate-900"
              }`}>
                <div className="flex flex-col justify-center items-end text-right min-w-0">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-[11px] font-bold text-amber-950 capitalize truncate max-w-[90px] sm:max-w-[125px] leading-tight">
                      {loginDisplayName}
                    </span>
                  </div>
                  {cccCode && (
                    <span className="text-[9px] font-semibold text-blue-700/90 uppercase tracking-wider leading-none mt-0.5">
                      {cccCode}
                    </span>
                  )}
                </div>

                {/* Avatar with PRO badge */}
                <div className="relative flex flex-col items-center justify-center shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                    profileData?.isPaid
                      ? "bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 shadow-xs ring-1 ring-amber-300/90"
                      : "bg-blue-100/90 text-blue-600"
                  }`}>
                    {profileData?.isPaid ? (
                      <Crown className="h-3.5 w-3.5 fill-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]" />
                    ) : (
                      <User className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  {profileData?.isPaid && (
                    <span className="absolute -bottom-1 px-1 py-[0.5px] rounded-full text-[7.5px] font-black uppercase tracking-wider bg-slate-950 text-amber-300 border border-amber-400/80 leading-none shadow-xs group-hover:border-amber-300 transition-colors">
                      PRO
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* --- DESKTOP VIEW (Hidden on Mobile) --- */}
            <div className="hidden md:flex items-center space-x-2">
              <FeedbackDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-300/60 bg-amber-50/60 hover:bg-amber-100/80 text-amber-900 font-semibold gap-1.5 text-xs rounded-full shadow-xs transition-all"
                    title="View & Edit Your Feedback"
                  >
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                    <span>My Feedback</span>
                  </Button>
                }
              />

              <Button
                variant="ghost"
                size="sm"
                onClick={handleHomeClick}
                onMouseDown={handleHomeTouchStart}
                onMouseUp={handleHomeTouchEnd}
                onMouseLeave={handleHomeTouchEnd}
                onTouchStart={handleHomeTouchStart}
                onTouchEnd={handleHomeTouchEnd}
                onTouchCancel={handleHomeTouchEnd}
                title="Home Dashboard (Long press to open SpotAI Intelligence)"
              >
                <LayoutDashboard className="h-4 w-4" />
              </Button>

              {(showDownloadButton || activeView === "dtr" || activeView === "dtr-painting") && (
                <div className="relative">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
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
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                              setShowDownloadMenu(false);
                              onDownload && onDownload();
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-red-600" />
                              <span>Download DC List (PDF)</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                              setShowDownloadMenu(false);
                              onDownloadExcel && onDownloadExcel();
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                              <span>Download DC List (Excel)</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
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
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
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
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                    setShowBroadcastPushModal(true)
                  }}
                  title="Broadcast Alert to Office Team"
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                >
                  <Bell className="h-4 w-4" />
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
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                  setShowThemeModal(true)
                }}
                title="Customize Home Card Theme"
                className="text-slate-600 hover:text-indigo-600 hover:bg-slate-100"
              >
                <Palette className="h-4 w-4" />
              </Button>

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
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
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
                        <FileText className="mr-2 h-4 w-4 text-red-600" />
                        <span>Download DC List (PDF)</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => onDownloadExcel && onDownloadExcel()}>
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                        <span>Download DC List (Excel)</span>
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

                      <DropdownMenuItem
                        onClick={() => {
                          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                          setShowBroadcastPushModal(true)
                        }}
                      >
                        <Bell className="mr-2 h-4 w-4 text-emerald-600" />
                        <span className="font-semibold text-emerald-700">Broadcast Push Alert</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={handleGlobalRefresh}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>Sync Fresh Data</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <FeedbackDialog
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <MessageSquarePlus className="mr-2 h-4 w-4 text-amber-500" />
                        <span>My Feedback & Rating</span>
                      </DropdownMenuItem>
                    }
                  />
                  <DropdownMenuItem
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                      setShowThemeModal(true)
                    }}
                  >
                    <Palette className="mr-2 h-4 w-4 text-indigo-600" />
                    <span className="font-medium text-slate-800">Home Card Theme</span>
                  </DropdownMenuItem>

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
        <DialogContent className="max-w-2xl rounded-2xl shadow-2xl w-[95vw] sm:w-full min-h-[75vh] max-h-[88vh] p-4 sm:p-6 flex flex-col">
          <DialogHeader className="border-b border-slate-100 pb-3 shrink-0">
            <div className="flex items-center justify-between pr-8">
              <div className="flex items-center space-x-2.5">
                <Building2 className="h-5 w-5 text-blue-600" />
                <DialogTitle className="text-lg sm:text-xl font-bold text-gray-900">
                  Agency Last Updates
                </DialogTitle>
              </div>

              {/* Share to WhatsApp / Image Button */}
              {!loading && agencyLastUpdates.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleShareAgencyUpdates}
                  disabled={isSharingAgencyImage}
                  className="h-8 px-2.5 sm:px-3 text-xs font-semibold gap-1.5 rounded-full border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 shadow-2xs transition-all cursor-pointer"
                  title="Share JPEG Report directly to WhatsApp"
                >
                  {isSharingAgencyImage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  <span className="hidden xs:inline">{isSharingAgencyImage ? "Generating..." : "Share Image"}</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center flex-1 py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-3 border-blue-600 border-t-transparent mb-3"></div>
              <p className="text-sm text-gray-600">Loading agency updates...</p>
            </div>
          )}

          {/* Agency List */}
          {!loading && agencyLastUpdates.length > 0 && (
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
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
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-all duration-200 border ${getRowColor(agency.lastUpdate)}`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-current opacity-70 flex-shrink-0"></div>
                        <span className="font-bold text-slate-900 truncate text-sm sm:text-base">{agency.name}</span>
                      </div>

                      <div className="flex items-center space-x-2.5 flex-shrink-0 ml-2">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-700 font-mono">
                          {agency.lastUpdate || "No updates"}
                        </span>
                        {agency.lastUpdate && sameDateCount > 0 && (
                          <span className={`text-xs font-bold min-w-[24px] text-center px-2 py-0.5 rounded-full ${getBadgeColor(agency.lastUpdate)}`}>
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
              <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">No update data available</p>
            </div>
          )}
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
              <KeyRound className="h-5 w-5 text-indigo-500" />
              Change Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {changePwdSuccess ? (
              <div className="text-center py-4 space-y-2">
                <Check className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-sm text-green-600 font-semibold">Password changed successfully!</p>
              </div>
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
                      placeholder="Enter new password (min 4 characters)"
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
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{changePwdError}</span>
                  </p>
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {changePwdLoading ? "Saving..." : "Save Password"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Profile & Subscription Status Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={(open) => {
        setShowProfileDialog(open)
        if (open) {
          setIsEditingProfile(false)
          setProfileSaveError(null)
          setProfileSaveSuccess(false)
          loadUserProfile()
        }
      }}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <User className="h-5 w-5 text-indigo-400" />
                My Profile & Workspace Status
              </DialogTitle>
            </div>
          </DialogHeader>

          {profileData ? (
            <div className="space-y-3.5 py-2 text-sm text-slate-300">
              {/* Basic Details */}
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2.5 items-center">
                <span className="text-slate-400 font-medium">Name:</span>
                <div className="col-span-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100 truncate">{profileData.name || profileData.fullName || "N/A"}</span>
                  {!isEditingProfile && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={startEditProfile}
                      className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full shrink-0"
                      title="Edit Profile Details"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2.5">
                <span className="text-slate-400 font-medium">Office:</span>
                <span className="col-span-2 font-mono font-semibold text-blue-400">
                  {profileData.cccCode} {profileData.cccName && profileData.cccName !== profileData.cccCode ? `(${profileData.cccName})` : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2.5">
                <span className="text-slate-400 font-medium">Agency:</span>
                <span className="col-span-2 text-xs font-semibold text-slate-200">
                  {profileData.agencies && profileData.agencies.length > 0
                    ? profileData.agencies.join(", ")
                    : "None (All Access)"}
                </span>
              </div>

              {/* Mobile Number & Vendor Code Display or Edit Form */}
              {!isEditingProfile ? (
                <>
                  {/* Personal Login Mobile Number Row */}
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2.5 items-center">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-purple-400" />
                      User Ph:
                    </span>
                    <div className="col-span-2 flex items-center justify-between gap-2">
                      {(profileData.userMobile || profileData.mobileNumber) && /^\d{10}$/.test(profileData.userMobile || profileData.mobileNumber) ? (
                        <span className="font-mono font-bold text-emerald-400 text-xs">
                          +91 {profileData.userMobile || profileData.mobileNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400 font-medium">Not Set</span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={startEditProfile}
                        className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
                        title="Edit Personal Mobile"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Agency Official Phone (shown if agency user) */}
                  {(profileData.hasAgency || profileData.agencyMobile) && (
                    <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2.5 items-center">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                        Agency Ph:
                      </span>
                      <div className="col-span-2 flex items-center justify-between gap-2">
                        {profileData.agencyMobile && /^\d{10}$/.test(profileData.agencyMobile) ? (
                          <span className="font-mono font-semibold text-slate-200 text-xs">
                            +91 {profileData.agencyMobile}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Not recorded</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Vendor Code Row (Read-Only) */}
                  {(profileData.hasAgency || profileData.vendorCode) && (
                    <div className="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2.5 items-center">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-blue-400" />
                        Vendor Code:
                      </span>
                      <div className="col-span-2 flex items-center justify-between gap-2">
                        {profileData.vendorCode ? (
                          <span className="font-mono font-bold text-cyan-400 text-xs bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800">
                            {profileData.vendorCode}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Not Tagged</span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Inline Edit Profile Section (Personal Login Mobile Only) */
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Update Personal Login Mobile Number
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    This phone number is used for logging into your user account and receiving password reset OTPs. It must be unique to you.
                  </p>

                  {profileSaveError && (
                    <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/80 rounded-lg p-2 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{profileSaveError}</span>
                    </div>
                  )}

                  {profileSaveSuccess && (
                    <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/80 rounded-lg p-2 flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span>Mobile number updated successfully!</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="profile-header-name" className="text-xs text-slate-300 flex items-center gap-1">
                      <User className="h-3 w-3 text-indigo-400" />
                      Full Name
                    </Label>
                    <Input
                      id="profile-header-name"
                      type="text"
                      placeholder="Your full name"
                      value={profileEditName}
                      onChange={(e) => setProfileEditName(e.target.value)}
                      className="h-8 text-xs bg-slate-900 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="profile-mobile" className="text-xs text-slate-300 flex items-center gap-1">
                      <Phone className="h-3 w-3 text-purple-400" />
                      10-Digit Mobile Number
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">+91</span>
                      <Input
                        id="profile-mobile"
                        type="tel"
                        maxLength={10}
                        placeholder="10-digit phone"
                        value={profileEditMobile}
                        onChange={(e) => setProfileEditMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="h-8 pl-9 text-xs bg-slate-900 border-slate-700 text-white font-mono"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500">
                    Note: Vendor Code & Company Phone can only be modified by the Station Admin in the CCC Admin Panel.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={profileSaving}
                      onClick={() => setIsEditingProfile(false)}
                      className="h-7 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={profileSaving || (profileEditMobile && profileEditMobile.length > 0 && profileEditMobile.length !== 10)}
                      onClick={handleSaveProfileDetails}
                      className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Save Details
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Subscription Status Section */}
              <div className="pt-2 border-t border-slate-800">
                {(() => {
                  const roleLower = (profileData.role || "").toLowerCase()
                  const isExempt = roleLower === "admin" || roleLower === "superuser" || roleLower === "monitor" || profileData.bypassSubscription

                  if (isExempt) {
                    return (
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <span className="text-slate-400 font-medium">Subscription:</span>
                        <div className="col-span-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Free Pass / Bypassed
                          </span>
                        </div>
                      </div>
                    )
                  }

                  const rawExp = profileData.subscriptionExpiresAt
                  const isPaid = Boolean(profileData.isPaid || profileData.subscriptionStatus === "paid")

                  if (rawExp) {
                    const expDate = new Date(rawExp)
                    const isExpired = expDate.getTime() < Date.now()
                    const expFormatted = isNaN(expDate.getTime())
                      ? rawExp
                      : expDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

                    if (isExpired) {
                      return (
                        <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/60 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                              Subscription Expired
                            </span>
                            <span className="text-[10px] text-rose-400/80 font-mono">Expired {expFormatted}</span>
                          </div>
                          <p className="text-xs text-rose-300/80">
                            Your billing term has ended. Please subscribe to restore full sync & operations.
                          </p>
                        </div>
                      )
                    }

                    if (isPaid) {
                      return (
                        <div className="relative overflow-hidden p-3.5 rounded-xl bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-transparent border border-amber-400/40 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-200 text-slate-950 shadow-xs">
                              <Crown className="w-3 h-3 fill-slate-950" />
                              PRO SUBSCRIBER
                            </span>
                            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              Active Plan
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-100">
                              {profileData.planName || "Quarterly Vendor Access"}
                            </p>
                            <p className="text-[11px] text-amber-200/80">
                              Subscribed & Verified online • Full validity till <strong className="text-white font-mono">{expFormatted}</strong>
                            </p>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Free Trial Active
                          </span>
                          <span className="text-[10px] text-indigo-300 font-mono">Till {expFormatted}</span>
                        </div>
                        <p className="text-xs text-indigo-200/80">
                          Operational trial window active. Regular billing commences after {expFormatted}.
                        </p>
                      </div>
                    )
                  }

                  if (profileData.subscriptionStatus === "active") {
                    return (
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <span className="text-slate-400 font-medium">Subscription:</span>
                        <div className="col-span-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Check className="w-3 h-3" /> Active
                          </span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-slate-400 font-medium">Subscription:</span>
                      <div className="col-span-2">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          Inactive / Due
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="bg-slate-800 text-indigo-300 hover:bg-slate-700 hover:text-indigo-200 border-slate-700 w-full sm:w-auto font-medium text-xs flex items-center justify-center gap-1.5"
              onClick={() => {
                setShowProfileDialog(false)
                openChangePwdDialog()
              }}
            >
              <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
              Change Password
            </Button>
            <Button className="bg-slate-800 text-white hover:bg-slate-700 w-full sm:w-auto font-semibold text-xs" onClick={() => setShowProfileDialog(false)}>
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

      {/* Broadcast Push Alert Dialog for Office Admin */}
      <BroadcastPushModal
        isOpen={showBroadcastPushModal}
        onClose={() => setShowBroadcastPushModal(false)}
        isSuperuser={false}
        currentCccCode={cccCode || "SYSTEM"}
      />

      {/* Home Card Theme Selector Dialog */}
      <Dialog open={showThemeModal} onOpenChange={setShowThemeModal}>
        <DialogContent className="max-w-md w-[95vw] rounded-2xl p-5 sm:p-6">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Home Card Theme
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose a visual style for the module cards & badges
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-2.5 py-4">
            {moduleThemeOptions.map((opt) => {
              const isSelected = currentModuleTheme === opt.id
              return (
                <div
                  key={opt.id}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
                    setModuleTheme(opt.id)
                  }}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 flex items-start justify-between gap-3 ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                      : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs border border-white"
                      style={{ backgroundColor: opt.accentColor }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">
                          {opt.label}
                        </h4>
                        {isSelected && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {opt.description}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl"
              onClick={() => setShowThemeModal(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}