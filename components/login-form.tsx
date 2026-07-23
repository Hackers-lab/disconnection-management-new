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
      {/* 📲 Top-Right Moveable Aesthetic Install App Button + Angled Thread Arrow */}
      {!isStandalone && (
        <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-40 flex flex-col items-end group">
          <button
            onClick={handleInstallClick}
            className="bg-slate-900 hover:bg-black text-white px-3.5 py-2 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 flex items-center gap-2 text-xs font-semibold border border-slate-800/40 hover:scale-105 active:scale-95 cursor-pointer"
            title="Install App on Home Screen"
          >
            <Smartphone className="h-4 w-4 text-blue-400 animate-pulse" />
            <span>Install App</span>
            <Download className="h-3.5 w-3.5 opacity-70" />
          </button>

          {/* Angled Thread Arrow pointing up to Install button */}
          <div className="mt-1.5 flex items-center gap-1 opacity-85 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
              Get App
            </span>
            <svg
              className="w-4 h-4 text-slate-700 transform -rotate-45 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
        </div>
      )}

      <Card className="rounded-3xl shadow-xl hover:shadow-2xl transition bg-white/95 backdrop-blur-md border border-gray-100/80">
        <CardContent className="space-y-6 pt-7 pb-6 px-6 sm:px-8">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              await handleSubmit(formData)
            }}
            className="space-y-4"
          >
            {/* Username Field with In-Box Placeholder */}
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
              <Input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Username"
                className="pl-11 h-13 rounded-2xl border-gray-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-400 text-sm font-medium"
              />
            </div>

            {/* Password Field with In-Box Placeholder */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                className="pl-11 pr-11 h-13 rounded-2xl border-gray-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-400 text-sm font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
