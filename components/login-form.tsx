"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, User, Lock, X, Phone, ArrowDown, Smartphone, ShieldCheck, FileText } from "lucide-react"
import { login } from "@/app/actions/auth"

export function LoginForm() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showDevModal, setShowDevModal] = useState(false)
  const [deviceId, setDeviceId] = useState("")
  const [isStandalone, setIsStandalone] = useState(true) // default true to avoid flash
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
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

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsStandalone(false)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setIsStandalone(true)
      }
      setDeferredPrompt(null)
    }
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError("")

    const result = await login(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push("/dashboard")
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
            {/* Username Field with Increased Height */}
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              <Input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Username"
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
          </form>

          {/* Footer Section Inside White Card */}
          <div className="text-center pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500">
              Developed by{" "}
              <button
                onClick={() => setShowDevModal(true)}
                className="font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer"
              >
                Pramod Verma
              </button>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Policy Row OUTSIDE the White Login Box (Icon Only) */}
      <div className="mt-3 text-center pt-2 border-t border-slate-200/60">
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

          {/* WhatsApp Outline Icon (Speech Bubble Outline like uploaded image - Icon Only) */}
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
              {/* Install Button (Down Arrow Only ↓ - Icon Only) */}
              <button
                type="button"
                onClick={handleInstallClick}
                className="hover:text-blue-600 transition-colors p-1 cursor-pointer"
                title="Install App"
                aria-label="Install App"
              >
                <ArrowDown className="w-4 h-4 stroke-[2.2]" />
              </button>
            </>
          )}
        </div>
      </div>


      {/* 🔥 Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-base font-medium text-gray-700 animate-pulse">Signing in...</p>
          </div>
        </div>
      )}

      {/* 🚀 Floating Window (Developer Info Modal) */}
      {showDevModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200 border border-gray-100">
            <button
              onClick={() => setShowDevModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="h-8 w-8 text-blue-600" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Get in Touch</h3>
            <p className="text-gray-600 mb-6">
              To add your supply or for further inquiries, please reach out directly:
            </p>

            <a
              href="tel:8092273459"
              className="inline-block w-full py-4 px-6 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-gray-800 transition shadow-lg"
            >
              8092273459
            </a>

            <p className="mt-4 text-xs text-gray-400 uppercase tracking-widest">Available for support</p>
          </div>
        </div>
      )}
    </>
  )
}
