"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Eye,
  EyeOff,
  User,
  Lock,
  ArrowDown,
  ShieldCheck,
  FileText,
  Star,
  Share2,
  Check,
  ArrowRight,
  Building2,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { login } from "@/app/actions/auth"
import { LoginFeedbackDialog } from "@/components/login-feedback-dialog"
import { RegisterCccDialog } from "@/components/register-ccc-dialog"
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog"
import { AnimatedCounter } from "@/components/animated-counter"
import { triggerHaptic } from "@/lib/haptics"
import type { FeedbackItem } from "@/lib/feedback-service"

const DEFAULT_FEEDBACKS: FeedbackItem[] = [
  {
    id: "def-1",
    username: "system",
    name: "Sub-Division Officer",
    supplyOffice: "Disconnection Team",
    cccCode: "MAIN",
    rating: 5,
    comment: "Fast real-time data sync & seamless disconnection tracking across all field teams!",
    createdAt: new Date().toISOString(),
    status: "approved",
  },
  {
    id: "def-2",
    username: "system",
    name: "Field Technician",
    supplyOffice: "NSC & Meter Cell",
    cccCode: "MAIN",
    rating: 5,
    comment: "Very easy to issue meters and track field updates directly on mobile devices without paperwork.",
    createdAt: new Date().toISOString(),
    status: "approved",
  },
]

function toBengaliDigits(num: number): string {
  return String(num)
    .replace(/0/g, "০")
    .replace(/1/g, "১")
    .replace(/2/g, "২")
    .replace(/3/g, "৩")
    .replace(/4/g, "৪")
    .replace(/5/g, "৫")
    .replace(/6/g, "৬")
    .replace(/7/g, "৭")
    .replace(/8/g, "৮")
    .replace(/9/g, "৯")
}

interface LoginFormProps {
  initialFeedbacks?: FeedbackItem[]
  initialTenantCount?: number
}

export function LoginForm({ initialFeedbacks, initialTenantCount = 90 }: LoginFormProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>(
    initialFeedbacks && initialFeedbacks.length > 0 ? initialFeedbacks : DEFAULT_FEEDBACKS
  )
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [visitCount, setVisitCount] = useState<number | null>(null)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showRegisterDialog, setShowRegisterDialog] = useState(false)
  const [showForgotPasswordDialog, setShowForgotPasswordDialog] = useState(false)
  const [resetIdentifier, setResetIdentifier] = useState("")
  const [isFirstLoginReset, setIsFirstLoginReset] = useState(false)
  const [deviceId, setDeviceId] = useState("")
  const [isStandalone, setIsStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallClicked, setIsInstallClicked] = useState(false)
  const [langIndex, setLangIndex] = useState<0 | 1>(0)
  const [textFade, setTextFade] = useState(true)
  const [copied, setCopied] = useState(false)
  const cidRef = useRef<string>("")
  const router = useRouter()

  // Rotate bilingual trust text on mobile every 5 seconds
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const interval = setInterval(() => {
      setTextFade(false)
      timeoutId = setTimeout(() => {
        setLangIndex((prev) => (prev === 0 ? 1 : 0))
        setTextFade(true)
      }, 240)
    }, 5000)
    return () => {
      clearInterval(interval)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  // Fetch public feedbacks if not supplied initially
  useEffect(() => {
    if (initialFeedbacks && initialFeedbacks.length > 0) return

    let isMounted = true
    fetch("/api/feedback/public")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FeedbackItem[]) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setFeedbacks(data)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [initialFeedbacks])

  // Fetch visit count
  useEffect(() => {
    let cid = ""
    try {
      cid = localStorage.getItem("_app_cid") || ""
      if (!cid) {
        cid = "c_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
        localStorage.setItem("_app_cid", cid)
      }
    } catch {
      cid = "c_" + Math.random().toString(36).substring(2, 11)
    }
    cidRef.current = cid

    let isNewVisit = false
    try {
      if (!sessionStorage.getItem("_app_visit_logged")) {
        isNewVisit = true
        sessionStorage.setItem("_app_visit_logged", "1")
      }
    } catch {
      isNewVisit = false
    }

    let cachedCount: number | null = null
    try {
      const raw = sessionStorage.getItem("_app_visitor_stats")
      const ts = Number(sessionStorage.getItem("_app_visitor_stats_ts") || 0)
      if (raw && Date.now() - ts < 10 * 60 * 1000) {
        const parsed = JSON.parse(raw)
        if (typeof parsed.totalVisitors === "number") {
          cachedCount = parsed.totalVisitors
          setVisitCount(cachedCount)
        }
      }
    } catch {}

    if (cachedCount === null || isNewVisit) {
      const fetchVisitCount = async () => {
        try {
          const initParam = isNewVisit ? "&init=1" : ""
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000)
          const res = await fetch(`/api/system/presence?cid=${encodeURIComponent(cidRef.current)}${initParam}`, {
            cache: "no-store",
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
          if (res.ok) {
            const data = await res.json()
            if (data && typeof data.totalVisitors === "number") {
              setVisitCount(data.totalVisitors)
              try {
                sessionStorage.setItem("_app_visitor_stats", JSON.stringify(data))
                sessionStorage.setItem("_app_visitor_stats_ts", Date.now().toString())
              } catch {}
            }
          }
        } catch {}
      }

      fetchVisitCount()
    }
  }, [])

  // Detect PWA status & listen for install prompt
  useEffect(() => {
    let id = localStorage.getItem("deviceId")
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem("deviceId", id)
    }
    setDeviceId(id)

    const checkPWA = () => {
      const isPWA =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://")
      setIsStandalone(isPWA)
    }
    checkPWA()

    if ((window as any).deferredPwaPrompt) {
      setDeferredPrompt((window as any).deferredPwaPrompt)
      setIsStandalone(false)
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      ;(window as any).deferredPwaPrompt = e
      setIsStandalone(false)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = async () => {
    setIsInstallClicked(true)
    setTimeout(() => setIsInstallClicked(false), 600)

    const promptEvent = deferredPrompt || (typeof window !== "undefined" ? (window as any).deferredPwaPrompt : null)

    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const choiceResult = await promptEvent.userChoice
        if (choiceResult?.outcome === "accepted") {
          setIsStandalone(true)
          setDeferredPrompt(null)
          if (typeof window !== "undefined") {
            ;(window as any).deferredPwaPrompt = null
          }
        }
      } catch (err) {
        console.error("PWA install error:", err)
      }
    }
  }

  const { averageRating, totalFeedbacks } = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) {
      return { averageRating: 4.9, totalFeedbacks: 0 }
    }
    const sum = feedbacks.reduce((acc, curr) => acc + (Number(curr.rating) || 5), 0)
    const avg = sum / feedbacks.length
    return {
      averageRating: Number(avg.toFixed(1)),
      totalFeedbacks: feedbacks.length,
    }
  }, [feedbacks])

  const handleShareClick = async () => {
    triggerHaptic("medium")
    const originUrl = typeof window !== "undefined" ? window.location.origin : "https://disconnection.vercel.app"
    const shareData = {
      title: "Disconnection & Utility Operations Platform",
      text: "Access the Disconnection & Utility Operations Platform:",
      url: originUrl,
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData)
      } catch {
        // User dismissed share
      }
    } else {
      try {
        await navigator.clipboard.writeText(originUrl)
      } catch {}
      const text = encodeURIComponent(`Disconnection & Utility Operations Platform:\n${originUrl}`)
      window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank")
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleSubmit(formData: FormData) {
    triggerHaptic("medium")
    setLoading(true)
    setError("")

    try {
      sessionStorage.clear()
    } catch {}

    const result: any = await login(formData)

    if (result?.error) {
      triggerHaptic("error")
      setError(result.error)
      setLoading(false)
    } else if (result?.requireFirstLoginReset) {
      triggerHaptic("warning")
      setLoading(false)
      setResetIdentifier(result.mobileNumber || result.username)
      setIsFirstLoginReset(true)
      setShowForgotPasswordDialog(true)
    } else {
      triggerHaptic("success")
      if (result?.benchmark) {
        console.log(
          `%c⚡ [AUTH BENCHMARK] %cDatabase: ${result.benchmark.dbSource} | DB Lookup: ${result.benchmark.lookupTimeMs}ms | Total Server: ${result.benchmark.totalServerTimeMs}ms | User: ${result.benchmark.username} (${result.benchmark.role})`,
          "background: #059669; color: white; padding: 3px 6px; border-radius: 4px; font-weight: bold;",
          "color: #0284c7; font-weight: 600;"
        )
      }
      router.push(result?.redirectTo || "/dashboard")
    }
  }

  return (
    <>
      <div className="w-full space-y-5">
        {/* Elevated Crisp Sign-In Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.10)] p-6 sm:p-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Sign in with your Username, Mobile Number, or CCC Code
            </p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              await handleSubmit(formData)
            }}
            className="space-y-4"
          >
            {/* Username / Mobile / CCC Code */}
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-semibold text-slate-700">
                Account Identifier
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="Username, Mobile, or CCC Code"
                  className="pl-10 h-11 rounded-xl border-slate-200 bg-slate-50/70 hover:bg-slate-50 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 text-sm font-medium placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("medium")
                    setShowForgotPasswordDialog(true)
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="pl-10 pr-11 h-11 rounded-xl border-slate-200 bg-slate-50/70 hover:bg-slate-50 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 text-sm font-medium placeholder:text-slate-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light")
                    setShowPassword(!showPassword)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Device fingerprint hidden field */}
            <input type="hidden" name="deviceId" value={deviceId} />

            {error && (
              <Alert variant="destructive" className="border-rose-200 bg-rose-50/90 rounded-xl py-2.5 px-3.5 text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <AlertDescription className="text-rose-800 text-xs font-medium leading-relaxed">
                    {error}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {/* Primary Sign In CTA */}
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-all duration-200 active:scale-[0.99] text-sm cursor-pointer gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Divider + New Care Center Onboarding CTA */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">New Care Center?</div>
                <div className="text-[11px] text-slate-500 truncate">Self-register your CCC workspace</div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                triggerHaptic("medium")
                setShowRegisterDialog(true)
              }}
              className="h-9 px-3 rounded-xl border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-blue-700 font-semibold text-xs shrink-0 cursor-pointer"
            >
              Register CCC
            </Button>
          </div>
        </div>

        {/* Mobile Bilingual Trust Pill (shown below card on screens where left showcase is hidden) */}
        <div className="lg:hidden flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50/80 px-3.5 py-1.5 text-xs font-semibold text-blue-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span
              className={`transition-opacity duration-200 ${textFade ? "opacity-100" : "opacity-0"} ${
                langIndex === 1 ? "font-[family-name:var(--font-bengali)]" : ""
              }`}
            >
              {langIndex === 0
                ? `Trusted by ${initialTenantCount}+ CCCs`
                : `${toBengaliDigits(initialTenantCount)}+ টি CCC-র বিশ্বস্ত সহযোগী`}
            </span>
          </div>
        </div>

        {/* Visits & Officer Rating Trust Strip */}
        <div className="flex items-center justify-center gap-2.5 text-xs text-slate-500 font-medium select-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200/80 px-3 py-1 text-slate-600 shadow-2xs">
            <span className="font-semibold text-slate-800">
              <AnimatedCounter value={visitCount} />
            </span>
            <span>visits</span>
          </span>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("medium")
              setShowFeedbackModal(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200/80 px-3 py-1 text-slate-800 hover:border-amber-300 hover:bg-amber-50/60 active:scale-95 transition-all cursor-pointer font-semibold shadow-2xs group"
            title="Click to view officer feedback and ratings"
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 group-hover:scale-110 transition-transform" />
            <span>{averageRating}/5</span>
            <span className="text-[11px] text-slate-400 font-normal">({totalFeedbacks})</span>
          </button>
        </div>

        {/* Compact Footer Utility Links */}
        <div className="flex items-center justify-center flex-wrap gap-x-2 gap-y-1.5 text-slate-500 text-xs">
          <a
            href="/privacy-policy"
            onClick={() => triggerHaptic("medium")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
            title="Privacy Policy"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Privacy</span>
          </a>

          <span className="text-slate-300">·</span>

          <a
            href="/terms-of-service"
            onClick={() => triggerHaptic("medium")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
            title="Terms of Service"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms</span>
          </a>

          <span className="text-slate-300">·</span>

          <a
            href="https://chat.whatsapp.com/LZKLg40n8FxCLdnAIO9HGE"
            onClick={() => triggerHaptic("medium")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
            title="WhatsApp Support Group"
          >
            <svg
              className="w-3.5 h-3.5 stroke-current fill-none"
              viewBox="0 0 24 24"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span>Support</span>
          </a>

          <span className="text-slate-300">·</span>

          <button
            type="button"
            onClick={handleShareClick}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer active:scale-95"
            title="Share Platform Link"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            <span>{copied ? "Copied" : "Share"}</span>
          </button>

          {!isStandalone && (
            <>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium")
                  handleInstallClick()
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:text-blue-700 hover:bg-blue-50 transition-all cursor-pointer active:scale-95 ${
                  isInstallClicked ? "text-blue-600" : ""
                }`}
                title="Install Web App"
              >
                <ArrowDown
                  className={`w-3.5 h-3.5 ${isInstallClicked ? "animate-bounce text-blue-600" : ""}`}
                />
                <span>Install App</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Feedback Reviews Modal Dialog */}
      <LoginFeedbackDialog
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        feedbacks={feedbacks}
      />

      {/* Self-Registration Dialog */}
      <RegisterCccDialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog} />

      {/* Forgot Password / First-Time Login Password Setup Dialog */}
      <ForgotPasswordDialog
        open={showForgotPasswordDialog}
        onOpenChange={(open) => {
          setShowForgotPasswordDialog(open)
          if (!open) {
            setIsFirstLoginReset(false)
            setResetIdentifier("")
          }
        }}
        initialIdentifier={resetIdentifier}
        isFirstLogin={isFirstLoginReset}
      />

      {/* Portaled Full-Viewport Signing In Overlay */}
      {loading &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl px-7 py-6 flex flex-col items-center gap-3.5 max-w-xs w-full text-center">
              <div className="relative h-12 w-12 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">Signing you in...</p>
                <p className="text-xs text-slate-500">Verifying credentials &amp; preparing workspace</p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
