"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, User, Lock, ArrowDown, ShieldCheck, FileText, Star, Share2, Check } from "lucide-react"
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

const TRUSTED_GRADIENTS = [
  "from-blue-600 via-indigo-600 to-violet-600",
  "from-violet-600 via-purple-600 to-fuchsia-600",
  "from-fuchsia-600 via-pink-600 to-rose-600",
  "from-rose-600 via-orange-500 to-amber-500",
  "from-amber-600 via-emerald-600 to-teal-600",
  "from-teal-600 via-cyan-600 to-blue-600",
  "from-cyan-600 via-indigo-600 to-purple-600",
  "from-purple-600 via-rose-600 to-red-500",
]

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
  const [deviceId, setDeviceId] = useState("")
  const [isStandalone, setIsStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallClicked, setIsInstallClicked] = useState(false)
  const [gradientIndex, setGradientIndex] = useState(0)
  const cidRef = useRef<string>("")
  const router = useRouter()

  // Cycle gradient effect every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      setGradientIndex((prev) => (prev + 1) % TRUSTED_GRADIENTS.length)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // 1. Fetch public feedbacks if not supplied initially
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

  // 2. Fetch visit count
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

  // 3. Detect PWA status & listen for install prompt
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

  // Calculate dynamic feedback statistics
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

  const [copied, setCopied] = useState(false)

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
      } catch (err) {
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
      {/* Modern Sleek Compact Login Card with Soft Vignette Shadow */}
      <div className="relative group/card">
        {/* Soft Vignette Halo Glow behind Card */}
        <div className="absolute -inset-2 bg-gradient-to-b from-slate-300/40 via-slate-400/25 to-slate-500/20 rounded-[28px] blur-xl opacity-75 pointer-events-none -z-10 transition-opacity duration-500 group-hover/card:opacity-90" />

        <Card className="relative rounded-2xl shadow-[0_22px_45px_-12px_rgba(15,23,42,0.14),0_8px_18px_-6px_rgba(15,23,42,0.06)] bg-white/95 backdrop-blur-xl border border-slate-200/90 overflow-hidden">
          <CardContent className="px-5 sm:px-6 py-5 sm:py-6 space-y-3.5">
            <div className="text-center pb-0.5">
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Sign in to your account</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Enter your official credentials below</p>
            </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              await handleSubmit(formData)
            }}
            className="space-y-3"
          >
            {/* Username / CCC Code / Mobile Field */}
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
              <Input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Username / CCC Code / Mobile"
                className="pl-10 h-10 sm:h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 text-xs sm:text-sm font-medium placeholder:text-slate-400 transition-all"
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                className="pl-10 pr-10 h-10 sm:h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 text-xs sm:text-sm font-medium placeholder:text-slate-400 transition-all"
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("light")
                  setShowPassword(!showPassword)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Device fingerprint hidden field */}
            <input type="hidden" name="deviceId" value={deviceId} />

            {error && (
              <Alert variant="destructive" className="border-red-200 bg-red-50/80 rounded-xl py-2 px-3 text-left">
                <AlertDescription className="text-red-700 text-xs font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Sleek Sign In Button */}
            <Button
              type="submit"
              className="w-full h-10 sm:h-11 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl shadow transition-all duration-200 active:scale-[0.99] text-xs sm:text-sm tracking-wide mt-1 cursor-pointer"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            {/* Auxiliary Links: Forgot Password & Register CCC */}
            <div className="flex items-center justify-between pt-2 px-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium")
                  setShowForgotPasswordDialog(true)
                }}
                className="text-slate-500 hover:text-slate-900 font-medium transition-colors cursor-pointer"
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium")
                  setShowRegisterDialog(true)
                }}
                className="text-slate-700 hover:text-slate-900 font-semibold transition-all hover:translate-x-0.5 cursor-pointer inline-flex items-center gap-1"
              >
                <span>Register CCC</span>
                <span className="text-slate-400 font-bold">→</span>
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>

      {/* Integrated Compact Status Bar: 19266 | 4.9/5* */}
      <div className="flex items-center justify-center gap-2 pt-0.5 text-xs text-slate-500 font-medium select-none">
        <span className="text-slate-600 font-medium tracking-tight">
          <AnimatedCounter value={visitCount} /> visits
        </span>

        <span className="text-slate-300">|</span>

        {/* Clickable Feedback Rating (Monochrome Black Star) */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("medium")
            setShowFeedbackModal(true)
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-slate-800 hover:text-black hover:bg-slate-200/60 active:scale-95 transition-all cursor-pointer font-semibold group"
          title="Click to view officer feedback and ratings"
        >
          <span>{averageRating}/5</span>
          <Star className="w-3 h-3 fill-black text-black group-hover:scale-110 transition-transform" />
          <span className="text-[10px] text-slate-400 group-hover:text-slate-600 font-normal">
            ({totalFeedbacks})
          </span>
        </button>
      </div>

      {/* Clean Utility Icon Links */}
      <div className="flex items-center justify-center gap-3 text-slate-400 text-xs pt-0.5">
        {/* Privacy Policy */}
        <a
          href="/privacy-policy"
          onClick={() => triggerHaptic("medium")}
          className="hover:text-slate-700 transition-colors p-1 rounded-md hover:bg-slate-100/70"
          title="Privacy Policy"
          aria-label="Privacy Policy"
        >
          <ShieldCheck className="w-4 h-4 stroke-[1.8]" />
        </a>

        <span className="text-slate-200 font-bold">•</span>

        {/* Terms of Service */}
        <a
          href="/terms-of-service"
          onClick={() => triggerHaptic("medium")}
          className="hover:text-slate-700 transition-colors p-1 rounded-md hover:bg-slate-100/70"
          title="Terms of Service"
          aria-label="Terms of Service"
        >
          <FileText className="w-4 h-4 stroke-[1.8]" />
        </a>

        <span className="text-slate-200 font-bold">•</span>

        {/* WhatsApp Group */}
        <a
          href="https://chat.whatsapp.com/LZKLg40n8FxCLdnAIO9HGE"
          onClick={() => triggerHaptic("medium")}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-600 transition-colors p-1 rounded-md hover:bg-slate-100/70 cursor-pointer"
          title="WhatsApp Support Group"
          aria-label="WhatsApp Support Group"
        >
          <svg className="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </a>

        <span className="text-slate-200 font-bold">•</span>

        {/* Share App Link (WhatsApp / SMS / Native Share) */}
        <button
          type="button"
          onClick={handleShareClick}
          className="hover:text-slate-900 transition-colors p-1 rounded-md hover:bg-slate-100/70 cursor-pointer text-slate-400 active:scale-95 flex items-center justify-center"
          title="Share Platform Link via WhatsApp or Message"
          aria-label="Share Platform Link"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-600 stroke-[2.2] animate-in zoom-in-50 duration-200" />
          ) : (
            <Share2 className="w-4 h-4 stroke-[1.8]" />
          )}
        </button>

        {!isStandalone && (
          <>
            <span className="text-slate-200 font-bold">•</span>
            {/* Install PWA Button */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("medium")
                handleInstallClick()
              }}
              className={`relative inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100/70 transition-all duration-300 active:scale-95 cursor-pointer ${
                isInstallClicked ? "text-blue-600 scale-110" : ""
              }`}
              title="Install Web App"
              aria-label="Install Web App"
            >
              <ArrowDown
                className={`w-4 h-4 stroke-[1.8] transition-all duration-300 ${
                  isInstallClicked ? "animate-bounce text-blue-600 stroke-[2.2]" : ""
                }`}
              />
            </button>
          </>
        )}
      </div>

      {/* Light Elegant Samarata Trust Line with 1s Cycling Gradient & Blinking Effect */}
      <div className="text-center pt-1 select-none">
        <p className="text-[17px] sm:text-[19px] font-bold font-[family-name:var(--font-samarata)] tracking-wide animate-pulse">
          <span className={`bg-gradient-to-r ${TRUSTED_GRADIENTS[gradientIndex]} bg-clip-text text-transparent drop-shadow-sm transition-all duration-500`}>
            Trusted by {initialTenantCount}+ Offices.
          </span>
        </p>
      </div>

      {/* Comprehensive Feedback Reviews Modal Dialog */}
      <LoginFeedbackDialog
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        feedbacks={feedbacks}
      />

      {/* Self-Registration Dialog */}
      <RegisterCccDialog 
        open={showRegisterDialog} 
        onOpenChange={setShowRegisterDialog} 
      />

      {/* Forgot Password Recovery Dialog */}
      <ForgotPasswordDialog 
        open={showForgotPasswordDialog} 
        onOpenChange={setShowForgotPasswordDialog} 
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-900 border-t-transparent" />
            <p className="text-xs font-semibold text-slate-700 animate-pulse">Signing in...</p>
          </div>
        </div>
      )}
    </>
  )
}
