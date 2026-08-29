"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, User, Lock, X, Phone, ArrowDown, Smartphone, ShieldCheck, FileText } from "lucide-react"
import { login } from "@/app/actions/auth"
import { LoginFeedbackCarousel } from "@/components/login-feedback-carousel"
import { VisitorLiveCounter } from "@/components/visitor-live-counter"
import { RegisterCccDialog } from "@/components/register-ccc-dialog"
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog"

import type { FeedbackItem } from "@/lib/feedback-service"

interface LoginFormProps {
  initialFeedbacks?: FeedbackItem[]
}

export function LoginForm({ initialFeedbacks }: LoginFormProps) {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showRegisterDialog, setShowRegisterDialog] = useState(false)
  const [showForgotPasswordDialog, setShowForgotPasswordDialog] = useState(false)
  const [deviceId, setDeviceId] = useState("")
  const [isStandalone, setIsStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallClicked, setIsInstallClicked] = useState(false)
  const router = useRouter()

  // Detect PWA status & listen for install prompt
  useEffect(() => {
    let id = localStorage.getItem("deviceId")
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem("deviceId", id)
    }
    setDeviceId(id)

    // Check if running as PWA
    const checkPWA = () => {
      const isPWA =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://")
      setIsStandalone(isPWA)
    }
    checkPWA()

    // Read early prompt caught by layout head script if available
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

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError("")

    try {
      sessionStorage.clear()
    } catch {}

    const result: any = await login(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
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
      {/* Visually Balanced White Card */}
      <Card className="rounded-3xl shadow-xl hover:shadow-2xl transition bg-white/95 backdrop-blur-md border border-gray-100/80 overflow-hidden">
        <CardContent className="px-6 sm:px-8 py-7 space-y-5">
          {/* Credentials Label & Line Separator (same style as after sign in) Above Username Input Box */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Enter your credentials</p>
            <div className="border-t border-gray-100" />
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              await handleSubmit(formData)
            }}
            className="space-y-4"
          >
            {/* Username / CCC Code / Mobile Field */}
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              <Input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Username / CCC Code / Mobile"
                className="pl-12 h-16 sm:h-18 rounded-2xl border-gray-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-400 text-base sm:text-lg font-medium placeholder:text-gray-400"
              />
            </div>

            {/* Password Field with Increased Height */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                className="pl-12 pr-12 h-16 sm:h-18 rounded-2xl border-gray-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-400 text-base sm:text-lg font-medium placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors p-1"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Device fingerprint hidden field */}
            <input type="hidden" name="deviceId" value={deviceId} />

            {error && (
              <Alert variant="destructive" className="border-red-200 bg-red-50 rounded-2xl py-2.5">
                <AlertDescription className="text-red-800 text-xs font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Sleek Button */}
            <Button
              type="submit"
              className="w-full h-11 sm:h-12 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.98] mt-1 text-sm tracking-wide"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            {/* Quick Action Links: Forgot Password & Register CCC */}
            <div className="flex items-center justify-between pt-2 px-1 text-xs">
              <button
                type="button"
                onClick={() => setShowForgotPasswordDialog(true)}
                className="text-slate-500 hover:text-slate-900 font-medium transition-colors cursor-pointer"
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => setShowRegisterDialog(true)}
                className="text-amber-600 hover:text-amber-700 font-bold transition-colors cursor-pointer"
              >
                Register New CCC →
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Real User Feedback Ticker Card ABOVE small icon buttons */}
      <div className="pt-2">
        <LoginFeedbackCarousel initialFeedbacks={initialFeedbacks} />
      </div>

      {/* Small Iconed Buttons Row */}
      <div className="mt-2 text-center pt-2">
        <div className="flex items-center justify-center gap-3.5 text-slate-500">
          {/* Privacy Policy (Shield Icon Only) */}
          <a
            href="/privacy-policy"
            className="hover:text-blue-600 transition-colors p-1"
            title="Privacy Policy"
            aria-label="Privacy Policy"
          >
            <ShieldCheck className="w-4 h-4 stroke-[2]" />
          </a>

          <span className="text-slate-300 font-bold">•</span>

          {/* Terms of Service (FileText Icon Only) */}
          <a
            href="/terms-of-service"
            className="hover:text-blue-600 transition-colors p-1"
            title="Terms of Service"
            aria-label="Terms of Service"
          >
            <FileText className="w-4 h-4 stroke-[2]" />
          </a>

          <span className="text-slate-300 font-bold">•</span>

          {/* WhatsApp Outline Icon */}
          <a
            href="https://chat.whatsapp.com/LZKLg40n8FxCLdnAIO9HGE"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-600 transition-colors p-1 cursor-pointer"
            title="WhatsApp Group"
            aria-label="WhatsApp Group"
          >
            <svg className="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </a>

          {!isStandalone && (
            <>
              <span className="text-slate-300 font-bold">•</span>
              {/* Install Button (Down Arrow Only ↓ with Glow & Scale-up click animation) */}
              <button
                type="button"
                onClick={handleInstallClick}
                className={`relative inline-flex items-center justify-center p-1.5 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-300 transform active:scale-140 cursor-pointer ${
                  isInstallClicked
                    ? "scale-130 text-blue-600 drop-shadow-[0_0_12px_rgba(37,99,235,0.95)]"
                    : "hover:scale-115"
                }`}
                title="Install App"
                aria-label="Install App"
              >
                <ArrowDown
                  className={`w-4 h-4 stroke-[2.4] transition-all duration-300 ${
                    isInstallClicked ? "animate-bounce text-blue-600 stroke-[3]" : ""
                  }`}
                />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Small Line Separator */}
      <div className="w-12 mx-auto border-t border-slate-300/70 my-2" />

      {/* Total Visits Count (No live user polling) */}
      <VisitorLiveCounter className="text-slate-500/80 text-[11px]" showUi={true} showLiveUsers={false} />

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

      {/* 🔥 Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-base font-medium text-gray-700 animate-pulse">Signing in...</p>
          </div>
        </div>
      )}
    </>
  )
}
