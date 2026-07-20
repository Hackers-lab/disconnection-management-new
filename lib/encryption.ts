import * as crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // Recommended IV length for GCM

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || "fallback-secret-key-please-change"
  // Derive a secure 32-byte key from the secret string
  return crypto.createHash("sha256").update(secret).digest()
}

/**
 * Encrypts cleartext using AES-256-GCM
 * Returns string formatted as iv:authTag:ciphertext
 */
export function encrypt(text: string): string {
  if (!text) return ""
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  
  const authTag = cipher.getAuthTag().toString("hex")
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

/**
 * Decrypts ciphertext formatted as iv:authTag:ciphertext
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return ""
  const parts = encryptedText.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format")
  }
  
  const [ivHex, authTagHex, encryptedDataHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const key = getKey()
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedDataHex, "hex", "utf8")
  decrypted += decipher.final("utf8")
  
  return decrypted
}
