"use client"

// Re-export from the unified toast store in @/hooks/use-toast
// so all components share a single mounted <Toaster /> instance.
export { useToast, toast } from "@/hooks/use-toast"
