import { drive as googleDrive, type drive_v3 } from "@googleapis/drive"
import { OAuth2Client } from "google-auth-library"
import { getTenantRegistry, type TenantConfig } from "./tenant-resolver"
import { db } from "./db"

export interface BackupResult {
  cccCode: string
  cccName: string
  status: "success" | "skipped" | "failed"
  backupFileId?: string
  backupFileName?: string
  previousBackupFileId?: string
  error?: string
}

/**
 * Creates an OAuth2 client specifically for a given tenant using decrypted refresh token.
 */
function getTenantOAuthClient(refreshToken: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const oauth2Client = new OAuth2Client(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

/**
 * Performs a rolling 1-day backup for a single CCC tenant:
 * 1. Copies the live spreadsheet to the CCC's Google Drive folder as:
 *    `Backup - [CCC_NAME] (DO NOT EDIT)`
 * 2. Finds any previous backup file matching `Backup - [CCC_NAME]` and moves it to trash.
 * 3. Returns the status and new backup file details.
 */
export async function backupTenantSpreadsheet(tenant: TenantConfig): Promise<BackupResult> {
  const { cccCode, cccName, spreadsheetId, driveFolderId, googleDriveRefreshToken } = tenant

  if (!spreadsheetId) {
    return { cccCode, cccName, status: "skipped", error: "No spreadsheet ID configured" }
  }

  if (!googleDriveRefreshToken) {
    return { cccCode, cccName, status: "skipped", error: "No Google Drive refresh token linked" }
  }

  try {
    const authClient = getTenantOAuthClient(googleDriveRefreshToken)
    const drive = googleDrive({ version: "v3", auth: authClient as any })

    const backupFileName = `Backup - ${cccName || cccCode} (DO NOT EDIT)`

    // 1. Search for existing backups in the target folder or Drive root
    let previousBackupFileId: string | undefined = undefined
    try {
      const searchParents = driveFolderId ? `'${driveFolderId}' in parents and ` : ""
      const q = `${searchParents}name contains 'Backup - ${cccName || cccCode}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
      const listRes = await drive.files.list({
        q,
        fields: "files(id, name, createdTime)",
        spaces: "drive",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

      const files = listRes.data.files || []
      if (files.length > 0) {
        // Pick the oldest or any previous backup file to delete/trash after creating the new one
        previousBackupFileId = files[0].id || undefined
      }
    } catch (searchErr: any) {
      console.warn(`[BackupService] Search for previous backup failed for ${cccCode}:`, searchErr?.message || searchErr)
    }

    // 2. Copy the active spreadsheet to Drive
    const copyMetadata: drive_v3.Params$Resource$Files$Copy["requestBody"] = {
      name: backupFileName,
      description: `Automated daily backup created on ${new Date().toISOString()}. Only the last backup is preserved.`,
      ...(driveFolderId ? { parents: [driveFolderId] } : {}),
    }

    const copyRes = await drive.files.copy({
      fileId: spreadsheetId,
      requestBody: copyMetadata,
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    })

    const newBackupFileId = copyRes.data.id || undefined
    if (!newBackupFileId) {
      throw new Error("Drive copy succeeded but returned no file ID")
    }

    // 3. Delete / trash the previous backup file so only the last backup is preserved
    if (previousBackupFileId && previousBackupFileId !== newBackupFileId) {
      try {
        await drive.files.update({
          fileId: previousBackupFileId,
          requestBody: { trashed: true },
          supportsAllDrives: true,
        })
        console.log(`[BackupService] Trashed previous backup ${previousBackupFileId} for CCC ${cccCode}`)
      } catch (trashErr: any) {
        console.warn(`[BackupService] Failed to trash old backup ${previousBackupFileId}:`, trashErr?.message || trashErr)
      }
    }

    return {
      cccCode,
      cccName,
      status: "success",
      backupFileId: newBackupFileId,
      backupFileName,
      previousBackupFileId,
    }
  } catch (err: any) {
    console.error(`[BackupService] Backup failed for CCC ${cccCode}:`, err?.message || err)
    return {
      cccCode,
      cccName,
      status: "failed",
      error: err?.message || String(err),
    }
  }
}

/**
 * Runs the daily backup routine across all registered CCCs.
 */
export async function backupAllTenants(): Promise<BackupResult[]> {
  const tenants = await getTenantRegistry(true)
  const tenantList = Object.values(tenants)
  const results: BackupResult[] = []

  for (const tenant of tenantList) {
    if (!tenant.spreadsheetId || !tenant.googleDriveRefreshToken) {
      continue
    }
    const res = await backupTenantSpreadsheet(tenant)
    results.push(res)
  }

  return results
}
