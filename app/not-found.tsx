import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <h1 className="text-4xl font-extrabold text-slate-800">404</h1>
      <p className="text-gray-600 mt-2">Page Not Found</p>
      <Link href="/dashboard" className="mt-4">
        <Button variant="outline">Return to Dashboard</Button>
      </Link>
    </div>
  )
}
