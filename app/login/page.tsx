import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-10 w-10 sm:h-11 sm:w-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight whitespace-nowrap">
            Disconnection Management
          </h1>
        </div>

        <LoginForm />

        <div className="text-center pt-2 border-t border-slate-200/60">
          <p className="text-xs text-slate-500 space-x-3">
            <a href="/privacy-policy" className="hover:text-blue-600 transition-colors underline">
              Privacy Policy
            </a>
            <span>•</span>
            <a href="/terms-of-service" className="hover:text-blue-600 transition-colors underline">
              Terms of Service
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
