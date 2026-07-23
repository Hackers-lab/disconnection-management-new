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
          <div className="text-center pt-3 border-t border-gray-100 space-y-2">
            <p className="text-xs font-medium text-gray-500">
              Developed by{" "}
              <button
                onClick={() => setShowDevModal(true)}
                className="font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer"
              >
                Pramod Verma
              </button>
            </p>

            {/* Clean Line Icon Links */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pt-0.5">
              <a
                href="https://chat.whatsapp.com/LZKLg40n8FxCLdnAIO9HGE"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors cursor-pointer group"
                title="Join Official WhatsApp Group"
              >
                <svg className="w-4 h-4 stroke-current fill-none text-gray-500 group-hover:text-emerald-600" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-[11px] font-medium group-hover:underline">WhatsApp</span>
              </a>

              {!isStandalone && (
                <>
                  <span className="text-gray-300 font-bold">•</span>
                  <button
                    onClick={handleInstallClick}
                    className="flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer group"
                    title="Install App on Home Screen"
                  >
                    <svg className="w-4 h-4 stroke-current fill-none text-gray-500 group-hover:text-blue-600" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="text-[11px] font-medium group-hover:underline">Install</span>
                  </button>
                </>
              )}
            </div>
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
