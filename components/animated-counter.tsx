"use client"

import { useState, useEffect } from "react"

interface AnimatedCounterProps {
  value: number | null
  className?: string
}

function RollingDigitColumn({
  targetDigit,
  indexFromRight,
}: {
  targetDigit: number
  indexFromRight: number
}) {
  const [mounted, setMounted] = useState(false)

  // 30 numbers total in reel strip (0-9 repeated 3 times)
  // Higher cycle count for rightmost digits for longer spinning duration
  const cycleCount = indexFromRight === 0 ? 2 : indexFromRight === 1 ? 2 : 1
  const targetIndex = cycleCount * 10 + targetDigit

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
    }, 50 + (2 - indexFromRight) * 70)

    return () => clearTimeout(timer)
  }, [indexFromRight, targetDigit])

  const currentIndex = mounted ? targetIndex : 0
  // Deceleration duration: 3rd from right stops first, rightmost stops last
  const duration = 1400 + (2 - indexFromRight) * 280

  return (
    <span className="inline-block h-[1.2em] overflow-hidden leading-[1.2em] relative align-bottom">
      <span
        className="inline-flex flex-col select-none"
        style={{
          transform: `translateY(-${(currentIndex * 100) / 30}%)`,
          transitionProperty: "transform",
          transitionDuration: `${duration}ms`,
          transitionTimingFunction: "cubic-bezier(0.12, 0.88, 0.22, 1)",
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <span key={i} className="h-[1.2em] flex items-center justify-center">
            {i % 10}
          </span>
        ))}
      </span>
    </span>
  )
}

export function AnimatedCounter({ value, className = "" }: AnimatedCounterProps) {
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
              key={idx}
              targetDigit={digitNum}
              indexFromRight={indexFromRight}
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


