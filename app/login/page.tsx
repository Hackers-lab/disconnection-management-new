import { LoginForm } from "@/components/login-form"
import { fetchApprovedFeedbacks } from "@/lib/feedback-service"
import { fetchCachedTenantCount } from "@/lib/tenant-resolver"
import { LoginDynamicHeader } from "@/components/login-dynamic-header"
import { LoginShowcasePanel } from "@/components/login-showcase-panel"

export default async function LoginPage() {
  const [initialFeedbacks, tenantCount] = await Promise.all([
    fetchApprovedFeedbacks().catch(() => []),
    fetchCachedTenantCount().catch(() => 10),
  ])

  return (
    <div className="min-h-[100dvh] w-full bg-[#f6f8fb] lg:grid lg:grid-cols-12 overflow-x-hidden">
      {/* Left Desktop Architectural Showcase Stage */}
      <LoginShowcasePanel tenantCount={tenantCount} />

      {/* Right Sign-In Workspace (Full-screen scrollable centered on mobile/tablet) */}
      <main className="lg:col-span-6 xl:col-span-5 relative flex flex-col items-center justify-center min-h-[100dvh] px-4 py-8 sm:px-8 sm:py-10">
        {/* Soft Ambient Light Accents */}
        <div className="pointer-events-none absolute top-0 right-0 h-72 w-72 rounded-full bg-blue-400/[0.08] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-400/[0.08] blur-3xl" />

        <div className="w-full max-w-[430px] relative z-10 space-y-5">
          {/* Dynamic Brand Header (prominent on mobile/tablet where left showcase is hidden) */}
          <div className="lg:hidden">
            <LoginDynamicHeader />
          </div>

          <LoginForm initialFeedbacks={initialFeedbacks} initialTenantCount={tenantCount} />
        </div>
      </main>
    </div>
  )
}
