import { LoginForm } from "@/components/login-form"
import { fetchApprovedFeedbacks } from "@/lib/feedback-service"

export default async function LoginPage() {
  const initialFeedbacks = await fetchApprovedFeedbacks().catch(() => [])

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden overscroll-none flex flex-col items-center justify-center bg-slate-50 relative px-4 sm:px-6">
      {/* Dynamic Ambient Background Blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-96 h-80 sm:h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 sm:w-96 h-80 sm:h-96 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-200/20 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-md w-full my-auto space-y-4 relative z-10">
        {/* Single-lined title & logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 ring-4 ring-white">
            <svg className="h-6 w-6 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Disconnection Management
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Secure Operations & CCC Field Platform
            </p>
          </div>
        </div>

        <LoginForm initialFeedbacks={initialFeedbacks} />
      </div>
    </div>
  )
}
