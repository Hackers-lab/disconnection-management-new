"use client"

import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Crown,
  Sparkles,
  Zap,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Receipt,
  HeartHandshake,
  Flame,
} from "lucide-react"

export interface PaymentCelebrationModalProps {
  open: boolean
  onClose: () => void
  planName?: string
  expiresAt?: string
  paymentId?: string
  amount?: number
}

// Particle confetti colors
const CONFETTI_COLORS = ["#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#eab308"]

export function PaymentCelebrationModal({
  open,
  onClose,
  planName = "1 Month Vendor Access",
  expiresAt,
  paymentId,
  amount = 99,
}: PaymentCelebrationModalProps) {
  const [particles, setParticles] = useState<Array<{ id: number; left: number; top: number; size: number; color: string; delay: number; duration: number; rotation: number }>>([])

  useEffect(() => {
    if (open) {
      // Haptic celebration on mobile devices
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([60, 40, 80, 40, 100])
      }

      // Generate colorful falling confetti
      const items = Array.from({ length: 45 }).map((_, i) => ({
        id: i,
        left: Math.random() * 96 + 2, // 2% to 98%
        top: -(Math.random() * 20 + 5), // start above view
        size: Math.random() * 8 + 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.8,
        duration: Math.random() * 2.5 + 2.2,
        rotation: Math.random() * 360,
      }))
      setParticles(items)
    }
  }, [open])

  const formattedDate = expiresAt
    ? (() => {
        const d = new Date(expiresAt)
        return isNaN(d.getTime())
          ? expiresAt
          : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      })()
    : "30 Days Active"

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
      <DialogContent className="max-w-md w-[92vw] sm:w-full p-0 overflow-hidden rounded-3xl border border-amber-400/40 shadow-2xl [&>button]:hidden max-h-[94vh] flex flex-col bg-slate-950 text-slate-100 dark">
        <DialogTitle className="sr-only">Payment Successful - Subscription Activated</DialogTitle>

        {/* --- DYNAMIC CSS CONFETTI LAYER --- */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-xs shadow-xs animate-confetti-fall"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${p.size}px`,
                height: `${p.size * 1.5}px`,
                backgroundColor: p.color,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                transform: `rotate(${p.rotation}deg)`,
              }}
            />
          ))}
        </div>

        {/* --- CELEBRATION HERO SECTION --- */}
        <div className="relative bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white px-6 pt-7 pb-5 text-center shrink-0 border-b border-indigo-500/20 overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-2">
            {/* Animated Crown Badge */}
            <div className="inline-flex relative items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center animate-bounce">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Crown className="h-8 w-8 text-amber-400 fill-amber-400 drop-shadow-md" />
                </div>
              </div>
              <div className="absolute -top-1 -right-1 bg-emerald-500 text-white p-1 rounded-full shadow">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="inline-block px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-[10px] font-black tracking-widest text-amber-300 uppercase shadow-xs">
              ⚡ PAYMENT VERIFIED & ACTIVE
            </div>

            <h2 className="text-2xl font-black tracking-tight text-white">
              Tremendous Job! 🌟
            </h2>

            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
              Your contribution fuels uninterrupted field sync, rapid disconnections & transparent revenue audit.
            </p>
          </div>
        </div>

        {/* --- PLAN & BENEFITS CARD --- */}
        <div className="px-5 py-4 space-y-3 bg-slate-900/60 overflow-y-auto flex-1">
          {/* Active Plan Snapshot */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-indigo-500/10 border border-amber-400/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                {planName}
              </span>
              <span className="font-mono font-extrabold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded text-[11px]">
                ₹{amount} PAID
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
              <span>Full Validity Until:</span>
              <strong className="text-white font-mono text-xs">{formattedDate}</strong>
            </div>

            {paymentId && (
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Receipt className="h-3 w-3 text-slate-400" />
                  Transaction Ref:
                </span>
                <span className="font-mono text-indigo-300 truncate max-w-[170px]">{paymentId}</span>
              </div>
            )}
          </div>

          {/* Unlocked Capabilities Highlights */}
          <div className="space-y-2 pt-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Unlocked Field Capabilities:</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-200">Blazing Fast Sync</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-200">Full Cloud Security</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-indigo-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-200">Multi-Agency Access</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                <Flame className="h-4 w-4 text-rose-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-200">Live Discon Tracking</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- ACTION FOOTER --- */}
        <div className="px-5 pb-5 pt-3 bg-slate-950 border-t border-slate-800/80 shrink-0">
          <Button
            className="w-full h-11 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 rounded-xl text-xs sm:text-sm font-black shadow-lg shadow-amber-500/20 gap-2 flex items-center justify-center transition-all active:scale-[0.98]"
            onClick={onClose}
          >
            Dive In & Continue to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-center text-[10px] text-slate-500 mt-2">
            Receipt and invoice details have been recorded in your Profile history.
          </p>
        </div>
      </DialogContent>

      <style jsx global>{`
        @keyframes confettiFall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti-fall {
          animation: confettiFall linear forwards;
        }
      `}</style>
    </Dialog>
  )
}
