import { LoginForm } from "@/components/login-form"
import { LoginFeedbackCarousel } from "@/components/login-feedback-carousel"

export default function LoginPage() {
  return (
    <div className="fixed inset-0 h-screen w-screen overflow-y-auto overflow-x-hidden flex flex-col items-center justify-between bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-6 lg:p-8">
      {/* Top spacing element */}
      <div className="w-full h-4 shrink-0" />

      {/* Center login box */}
      <div className="max-w-md w-full my-auto space-y-4 shrink-0">
        {/* Single-lined title & logo ABOVE the white login box */}
        <div className="text-center">
          <div className="mx-auto h-11 w-11 sm:h-12 sm:w-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-2 sm:mb-3 shadow-md shadow-blue-500/20">
            <svg className="h-6 w-6 sm:h-7 sm:w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight whitespace-nowrap">
            Disconnection Management
          </h1>
        </div>

        <LoginForm />
      </div>

      {/* Bottom sliding feedback carousel */}
      <div className="w-full shrink-0 pt-4">
        <LoginFeedbackCarousel />
      </div>
    </div>
  )
}


