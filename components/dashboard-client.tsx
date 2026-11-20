"use client"

import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { getFromCache, saveToCache, getCccPrefix } from "@/lib/indexed-db"
import { logout } from "@/app/actions/auth"
import { DashboardShell } from "@/components/dashboard-shell"
import { ViewType } from "@/components/app-sidebar"
import { DashboardProvider } from "@/components/dashboard-context"
import { DashboardMenu } from "@/components/dashboard-menu" 
import { FloatingRatingPill } from "@/components/floating-rating-pill"
import type { ConsumerData } from "@/lib/google-sheets"
// Heavy libraries loaded dynamically in download functions
// import jsPDF / autoTable / XLSX — see handleDownloadConfirm, generateStatusReport, downloadPDF

import { ModuleWaiter } from "@/components/ui/module-waiter"

// Lazy-load view components with instant beautiful waiter screens so switching modules never shows a blank page
const ConsumerList = dynamic(() => import("@/components/consumer-list").then(m => ({ default: m.ConsumerList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="red"
      title="Opening Disconnection Module"
      subtitle="Loading consumer list, dues & field filters"
      messages={["Loading disconnection list...", "Preparing consumer cards...", "Checking latest updates..."]}
    />
  ),
})
const AdminPanel = dynamic(() => import("@/components/admin-panel").then(m => ({ default: m.AdminPanel })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="indigo"
      title="Opening Admin Panel"
      subtitle="Loading agencies, users, roles & CCC settings"
      showSkeletonCards={false}
    />
  ),
})
const DDList = dynamic(() => import("@/components/dd-list").then(m => ({ default: m.DDList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="orange"
      title="Opening Deemed Visit"
      subtitle="Loading deemed disconnected consumer records"
    />
  ),
})
const AnalysisDashboard = dynamic(() => import("@/components/analysis-dashboard").then(m => ({ default: m.AnalysisDashboard })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="indigo"
      title="Opening Analysis Dashboard"
      subtitle="Preparing charts & agency performance metrics"
      showSkeletonCards={false}
    />
  ),
})
const ReconnectionList = dynamic(() => import("@/components/reconnection-list").then(m => ({ default: m.ReconnectionList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="blue"
      title="Opening Reconnection Module"
      subtitle="Loading pending supply restoration orders"
    />
  ),
})
const MeterList = dynamic(() => import("@/components/meter-list").then(m => ({ default: m.MeterList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="indigo"
      title="Opening Meter Management"
      subtitle="Loading meter stock, issuance & installation logs"
    />
  ),
})
const NscList = dynamic(() => import("@/components/nsc-list").then(m => ({ default: m.NscList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="emerald"
      title="Opening NSC Module"
      subtitle="Loading new service connection applications"
    />
  ),
})
const AgencyUpdatesReport = dynamic(() => import("@/components/agency-updates-report").then(m => ({ default: m.AgencyUpdatesReport })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="blue"
      title="Opening Agency Updates Report"
      subtitle="Compiling daily field updates across agencies"
      showSkeletonCards={false}
    />
  ),
})
const ConsumerMaster = dynamic(() => import("@/components/consumer-master").then(m => ({ default: m.ConsumerMaster })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="blue"
      title="Opening Consumer Master"
      subtitle="Connecting to consumer master database"
      showSkeletonCards={false}
    />
  ),
})
const DTRList = dynamic(() => import("@/components/dtr-list").then(m => ({ default: m.DTRList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="amber"
      title="Opening DTR Verification"
      subtitle="Loading transformer audit records"
    />
  ),
})
const DTRPaintingList = dynamic(() => import("@/components/dtr-painting-list").then(m => ({ default: m.DTRPaintingList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="orange"
      title="Opening DTR Painting"
      subtitle="Loading DTR painting logs & photo proofs"
    />
  ),
})
const MeterReplacementList = dynamic(() => import("@/components/meter-replacement-list").then(m => ({ default: m.MeterReplacementList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="indigo"
      title="Opening Replacement List"
      subtitle="Loading proposed meter replacements"
    />
  ),
})
const MaterialList = dynamic(() => import("@/components/material-list").then(m => ({ default: m.MaterialList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="amber"
      title="Opening Material Management"
      subtitle="Loading office store stock & issuance records"
    />
  ),
})
const SafetyList = dynamic(() => import("@/components/safety-list").then(m => ({ default: m.SafetyList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="amber"
      title="Opening Safety Inspection"
      subtitle="Loading safety hazard reports & approvals"
    />
  ),
})
const MiscInspectionList = dynamic(() => import("@/components/misc-inspection-list").then(m => ({ default: m.MiscInspectionList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="indigo"
      title="Opening Misc Inspections"
      subtitle="Loading field inspection requests"
    />
  ),
})
const IcdsList = dynamic(() => import("@/components/icds/icds-list").then(m => ({ default: m.IcdsList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="emerald"
      title="Opening ICDS Electrification"
      subtitle="Loading Anganwadi electrification progress"
    />
  ),
})
const PermanentDisconnectionList = dynamic(() => import("@/components/permanent-disconnection/permanent-disconnection-list").then(m => ({ default: m.PermanentDisconnectionList })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="red"
      title="Opening Permanent Disconnection"
      subtitle="Loading meter dismantling & note sheet records"
    />
  ),
})
const DivisionalDashboard = dynamic(() => import("@/components/divisional-dashboard").then(m => ({ default: m.DivisionalDashboard })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="blue"
      title="Opening Divisional Dashboard"
      subtitle="Loading division-wide CCC analytics"
      showSkeletonCards={false}
    />
  ),
})
const OsdDetailsView = dynamic(() => import("@/components/osd-details-view").then(m => ({ default: m.OsdDetailsView })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="blue"
      title="Opening SpotAI Intelligence"
      subtitle="Loading live consumer analytics"
      showSkeletonCards={false}
    />
  ),
})
const OsdPageView = dynamic(() => import("@/components/osd-page-view").then(m => ({ default: m.OsdPageView })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="blue"
      title="Opening Consumer Details & OSD"
      subtitle="Preparing live dues & billing lookup"
      showSkeletonCards={false}
    />
  ),
})
const GisCamera = dynamic(() => import("@/components/gis-camera").then(m => ({ default: m.GisCamera })), {
  ssr: false,
  loading: () => (
    <ModuleWaiter
      variant="module"
      accent="indigo"
      title="Opening GIS Camera"
      subtitle="Initializing GPS & watermark engine"
      showSkeletonCards={false}
    />
  ),
})
const NewYearPopup = dynamic(() => import("@/components/new-year-popup").then(m => ({ default: m.NewYearPopup })), { ssr: false })
const SubscriptionExpiryAlertModal = dynamic(() => import("@/components/subscription-expiry-alert-modal").then(m => ({ default: m.SubscriptionExpiryAlertModal })), { ssr: false })

import { Loader2, AlertTriangle, KeyRound, CheckCircle2, User, ArrowLeft, Phone, Hash, Pencil, Check, AlertCircle, Building2, Lock, Crown, Sparkles, ShieldCheck, Receipt, Gift } from "lucide-react"
import { OnboardingGuideDialog } from "@/components/onboarding-guide-dialog"
import { useOnboardingGuide, notifyOnboardingUpdated } from "@/components/onboarding-spotlight"
import { VendorSubscriptionCheckout } from "@/components/vendor-subscription-checkout"
import { PaymentCelebrationModal } from "@/components/payment-celebration-modal"
import { FeedbackDialog } from "@/components/feedback-dialog"
import {
  FEEDBACK_REWARD_DAYS,
  FEEDBACK_REWARD_EVENT,
  type FeedbackRewardGrantResult,
} from "@/lib/feedback-reward-utils"
import { getCurrentSpotAiHashRoute, isValidSpotAiHash, isSpotAiSessionValid, lockSpotAiSession, unlockSpotAiSession } from "@/lib/spotai-guard"

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
import { toast } from "@/hooks/use-toast"

// Helper type for PDF generation
type TableCell = string | { content: string; colSpan?: number; styles?: any };

interface DashboardClientProps {
  role: string
  agencies: string[]
  initialPermissions?: Record<string, string[]>
  initialHasFeedback?: boolean
  initialProfile?: {
    name?: string
    username?: string
    cccCode?: string
    cccName?: string
    isSubscribed?: boolean
    subscriptionExpiresAt?: string
    bypassSubscription?: boolean
  }
}

export default function DashboardClient({ role, agencies, initialPermissions, initialHasFeedback, initialProfile }: DashboardClientProps) {
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [activeView, setActiveViewInternal] = useState<ViewType | "home">("home")
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [adminInitialView, setAdminInitialView] = useState<any>(undefined)
  const onboarding = useOnboardingGuide(role)
  const prevCoreLockedRef = useRef<boolean | null>(null)

  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(initialProfile?.isSubscribed ?? true)
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(initialProfile?.subscriptionExpiresAt || "")
  const [profileName, setProfileName] = useState(initialProfile?.name || "")
  const [bypassSubscription, setBypassSubscription] = useState(!!initialProfile?.bypassSubscription)
  const [profileCccCode, setProfileCccCode] = useState(initialProfile?.cccCode || "")
  const [profileCccName, setProfileCccName] = useState(initialProfile?.cccName || "")

  const [showCelebrationModal, setShowCelebrationModal] = useState(false)
  const [celebrationDetails, setCelebrationDetails] = useState<{
    planName?: string
    expiresAt?: string
    paymentId?: string
    amount?: number
  }>({})
  const [showPaywallFeedbackDialog, setShowPaywallFeedbackDialog] = useState(false)
  const [paywallRewardEligible, setPaywallRewardEligible] = useState(false)

  const dashboardPlans = [
    { id: "monthly_79", amount: 7900, name: "1 Month Vendor Access", days: 30, label: "1 Month", price: "₹79", originalPrice: "₹199", badge: "60% OFF", subtext: "₹79 / mo" },
    { id: "quarterly_199", amount: 19900, name: "3 Month Vendor Access", days: 90, label: "3 Months", price: "₹199", originalPrice: "₹597", badge: "67% OFF", popular: true, subtext: "₹66 / mo" },
    { id: "half_yearly_349", amount: 34900, name: "6 Month Vendor Access", days: 180, label: "6 Months", price: "₹349", originalPrice: "₹1,194", badge: "71% OFF", subtext: "₹58 / mo" },
  ]
  const [selectedDashboardPlan, setSelectedDashboardPlan] = useState(dashboardPlans[0])

  const handlePaymentSuccess = async (result: {
    expiresAt: string
    paymentId: string
    planName?: string
    amount?: number
  }) => {
    // 1. Immediately update access flags in state so paywall vanishes without hard reload
    setIsSubscribed(true)
    setSubscriptionExpiresAt(result.expiresAt)

    // 2. Refresh full user profile to fetch fresh payment history
    await fetchFullUserProfile()

    // 3. Trigger enthusiastic celebration modal
    setCelebrationDetails({
      planName: result.planName || "1 Month Vendor Access",
      expiresAt: result.expiresAt,
      paymentId: result.paymentId,
      amount: result.amount || 99,
    })
    setShowCelebrationModal(true)
  }

  // Full User Profile & Edit State
  const [profileData, setProfileData] = useState<any>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileEditName, setProfileEditName] = useState("")
  const [profileEditMobile, setProfileEditMobile] = useState("")
  const [profileEditVendor, setProfileEditVendor] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false)

  const fetchFullUserProfile = async () => {
    try {
      const res = await fetch("/api/user/profile")
      if (res.ok) {
        const data = await res.json()
        setProfileData(data)
        if (data.name) setProfileName(data.name)
        if (data.cccCode) setProfileCccCode(data.cccCode)
        if (data.cccName) setProfileCccName(data.cccName)
        if (typeof data.isSubscribed === "boolean") setIsSubscribed(data.isSubscribed)
        if (data.subscriptionExpiresAt) setSubscriptionExpiresAt(data.subscriptionExpiresAt)
        return data
      }
    } catch (e) {
      console.warn("Failed to fetch full user profile in dashboard client", e)
    }
  }

  useEffect(() => {
    fetchFullUserProfile()
  }, [])

  // Live subscription sync whenever a +7 day feedback reward is granted anywhere in the app
  useEffect(() => {
    const handleFeedbackReward = (event: Event) => {
      const detail = (event as CustomEvent<FeedbackRewardGrantResult>)?.detail
      if (!detail?.granted) return
      setIsSubscribed(true)
      if (detail.newExpiresAt) {
        setSubscriptionExpiresAt(detail.newExpiresAt)
      }
      setPaywallRewardEligible(false)
      fetchFullUserProfile()
    }
    window.addEventListener(FEEDBACK_REWARD_EVENT, handleFeedbackReward)
    return () => window.removeEventListener(FEEDBACK_REWARD_EVENT, handleFeedbackReward)
  }, [])

  // When an agency user lands on the expired subscription paywall, check if they can unlock +7 free days via review
  useEffect(() => {
    if (role?.toLowerCase() !== "agency" || isSubscribed) {
      setPaywallRewardEligible(false)
      return
    }
    let mounted = true
    fetch("/api/feedback", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.rewardStatus) {
          setPaywallRewardEligible(Boolean(data.rewardStatus.eligible))
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [role, isSubscribed])

  const startEditProfile = () => {
    setProfileEditName(profileData?.name || profileData?.fullName || profileName || "")
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
      await fetchFullUserProfile()
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

  // Handle Google OAuth success param and workspace unlock transitions
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("success") === "true") {
        setShowSuccessModal(true)
        notifyOnboardingUpdated()
        // Clean up search params to avoid popping up again on refresh
        const cleanUrl = window.location.pathname + window.location.hash
        window.history.replaceState(null, "", cleanUrl)
      }
    }
  }, [role])

  // Celebrate when core setup unlocks (1 Agency + 1 User created)
  useEffect(() => {
    if (!onboarding.loaded) return
    if (prevCoreLockedRef.current === true && !onboarding.isCoreSetupLocked) {
      toast({
        title: "Workspace Unlocked!",
        description: "All operational modules are now enabled. Continue with Zone Map & DC List whenever ready.",
      })
    }
    prevCoreLockedRef.current = onboarding.isCoreSetupLocked
  }, [onboarding.loaded, onboarding.isCoreSetupLocked])

  // Keep locked admins focused on Home or Admin Panel until 1 Agency + 1 User exist
  useEffect(() => {
    if (
      onboarding.isCoreSetupLocked &&
      activeView !== "home" &&
      activeView !== "admin" &&
      activeView !== "profile"
    ) {
      setActiveViewInternal("home")
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
      }
    }
  }, [onboarding.isCoreSetupLocked, activeView])

  const handleGuideNavigate = (targetView: string) => {
    if (targetView.startsWith("admin:")) {
      const subView = targetView.split(":")[1]
      setAdminInitialView(subView as any)
      setActiveViewInternal("admin")
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", `#admin/${subView}`)
      }
    } else if (targetView === "consumerMaster" || targetView === "consumer-master") {
      setActiveView("consumer-master")
    } else {
      setActiveView(targetView as any)
    }
  }

  // Handle setting active view and updating hash/history
  const setActiveView = (newView: ViewType | "home") => {
    if (
      onboarding.isCoreSetupLocked &&
      newView !== "home" &&
      newView !== "admin" &&
      newView !== "profile"
    ) {
      toast({
        title: "Quick Setup Required",
        description: "Please add at least 1 Agency and 1 User in Admin Panel to unlock all modules.",
      })
      setActiveViewInternal("home")
      return
    }
    if (newView !== "admin") {
      setAdminInitialView(undefined)
    }
    setActiveViewInternal(newView)
    if (typeof window === "undefined") return

    let expectedHash = ""
    if (newView === "home") {
      expectedHash = ""
    } else if (newView === "spotai") {
      expectedHash = `#${getCurrentSpotAiHashRoute()}`
    } else {
      expectedHash = `#${newView}`
    }

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
      const hash = window.location.hash.substring(1) // e.g. "reconnection/create" or "spotai-9f82a1"
      const [hashModule] = hash.split("/")

      if (hashModule) {
        // Guard check for SpotAI routes (static #spotai or rotating dynamic hashes)
        if (hashModule === "spotai" || hashModule.startsWith("spotai-") || hashModule.startsWith("spotai")) {
          const isValidHash = isValidSpotAiHash(hashModule)

          if (isValidHash) {
            unlockSpotAiSession()
            if (activeView !== "spotai") {
              setActiveViewInternal("spotai")
            }
          } else {
            // Block expired or static #spotai -> clear URL and redirect to home
            lockSpotAiSession()
            window.history.replaceState(null, "", window.location.pathname)
            if (activeView !== "home") {
              setActiveViewInternal("home")
            }
          }
          return
        }

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

  const [permissions, setPermissions] = useState<Record<string, string[]>>(initialPermissions || {})
  const [permsLoaded, setPermsLoaded] = useState(!!(initialPermissions && Object.keys(initialPermissions).length > 0))
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

    // Load cached permissions from sessionStorage only if role matches
    let isCacheFresh = false
    try {
      const cachedRole = sessionStorage.getItem("user_permissions_role")
      const cached = sessionStorage.getItem("user_permissions")
      const cachedTs = Number(sessionStorage.getItem("user_permissions_ts") || 0)
      const isFresh = Date.now() - cachedTs < 15 * 60 * 1000 // 15 min TTL

      if (cached && cachedRole === role) {
        const parsed = JSON.parse(cached)
        if (parsed) {
          setPermissions(parsed)
          setPermsLoaded(true)
          if (isFresh) {
            isCacheFresh = true
          }
        }
      } else {
        sessionStorage.removeItem("user_permissions")
        sessionStorage.removeItem("user_permissions_role")
        sessionStorage.removeItem("user_permissions_ts")
      }
    } catch (e) {
      console.error("Failed to read permissions from sessionStorage", e)
    }

    // Skip network request if cache is fresh
    if (isCacheFresh) {
      return () => {
        active = false
      }
    }

    fetch("/api/auth/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) {
          if (data?.permissions) {
            setPermissions(data.permissions)
            try {
              sessionStorage.setItem("user_permissions", JSON.stringify(data.permissions))
              sessionStorage.setItem("user_permissions_role", role)
              sessionStorage.setItem("user_permissions_ts", Date.now().toString())
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
            setProfileCccName(data.cccName || "")
            try {
              localStorage.setItem("user_ccc_code", data.cccCode || "")
              sessionStorage.setItem("user_ccc_code", data.cccCode || "")
              if (data.cccName) {
                localStorage.setItem("user_ccc_name", data.cccName || "")
                sessionStorage.setItem("user_ccc_name", data.cccName || "")
              }
              localStorage.setItem("user_role", role.toLowerCase())
              sessionStorage.setItem("user_role", role.toLowerCase())
              if (data.username) {
                localStorage.setItem("user_username", data.username.toLowerCase())
                sessionStorage.setItem("user_username", data.username.toLowerCase())
              }
            } catch (e) {
              console.error("Failed to save cccCode/username to storage", e)
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
  const [reportType, setReportType] = useState<"filtered" | "defaulters" | "status">("filtered")
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
    if (!permsLoaded) return
    const canReadDisconnection = role === "admin" || permissions?.disconnection?.includes("read")
    if (!canReadDisconnection) return
  }, [permsLoaded, permissions, role])

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
  const openDownloadDialog = (defaultType: "filtered" | "defaulters" | "status" = "filtered") => {
    if (activeView !== "disconnection" || !consumerListRef.current) {
      toast({ variant: "destructive", title: "Open Disconnection List", description: "Please open the Disconnection List to download data." });
      return;
    }
    const consumers = consumerListRef.current.getCurrentConsumers();
    if (consumers.length === 0) {
      toast({ variant: "destructive", title: "No Data Available", description: "No consumer data available for export." });
      return;
    }
    setReportType(defaultType);
    setIsDownloadDialogOpen(true);
  };

  // --- 2. EXECUTE DOWNLOAD ---
  const handleDownloadConfirm = async () => {
    const topN = parseInt(downloadCount, 10);
    if (!topN || topN <= 0) {
      toast({ variant: "destructive", title: "Invalid Count", description: "Please enter a valid positive number." });
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

      const tableColumn = ["#", "Con ID", "Name", "MRU/Zone", "Address", "Phone", "Device", "Class", "Due Date", "OSD", "Agency", "Status", "Reading", "Notes"];
      const tableRows = topConsumers.map((c, index) => [
        index + 1,
        c.consumerId || "-",
        c.name || "-",
        c.mru || "-",
        c.address ? (c.address.length > 75 ? c.address.substring(0, 72) + "..." : c.address.trim()) : "-",
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
        styles: { fontSize: 7, font: "helvetica", overflow: "linebreak", cellPadding: 1.5 },
        headStyles: { fillColor: [40, 53, 147], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 16 },
          2: { cellWidth: 24 },
          3: { cellWidth: 16, halign: "center" },
          4: { cellWidth: 42 },
          5: { cellWidth: 18 },
          6: { cellWidth: 12 },
          7: { cellWidth: 10 },
          8: { cellWidth: 16 },
          9: { cellWidth: 18, halign: "right" },
          10: { cellWidth: 20 },
          11: { cellWidth: 20, halign: "center" },
          12: { cellWidth: 12 },
          13: { cellWidth: 24 },
        },
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
      toast({ variant: "destructive", title: "No Matching Consumers", description: "No consumers found for the selected date range." });
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
          "Total Paid Amount (₹)": rows.reduce((s, c) => {
            const rawPaid = c.paidAmount && c.paidAmount.trim() !== "" ? Number(c.paidAmount) : 0
            const os = Number(c.d2NetOS || 0)
            const actual = rawPaid > 0 && os > 0 ? Math.min(rawPaid, os) : (rawPaid || os)
            return s + actual
          }, 0),
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

          const cols = ["#", "Con ID", "Name", "MRU/Zone", "Address", "Mobile", "Agency", "Class", "Status", "Date", "OSD", "Reading", "Remarks"];
          const body = rows.map((c, i) => [
            i + 1,
            c.consumerId || "-",
            c.name || "-",
            c.mru || "-",
            c.address ? (c.address.length > 75 ? c.address.substring(0, 72) + "..." : c.address.trim()) : "-",
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
            styles: { fontSize: 6.5, font: "helvetica", overflow: "linebreak", cellPadding: 1.5 },
            headStyles: { fillColor: [40, 53, 147], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
            columnStyles: { 
              3: { cellWidth: 16, halign: "center" }, 
              4: { cellWidth: 42 }, 
              12: { cellWidth: 28 } 
            },
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

  // --- EXCEL DOWNLOAD FOR CURRENT FILTERED DC LIST ---
  const downloadExcel = async () => {
    if (activeView !== "disconnection" || !consumerListRef.current) {
      toast({ variant: "destructive", title: "Open Disconnection List", description: "Please open the Disconnection List view first to export data." });
      return;
    }
    const consumers = [...consumerListRef.current.getCurrentConsumers()];
    if (consumers.length === 0) {
      toast({ variant: "destructive", title: "No Data to Export", description: "No consumer records match the current filters." });
      return;
    }

    const XLSX = await import("xlsx");
    
    // Sort same as PDF: agency A-Z, then OSD high to low
    consumers.sort((a, b) => {
      const agencyCompare = (a.agency || "").localeCompare(b.agency || "");
      if (agencyCompare !== 0) return agencyCompare;
      const aOsd = Number.parseFloat(a.d2NetOS || "0");
      const bOsd = Number.parseFloat(b.d2NetOS || "0");
      return bOsd - aOsd;
    });

    const rows = consumers.map((c, index) => ({
      "Sl No": index + 1,
      "Office Code": c.offCode || "-",
      "MRU / Zone": c.mru || "-",
      "Consumer ID": /^\d+$/.test(c.consumerId) ? Number(c.consumerId) : (c.consumerId || "-"),
      "Name": c.name || "-",
      "Address": c.address || "-",
      "Mobile Number": c.mobileNumber || "-",
      "Device": c.device || "-",
      "Class": c.baseClass || "-",
      "Due Date Range": c.osDuedateRange || "-",
      "Outstanding Dues (₹)": Number(c.d2NetOS || 0),
      "Discon Status": c.disconStatus || "-",
      "Discon Date": c.disconDate || "-",
      "Paid Amount (₹)": c.paidAmount && c.paidAmount.trim() !== "" ? Number(c.paidAmount) : "",
      "Agency": c.agency || "-",
      "Meter Reading": c.reading || "-",
      "Notes / Remarks": c.notes || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 6 },  // Sl No
      { wch: 12 }, // Office Code
      { wch: 14 }, // MRU / Zone
      { wch: 14 }, // Consumer ID
      { wch: 25 }, // Name
      { wch: 45 }, // Address
      { wch: 14 }, // Mobile
      { wch: 12 }, // Device
      { wch: 10 }, // Class
      { wch: 18 }, // Due Date
      { wch: 18 }, // Outstanding Dues
      { wch: 18 }, // Status
      { wch: 14 }, // Date
      { wch: 14 }, // Paid Amount
      { wch: 18 }, // Agency
      { wch: 14 }, // Meter Reading
      { wch: 30 }, // Notes
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DC List");

    // Add Summary Sheet
    const agencySummary: Record<string, { count: number; totalOsd: number }> = {};
    consumers.forEach(c => {
      const ag = c.agency || "Un-Allocated";
      if (!agencySummary[ag]) agencySummary[ag] = { count: 0, totalOsd: 0 };
      agencySummary[ag].count++;
      agencySummary[ag].totalOsd += Number(c.d2NetOS || 0);
    });

    const summaryRows = Object.entries(agencySummary).map(([agency, data]) => ({
      "Agency": agency,
      "Consumer Count": data.count,
      "Total Outstanding Dues (₹)": data.totalOsd,
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet["!cols"] = [{ wch: 25 }, { wch: 16 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Agency Summary");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `DC_List_${dateStr}.xlsx`);
  };

  // --- STANDARD REPORT PDF ---
  const downloadPDF = async () => {
    if (activeView !== "disconnection" || !consumerListRef.current) {
      toast({ variant: "destructive", title: "Open Disconnection List", description: "Please open the Disconnection List view first to export PDF." });
      return;
    }
    
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    const consumers = [...consumerListRef.current.getCurrentConsumers()];
    if (consumers.length === 0) {
      toast({ variant: "destructive", title: "No Data to Export", description: "No consumer records match the current filters." });
      return;
    }

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

      const tableColumn = ["#", "Con ID", "Name", "MRU/Zone", "Address", "Phone", "Device", "Class", "Due Date", "OSD", "Status", "Reading", "Remarks"];
      const tableRows = agencyConsumers.map((c, index) => [
        index + 1,
        c.consumerId || "-",
        c.name || "-",
        c.mru || "-",
        c.address ? (c.address.length > 75 ? c.address.substring(0, 72) + "..." : c.address.trim()) : "-",
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

      autoTable(doc, { 
        startY: 25, 
        head: [tableColumn], 
        body: tableRows as any, 
        styles: { fontSize: 6.5, font: "helvetica", overflow: "linebreak", cellPadding: 1.5 },
        headStyles: { fillColor: [40, 53, 147], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },   // #
          1: { cellWidth: 16 },                    // Con ID
          2: { cellWidth: 26 },                    // Name
          3: { cellWidth: 16, halign: "center" },  // MRU/Zone
          4: { cellWidth: 44 },                    // Address (wraps into 2 lines)
          5: { cellWidth: 18 },                    // Phone
          6: { cellWidth: 12, halign: "center" },  // Device
          7: { cellWidth: 10, halign: "center" },  // Class
          8: { cellWidth: 16 },                    // Due Date
          9: { cellWidth: 18, halign: "right" },   // OSD
          10: { cellWidth: 22, halign: "center" }, // Status
          11: { cellWidth: 12, halign: "center" }, // Reading
          12: { cellWidth: 26 },                    // Remarks
        },
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
      <ModuleWaiter
        variant="fullscreen"
        accent="indigo"
        title="Authorizing Workspace"
        subtitle="Preparing your CCC modules and role access"
        messages={[
          loadingText || "Securing connection...",
          "Loading role permissions...",
          "Syncing CCC workspace...",
        ]}
      />
    )
  }

  return (
    <DashboardProvider value={{ activeView, setActiveView }}>
      <DashboardShell
        role={role}
        agencies={agencies}
        userName={profileName || initialProfile?.name || initialProfile?.username}
        userCccCode={profileCccCode || initialProfile?.cccCode}
        initialProfile={profileData || initialProfile}
        showAdminPanel={showAdminPanel}
        openAdmin={() => setShowAdminPanel(true)}
        closeAdmin={handleAdminClose}
        activeView={activeView}
        setActiveView={setActiveView}
        onDownload={downloadPDF}
        onDownloadExcel={downloadExcel}
        onDownloadDefaulters={() => openDownloadDialog("defaulters")}
        permissions={permissions}
        isSetupLocked={onboarding.isCoreSetupLocked}
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
                  onValueChange={(v: "filtered" | "defaulters" | "status") => setReportType(v)}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="filtered" id="rt-filt" />
                    <Label htmlFor="rt-filt">Current Filtered DC List ({consumerListRef.current?.getCurrentConsumers().length || 0} consumers)</Label>
                  </div>
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
                if (reportType === "filtered") {
                  if (downloadFormat === "excel") downloadExcel();
                  else downloadPDF();
                  setIsDownloadDialogOpen(false);
                } else if (reportType === "status") {
                  generateStatusReport();
                } else {
                  handleDownloadConfirm();
                }
              }}>
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* VIEW SWITCHING LOGIC */}
        
        {role === "division_viewer" ? (
          <DivisionalDashboard userRole={role} username={profileCccCode || role} cccCode={profileCccCode} />
        ) : activeView === "home" ? (
          <DashboardMenu
            onSelect={setActiveView}
            userRole={role}
            userAgencies={agencies}
            permissions={permissions}
            onboarding={onboarding}
            onNavigateToStep={handleGuideNavigate}
          />
        ) : null}

        {activeView === "disconnection" && (
          <ConsumerList
            ref={consumerListRef}
            userRole={role}
            userAgencies={agencies}
            onAdminClick={() => setShowAdminPanel(true)}
            showAdminPanel={showAdminPanel}
            onCloseAdminPanel={handleAdminClose}
            onDownload={downloadPDF}
            onDownloadExcel={downloadExcel}
            onDownloadDefaulters={() => openDownloadDialog("defaulters")}
            onGoToReconnection={() => setActiveView("reconnection")}
            onNavigateToUploadDcList={() => {
              setAdminInitialView("dcList")
              setActiveViewInternal("admin")
              if (typeof window !== "undefined") {
                window.history.pushState(null, "", "#admin/dcList")
              }
            }}
            permissions={permissions}
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

        {activeView === "agency-updates" && (
          <AgencyUpdatesReport userRole={role} />
        )}

        {activeView === "consumer-master" && (
          <ConsumerMaster role={role} permissions={permissions} />
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

        {activeView === "safety" && (
          <SafetyList
            userRole={role}
            userAgencies={agencies}
            permissions={permissions}
            availableAgencies={agencies}
          />
        )}

        {activeView === "misc-inspection" && (
          <MiscInspectionList role={role} agencies={agencies} permissions={permissions} />
        )}

        {activeView === "icds" && (
          <IcdsList
            role={role}
            agencies={agencies}
            permissions={permissions}
            username={profileName || agencies[0] || role}
            officeName={profileCccName || profileCccCode}
          />
        )}

        {activeView === "permanent-disconnection" && (
          <PermanentDisconnectionList
            userRole={role}
            userAgencies={agencies}
            username={profileName || agencies[0] || role}
            agencies={agencies}
            permissions={permissions}
          />
        )}

        {activeView === "osd" && (
          <OsdPageView onBack={() => setActiveView("home")} />
        )}

        {activeView === "spotai" && (
          <OsdDetailsView onBack={() => setActiveView("home")} />
        )}

        {activeView === "gis-camera" && (
          <GisCamera
            userRole={role}
            userName={profileName || (agencies && agencies[0]) || role}
            userAgencies={agencies}
            officeCode={profileCccCode || "KUSHIDA"}
            onBack={() => setActiveView("home")}
          />
        )}

        {activeView === "analysis" && role === "admin" && (
           <AnalysisDashboard userRole={role} />
        )}

        {activeView === "admin" && (
           <AdminPanel 
             onClose={() => {
               setAdminInitialView(undefined)
               setActiveView("home")
             }} 
             initialView={adminInitialView}
             onNavigateToConsumerMaster={() => {
               setAdminInitialView(undefined)
               setActiveView("consumer-master")
             }}
           />
        )}

        {activeView === "profile" && (
          <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
            {/* Top Navigation & Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 sm:pb-4">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setActiveView("home")} 
                  className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
                    Account Profile
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">
                    Workspace identity, access role & subscription
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile-Friendly Profile Identity Banner */}
            <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
              Boolean(profileData?.isPaid || profileData?.subscriptionStatus === "paid")
                ? "bg-gradient-to-br from-amber-500/15 via-yellow-500/5 to-amber-500/10 border-amber-300/80 shadow-xs"
                : "bg-white border-slate-200/90 shadow-2xs"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ring-2 ${
                    Boolean(profileData?.isPaid || profileData?.subscriptionStatus === "paid")
                      ? "bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 ring-amber-300/80"
                      : "bg-blue-100 text-blue-700 ring-blue-200/70"
                  }`}>
                    {Boolean(profileData?.isPaid || profileData?.subscriptionStatus === "paid") ? (
                      <Crown className="w-6 h-6 sm:w-7 sm:h-7 fill-slate-950 drop-shadow-xs" />
                    ) : (
                      <User className="w-6 h-6 sm:w-7 sm:h-7" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                        {profileData?.name || profileName || "N/A"}
                      </h2>
                      {Boolean(profileData?.isPaid || profileData?.subscriptionStatus === "paid") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-950 text-amber-300 border border-amber-400 shadow-2xs">
                          <Crown className="w-2.5 h-2.5 fill-amber-300" />
                          PRO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                      @{profileData?.username || "user"} • <span className="capitalize font-sans font-semibold text-slate-700">{profileData?.role || role}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center sm:flex-col sm:items-end justify-between border-t sm:border-t-0 pt-2.5 sm:pt-0 border-amber-200/50">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">CCC Subdivision</span>
                  <span className="font-mono font-bold text-blue-700 text-xs sm:text-sm bg-white/80 sm:bg-transparent px-2 py-0.5 rounded border sm:border-0 border-slate-200">
                    {profileData?.cccCode || profileCccCode || "SYSTEM"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {/* Profile Details Card */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-600" />
                    Account & Scope Information
                  </h3>
                </div>

                {/* Edit Form or Read-only Details */}
                {isEditingProfile ? (
                  <div className="space-y-4 pt-1">
                    {/* Full Name Input */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-blue-600" />
                        Full Name
                      </Label>
                      <Input
                        value={profileEditName}
                        onChange={(e) => setProfileEditName(e.target.value)}
                        placeholder="Enter your full name"
                        className="text-sm bg-white border-slate-300 focus:border-blue-500 h-10"
                      />
                    </div>

                    {/* Personal Login Phone Input */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-blue-600" />
                        Personal Login Mobile Number (10 digits)
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 select-none">
                          +91
                        </span>
                        <Input
                          value={profileEditMobile}
                          onChange={(e) => setProfileEditMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="e.g. 9876543210"
                          maxLength={10}
                          className="font-mono text-sm bg-white border-slate-300 focus:border-blue-500 h-10"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">Used for your personal login and password OTP verification.</p>
                    </div>

                    {profileSaveError && (
                      <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-lg font-medium">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{profileSaveError}</span>
                      </div>
                    )}

                    {profileSaveSuccess && (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg font-medium">
                        <Check className="h-4 w-4 shrink-0" />
                        <span>Profile details updated successfully!</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditingProfile(false)}
                        disabled={profileSaving}
                        className="h-9 px-3 text-xs w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveProfileDetails}
                        disabled={profileSaving || (profileEditMobile && profileEditMobile.length !== 10)}
                        className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold w-full sm:w-auto"
                      >
                        {profileSaving ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Saving...
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1.5" /> Save Profile
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {/* Name */}
                    <div className="flex items-center justify-between py-2 gap-2">
                      <span className="text-slate-500 font-medium shrink-0">Name:</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-slate-900 truncate">{profileData?.name || profileName || "N/A"}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={startEditProfile}
                          className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full shrink-0"
                          title="Edit Profile"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Office */}
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="text-slate-500 font-medium shrink-0">Office:</span>
                      <span className="font-mono font-semibold text-blue-700 text-right truncate">
                        {profileData?.cccCode || profileCccCode || "SYSTEM"} {profileData?.cccName && profileData.cccName !== (profileData?.cccCode || profileCccCode) ? `(${profileData.cccName})` : ""}
                      </span>
                    </div>

                    {/* Agency */}
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="text-slate-500 font-medium shrink-0">Agency:</span>
                      <span className="font-semibold text-slate-800 text-right truncate">
                        {(profileData?.agencies && profileData.agencies.length > 0)
                          ? profileData.agencies.join(", ")
                          : (agencies && agencies.length > 0 ? agencies.join(", ") : "All Agencies")}
                      </span>
                    </div>

                    {/* User Phone */}
                    <div className="flex items-center justify-between py-2 gap-2">
                      <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        User Ph:
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {profileData?.userMobile || profileData?.mobileNumber ? (
                          <span className="font-mono font-bold text-slate-900">
                            +91 {profileData.userMobile || profileData.mobileNumber}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium">Not Set</span>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={startEditProfile}
                          className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                          title="Edit Personal Mobile"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Agency Phone */}
                    {(profileData?.hasAgency || profileData?.agencyMobile) && (
                      <div className="flex items-center justify-between py-2.5 gap-2">
                        <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                          Agency Ph:
                        </span>
                        <span className="font-mono font-semibold text-slate-800 text-right">
                          {profileData?.agencyMobile ? `+91 ${profileData.agencyMobile}` : "Not set"}
                        </span>
                      </div>
                    )}

                    {/* Vendor Code */}
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        Vendor Code:
                      </span>
                      <span className="font-mono font-bold text-blue-800 text-right">
                        {profileData?.vendorCode || "Not Tagged"}
                      </span>
                    </div>

                    {/* Security & Password */}
                    <div className="flex items-center justify-between pt-3 pb-1 gap-2">
                      <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        Password:
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("open-change-password"))
                          }
                        }}
                        className="h-7 px-2.5 text-xs text-indigo-700 bg-indigo-50/70 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800 font-semibold flex items-center gap-1"
                      >
                        <KeyRound className="h-3 w-3" />
                        Change Password
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Billing / Subscription Info Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs flex flex-col justify-between h-full min-h-[260px]">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-3 sm:mb-4 flex items-center justify-between">
                    <span>Subscription Plan</span>
                    {Boolean(profileData?.isPaid || profileData?.subscriptionStatus === "paid") && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 border border-amber-300/80 px-2 py-0.5 rounded-full">
                        PRO
                      </span>
                    )}
                  </h3>
                  <div className="space-y-3">
                    {(() => {
                      const roleLower = role.toLowerCase()
                      const isExempt = roleLower === "admin" || roleLower === "superuser" || roleLower === "monitor" || bypassSubscription

                      if (isExempt) {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Bypassed / Free Access
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">Your role or user account has been exempted from billing.</p>
                          </div>
                        )
                      }

                      const rawExp = subscriptionExpiresAt || profileData?.subscriptionExpiresAt
                      const isPaid = Boolean(profileData?.isPaid || profileData?.subscriptionStatus === "paid")

                      if (rawExp) {
                        const expDate = new Date(rawExp)
                        const isExpired = expDate.getTime() < Date.now()
                        const expFormatted = isNaN(expDate.getTime()) ? rawExp : expDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

                        if (isExpired) {
                          return (
                            <div className="p-3.5 rounded-xl bg-red-50/80 border border-red-200 space-y-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-red-100 text-red-700 border border-red-200">
                                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                Subscription Expired
                              </span>
                              <p className="text-xs text-red-700/90 leading-relaxed">
                                Access expired on <strong>{expFormatted}</strong>. Please renew below to restore operations.
                              </p>
                            </div>
                          )
                        } else if (isPaid) {
                          return (
                            <div className="relative overflow-hidden p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-amber-500/5 border border-amber-300/80 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-slate-950 shadow-xs">
                                  <Crown className="w-3 h-3 fill-slate-950" />
                                  PRO ACTIVE
                                </span>
                                <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-amber-500" />
                                  Verified
                                </span>
                              </div>
                              <div className="space-y-1 pt-0.5">
                                <p className="text-xs sm:text-sm font-bold text-slate-900">
                                  {profileData?.planName || "Quarterly Vendor Access"}
                                </p>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                  Valid until <strong className="text-slate-900 font-semibold">{expFormatted}</strong>.
                                </p>
                              </div>
                            </div>
                          )
                        } else {
                          return (
                            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">
                                  Free Trial
                                </span>
                                <span className="text-xs font-mono text-indigo-600 font-semibold">Till {expFormatted}</span>
                              </div>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                Free operational trial valid until <strong>{expFormatted}</strong>.
                              </p>
                            </div>
                          )
                        }
                      }

                      if (isSubscribed) {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Active Subscription
                            </span>
                          </div>
                        )
                      } else {
                        return (
                          <div className="space-y-2">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-red-50 text-red-700 border border-red-100">
                              Subscription Inactive
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">Please subscribe below to activate agency access.</p>
                          </div>
                        )
                      }
                    })()}
                  </div>

                  {/* Payment History inside Profile Card */}
                  {profileData?.paymentHistory && profileData.paymentHistory.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-blue-600" />
                          Payment History
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {profileData.paymentHistory.length} record{profileData.paymentHistory.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                        {profileData.paymentHistory.map((tx: any) => (
                          <div
                            key={tx.id || tx.paymentId}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs transition-colors hover:bg-slate-100/70"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-800 truncate">{tx.planName}</span>
                                <span className="font-mono text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  {tx.paymentId.slice(0, 10)}...
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Paid {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""} • Valid till {tx.expiresAt ? new Date(tx.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                              </p>
                            </div>
                            <span className="font-mono font-extrabold text-emerald-700 text-xs shrink-0 ml-2 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              ₹{tx.amount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulated Payment Action inside Profile */}
                {!(role === "admin" || role === "superuser" || role === "monitor" || bypassSubscription) && (
                  <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                    <span className="text-xs font-bold text-slate-700 block">Subscription Plans:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {dashboardPlans.map((p) => {
                        const isSel = selectedDashboardPlan.id === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedDashboardPlan(p)}
                            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                              isSel
                                ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span className="text-[9px] font-bold text-indigo-600 block uppercase">{p.badge}</span>
                            <span className="text-xs font-bold text-slate-800 block">{p.label}</span>
                            <span className="text-sm font-extrabold text-slate-900 block">{p.price}</span>
                          </button>
                        )
                      })}
                    </div>
                    <VendorSubscriptionCheckout 
                      amount={selectedDashboardPlan.amount}
                      planName={selectedDashboardPlan.name}
                      days={selectedDashboardPlan.days}
                      buttonText={isSubscribed ? `Extend Subscription (${selectedDashboardPlan.price})` : `Activate Subscription (${selectedDashboardPlan.price})`}
                      userPrefill={{
                        name: profileData?.name || profileName || initialProfile?.name || initialProfile?.username || "",
                        contact: profileData?.mobileNumber || profileEditMobile || "",
                      }}
                      onSuccess={(res) => {
                        handlePaymentSuccess(res)
                      }}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold py-2.5 rounded-xl shadow-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Global Onboarding Required Dialog Modal (Unified Light Surface) */}
        <Dialog open={showOnboardingModal} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-[425px] bg-white border-slate-200 text-slate-900 rounded-2xl shadow-xl" aria-describedby="onboarding-description">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700 font-bold text-lg">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                Google Integration Required
              </DialogTitle>
              <DialogDescription id="onboarding-description" className="text-slate-600 pt-2 text-sm leading-relaxed">
                This subdivision Customer Care Center (CCC) has not been linked to a Google Spreadsheet database or Drive folder yet.
                {role === "admin" ? (
                  <>
                    <br /><br />
                    As an <strong className="text-slate-900">Administrator</strong>, authenticate with your Google Account to duplicate the master database template and begin managing consumer records.
                  </>
                ) : (
                  <>
                    <br /><br />
                    Please request an <strong className="text-slate-900">Administrator</strong> of your office to log in and authorize the application to link your database.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-5 flex flex-col gap-2 sm:flex-col">
              {role === "admin" ? (
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl interactive-tap">
                  <a href="/api/auth/google/login">
                    <KeyRound className="h-4 w-4 mr-2" />
                    Link Google Account Now
                  </a>
                </Button>
              ) : (
                <div className="w-full text-center py-2.5 px-3 bg-slate-100 rounded-xl text-slate-500 text-xs font-medium">
                  Awaiting Admin Authentication
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Global Onboarding Success Dialog Modal (Unified Light Surface) */}
        <Dialog open={!showOnboardingModal && showSuccessModal} onOpenChange={setShowSuccessModal}>
          <DialogContent className="sm:max-w-[425px] bg-white border-slate-200 text-slate-900 rounded-2xl shadow-xl" aria-describedby="success-description">
            <DialogHeader className="flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mb-3 mt-1 animate-chip-in">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 text-center">
                Onboarding Completed!
              </DialogTitle>
              <DialogDescription id="success-description" className="text-slate-600 pt-1.5 text-sm leading-relaxed text-center">
                Your subdivision Customer Care Center (CCC) database has been set up successfully.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-5 flex flex-col gap-2 sm:flex-col">
              <Button 
                onClick={() => {
                  setShowSuccessModal(false)
                  setActiveView("home")
                  notifyOnboardingUpdated()
                }} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl interactive-tap"
              >
                Start Guided Setup →
              </Button>
              <Button 
                variant="ghost"
                onClick={() => setShowSuccessModal(false)} 
                className="w-full text-slate-500 hover:text-slate-900 text-xs rounded-xl"
              >
                Dismiss
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Global Subscription Required Dialog Modal (Unified Light Surface) */}
        <Dialog open={!showOnboardingModal && role?.toLowerCase() === "agency" && !isSubscribed && permsLoaded && !showPaywallFeedbackDialog} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-[440px] bg-white border-slate-200 text-slate-900 rounded-2xl shadow-2xl" aria-describedby="subscription-description">
            <DialogHeader className="flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3 mt-1 border border-indigo-200">
                <AlertTriangle className="h-7 w-7 text-indigo-600" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 text-center">
                Workspace Subscription Required
              </DialogTitle>
              <DialogDescription id="subscription-description" className="text-slate-500 pt-1.5 text-sm leading-relaxed text-center">
                Your account subscription is currently inactive. Activate a plan to continue accessing your CCC modules.
              </DialogDescription>
            </DialogHeader>

            {/* Multi-Plan Selection Grid */}
            <div className="my-3 space-y-3 w-full">
              <div className="grid grid-cols-3 gap-2">
                {dashboardPlans.map((p) => {
                  const isSel = selectedDashboardPlan.id === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedDashboardPlan(p)}
                      className={`relative p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer interactive-tap ${
                        isSel
                          ? "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600 shadow-sm"
                          : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
                      }`}
                    >
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider mb-1 self-start ${
                        p.popular ? "bg-amber-400 text-slate-950" : "bg-indigo-600 text-white"
                      }`}>
                        {p.badge}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">{p.label}</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-base font-black text-slate-900">{p.price}</span>
                          <span className="text-[10px] text-slate-400 line-through">{p.originalPrice}</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 font-medium">{p.subtext}</span>
                    </button>
                  )
                })}
              </div>

              {subscriptionExpiresAt && (
                <span className="block text-[11px] text-red-700 bg-red-50 px-2.5 py-1.5 rounded-xl border border-red-200 text-center font-medium">
                  Last session expired: {subscriptionExpiresAt}
                </span>
              )}
            </div>

            <DialogFooter className="mt-1 flex flex-col gap-2 sm:flex-col w-full">
              <VendorSubscriptionCheckout 
                amount={selectedDashboardPlan.amount}
                planName={selectedDashboardPlan.name}
                days={selectedDashboardPlan.days}
                buttonText={`Pay ${selectedDashboardPlan.price} with Razorpay & Activate`}
                userPrefill={{
                  name: profileData?.name || profileName || initialProfile?.name || initialProfile?.username || "",
                  contact: profileData?.mobileNumber || profileEditMobile || "",
                }}
                onSuccess={(res) => {
                  handlePaymentSuccess(res)
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2.5 rounded-xl shadow-sm transition-all duration-200"
              />
              {paywallRewardEligible && (
                <Button
                  type="button"
                  onClick={() => setShowPaywallFeedbackDialog(true)}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold py-2.5 rounded-xl gap-2 text-xs shadow-xs"
                >
                  <Gift className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Need extra time? Review app &amp; unlock +{FEEDBACK_REWARD_DAYS} Free Days</span>
                </Button>
              )}
              <Button 
                onClick={async () => {
                  try {
                    sessionStorage.clear()
                    localStorage.removeItem("user_ccc_code")
                    localStorage.removeItem("user_username")
                    localStorage.removeItem("user_role")
                    localStorage.removeItem("user_permissions")
                  } catch (e) {}
                  await logout()
                  window.location.href = "/"
                }} 
                variant="outline"
                className="w-full border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold py-2.5 rounded-xl"
              >
                Logout Securely
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {showPaywallFeedbackDialog && (
          <FeedbackDialog
            open={showPaywallFeedbackDialog}
            onOpenChange={setShowPaywallFeedbackDialog}
            onRewardGranted={(reward: FeedbackRewardGrantResult) => {
              if (reward.granted) {
                setIsSubscribed(true)
                if (reward.newExpiresAt) setSubscriptionExpiresAt(reward.newExpiresAt)
                setPaywallRewardEligible(false)
                fetchFullUserProfile()
              }
            }}
          />
        )}

        {/* Startup Modal Queue: Only one secondary startup dialog renders when higher-priority modals are closed */}
        {(() => {
          const isPaywallOpen = role?.toLowerCase() === "agency" && !isSubscribed && permsLoaded
          const hasBlockingModal = showOnboardingModal || showSuccessModal || isPaywallOpen || showCelebrationModal

          return (
            <>
              {/* Interactive Setup & Onboarding Guide for Admin */}
              {role === "admin" && (
                <OnboardingGuideDialog
                  open={!hasBlockingModal && showGuideModal}
                  onOpenChange={(nextOpen) => {
                    setShowGuideModal(nextOpen)
                    if (!nextOpen && typeof window !== "undefined") {
                      sessionStorage.setItem("setup_guide_dismissed", "true")
                    }
                  }}
                  onNavigate={handleGuideNavigate}
                  role={role}
                />
              )}

              {/* Announcement Popup — only when no higher-priority modal is open */}
              {!hasBlockingModal && !showGuideModal && <NewYearPopup />}

              {/* Proactive Subscription & Trial Expiry Warning */}
              {!hasBlockingModal && !showGuideModal && (
                <SubscriptionExpiryAlertModal
                  userId={initialProfile?.username}
                  username={initialProfile?.username}
                  role={role}
                  agencyName={agencies && agencies.length > 0 ? agencies[0] : (profileName || initialProfile?.username)}
                  subscriptionExpiresAt={subscriptionExpiresAt}
                  onSubscriptionRenewed={handlePaymentSuccess}
                />
              )}

              {/* Payment Celebration Modal */}
              <PaymentCelebrationModal
                open={showCelebrationModal}
                onClose={() => setShowCelebrationModal(false)}
                planName={celebrationDetails.planName}
                expiresAt={celebrationDetails.expiresAt}
                paymentId={celebrationDetails.paymentId}
                amount={celebrationDetails.amount}
              />

              {/* Floating Rating Pill (Hidden during active blocking modals or fullscreen GIS camera) */}
              {!hasBlockingModal && !showGuideModal && activeView !== "gis-camera" && (
                <FloatingRatingPill initialHasFeedback={initialHasFeedback} />
              )}
            </>
          )
        })()}

      </DashboardShell>
    </DashboardProvider>
  )
}