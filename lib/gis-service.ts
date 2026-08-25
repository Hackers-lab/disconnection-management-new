import { createClient, type Client } from "@libsql/client"
import { getDriveClient } from "./google-drive"
import { getKV, setKV, getTenantKey } from "./kv-store"
import { appendDeltaPatch, getModuleVersions } from "./version-engine"
import type { GisPhotoRecord } from "./indexed-db"

export const GIS_MODULE_KEY = "gis"

let tursoClient: Client | null = null
let gisTableInitialized = false

function getTursoClient(): Client | null {
  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    process.env.LIBSQL_URL ||
    process.env.STORAGE_DATABASE_URL ||
    process.env.STORAGE_URL ||
    process.env.TURSO_DATABASE_URL_URL
  const authToken =
    process.env.TURSO_AUTH_TOKEN ||
    process.env.LIBSQL_AUTH_TOKEN ||
    process.env.STORAGE_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN_TOKEN
  if (!url) return null
  if (!tursoClient) {
    tursoClient = createClient({ url, authToken })
  }
  return tursoClient
}

export async function ensureGisCapturesTable(): Promise<void> {
  if (gisTableInitialized) return
  const client = getTursoClient()
  if (!client) return

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS GIS_captures (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        drive_file_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        date_formatted TEXT,
        time_formatted TEXT,
        lat REAL,
        lng REAL,
        accuracy REAL,
        location_name TEXT,
        note TEXT NOT NULL,
        uploaded_by TEXT,
        uploaded_by_name TEXT,
        user_role TEXT,
        office_code TEXT,
        agency TEXT,
        created_at INTEGER DEFAULT (unixepoch() * 1000)
      );
    `)

    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_gis_captures_tenant ON GIS_captures(tenant_id, timestamp DESC);
    `).catch(() => {})

    gisTableInitialized = true
  } catch (err) {
    console.warn("[gis-service] Error initializing GIS_captures table in Turso:", err)
  }
}

/**
 * Helper to construct viewable/downloadable Google Drive link from fileId.
 */
export function getDriveViewUrl(driveFileId: string): string {
  if (!driveFileId) return ""
  return `https://lh3.googleusercontent.com/d/${driveFileId}`
}

export function getDriveDownloadUrl(driveFileId: string): string {
  if (!driveFileId) return ""
  return `https://drive.google.com/uc?export=download&id=${driveFileId}`
}

/**
 * Fetch all GIS captures for a tenant (Base Dataset)
 */
export async function fetchGisCaptures(tenantId: string): Promise<GisPhotoRecord[]> {
  const cleanTenant = (tenantId || "default").trim().toLowerCase()

  try {
    const client = getTursoClient()
    if (client) {
      await ensureGisCapturesTable()
      const res = await client.execute({
        sql: `SELECT * FROM GIS_captures WHERE LOWER(tenant_id) = ? ORDER BY timestamp DESC`,
        args: [cleanTenant],
      })

      if (res && res.rows && res.rows.length > 0) {
        return res.rows.map((row: any) => {
          const driveFileId = String(row.drive_file_id || "")
          const driveUrl = getDriveViewUrl(driveFileId)
          return {
            id: String(row.id),
            driveFileId,
            driveUrl,
            dataUrl: driveUrl,
            timestamp: Number(row.timestamp || Date.now()),
            dateFormatted: String(row.date_formatted || ""),
            timeFormatted: String(row.time_formatted || ""),
            lat: Number(row.lat || 0),
            lng: Number(row.lng || 0),
            accuracy: row.accuracy ? Number(row.accuracy) : undefined,
            locationName: String(row.location_name || ""),
            note: String(row.note || ""),
            uploadedBy: String(row.uploaded_by || ""),
            uploadedByName: String(row.uploaded_by_name || ""),
            userRole: String(row.user_role || ""),
            officeCode: String(row.office_code || ""),
            agency: String(row.agency || ""),
            cloudSynced: true,
          }
        })
      }
    }
  } catch (err) {
    console.warn("[gis-service] Turso query failed, falling back to KV store:", err)
  }

  // Fallback to KV store
  const kvKey = getTenantKey(tenantId, "gis_captures:records")
  const records = (await getKV<GisPhotoRecord[]>(kvKey)) || []
  return records.map(r => ({
    ...r,
    driveUrl: r.driveUrl || getDriveViewUrl(r.driveFileId || ""),
    dataUrl: r.dataUrl || r.driveUrl || getDriveViewUrl(r.driveFileId || ""),
    cloudSynced: true,
  }))
}

/**
 * Save GIS capture in KV Store table 'GIS_captures' and log Delta Patch.
 * Stores ONLY the driveFileId in the database record.
 */
export async function saveGisCapture(
  tenantId: string,
  photo: GisPhotoRecord
): Promise<GisPhotoRecord> {
  const cleanTenant = (tenantId || "default").trim().toLowerCase()
  const driveFileId = photo.driveFileId || ""

  // 1. Insert into Turso GIS_captures table
  try {
    const client = getTursoClient()
    if (client) {
      await ensureGisCapturesTable()
      await client.execute({
        sql: `
          INSERT INTO GIS_captures (
            id, tenant_id, drive_file_id, timestamp, date_formatted,
            time_formatted, lat, lng, accuracy, location_name,
            note, uploaded_by, uploaded_by_name, user_role, office_code, agency, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            drive_file_id = excluded.drive_file_id,
            timestamp = excluded.timestamp,
            date_formatted = excluded.date_formatted,
            time_formatted = excluded.time_formatted,
            lat = excluded.lat,
            lng = excluded.lng,
            accuracy = excluded.accuracy,
            location_name = excluded.location_name,
            note = excluded.note,
            uploaded_by = excluded.uploaded_by,
            uploaded_by_name = excluded.uploaded_by_name,
            user_role = excluded.user_role,
            office_code = excluded.office_code,
            agency = excluded.agency
        `,
        args: [
          photo.id,
          cleanTenant,
          driveFileId,
          photo.timestamp || Date.now(),
          photo.dateFormatted || "",
          photo.timeFormatted || "",
          photo.lat || 0,
          photo.lng || 0,
          photo.accuracy || null,
          photo.locationName || "",
          photo.note || "",
          photo.uploadedBy || "",
          photo.uploadedByName || "",
          photo.userRole || "",
          photo.officeCode || "",
          photo.agency || "",
          Date.now(),
        ],
      })
    }
  } catch (err) {
    console.warn("[gis-service] Turso save error:", err)
  }

  // 2. Also keep mirror in KV Store for fast key-value lookups
  try {
    const kvKey = getTenantKey(tenantId, "gis_captures:records")
    const existing = (await getKV<GisPhotoRecord[]>(kvKey)) || []
    const updated = [
      {
        ...photo,
        driveFileId,
        // Omit large base64 dataUrls from KV storage to keep database tiny
        dataUrl: undefined as any,
        driveUrl: undefined as any,
      },
      ...existing.filter(p => p.id !== photo.id),
    ].slice(0, 500)
    await setKV(kvKey, updated)
  } catch (kvErr) {
    console.warn("[gis-service] KV store mirror error:", kvErr)
  }

  // 3. Append Delta Patch for incremental client sync
  const recordForPatch = {
    id: photo.id,
    driveFileId,
    timestamp: photo.timestamp || Date.now(),
    dateFormatted: photo.dateFormatted || "",
    timeFormatted: photo.timeFormatted || "",
    lat: photo.lat || 0,
    lng: photo.lng || 0,
    accuracy: photo.accuracy,
    locationName: photo.locationName || "",
    note: photo.note || "",
    uploadedBy: photo.uploadedBy || "",
    uploadedByName: photo.uploadedByName || "",
    userRole: photo.userRole || "",
    officeCode: photo.officeCode || "",
    agency: photo.agency || "",
    cloudSynced: true,
  }

  await appendDeltaPatch(tenantId, GIS_MODULE_KEY, {
    action: "UPDATE",
    recordId: photo.id,
    changes: recordForPatch,
  }).catch(e => console.warn("[gis-service] Delta patch logging error:", e))

  return {
    ...recordForPatch,
    driveUrl: getDriveViewUrl(driveFileId),
    dataUrl: getDriveViewUrl(driveFileId),
  }
}

/**
 * Delete GIS capture from table, KV, Google Drive, and log tombstone patch.
 */
export async function deleteGisCapture(
  tenantId: string,
  photoId: string
): Promise<boolean> {
  const cleanTenant = (tenantId || "default").trim().toLowerCase()
  let driveFileId = ""

  // 1. Find & delete from Turso
  try {
    const client = getTursoClient()
    if (client) {
      await ensureGisCapturesTable()
      const selRes = await client.execute({
        sql: `SELECT drive_file_id FROM GIS_captures WHERE id = ? AND LOWER(tenant_id) = ?`,
        args: [photoId, cleanTenant],
      })
      if (selRes?.rows?.[0]) {
        driveFileId = String(selRes.rows[0].drive_file_id || "")
      }

      await client.execute({
        sql: `DELETE FROM GIS_captures WHERE id = ? AND LOWER(tenant_id) = ?`,
        args: [photoId, cleanTenant],
      })
    }
  } catch (err) {
    console.warn("[gis-service] Turso delete error:", err)
  }

  // 2. Delete from KV Store
  try {
    const kvKey = getTenantKey(tenantId, "gis_captures:records")
    const existing = (await getKV<GisPhotoRecord[]>(kvKey)) || []
    const match = existing.find(p => p.id === photoId)
    if (match?.driveFileId && !driveFileId) {
      driveFileId = match.driveFileId
    }
    const updated = existing.filter(p => p.id !== photoId)
    await setKV(kvKey, updated)
  } catch (kvErr) {
    console.warn("[gis-service] KV delete error:", kvErr)
  }

  // 3. Delete file from Google Drive
  if (driveFileId) {
    try {
      const drive = getDriveClient(false)
      await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true })
    } catch (driveErr) {
      console.warn("[gis-service] Drive file deletion failed:", driveErr)
    }
  }

  // 4. Append DELETE Delta Patch (tombstone)
  await appendDeltaPatch(tenantId, GIS_MODULE_KEY, {
    action: "DELETE",
    recordId: photoId,
  }).catch(e => console.warn("[gis-service] Tombstone patch logging error:", e))

  return true
}
