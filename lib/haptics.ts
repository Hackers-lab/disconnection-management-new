/**
 * Safe client-side Web Vibration API haptics utility
 */
export type HapticFeedbackType =
  | "tick"     // Ultra-light micro-tick for subtle text/icon transitions
  | "light"    // Light click feedback
  | "medium"   // Distinct feedback for button taps and toggle interactions
  | "heavy"    // Strong single burst
  | "success"  // Satisfying affirmative double-pulse for successful login
  | "error"    // Staggered losing/error pattern (buzz-buzz-buzz) for failed login

export function triggerHaptic(type: HapticFeedbackType) {
  if (typeof window === "undefined" || !("navigator" in window) || !("vibrate" in navigator)) {
    return
  }

  try {
    switch (type) {
      case "tick":
        navigator.vibrate(8) // 8ms micro-pulse for module text rotate
        break
      case "light":
        navigator.vibrate(15)
        break
      case "medium":
        navigator.vibrate(28) // Medium click on bottom buttons
        break
      case "heavy":
        navigator.vibrate(55)
        break
      case "success":
        navigator.vibrate([45, 35, 75]) // Heavy punch on successful login
        break
      case "error":
        navigator.vibrate([60, 45, 60, 45, 90]) // Losing pattern for failed login
        break
    }
  } catch {
    // Graceful degradation on unsupported devices
  }
}
