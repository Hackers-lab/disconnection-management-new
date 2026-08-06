import { LoginForm } from "@/components/login-form"
import { LoginFeedbackCarousel } from "@/components/login-feedback-carousel"

export default function LoginPage() {
  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden overscroll-none touch-none flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full my-auto space-y-4">
        {/* Single-lined title & logo ABOVE the white login box */}
        <div className="text-center">
          <div className="mx-auto h-11 w-11 sm:h-12 sm:w-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-2 sm:mb-3 shadow-md shadow-blue-500/20">
            <svg className="h-6 w-6 sm:h-7 sm:w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 tracking-tight whitespace-nowrap">
            Disconnection Management
          </h1>
        </div>

        {/* Centered Feedback & Notice Marquee Banner */}
        <div className="w-full bg-white/80 backdrop-blur-sm border border-blue-200/80 rounded-2xl px-3.5 py-2 shadow-sm flex items-center gap-2 overflow-hidden">
          <span className="shrink-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Notice
          </span>
          <div className="flex-1 overflow-hidden whitespace-nowrap relative">
            <div className="inline-block animate-marquee text-xs font-medium text-slate-700">
              Welcome! Send app feedback inside your profile tab after login • For technical support contact Pramod Verma: 8092273459
            </div>
          </div>
        </div>

        <LoginForm />

        {/* Minimal Right-to-Left Real User Feedback Ticker */}
        <div className="pt-2">
          <LoginFeedbackCarousel />
        </div>
      </div>
    </div>
  )
}



