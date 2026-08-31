import { LoginForm } from "@/components/login-form"
import { fetchApprovedFeedbacks } from "@/lib/feedback-service"
import { Zap } from "lucide-react"

export default async function LoginPage() {
  const initialFeedbacks = await fetchApprovedFeedbacks().catch(() => [])

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden overscroll-none flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-50 relative px-4 sm:px-6 select-none">
      {/* Soft Ambient Vignette & Glow Accents */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(15,23,42,0.05)_100%)]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-gradient-to-tr from-blue-400/15 via-indigo-400/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-20 right-1/4 w-80 h-80 bg-sky-300/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-[420px] w-full my-auto space-y-4 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15 ring-4 ring-white/80 transition-transform duration-300 hover:scale-105">
            <Zap className="w-6 h-6 text-amber-400 fill-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-[26px] font-black tracking-tight animate-title-shimmer select-none drop-shadow-sm">
              Disconnection Management
            </h1>
          </div>
        </div>

        <LoginForm initialFeedbacks={initialFeedbacks} />
      </div>
    </div>
  )
}

