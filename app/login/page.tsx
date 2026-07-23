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
          <h2 className="text-3xl font-bold text-gray-900">Disconnection Management </h2>
          {/* <p className="mt-2 text-sm text-gray-600">Sign in to manage disconnection consumers</p> */}
        </div>
        <LoginForm />
        
        <div className="text-center pt-4 border-t border-slate-200/60">
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
