import { ModuleWaiter } from "@/components/ui/module-waiter"

export default function AppLoading() {
  return (
    <ModuleWaiter
      variant="fullscreen"
      accent="blue"
      title="Preparing Your Workspace"
      subtitle="Loading CCC Operations & Field Management Suite"
      messages={[
        "Verifying secure session...",
        "Loading CCC configuration...",
        "Preparing your dashboard...",
      ]}
    />
  )
}
