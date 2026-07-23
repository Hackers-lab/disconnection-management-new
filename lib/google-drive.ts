import { GoogleAuth, OAuth2Client } from "google-auth-library"
import { drive as googleDrive } from "@googleapis/drive"
import { Readable } from "stream"
import { getTenantContext } from "./tenant-context"

// Shared Auth client configuration
const client_email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
const private_key = process.env.GOOGLE_SHEETS_PRIVATE_KEY
const client_id = process.env.GOOGLE_CLIENT_ID
const client_secret = process.env.GOOGLE_CLIENT_SECRET
const refresh_token = process.env.GOOGLE_REFRESH_TOKEN

// Dynamic Auth Delegate class
class DynamicAuth extends GoogleAuth {
  private defaultAuth: any

  constructor() {
    super({
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    })
    this.defaultAuth =
      client_id && client_secret && refresh_token
        ? (() => {
            const oauth2Client = new OAuth2Client(client_id, client_secret)
            oauth2Client.setCredentials({ refresh_token })
            return oauth2Client
          })()
        : new GoogleAuth({
            credentials: {
              client_email,
              private_key: private_key?.replace(/\\n/g, "\n"),
            },
            scopes: [
              "https://www.googleapis.com/auth/drive",
              "https://www.googleapis.com/auth/spreadsheets",
            ],
          })
  }

  private getActiveAuth() {
    const context = getTenantContext()
    if (context?.googleDriveRefreshToken) {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      )
      oauth2Client.setCredentials({ refresh_token: context.googleDriveRefreshToken })
      return oauth2Client
    }
    return this.defaultAuth
  }

  override async getRequestHeaders(url?: string): Promise<any> {
    const active = this.getActiveAuth()
    if (typeof active.getRequestHeaders === "function") {
      try {
        return await active.getRequestHeaders(url)
      } catch (err: any) {
        if (active !== this.defaultAuth && typeof this.defaultAuth.getRequestHeaders === "function") {
          console.warn("[DynamicAuth] Active OAuth getRequestHeaders failed, falling back to defaultAuth:", err?.message || err)
          return await this.defaultAuth.getRequestHeaders(url)
        }
        throw err
      }
    }
    return {}
  }

  override async request(opts: any): Promise<any> {
    const active = this.getActiveAuth()
    if (typeof active.request === "function") {
      try {
        return await active.request(opts)
      } catch (err: any) {
        const statusCode = err?.status || err?.code || err?.response?.status
        const isPermissionOrNotFound = statusCode === 403 || statusCode === 404 || statusCode === 401

        if (active !== this.defaultAuth && isPermissionOrNotFound && typeof this.defaultAuth.request === "function") {
          console.warn(
            `[DynamicAuth] Active OAuth client request returned HTTP ${statusCode}. Falling back to Service Account (defaultAuth)...`,
            opts?.url
          )
          return await this.defaultAuth.request(opts)
        }
        throw err
      }
    }
    throw new Error("Active auth client does not support request method")
  }
}

export const auth = new DynamicAuth()

const drive = googleDrive({ version: "v3", auth })

function detectFolderForModule(consumerId: string, moduleName?: string): string {
  if (moduleName) return moduleName.trim().toLowerCase()

  const id = String(consumerId).toUpperCase()
  if (id.includes("MAT-RECV-") || id.includes("MAT-ISSUE-") || id.includes("MAT-CAT-")) {
    return "material"
  }
  if (id.startsWith("NSC-")) {
    return "nsc"
  }
  if (id.startsWith("DTR-")) {
    return "dtr"
  }
  if (id.startsWith("PAINT-")) {
    return "dtr_painting"
  }
  if (id.startsWith("RECON-")) {
    return "reconnection"
  }
  if (id.startsWith("MTR-") || id.startsWith("METER-") || id.startsWith("REPL-")) {
    return "meter_replacement"
  }
  if (id.startsWith("DD-")) {
    return "deemed"
  }

  // Fallback to disconnection
  return "disconnection"
}

export async function uploadImageToDrive(file: File, consumerId: string, moduleName?: string): Promise<string> {
  try {
    const hasServiceAccount = client_email && private_key
    const hasOAuth = client_id && client_secret && refresh_token
    const context = getTenantContext()

    if (!hasServiceAccount && !hasOAuth && !context?.googleDriveRefreshToken) {
      throw new Error(
        "Missing Google credentials. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local or link a Google account",
      )
    }

    // Convert File to Buffer/Stream
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const stream = Readable.from(buffer)

    const ext = file.name ? (file.name.split(".").pop() || "jpg") : (file.type === "application/pdf" ? "pdf" : "jpg")
    const fileName = `${consumerId}_${Date.now()}.${ext}`
    
    const rootFolderId = context?.driveFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID
    
    if (!rootFolderId) {
      throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set in .env.local and no tenant folder is provisioned")
    }

    // Determine subfolder based on module name
    let targetFolderId = rootFolderId
    const folderName = detectFolderForModule(consumerId, moduleName)
    
    if (folderName) {
      try {
        // Query to check if the module subfolder already exists inside the root folder
        const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed = false`
        const listResponse = await drive.files.list({
          q: query,
          spaces: 'drive',
          fields: 'files(id)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

        const existingFolder = listResponse.data.files?.[0]
        if (existingFolder?.id) {
          targetFolderId = existingFolder.id
        } else {
          // Create the subfolder under the root folder
          const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootFolderId],
          }
          const createResponse = await drive.files.create({
            requestBody: folderMetadata,
            fields: 'id',
            supportsAllDrives: true,
          })
          if (createResponse.data.id) {
            targetFolderId = createResponse.data.id
          }
        }
      } catch (err) {
        console.error(`Failed to locate or create Drive subfolder '${folderName}':`, err)
        // Fallback to uploading to root folder
        targetFolderId = rootFolderId
      }
    }

    const fileMetadata = {
      name: fileName,
      parents: [targetFolderId],
    }

    const media = {
      mimeType: file.type,
      body: stream,
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    })

    const fileId = response.data.id
    if (!fileId) throw new Error("No file ID returned from Drive")

    // Make the file publicly readable so it can be displayed in the app
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    })

    // Return a direct view URL instead of the webViewLink (which is a HTML page)
    return `https://drive.google.com/uc?export=view&id=${fileId}`
  } catch (error) {
    console.error("Drive upload failed:", error)
    throw error
  }
}

export async function renameDriveFile(fileId: string, newName: string): Promise<void> {
  try {
    await drive.files.update({
      fileId: fileId,
      requestBody: {
        name: newName,
      },
    })
  } catch (error) {
    console.error("Failed to rename drive file:", error)
  }
}