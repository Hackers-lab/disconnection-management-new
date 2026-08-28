"use client"

import { useState, useEffect } from "react"
import { Bell, Send, CheckCircle2, AlertTriangle, Users, Building2, User, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { triggerHaptic } from "@/lib/utils"

interface BroadcastPushModalProps {
  isOpen: boolean
  onClose: () => void
  isSuperuser?: boolean
  currentCccCode?: string
  tenants?: Array<{ cccCode: string; cccName: string }>
}

export function BroadcastPushModal({
  isOpen,
  onClose,
  isSuperuser = false,
  currentCccCode = "SYSTEM",
  tenants = []
}: BroadcastPushModalProps) {
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [targetCcc, setTargetCcc] = useState(isSuperuser ? "all" : currentCccCode)
  const [targetRole, setTargetRole] = useState("all")
  const [targetUrl, setTargetUrl] = useState("/dashboard")
  const [priority, setPriority] = useState<"normal" | "urgent">("normal")

  const [sending, setSending] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setResultMsg(null)
      setTitle("")
      setMessage("")
      setTargetCcc(isSuperuser ? "all" : currentCccCode)
    }
  }, [isOpen, isSuperuser, currentCccCode])

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      triggerHaptic("error")
      alert("Please provide both a notification title and message.")
      return
    }

    setSending(true)
    setResultMsg(null)
    triggerHaptic("medium")

    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          url: targetUrl,
          targetCcc: isSuperuser ? targetCcc : currentCccCode,
          targetRole,
          priority
        })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        triggerHaptic("success")
        setResultMsg({
          success: true,
          text: data.message || `Delivered to ${data.sentCount} devices.`
        })
      } else {
        triggerHaptic("error")
        setResultMsg({
          success: false,
          text: data.error || "Failed to broadcast notification."
        })
      }
    } catch (err: any) {
      triggerHaptic("error")
      setResultMsg({
        success: false,
        text: err?.message || "Network error while broadcasting."
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white p-4 sm:p-6 rounded-2xl shadow-2xl border border-slate-200">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 shrink-0">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-sm sm:text-base font-bold text-slate-900">
                {isSuperuser ? "Global Push Notification" : "Office Team Announcement"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {isSuperuser
                  ? "Broadcast instant notifications to all connected devices across care centers."
                  : `Send instant mobile push alerts to all staff and agencies in ${currentCccCode}.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {/* Target Audience Controls */}
          <div className="grid grid-cols-2 gap-2">
            {isSuperuser && (
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Target Care Center
                </label>
                <select
                  value={targetCcc}
                  onChange={e => setTargetCcc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs h-8 px-2 rounded-lg outline-none"
                >
                  <option value="all">📢 All Care Centers (Global)</option>
                  {tenants.map(t => (
                    <option key={t.cccCode} value={t.cccCode}>
                      {t.cccCode} — {t.cccName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={isSuperuser ? "" : "col-span-2"}>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Target Role
              </label>
              <select
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs h-8 px-2 rounded-lg outline-none"
              >
                <option value="all">👥 All Roles (Admins & Field Staff)</option>
                <option value="agency">Agency Field Staff</option>
                <option value="admin">Office Admins</option>
                <option value="executive">Executives</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Notification Title
            </label>
            <Input
              placeholder="e.g. Urgent Disconnection List Updated"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-slate-50 border-slate-200 text-slate-900 text-xs h-8 rounded-lg"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Message Content
            </label>
            <Textarea
              placeholder="Type your message here (will buzz and appear on Android notification shade)..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-lg resize-none"
            />
          </div>

          {/* Priority & Deep-link URL */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs h-8 px-2 rounded-lg outline-none"
              >
                <option value="normal">⚡ Standard Alert</option>
                <option value="urgent">🚨 Urgent Priority</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Tap Destination
              </label>
              <select
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs h-8 px-2 rounded-lg outline-none"
              >
                <option value="/dashboard">Home Dashboard</option>
                <option value="/dashboard?view=disconnection">Disconnection List</option>
                <option value="/dashboard?view=meters">Meter Replacement</option>
                <option value="/dashboard?view=consumer-master">Consumer Master</option>
              </select>
            </div>
          </div>

          {/* Feedback Status Alert */}
          {resultMsg && (
            <div
              className={`p-2.5 rounded-lg flex items-center gap-2 text-xs ${
                resultMsg.success
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border border-rose-200 text-rose-800"
              }`}
            >
              {resultMsg.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />}
              <span className="font-medium">{resultMsg.text}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-1.5 sm:gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm"
          >
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Sending Broadcast...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send Push Notification
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
