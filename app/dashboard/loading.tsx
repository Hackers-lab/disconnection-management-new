import { ModuleWaiter } from "@/components/ui/module-waiter"

export default function DashboardLoading() {
  return (
    <ModuleWaiter
      variant="fullscreen"
      accent="indigo"
      title="Loading CCC Dashboard"
      subtitle="Syncing permissions, agencies & live module counts"
      messages={[
        "Checking account & permissions...",
        "Loading CCC modules...",
        "Hydrating field operations data...",
        "Almost ready...",
      ]}
    />
  )
}
