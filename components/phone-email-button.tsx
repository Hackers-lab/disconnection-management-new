"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"

declare global {
  interface Window {
    phoneEmailListener?: (userObj: { user_json_url?: string }) => void
  }
}

interface PhoneEmailButtonProps {
  onVerified: (userJsonUrl: string) => void | Promise<void>
  verifying?: boolean
  helperText?: string
}

const PHONE_EMAIL_SCRIPT_URL = "https://www.phone.email/sign_in_button_v1.js"

function getPhoneEmailClientId(): string {
  return (process.env.NEXT_PUBLIC_PHONE_EMAIL_CLIENT_ID || "")
    .replace(/^["']|["']$/g, "")
    .trim()
}

export function PhoneEmailButton({
  onVerified,
  verifying = false,
  helperText,
}: PhoneEmailButtonProps) {
  const clientId = getPhoneEmailClientId()
  const containerRef = useRef<HTMLDivElement>(null)
  const onVerifiedRef = useRef(onVerified)
  const [scriptError, setScriptError] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    onVerifiedRef.current = onVerified
  }, [onVerified])

  useEffect(() => {
    if (!clientId || !containerRef.current) return

    const container = containerRef.current
    setScriptError(false)
    setScriptReady(false)

    // Register global Phone.Email callback
    const listener = (userObj: { user_json_url?: string }) => {
      if (userObj?.user_json_url) {
        onVerifiedRef.current(userObj.user_json_url)
      }
    }
    window.phoneEmailListener = listener

    // Build fresh widget div with script inside it (matching Phone.Email's official embed structure)
    container.innerHTML = ""
    const widgetDiv = document.createElement("div")
    widgetDiv.className = "pe_signin_button"
    widgetDiv.setAttribute("data-client-id", clientId)

    const script = document.createElement("script")
    script.src = PHONE_EMAIL_SCRIPT_URL
    script.async = true
    script.onload = () => setScriptReady(true)
    script.onerror = () => setScriptError(true)
    widgetDiv.appendChild(script)
    container.appendChild(widgetDiv)

    return () => {
      if (window.phoneEmailListener === listener) {
        delete window.phoneEmailListener
      }
      container.innerHTML = ""
    }
  }, [clientId])

  if (!clientId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
        <p className="font-semibold flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          Phone.Email OTP Not Configured
        </p>
        <p className="text-[11px] text-amber-800 leading-relaxed">
          Please add <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">NEXT_PUBLIC_PHONE_EMAIL_CLIENT_ID</code> in your environment variables from your Phone.Email Admin Dashboard.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative flex flex-col items-center justify-center min-h-[54px] rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
        {!scriptReady && !scriptError && !verifying && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
            <span>Loading SMS OTP verification...</span>
          </div>
        )}

        <div
          ref={containerRef}
          className={`flex items-center justify-center w-full ${verifying ? "opacity-40 pointer-events-none" : ""}`}
        />

        {verifying && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-white/80 backdrop-blur-[1px] text-xs font-semibold text-slate-800">
            <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
            <span>Confirming verified mobile...</span>
          </div>
        )}
      </div>

      {scriptError && (
        <p className="text-[11px] text-red-600 text-center">
          Could not load Phone.Email verification script. Please check your internet connection and try again.
        </p>
      )}

      {helperText && (
        <p className="text-[11px] text-slate-500 text-center leading-snug">
          {helperText}
        </p>
      )}
    </div>
  )
}
