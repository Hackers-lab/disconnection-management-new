import { useState, useEffect, useCallback } from "react"

export function useHashState<T extends string>(
  moduleName: string,
  defaultValue: T
): [T, (val: T) => void] {
  const [state, setState] = useState<T>(defaultValue)

  const getHashSubView = useCallback(() => {
    if (typeof window === "undefined") return defaultValue
    const hash = window.location.hash.substring(1) // e.g. "reconnection/create"
    const [hashModule, hashSub] = hash.split("/")
    if (hashModule === moduleName) {
      return (hashSub as T) || defaultValue
    }
    return defaultValue
  }, [moduleName, defaultValue])

  // Synchronize state when the hash changes
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleHashChange = () => {
      const currentVal = getHashSubView()
      if (currentVal !== state) {
        setState(currentVal)
      }
    }

    // Set initial state from hash
    const initialVal = getHashSubView()
    if (initialVal !== state) {
      setState(initialVal)
    }

    window.addEventListener("hashchange", handleHashChange)
    window.addEventListener("popstate", handleHashChange)
    return () => {
      window.removeEventListener("hashchange", handleHashChange)
      window.removeEventListener("popstate", handleHashChange)
    }
  }, [getHashSubView, state])

  // Setter function that updates local state and modifies window history/hash
  const setHashState = useCallback((newVal: T) => {
    setState(newVal)
    if (typeof window === "undefined") return

    const targetHash = newVal === defaultValue ? `#${moduleName}` : `#${moduleName}/${newVal}`
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, "", targetHash)
    }
  }, [moduleName, defaultValue])

  return [state, setHashState]
}
