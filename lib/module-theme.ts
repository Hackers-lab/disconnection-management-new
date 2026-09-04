"use client"

import { useState, useEffect } from "react"

export type ModuleTheme = "slate" | "categorized" | "status" | "minimal-accent"

export interface ThemeOption {
  id: ModuleTheme
  label: string
  description: string
  accentColor: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "slate",
    label: "Executive Slate",
    description: "Monochrome, ultra-clean neutral cards and badges",
    accentColor: "#475569",
  },
  {
    id: "categorized",
    label: "Category Harmony",
    description: "Grouped by function: Ops (Blue), Field (Amber), Asset (Emerald)",
    accentColor: "#2563eb",
  },
  {
    id: "status",
    label: "Status Driven",
    description: "Neutral icons with dynamic priority-colored badges",
    accentColor: "#e11d48",
  },
  {
    id: "minimal-accent",
    label: "Minimal Indigo",
    description: "Crisp white cards with unified modern indigo accents",
    accentColor: "#4f46e5",
  },
]

const THEME_STORAGE_KEY = "dm_module_card_theme"
const DEFAULT_THEME: ModuleTheme = "slate"

export function getStoredTheme(): ModuleTheme {
  if (typeof window === "undefined") return DEFAULT_THEME
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ModuleTheme | null
    if (saved && ["slate", "categorized", "status", "minimal-accent"].includes(saved)) {
      return saved
    }
  } catch (e) {
    console.warn("Failed to read theme from localStorage", e)
  }
  return DEFAULT_THEME
}

export function setStoredTheme(theme: ModuleTheme) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    window.dispatchEvent(new CustomEvent("module-theme-change", { detail: { theme } }))
  } catch (e) {
    console.warn("Failed to save theme to localStorage", e)
  }
}

export function useModuleTheme() {
  const [theme, setTheme] = useState<ModuleTheme>(DEFAULT_THEME)

  useEffect(() => {
    setTheme(getStoredTheme())

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ModuleTheme }>
      if (customEvent.detail?.theme) {
        setTheme(customEvent.detail.theme)
      } else {
        setTheme(getStoredTheme())
      }
    }

    window.addEventListener("module-theme-change", handleThemeChange)
    window.addEventListener("storage", handleThemeChange)

    return () => {
      window.removeEventListener("module-theme-change", handleThemeChange)
      window.removeEventListener("storage", handleThemeChange)
    }
  }, [])

  const changeTheme = (newTheme: ModuleTheme) => {
    setTheme(newTheme)
    setStoredTheme(newTheme)
  }

  return { theme, changeTheme, options: THEME_OPTIONS }
}
