export async function ensureLeafletLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as any
  if (w.L) return
  if (w.__leafletLoadingPromise) return w.__leafletLoadingPromise

  const cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  const scriptSrc = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

  // Add CSS if not already present
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = cssHref
    document.head.appendChild(link)
  }

  // If script already present but not loaded yet, wait for it
  let existingScript = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null
  if (existingScript && (window as any).L) return

  w.__leafletLoadingPromise = new Promise<void>((resolve, reject) => {
    if (existingScript) {
      // If script exists but Leaflet not yet initialized, attach onload handlers
      existingScript.addEventListener('load', () => resolve())
      existingScript.addEventListener('error', (e) => reject(e))
      return
    }

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.onload = () => {
      resolve()
    }
    script.onerror = (e) => reject(e)
    document.body.appendChild(script)
  })

  return w.__leafletLoadingPromise
}
