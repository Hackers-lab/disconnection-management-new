import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let _app: FirebaseApp | null = null
let _auth: Auth | null = null

export function isFirebaseConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  return (
    typeof window !== "undefined" &&
    typeof key === "string" &&
    key.trim().length > 5 &&
    !key.includes("your-api-key")
  )
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return null
  if (_app) return _app
  try {
    _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
    return _app
  } catch (err) {
    console.warn("[Firebase] Initialization skipped or invalid config:", err)
    return null
  }
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return null
  if (_auth) return _auth
  try {
    const app = getFirebaseApp()
    if (!app) return null
    _auth = getAuth(app)
    return _auth
  } catch (err) {
    console.warn("[Firebase] Auth initialization skipped or invalid config:", err)
    return null
  }
}

// Proxied lazy exports so importing this file NEVER executes getAuth() at bundle evaluation time
export const firebaseApp = new Proxy({} as FirebaseApp, {
  get(_target, prop) {
    const instance = getFirebaseApp()
    if (!instance) return undefined
    const val = (instance as any)[prop]
    return typeof val === "function" ? val.bind(instance) : val
  },
})

export const firebaseAuth = new Proxy({} as Auth, {
  get(_target, prop) {
    const instance = getFirebaseAuth()
    if (!instance) return undefined
    const val = (instance as any)[prop]
    return typeof val === "function" ? val.bind(instance) : val
  },
})
