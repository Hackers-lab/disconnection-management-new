import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

function cleanEnv(value: string | undefined): string {
  return (value || "").replace(/^["']|["']$/g, "").trim()
}

const firebaseConfig = {
  apiKey: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
}

let _app: FirebaseApp | null = null
let _auth: Auth | null = null

export function isFirebaseConfigured(): boolean {
  const key = firebaseConfig.apiKey
  return (
    typeof window !== "undefined" &&
    key.length > 5 &&
    !key.includes("your-api-key") &&
    firebaseConfig.projectId.length > 0
  )
}

export function getFirebaseConfigError(): string | null {
  if (typeof window === "undefined") return null
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("your-api-key")) {
    return "OTP SMS service is not configured (missing NEXT_PUBLIC_FIREBASE_API_KEY)."
  }
  if (!firebaseConfig.authDomain) {
    return "OTP SMS service is not configured (missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)."
  }
  if (!firebaseConfig.projectId) {
    return "OTP SMS service is not configured (missing NEXT_PUBLIC_FIREBASE_PROJECT_ID)."
  }
  return null
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

function createLazyProxy<T extends object>(getter: () => T | null): T {
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const instance = getter()
      if (!instance) return undefined
      const val = Reflect.get(instance, prop, instance)
      return typeof val === "function" ? val.bind(instance) : val
    },
    set(_target, prop, value) {
      const instance = getter()
      if (!instance) return false
      return Reflect.set(instance, prop, value, instance)
    },
    has(_target, prop) {
      const instance = getter()
      return instance ? Reflect.has(instance, prop) : false
    },
    getPrototypeOf() {
      const instance = getter()
      return instance ? Object.getPrototypeOf(instance) : Object.prototype
    },
    ownKeys() {
      const instance = getter()
      return instance ? Reflect.ownKeys(instance) : []
    },
    getOwnPropertyDescriptor(_target, prop) {
      const instance = getter()
      if (!instance) return undefined
      const desc = Object.getOwnPropertyDescriptor(instance, prop)
      return desc ? { ...desc, configurable: true } : undefined
    },
  })
}

// Backwards-compatible lazy proxies. Prefer calling getFirebaseAuth() / getFirebaseApp() directly
// when passing instances into Firebase modular SDK functions like RecaptchaVerifier / signInWithPhoneNumber.
export const firebaseApp = createLazyProxy<FirebaseApp>(getFirebaseApp)
export const firebaseAuth = createLazyProxy<Auth>(getFirebaseAuth)
