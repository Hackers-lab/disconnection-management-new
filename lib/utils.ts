import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type HapticType = 
  | "tap"        // 20ms - Standard button, tab, card, or toggle tap
  | "medium"     // 35ms - Drawer open, modal popup, menu expansion
  | "success"    // [20ms, 40ms, 30ms] - Save success, sync done, status update, upload completed
  | "warning"    // [35ms, 50ms, 35ms] - Confirmation prompt, disconnect warning, unlinked alert
  | "error"      // [50ms, 60ms, 50ms, 60ms, 70ms] - Validation error, delete action, network error
  | "shutter"    // 30ms - Camera shutter snap
  | "selection"  // 15ms - Quick scroll / picker selection

export function triggerHaptic(type: HapticType | number | number[] = "tap") {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.vibrate) {
    return
  }

  try {
    if (typeof type === "number" || Array.isArray(type)) {
      navigator.vibrate(type)
      return
    }

    switch (type) {
      case "tap":
        navigator.vibrate(20)
        break
      case "selection":
        navigator.vibrate(15)
        break
      case "medium":
        navigator.vibrate(35)
        break
      case "shutter":
        navigator.vibrate(30)
        break
      case "success":
        navigator.vibrate([20, 40, 30])
        break
      case "warning":
        navigator.vibrate([35, 50, 35])
        break
      case "error":
        navigator.vibrate([50, 60, 50, 60, 70])
        break
      default:
        navigator.vibrate(20)
    }
  } catch {
    // Ignore unsupported or restricted gesture vibration errors
  }
}

