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
  Receipt,
  Search,
  ChevronRight,
  ChevronDown,
  Palette,
  Gift,
} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { FeedbackDialog } from "@/components/feedback-dialog"
import {
  FEEDBACK_REWARD_DAYS,
  FEEDBACK_REWARD_EVENT,
} from "@/lib/feedback-reward-utils"
import { BroadcastPushModal } from "@/components/broadcast-push-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { normalizeCalendarDate } from "@/lib/date-utils"
import { getModuleTitle, getModuleIcon } from "@/lib/module-catalog"
import { useToast } from "@/hooks/use-toast"

interface HeaderProps {
  userRole: string
  userAgencies?: string[]
  userName?: string
  userCccCode?: string
  initialProfile?: {
    name?: string
    username?: string
    cccCode?: string
    cccName?: string
    isSubscribed?: boolean
    subscriptionExpiresAt?: string
    bypassSubscription?: boolean
  }
  onAdminClick?: () => void
  onDownload?: () => void
  onDownloadExcel?: () => void
  onDownloadDefaulters?: () => void
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
  permissions?: Record<string, string[]>
  onOpenQuickSwitcher?: () => void
  isSetupLocked?: boolean
}

export function Header({
  userRole,
  userAgencies = [],
  userName,
  userCccCode,
  initialProfile,
  onAdminClick,
  onDownload,
  onDownloadExcel,
  onDownloadDefaulters,
  activeView: propsActiveView,
  setActiveView: propsSetActiveView,
  permissions,
  onOpenQuickSwitcher,
  isSetupLocked = false,
}: HeaderProps) {
  const { toast } = useToast()
  const dashboard = useDashboard()
  const setActiveView = dashboard?.setActiveView || propsSetActiveView || (() => {})
  const activeView = dashboard?.activeView || propsActiveView
  const [showAgencyUpdates, setShowAgencyUpdates] = useState(false)
  const [showGlobalRefreshConfirm, setShowGlobalRefreshConfirm] = useState(false)
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
  const [profileData, setProfileData] = useState<any>(initialProfile || null)
  const [clientCccCode, setClientCccCode] = useState<string>(userCccCode || initialProfile?.cccCode || "")
  const [clientUsername, setClientUsername] = useState<string>(userName || initialProfile?.username || "")
  const { theme: currentModuleTheme, changeTheme: setModuleTheme, options: moduleThemeOptions } = useModuleTheme()
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [feedbackRewardEligible, setFeedbackRewardEligible] = useState(false)

  useEffect(() => {
    const roleLower = String(userRole || "").toLowerCase()
    if (
      roleLower === "admin" ||
      roleLower === "superuser" ||
      roleLower === "monitor" ||
      initialProfile?.bypassSubscription
    ) {
      setFeedbackRewardEligible(false)
      return
    }

    let mounted = true
    fetch("/api/feedback", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.rewardStatus) {
          setFeedbackRewardEligible(Boolean(data.rewardStatus.eligible))
        }
      })
      .catch(() => {})

    const handleFeedbackRewardGranted = (event: Event) => {
      if (!mounted) return
      const detail = (event as CustomEvent)?.detail
      setFeedbackRewardEligible(false)
      if (detail?.newExpiresAt) {
        setProfileData((prev: any) => ({
          ...(prev || {}),
          subscriptionStatus: "active",
          subscriptionExpiresAt: detail.newExpiresAt,
          isSubscribed: true,
        }))
      }
      loadUserProfile()
    }

    window.addEventListener(FEEDBACK_REWARD_EVENT, handleFeedbackRewardGranted)
    return () => {
      mounted = false
      window.removeEventListener(FEEDBACK_REWARD_EVENT, handleFeedbackRewardGranted)
    }
  }, [userRole, initialProfile?.bypassSubscription])

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
        if (data?.username) {
          setClientUsername(data.username)
          if (typeof window !== "undefined") {
            localStorage.setItem("user_username", data.username)
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
        if (pData?.cccCode) setClientCccCode(pData.cccCode)
        if (pData?.username) setClientUsername(pData.username)
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
      const storedCcc = localStorage.getItem("user_ccc_code")
      const storedUser = localStorage.getItem("user_username")
      if (!clientCccCode && storedCcc) setClientCccCode(storedCcc)
      if (!clientUsername && storedUser) setClientUsername(storedUser)
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
            toast({ title: "No DD data available", description: "Open Deemed Visit first to load data before exporting.", variant: "destructive" });
            setLoading(false);
            return;
        }

        // 1. Filter data based on user role
        const filteredData = (userRole === "admin" || userRole === "viewer")
            ? data
            : data.filter(item => userAgencies.includes(item.agency));
        
        if (filteredData.length === 0) {
            toast({ title: "No records found", description: "No deemed visit records match your assigned agency.", variant: "destructive" });
            setLoading(false);
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast({ title: "Pop-up blocked", description: "Please allow pop-ups in your browser to generate reports.", variant: "destructive" });
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
        toast({ title: "Report generation failed", description: "An unexpected error occurred while creating the DD PDF.", variant: "destructive" });
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
        sessionStorage.clear();
        localStorage.removeItem("user_ccc_code");
        localStorage.removeItem("user_username");
        localStorage.removeItem("user_role");
        localStorage.removeItem("user_permissions");
        localStorage.removeItem("user_ccc_name");
        localStorage.removeItem("_hb_date");
      } catch (e) {
        // ignore storage errors
      }
      await logout();
    } catch (err) {
      setLoggingOut(false);
    }
  };

  const handleGlobalRefresh = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20)
    setShowGlobalRefreshConfirm(true)
  }

  const executeGlobalRefresh = async () => {
    setShowGlobalRefreshConfirm(false)
    if (userRole === "admin" || userRole === "executive" || isAdminUser) {
      try {
        const res = await fetch("/api/system/reset-base?moduleKey=all", { method: "POST" })
        if (res.status === 429) {
          const json = await res.json().catch(() => ({}))
          const msg = json.error || "Manual CDN cache refresh is locked. You can refresh only once per hour."
          toast({ title: "Refresh Locked", description: msg, variant: "destructive" })
          return
        }
      } catch {}
    }
    await clearAllCache()

    const prefix = getCccPrefix() ? `${getCccPrefix()}_` : ""
    localStorage.removeItem(`${prefix}dd_row_count`)
    sessionStorage.removeItem("consumers_synced_session")
    window.location.reload()
  }

  const handleUpload = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
    setShowAgencyUpdates(true);
    setLoading(true);
    setAgencyLastUpdates([]);

    // 1. Try to calculate from consumers_data_cache ONLY for admins/viewers who have the full tenant dataset cached.
    // Agency users have their local cache scoped only to their own agency, so they MUST fetch the authoritative server endpoint
    // to see accurate counts for all agencies.
    const isAgencyRole = userRole === "agency" || (userAgencies && userAgencies.length > 0 && userRole !== "admin" && userRole !== "viewer" && userRole !== "executive");

    if (!isAgencyRole) {
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

              let latestNormalizedDate = "";

              // Find the latest ISO date (YYYY-MM-DD) in this agency's items
              items.forEach(item => {
                  if (item.disconDate) {
                      const norm = normalizeCalendarDate(item.disconDate);
                      if (norm && (!latestNormalizedDate || norm > latestNormalizedDate)) {
                          latestNormalizedDate = norm;
                      }
                  }
              });

              if (!latestNormalizedDate) {
                return { name, lastUpdate: "", lastUpdateCount: 0 };
              }

              // Count items matching the latest normalized calendar date
              const count = items.filter(item => {
                  if (!item.disconDate) return false;
                  return normalizeCalendarDate(item.disconDate) === latestNormalizedDate;
              }).length;

              const [y, m, d] = latestNormalizedDate.split("-");
              const formattedDate = `${d}-${m}-${y}`;

              return {
                  name,
                  lastUpdate: formattedDate,
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
          console.log("ℹ️ [Local DB] Cache miss or empty. Falling back to network.");
        }
      } catch (error) {
        console.warn("⚠️ [Local DB] Could not calculate updates from local cache, falling back to network.", error);
      }
    }

    // 2. Fetch fresh updates from server API (authoritative across all agencies)
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
      
      const normTarget = (targetAgency || "").trim().toUpperCase()

      if (normTarget === "ALL AGENCIES") {
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

      let cachedData = await getFromCache<any[]>("consumers_data_cache") || []
      
      // If agency cache is empty (e.g. user hasn't visited the consumer list yet), fetch fresh base data
      if (cachedData.length === 0) {
        try {
          const res = await fetch("/api/consumers/base")
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              cachedData = data
            }
          }
        } catch (fetchErr) {
          console.warn("Could not fallback-fetch consumers for report", fetchErr)
        }
      }
      
      const fromDate = new Date(reportDateRange.from)
      fromDate.setHours(0, 0, 0, 0)
      const toDate = new Date(reportDateRange.to)
      toDate.setHours(23, 59, 59, 999)

      const userAgenciesNorm = (userAgencies || []).map(a => String(a || "").trim().toUpperCase())

      const filtered = cachedData.filter(item => {
        const itemAgencyNorm = String(item.agency || "").trim().toUpperCase()

        // Agency Check (case-insensitive & whitespace-trimmed)
        if (normTarget !== "ALL AGENCIES" && itemAgencyNorm !== normTarget) return false
        if (userRole !== "admin" && normTarget === "ALL AGENCIES") {
             if (userAgenciesNorm.length > 0 && !userAgenciesNorm.includes(itemAgencyNorm)) return false
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
          toast({ title: "No records found", description: "Try selecting a broader date range or agency.", variant: "destructive" })
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
          toast({ title: "Pop-up blocked", description: "Please allow pop-ups in your browser to print reports.", variant: "destructive" })
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
      toast({ title: "Report failed", description: "Could not generate the daily report.", variant: "destructive" })
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
  const isAgencyRole = userRole === "agency";
  const loginDisplayName = isAgencyRole
    ? (displayAgencyName || profileData?.name || profileData?.username || clientUsername || userRole)
    : (profileData?.name || profileData?.fullName || userName || profileData?.username || clientUsername || userRole);

  const ActiveModuleIcon = getModuleIcon(activeView)
  const activeModuleTitle = getModuleTitle(activeView, userRole)
  const hasModuleActions =
    isDisconnectionView || isDDView || activeView === "dtr" || activeView === "dtr-painting" || activeView === "nsc"

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50 h-14 flex items-center">
      <div className="w-full px-3 sm:px-5 lg:px-6">
        <div className="flex justify-between items-center gap-2">
          
          {/* LEFT SIDE: Mobile Drawer + Home / Active Module Breadcrumb */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <AppSidebar 
              isMobile={true} 
              activeView={activeView} 
              setActiveView={setActiveView} 
              userRole={userRole} 
              agencies={userAgencies}
              permissions={permissions}
              isSetupLocked={isSetupLocked}
            />

            {/* Home Brand Button (preserves 2s long press for SpotAI) */}
            <button
              type="button"
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100/90 transition-colors select-none cursor-pointer interactive-tap shrink-0"
              onClick={handleHomeClick}
              onMouseDown={handleHomeTouchStart}
              onMouseUp={handleHomeTouchEnd}
              onMouseLeave={handleHomeTouchEnd}
              onTouchStart={handleHomeTouchStart}
              onTouchEnd={handleHomeTouchEnd}
              onTouchCancel={handleHomeTouchEnd}
              title="Dashboard Home (Long press for SpotAI)"
            >
              <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs shrink-0">
                <HomeIcon className="h-4 w-4" />
              </div>
              {activeView === "home" && (
                <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                  Workspace
                </span>
              )}
            </button>

            {/* Active Module Breadcrumb Context */}
            {activeView !== "home" && (
              <div
                key={activeView}
                className="flex items-center gap-1.5 min-w-0 animate-fade-slide-up"
              >
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100/80 border border-slate-200/70 min-w-0">
                  <ActiveModuleIcon className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[130px] sm:max-w-[240px]">
                    {activeModuleTitle}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Quick Jump, Module Actions, Language, Profile, Account Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Quick Module Switcher Trigger (Cmd/Ctrl+K) */}
            {onOpenQuickSwitcher && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
                    onOpenQuickSwitcher()
                  }}
                  className="hidden lg:flex items-center gap-2 h-8 px-3 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-slate-300 text-xs text-slate-500 transition-all cursor-pointer interactive-tap"
                  title="Quick jump to any module (Ctrl+K)"
                >
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <span>Jump to module...</span>
                  <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded">
                    ⌘K
                  </kbd>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
                    onOpenQuickSwitcher()
                  }}
                  className="lg:hidden h-8 w-8 rounded-xl text-slate-600 hover:bg-slate-100 interactive-tap"
                  title="Jump to module"
                  aria-label="Jump to module"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Desktop Context Module Actions Dropdown (replaces 8+ unlabeled icons) */}
            {hasModuleActions && (
              <div className="hidden md:block">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs gap-1.5 shadow-2xs interactive-tap"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-600" />
                      <span>Actions</span>
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60 rounded-xl shadow-lg">
                    {isDisconnectionView && (
                      <>
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                          Exports & Reports
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onDownload && onDownload()}>
                          <FileText className="mr-2 h-4 w-4 text-red-600" />
                          <span>Download DC List (PDF)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDownloadExcel && onDownloadExcel()}>
                          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                          <span>Download DC List (Excel)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
                          <Download className="mr-2 h-4 w-4 text-slate-600" />
                          <span>Daily Report (Print)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDownloadDefaulters && onDownloadDefaulters()}>
                          <FileDown className="mr-2 h-4 w-4 text-blue-600" />
                          <span className="font-medium text-blue-700">Download Report</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowHistoryReportDialog(true)}>
                          <Clock className="mr-2 h-4 w-4 text-indigo-600" />
                          <span className="font-medium text-indigo-700">History Report</span>
                        </DropdownMenuItem>
                        {canSeeAgencyUpdates && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                              Insights & Updates
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={handleUpload} disabled={loading}>
                              <List className="mr-2 h-4 w-4 text-slate-600" />
                              <span>Agency Last Updates</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setActiveView("agency-updates")}>
                              <CalendarDays className="mr-2 h-4 w-4 text-indigo-500" />
                              <span>Agency Updates Report</span>
                            </DropdownMenuItem>
                          </>
                        )}
                        {isAdminUser && (
                          <>
                            <DropdownMenuItem onClick={() => setActiveView("analysis")}>
                              <BarChart3 className="mr-2 h-4 w-4 text-blue-600" />
                              <span>Analysis Dashboard</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open("/api/sheet-redirect", "_blank")}>
                              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                              <span>Edit DC Sheet</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </>
                    )}

                    {isDDView && (
                      <>
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                          Deemed Visit Actions
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={handleGenerateDDReport}>
                          <Download className="mr-2 h-4 w-4 text-blue-600" />
                          <span>Download DD List (PDF)</span>
                        </DropdownMenuItem>
                        {isAdminUser && (
                          <DropdownMenuItem onClick={() => window.open("/api/dd-sheet-redirect", "_blank")}>
                            <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                            <span>Edit DD Sheet</span>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}

                    {activeView === "dtr" && (
                      <>
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                          DTR Actions
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("dtr-action", { detail: { action: "refresh" } }))}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          <span>Refresh List</span>
                        </DropdownMenuItem>
                        {(userRole === "admin" || (permissions && permissions.dtr?.includes("create"))) && (
                          <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("dtr-action", { detail: { action: "upload" } }))}>
                            <Upload className="mr-2 h-4 w-4 text-indigo-600" />
                            <span className="font-medium text-indigo-700">Upload DTR List</span>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}

                    {activeView === "dtr-painting" && (
                      <>
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                          DTR Painting Actions
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("dtr-painting-action", { detail: { action: "refresh" } }))}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          <span>Refresh Painting List</span>
                        </DropdownMenuItem>
                        {userRole === "admin" && (
                          <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("dtr-painting-action", { detail: { action: "report" } }))}>
                            <Building2 className="mr-2 h-4 w-4 text-blue-600" />
                            <span className="font-medium text-blue-700">Agency Painting Report</span>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}

                    {activeView === "nsc" && (
                      <>
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                          NSC Actions
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("nsc-action", { detail: { action: "export" } }))}>
                          <Download className="mr-2 h-4 w-4 text-blue-600" />
                          <span className="font-medium text-blue-700">Export NSC Data</span>
                        </DropdownMenuItem>
                        {isAdminUser && (
                          <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("nsc-action", { detail: { action: "import-legacy" } }))}>
                            <Upload className="mr-2 h-4 w-4 text-indigo-600" />
                            <span className="font-medium text-indigo-700">Import Legacy Apps</span>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Language Toggle (Bilingual English <-> Bengali) */}
            <LanguageToggle />

            {/* User Info / Profile Link (Calm refined PRO shimmer on hover, no endless spinning comet) */}
            <div 
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
                setActiveView("profile")
              }}
              className={`relative rounded-xl cursor-pointer select-none group transition-all duration-200 interactive-tap ${
                profileData?.isPaid
                  ? "pro-sheen-sweep bg-gradient-to-r from-amber-50 via-yellow-50/90 to-amber-50 border border-amber-300/80 hover:border-amber-400 shadow-2xs"
                  : "hover:bg-slate-100/80 border border-transparent hover:border-slate-200/70"
              }`}
              title={`User: ${loginDisplayName} | Office (CCC): ${cccCode || "Default"}${profileData?.isPaid ? " | PRO SUBSCRIBER" : ""}`}
            >
              <div className="relative flex items-center gap-2 text-right px-2 py-1">
                <div className="flex flex-col justify-center items-end text-right min-w-0">
                  <span className="text-[11px] font-bold text-slate-900 capitalize truncate max-w-[85px] sm:max-w-[125px] leading-tight">
                    {loginDisplayName}
                  </span>
                  {cccCode && (
                    <span className="text-[9px] font-semibold text-blue-700/90 uppercase tracking-wider leading-none mt-0.5">
                      {cccCode}
                    </span>
                  )}
                </div>

                {/* Avatar with clean PRO badge */}
                <div className="relative flex flex-col items-center justify-center shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                    profileData?.isPaid
                      ? "bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 shadow-xs ring-1 ring-amber-300"
                      : "bg-blue-100/90 text-blue-600"
                  }`}>
                    {profileData?.isPaid ? (
                      <Crown className="h-3.5 w-3.5 fill-slate-950" />
                    ) : (
                      <User className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  {profileData?.isPaid && (
                    <span className="absolute -bottom-1 px-1 py-[0.5px] rounded-full text-[7.5px] font-black uppercase tracking-wider bg-slate-900 text-amber-300 border border-amber-400/80 leading-none">
                      PRO
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* --- DESKTOP WORKSPACE MENU (Clean consolidated controls) --- */}
            <div className="hidden md:flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 interactive-tap"
                    title="Workspace Settings & Account"
                    aria-label="Workspace Settings & Account"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                    Workspace
                  </DropdownMenuLabel>
                  {isAdminUser && onAdminClick && (
                    <DropdownMenuItem onClick={onAdminClick}>
                      <Settings className="mr-2 h-4 w-4 text-slate-600" />
                      <span>Admin Panel</span>
                    </DropdownMenuItem>
                  )}
                  {isAdminUser && (
                    <DropdownMenuItem
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
                        setShowBroadcastPushModal(true)
                      }}
                    >
                      <Bell className="mr-2 h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700">Broadcast Push Alert</span>
                    </DropdownMenuItem>
                  )}
                  {isAdminUser && (
                    <DropdownMenuItem onClick={handleGlobalRefresh}>
                      <RefreshCw className="mr-2 h-4 w-4 text-blue-600" />
                      <span>Sync Fresh Data</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
                      setShowThemeModal(true)
                    }}
                  >
                    <Palette className="mr-2 h-4 w-4 text-indigo-600" />
                    <span>Home Card Theme</span>
                  </DropdownMenuItem>
                  <FeedbackDialog
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center justify-between gap-2">
                        <span className="flex items-center">
                          <Star className="mr-2 h-4 w-4 text-amber-500 fill-amber-400" />
                          <span>My Feedback &amp; Rating</span>
                        </span>
                        {feedbackRewardEligible && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                            <Gift className="h-2.5 w-2.5" />+{FEEDBACK_REWARD_DAYS}d
                          </span>
                        )}
                      </DropdownMenuItem>
                    }
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openChangePwdDialog}>
                    <KeyRound className="mr-2 h-4 w-4 text-slate-600" />
                    <span>Change Password</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center justify-between gap-2">
                        <span className="flex items-center">
                          <MessageSquarePlus className="mr-2 h-4 w-4 text-amber-500" />
                          <span>My Feedback &amp; Rating</span>
                        </span>
                        {feedbackRewardEligible && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                            <Gift className="h-2.5 w-2.5" />+{FEEDBACK_REWARD_DAYS}d
                          </span>
                        )}
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
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-3"></div>
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

      {loggingOut &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl px-7 py-6 flex flex-col items-center gap-3.5 max-w-xs w-full text-center">
              <div className="relative h-12 w-12 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">Signing you out...</p>
                <p className="text-xs text-slate-500">Closing your active session securely</p>
              </div>
            </div>
          </div>,
          document.body
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

      {/* Global Sync Confirmation AlertDialog (replaces window.confirm) */}
      <AlertDialog open={showGlobalRefreshConfirm} onOpenChange={setShowGlobalRefreshConfirm}>
        <AlertDialogContent className="rounded-2xl max-w-md bg-white border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              Sync Fresh Data from Server?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              This will clear local cached data across modules and reload the workspace with fresh server snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeGlobalRefresh}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            >
              Sync & Reload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile & Subscription Status Dialog (Unified Clean Light Surface) */}
      <Dialog open={showProfileDialog} onOpenChange={(open) => {
        setShowProfileDialog(open)
        if (open) {
          setIsEditingProfile(false)
          setProfileSaveError(null)
          setProfileSaveSuccess(false)
          loadUserProfile()
        }
      }}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200 text-slate-900 rounded-2xl shadow-xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
                My Profile & Workspace Status
              </DialogTitle>
            </div>
          </DialogHeader>

          {profileData ? (
            <div className="space-y-3.5 py-2 text-sm text-slate-700">
              <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2.5 items-center">
                <span className="text-slate-500 font-medium">Name:</span>
                <div className="col-span-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 truncate">{profileData.name || profileData.fullName || "N/A"}</span>
                  {!isEditingProfile && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={startEditProfile}
                      className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full shrink-0"
                      title="Edit Profile Details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2.5">
                <span className="text-slate-500 font-medium">Office:</span>
                <span className="col-span-2 font-mono font-semibold text-blue-700">
                  {profileData.cccCode} {profileData.cccName && profileData.cccName !== profileData.cccCode ? `(${profileData.cccName})` : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2.5">
                <span className="text-slate-500 font-medium">Agency:</span>
                <span className="col-span-2 text-xs font-semibold text-slate-800">
                  {profileData.agencies && profileData.agencies.length > 0
                    ? profileData.agencies.join(", ")
                    : "None (All Access)"}
                </span>
              </div>

              {!isEditingProfile ? (
                <>
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2.5 items-center">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-indigo-500" />
                      User Ph:
                    </span>
                    <div className="col-span-2 flex items-center justify-between gap-2">
                      {(profileData.userMobile || profileData.mobileNumber) && /^\d{10}$/.test(profileData.userMobile || profileData.mobileNumber) ? (
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          +91 {profileData.userMobile || profileData.mobileNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">Not Set</span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={startEditProfile}
                        className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                        title="Edit Personal Mobile"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {(profileData.hasAgency || profileData.agencyMobile) && (
                    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2.5 items-center">
                      <span className="text-slate-500 font-medium flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                        Agency Ph:
                      </span>
                      <div className="col-span-2">
                        {profileData.agencyMobile && /^\d{10}$/.test(profileData.agencyMobile) ? (
                          <span className="font-mono font-semibold text-slate-800 text-xs">
                            +91 {profileData.agencyMobile}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not recorded</span>
                        )}
                      </div>
                    </div>
                  )}

                  {(profileData.hasAgency || profileData.vendorCode) && (
                    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2.5 items-center">
                      <span className="text-slate-500 font-medium flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-blue-600" />
                        Vendor Code:
                      </span>
                      <div className="col-span-2">
                        {profileData.vendorCode ? (
                          <span className="font-mono font-bold text-blue-800 text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {profileData.vendorCode}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not Tagged</span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5 text-blue-600" />
                    Update Personal Details
                  </span>

                  {profileSaveError && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{profileSaveError}</span>
                    </div>
                  )}

                  {profileSaveSuccess && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span>Profile updated successfully!</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="profile-header-name" className="text-xs text-slate-700 flex items-center gap-1">
                      <User className="h-3 w-3 text-blue-600" />
                      Full Name
                    </Label>
                    <Input
                      id="profile-header-name"
                      type="text"
                      placeholder="Your full name"
                      value={profileEditName}
                      onChange={(e) => setProfileEditName(e.target.value)}
                      className="h-9 text-xs bg-white border-slate-300"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="profile-mobile" className="text-xs text-slate-700 flex items-center gap-1">
                      <Phone className="h-3 w-3 text-indigo-600" />
                      10-Digit Mobile Number
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">+91</span>
                      <Input
                        id="profile-mobile"
                        type="tel"
                        maxLength={10}
                        placeholder="10-digit phone"
                        value={profileEditMobile}
                        onChange={(e) => setProfileEditMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="h-9 pl-9 text-xs bg-white border-slate-300 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" disabled={profileSaving} onClick={() => setIsEditingProfile(false)} className="h-8 text-xs">
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={profileSaving || (profileEditMobile && profileEditMobile.length > 0 && profileEditMobile.length !== 10)}
                      onClick={handleSaveProfileDetails}
                      className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      {profileSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                      {profileSaving ? "Saving..." : "Save Details"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Payment History */}
              {profileData?.paymentHistory && profileData.paymentHistory.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-blue-600" />
                      Payment History
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {profileData.paymentHistory.length} transaction{profileData.paymentHistory.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {profileData.paymentHistory.map((tx: any) => (
                      <div key={tx.id || tx.paymentId} className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-800 truncate">{tx.planName}</span>
                            <span className="font-mono text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {tx.paymentId.slice(0, 10)}...
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-emerald-700 text-xs shrink-0 ml-2">₹{tx.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto font-medium text-xs flex items-center justify-center gap-1.5 rounded-xl"
              onClick={() => {
                setShowProfileDialog(false)
                openChangePwdDialog()
              }}
            >
              <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
              Change Password
            </Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800 w-full sm:w-auto font-semibold text-xs rounded-xl" onClick={() => setShowProfileDialog(false)}>
              Close
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