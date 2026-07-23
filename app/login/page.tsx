import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Disconnection Management</h1>
          <p className="mt-2 text-xs text-gray-600 max-w-sm mx-auto leading-relaxed">
            Utility management platform for electrical Customer Care Centers (CCCs) to process disconnections, reconnections, meter stock, and field inspections.
          </p>
        </div>

        <LoginForm />

        <div className="bg-white/70 backdrop-blur-sm border border-blue-100 rounded-xl p-4 text-left shadow-sm">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">About Disconnection Management</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Disconnection Management automates electrical utility workflows. Authorized administrators can link their Google Account to store administrative logs in Google Sheets and save field verification receipts directly to Google Drive.
          </p>
        </div>

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
