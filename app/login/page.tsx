import { LoginForm } from "@/components/login-form"
import { fetchApprovedFeedbacks } from "@/lib/feedback-service"
import { fetchCachedTenantCount } from "@/lib/tenant-resolver"
import { LoginDynamicHeader } from "@/components/login-dynamic-header"
import { LoginBackgroundShowcase } from "@/components/login-background-showcase"

export default async function LoginPage() {
  const [initialFeedbacks, tenantCount] = await Promise.all([
    fetchApprovedFeedbacks().catch(() => []),
    fetchCachedTenantCount().catch(() => 10),
  ])

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden overscroll-none flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-50 relative px-4 sm:px-6 select-none">
      {/* Background Animated SaaS Multi-Column Feature Showcase */}
      <LoginBackgroundShowcase />

      {/* Soft Ambient Vignette & Glow Accents */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(15,23,42,0.06)_100%)]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-gradient-to-tr from-blue-400/15 via-indigo-400/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-20 right-1/4 w-80 h-80 bg-sky-300/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-[420px] w-full my-auto space-y-3.5 relative z-10">
        {/* Dynamic Morphing Brand Header */}
        <LoginDynamicHeader />

        <LoginForm initialFeedbacks={initialFeedbacks} initialTenantCount={tenantCount} />
      </div>
    </div>
  )
}




