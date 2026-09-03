"use client"

import { useState, useEffect, useCallback, useRef } from "react"

declare global {
  interface Window {
    google?: {
      translate: {
        TranslateElement: new (
          options: {
            pageLanguage: string
            includedLanguages: string
            autoDisplay?: boolean
            layout?: number
          },
          elementId: string
        ) => void
      }
    }
    googleTranslateElementInit?: () => void
  }
}

// Prevent React from crashing when Google Translate wraps DOM nodes in <font> tags
if (typeof window !== "undefined" && typeof Node === "function" && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) {
        return child.parentNode.removeChild(child) as T
      }
      return child
    }
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (referenceNode.parentNode) {
        return referenceNode.parentNode.insertBefore(newNode, referenceNode) as T
      }
      return newNode
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T
  }
}

// Map Bengali digits to English standard digits
const BN_TO_EN_DIGITS: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
}

// Storage key for user's language preference
const STORAGE_KEY = "user_app_language_preference"

export function LanguageToggle() {
  const [currentLang, setCurrentLang] = useState<"en" | "bn">("en")
  const [isTranslating, setIsTranslating] = useState(false)
  const observerRef = useRef<MutationObserver | null>(null)

  // Helper to read language from localStorage first, then fallback to cookie
  const getPreferredLanguage = useCallback((): "en" | "bn" => {
    if (typeof window === "undefined") return "en"
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "bn" || stored === "en") return stored
    } catch (e) {}

    const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/)
    if (match && match[1]) {
      const val = decodeURIComponent(match[1])
      if (val.endsWith("/bn")) return "bn"
    }
    return "en"
  }, [])

  // Normalize Bengali digits in DOM back to standard English digits (0-9)
  const revertBengaliDigits = useCallback((rootNode: Node) => {
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script, style, and elements marked notranslate
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          if (
            parent.tagName === "SCRIPT" ||
            parent.tagName === "STYLE" ||
            parent.closest(".notranslate") ||
            parent.closest("[translate='no']")
          ) {
            return NodeFilter.FILTER_REJECT
          }
          if (/[০-৯]/.test(node.nodeValue || "")) {
            return NodeFilter.FILTER_ACCEPT
          }
          return NodeFilter.FILTER_SKIP
        },
      }
    )

    const nodesToUpdate: Node[] = []
    while (walker.nextNode()) {
      nodesToUpdate.push(walker.currentNode)
    }

    nodesToUpdate.forEach((node) => {
      if (node.nodeValue && /[০-৯]/.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/[০-৯]/g, (char) => BN_TO_EN_DIGITS[char] || char)
      }
    })
  }, [])

  // Clean up any Google Translate top bar and body shifts
  const cleanGoogleTranslateBanner = useCallback(() => {
    if (typeof document === "undefined") return

    // Force top offset back to 0px
    if (document.body.style.top && document.body.style.top !== "0px") {
      document.body.style.top = "0px"
    }
    if (document.documentElement.style.top && document.documentElement.style.top !== "0px") {
      document.documentElement.style.top = "0px"
    }

    // Hide any Google injected banners and iframes
    const googleElements = document.querySelectorAll<HTMLElement>(
      'iframe.goog-te-banner-frame, iframe[id*="container"], .VIpgJd-ZVi9od-aZ2wEe-wOHMyf, .VIpgJd-ZVi9od-ORHb-OEVmcd, .skiptranslate, #goog-gt-tt, .goog-te-balloon-frame'
    )
    googleElements.forEach((el) => {
      if (el.id !== "google_translate_element") {
        el.style.setProperty("display", "none", "important")
        el.style.setProperty("visibility", "hidden", "important")
        el.style.setProperty("height", "0px", "important")
        el.style.setProperty("opacity", "0", "important")
        el.style.setProperty("pointer-events", "none", "important")
      }
    })
  }, [])

  // Setup headless script and background observers
  useEffect(() => {
    if (typeof window === "undefined") return

    const savedLang = getPreferredLanguage()
    setCurrentLang(savedLang)

    // Ensure cookie matches stored preference so Google Translate initializes into user's choice
    const domain = window.location.hostname
    const isDomainIp = /^[0-9.]+$/.test(domain) || domain === "localhost"
    if (savedLang === "bn") {
      document.cookie = `googtrans=/en/bn; path=/;`
      if (!isDomainIp) {
        document.cookie = `googtrans=/en/bn; path=/; domain=.${domain};`
      }
    } else {
      document.cookie = `googtrans=/en/en; path=/;`
    }

    window.googleTranslateElementInit = () => {
      try {
        if (window.google?.translate?.TranslateElement) {
          new window.google.translate.TranslateElement(
            {
              pageLanguage: "en",
              includedLanguages: "en,bn",
              autoDisplay: false,
            },
            "google_translate_element"
          )
        }
      } catch (err) {
        console.error("Failed to initialize Google Translate element:", err)
      }
    }

    // Inject script if not present
    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script")
      script.id = "google-translate-script"
      script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
      script.async = true
      document.body.appendChild(script)
    } else if (window.google?.translate) {
      window.googleTranslateElementInit?.()
    }

    // Continuous MutationObserver to:
    // 1. Instantly kill Google top bar & body top shift
    // 2. Safely revert Bengali digits back to English digits (0-9) via debounced requestAnimationFrame
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleDigitReversion = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (typeof window !== "undefined" && getPreferredLanguage() === "bn") {
          requestAnimationFrame(() => {
            revertBengaliDigits(document.body)
          })
        }
      }, 150)
    }

    const observer = new MutationObserver(() => {
      cleanGoogleTranslateBanner()
      if (getPreferredLanguage() === "bn") {
        scheduleDigitReversion()
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    observerRef.current = observer

    // Initial pass to clean banners & digits
    cleanGoogleTranslateBanner()
    if (savedLang === "bn") {
      revertBengaliDigits(document.body)
    }

    const timer = setInterval(() => {
      cleanGoogleTranslateBanner()
      if (getPreferredLanguage() === "bn") {
        revertBengaliDigits(document.body)
      }
    }, 800)

    return () => {
      observer.disconnect()
      clearInterval(timer)
    }
  }, [cleanGoogleTranslateBanner, revertBengaliDigits, getPreferredLanguage])

  // Toggle function between English and Bengali
  const handleToggleLanguage = useCallback(() => {
    if (typeof window === "undefined") return
    if (navigator.vibrate) navigator.vibrate(20)

    setIsTranslating(true)
    const targetLang: "en" | "bn" = currentLang === "en" ? "bn" : "en"

    // Persist preference to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, targetLang)
    } catch (e) {}

    const domain = window.location.hostname
    const isDomainIp = /^[0-9.]+$/.test(domain) || domain === "localhost"

    if (targetLang === "bn") {
      document.cookie = `googtrans=/en/bn; path=/;`
      if (!isDomainIp) {
        document.cookie = `googtrans=/en/bn; path=/; domain=.${domain};`
      }

      const combo = document.querySelector(".goog-te-combo") as HTMLSelectElement | null
      if (combo) {
        combo.value = "bn"
        combo.dispatchEvent(new Event("change", { bubbles: true }))
        setCurrentLang("bn")
        setTimeout(() => {
          cleanGoogleTranslateBanner()
          revertBengaliDigits(document.body)
          setIsTranslating(false)
        }, 500)
      } else {
        setCurrentLang("bn")
        setTimeout(() => window.location.reload(), 150)
      }
    } else {
      // Clear googtrans cookie to restore pristine English
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
      document.cookie = `googtrans=/en/en; path=/;`
      if (!isDomainIp) {
        document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain};`
        document.cookie = `googtrans=/en/en; path=/; domain=.${domain};`
      }
      setCurrentLang("en")
      setTimeout(() => {
        window.location.reload()
      }, 150)
    }
  }, [currentLang, cleanGoogleTranslateBanner, revertBengaliDigits])

  return (
    <>
      {/* Invisible container for Google Translate */}
      <div id="google_translate_element" className="hidden" aria-hidden="true" style={{ display: "none" }} />

      {/* Compact Language Toggle Button: "E/বা" */}
      <button
        type="button"
        onClick={handleToggleLanguage}
        className={`notranslate relative inline-flex items-center justify-center gap-1 h-6.5 sm:h-7 px-2 py-0.5 rounded-full border text-[11px] font-bold shadow-2xs transition-all duration-200 active:scale-95 select-none cursor-pointer shrink-0 ${
          currentLang === "bn"
            ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-emerald-500/10"
            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
        } ${isTranslating ? "opacity-75 scale-95" : "opacity-100"}`}
        title={currentLang === "en" ? "বাংলায় পরিবর্তন করুন (E / বা)" : "Switch to English (E / বা)"}
        aria-label="Toggle Bengali/English Language"
      >
        {/* Minimal Translation Globe SVG */}
        <svg
          className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${
            currentLang === "bn" ? "text-emerald-600" : "text-blue-600"
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>

        {/* Ultra-compact "E/বা" text */}
        <span className="inline-flex items-center leading-none tracking-tight">
          <span
            className={
              currentLang === "en"
                ? "text-blue-700 font-extrabold"
                : "text-slate-400 font-medium"
            }
          >
            E
          </span>
          <span className="text-slate-300 font-light mx-[1px]">/</span>
          <span
            className={`font-[family-name:var(--font-bengali)] ${
              currentLang === "bn"
                ? "text-emerald-700 font-extrabold"
                : "text-slate-500 font-medium"
            }`}
          >
            বা
          </span>
        </span>
      </button>
    </>
  )
}
