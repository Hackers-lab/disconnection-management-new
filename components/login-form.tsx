"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, User, Lock, X, Phone } from "lucide-react" // Added X and Phone icons
import { login } from "@/app/actions/auth"

export function LoginForm() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showDevModal, setShowDevModal] = useState(false)
  const [deviceId, setDeviceId] = useState("")
  const router = useRouter()

  // Generate a stable device UUID on first visit, persist in localStorage
  useEffect(() => {
    let id = localStorage.getItem("deviceId")
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem("deviceId", id)
    }
    setDeviceId(id)
  }, [])

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
      <Card className="rounded-2xl shadow-lg hover:shadow-xl transition bg-white/90 backdrop-blur-sm border border-gray-100">
        <CardHeader className="space-y-2 pb-6 text-center">
          <CardTitle className="text-3xl font-bold text-gray-900">Welcome Back</CardTitle>
          <p className="text-sm text-gray-500">Sign in to continue to your dashboard</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              await handleSubmit(formData);
            }}
            className="space-y-5"
          >
            {/* Username Field */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  required
                  placeholder="Enter your username"
                  className="pl-10 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  className="pl-10 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Device fingerprint — sent to server for audit logging, invisible to user */}
            <input type="hidden" name="deviceId" value={deviceId} />

            {error && (
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-full shadow-md transition"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Updated Footer Section */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-500">
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
