"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, User, Lock, X, Phone, Download, Smartphone } from "lucide-react"
import { login } from "@/app/actions/auth"

export function LoginForm() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showDevModal, setShowDevModal] = useState(false)
  const [deviceId, setDeviceId] = useState("")
  const [isStandalone, setIsStandalone] = useState(true) // default true to avoid flash
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallInstruction, setShowInstallInstruction] = useState(false)
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
    } else {
      setShowInstallInstruction(true)
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
      {/* 💬 Top-Left Single White Color WhatsApp Group Button */}
      <a
        href="https://chat.whatsapp.com/LZKLg40n8FxCLdnAIO9HGE"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-4 left-4 sm:top-6 sm:left-6 z-40 h-11 w-11 sm:h-12 sm:w-12 bg-slate-900 hover:bg-black text-white rounded-2xl flex items-center justify-center shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 border border-slate-800/40 cursor-pointer"
        title="Join Official WhatsApp Group"
      >
        <svg className="h-6 w-6 fill-current text-white" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l.999 1.589-1.048 3.827 3.914-1.027.878 1.278z"/>
        </svg>
      </a>

      {/* 📲 Top-Right Icon-Only Install App Button + Wavy Threaded Arrow */}
      {!isStandalone && (
        <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-40 flex items-center gap-2 group">
          {/* Wavy Threaded Arrow pointing towards the install icon */}
          <div className="hidden sm:flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide select-none">
              Install App
            </span>
            <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 50 40" stroke="currentColor">
              <path
                d="M 5 30 Q 20 38, 30 20 T 42 8"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="4 2"
              />
              <path
                d="M 34 6 L 44 6 L 44 16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>

          {/* Larger Icon-Only Install Button */}
          <button
            onClick={handleInstallClick}
            className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-slate-900 hover:bg-black text-white flex items-center justify-center shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 border border-slate-800/40 cursor-pointer"
            title="Install App on Home Screen"
          >
            <Smartphone className="h-6 w-6 text-blue-400 animate-pulse" />
          </button>
        </div>
      )}

      {/* Visually Balanced & Symmetrical Card */}
      <Card className="rounded-3xl shadow-xl hover:shadow-2xl transition bg-white/95 backdrop-blur-md border border-gray-100/80">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              await handleSubmit(formData)
            }}
            className="space-y-5"
          >
            {/* Username Field with Taller Height & Larger Text */}
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              <Input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Username"
                className="pl-12 h-14 sm:h-16 rounded-2xl border-gray-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-400 text-base sm:text-lg font-medium placeholder:text-gray-400"
              />
            </div>

            {/* Password Field with Taller Height & Larger Text */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                className="pl-12 pr-12 h-14 sm:h-16 rounded-2xl border-gray-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-400 text-base sm:text-lg font-medium placeholder:text-gray-400"
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
              <Alert variant="destructive" className="border-red-200 bg-red-50 rounded-2xl">
                <AlertDescription className="text-red-800 text-xs font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Sleek Black Button */}
            <Button
              type="submit"
              className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.98] mt-2 text-sm tracking-wide"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Footer Section */}
          <div className="text-center pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500">
              Developed by{" "}
              <button
                onClick={() => setShowDevModal(false)}
                className="font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer"
              >
                Pramod Verma
              </button>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 📲 PWA Manual Installation Modal */}
      {showInstallInstruction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center border border-gray-100">
            <button
              onClick={() => setShowInstallInstruction(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
              <Smartphone className="h-7 w-7 text-blue-400" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Install App</h3>
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              To install this web app on your home screen for fast 1-tap access:
            </p>

            <div className="bg-gray-50 rounded-2xl p-4 text-left text-xs space-y-2 text-gray-700 font-medium mb-4">
              <p className="flex items-center gap-2">
                <span>1.</span> Tap your browser menu <span className="font-bold">(⋮ or Share icon)</span>.
              </p>
              <p className="flex items-center gap-2">
                <span>2.</span> Select <span className="font-bold">"Add to Home screen"</span> or <span className="font-bold">"Install App"</span>.
              </p>
            </div>

            <Button
              onClick={() => setShowInstallInstruction(false)}
              className="w-full h-11 bg-slate-900 text-white rounded-2xl font-bold text-xs"
            >
              Got it
            </Button>
          </div>
        </div>
      )}

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
