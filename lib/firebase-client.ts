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

// Lazy-initialize Firebase only on the client side to prevent
// SSR/prerender crashes when NEXT_PUBLIC_FIREBASE_API_KEY is not available.
let _app: FirebaseApp | null = null
let _auth: Auth | null = null

function getFirebaseApp(): FirebaseApp {
  if (_app) return _app
  _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  return _app
}

function getFirebaseAuth(): Auth {
  if (_auth) return _auth
  _auth = getAuth(getFirebaseApp())
  return _auth
}

// Keep the original export names so existing imports continue to work.
// Using getters ensures initialization is deferred until actual client-side usage.
export const firebaseApp = typeof window !== "undefined" ? getFirebaseApp() : (null as unknown as FirebaseApp)
export const firebaseAuth = typeof window !== "undefined" ? getFirebaseAuth() : (null as unknown as Auth)
