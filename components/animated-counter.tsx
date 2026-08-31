"use client"

import { useState, useEffect } from "react"

interface AnimatedCounterProps {
  value: number | null
  className?: string
  intervalMs?: number
}

function RollingDigitColumn({
  targetDigit,
  indexFromRight,
  cycleTick,
}: {
  targetDigit: number
  indexFromRight: number
  cycleTick: number
}) {
  const [mounted, setMounted] = useState(false)

  // 40 numbers in strip (0-9 repeated 4 times)
  const baseCycle = (cycleTick % 3) + 1
  const targetIndex = baseCycle * 10 + targetDigit

  useEffect(() => {
    setMounted(false)
    const timer = setTimeout(() => {
      setMounted(true)
    }, 40 + (2 - indexFromRight) * 60)

    return () => clearTimeout(timer)
  }, [indexFromRight, targetDigit, cycleTick])

  const currentIndex = mounted ? targetIndex : 0
  const duration = 1300 + (2 - indexFromRight) * 220

  return (
    <span className="inline-block h-[1.2em] overflow-hidden leading-[1.2em] relative align-bottom">
      <span
        className="inline-flex flex-col select-none"
        style={{
          transform: `translateY(-${(currentIndex * 100) / 40}%)`,
          transitionProperty: "transform",
          transitionDuration: `${duration}ms`,
          transitionTimingFunction: "cubic-bezier(0.12, 0.88, 0.22, 1)",
        }}
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="h-[1.2em] flex items-center justify-center">
            {i % 10}
          </span>
        ))}
      </span>
    </span>
  )
}

export function AnimatedCounter({ value, className = "", intervalMs = 10000 }: AnimatedCounterProps) {
  const [cycleTick, setCycleTick] = useState(0)

  useEffect(() => {
    if (value === null || typeof value !== "number") return

    const interval = setInterval(() => {
      setCycleTick((prev) => prev + 1)
    }, intervalMs)

    return () => clearInterval(interval)
  }, [value, intervalMs])

  if (value === null || typeof value !== "number") {
    return <span className={className}>...</span>
  }

  const formattedStr = value.toLocaleString()
  const chars = formattedStr.split("")

  // Calculate total number of numeric digits
  let totalDigits = 0
  for (let i = 0; i < chars.length; i++) {
    if (/\d/.test(chars[i])) {
      totalDigits++
    }
  }

  let currentDigitPosFromLeft = 0

  return (
    <span className={`inline-flex items-baseline tabular-nums font-semibold tracking-tight ${className}`}>
      {chars.map((char, idx) => {
        if (!/\d/.test(char)) {
          return (
            <span key={idx} className="px-px">
              {char}
            </span>
          )
        }

        const indexFromRight = totalDigits - 1 - currentDigitPosFromLeft
        currentDigitPosFromLeft++
        const digitNum = parseInt(char, 10)

        // Only roll the last 3 digits (indexFromRight < 3)
        if (indexFromRight < 3) {
          return (
            <RollingDigitColumn
              key={`${idx}-${cycleTick}`}
              targetDigit={digitNum}
              indexFromRight={indexFromRight}
              cycleTick={cycleTick}
            />
          )
        }

        // Leading digits remain static
        return (
          <span key={idx} className="inline-block">
            {char}
          </span>
        )
      })}
    </span>
  )
}



