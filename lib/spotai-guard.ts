// Time-based hourly rotating token and session guard for SpotAI Intelligence access

const SECRET_SALT = "wbsedcl_spotai_guard_secret_2026";

/**
 * Computes a deterministic 6-character hex hash for the given hour bucket.
 * Rotates automatically every 60 minutes.
 */
export function getHourlySpotAiHash(offsetHours = 0): string {
  const currentHourBucket = Math.floor(Date.now() / (1000 * 60 * 60)) + offsetHours;
  const inputStr = `${SECRET_SALT}_${currentHourBucket}`;
  
  // Simple deterministic string hashing (DJB2-based with salt)
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < inputStr.length; i++) {
    const char = inputStr.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }

  const combined = (Math.abs(hash1) * 31 + Math.abs(hash2)) >>> 0;
  return combined.toString(36).substring(0, 6);
}

/**
 * Returns the full current valid hash path for the URL bar, e.g., "spotai-9f82a1"
 */
export function getCurrentSpotAiHashRoute(): string {
  return `spotai-${getHourlySpotAiHash(0)}`;
}

/**
 * Validates if the given hash string matches the current hour or immediate previous hour (rollover grace)
 */
export function isValidSpotAiHash(hashStr: string): boolean {
  if (!hashStr) return false;
  
  const cleanHash = hashStr.replace(/^#/, "").trim();
  const match = cleanHash.match(/^spotai-([a-z0-9]+)$/i);
  if (!match) return false;

  const providedToken = match[1].toLowerCase();
  const currentToken = getHourlySpotAiHash(0).toLowerCase();
  const prevToken = getHourlySpotAiHash(-1).toLowerCase();

  return providedToken === currentToken || providedToken === prevToken;
}

/**
 * Unlocks SpotAI session in memory when the physical 2.0-second long press occurs.
 */
export function unlockSpotAiSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("spotai_auth_ts", String(Date.now()));
    sessionStorage.setItem("spotai_auth_token", getHourlySpotAiHash(0));
  } catch (e) {
    console.warn("Failed to set sessionStorage:", e);
  }
}

/**
 * Checks if the browser tab has an active, unexpired long-press unlock (< 60 minutes).
 */
export function isSpotAiSessionValid(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const tsStr = sessionStorage.getItem("spotai_auth_ts");
    const token = sessionStorage.getItem("spotai_auth_token");
    if (!tsStr || !token) return false;

    const ts = parseInt(tsStr, 10);
    if (isNaN(ts)) return false;

    // Must be within 60 minutes of the physical long press
    const isWithinTime = Date.now() - ts < 60 * 60 * 1000;
    const isTokenValid = token === getHourlySpotAiHash(0) || token === getHourlySpotAiHash(-1);

    return isWithinTime && isTokenValid;
  } catch (e) {
    return false;
  }
}

/**
 * Locks SpotAI session immediately.
 */
export function lockSpotAiSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("spotai_auth_ts");
    sessionStorage.removeItem("spotai_auth_token");
  } catch (e) {}
}
