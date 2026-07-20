// Provisioning functions — receive pre-configured clients as parameters

/**
 * Creates the "Disconnection_App_Storage" folder on the tenant's Google Drive.
 */
export async function createAppFolder(driveClient: any): Promise<string> {
  const fileMetadata = {
    name: "Disconnection_App_Storage",
    mimeType: "application/vnd.google-apps.folder",
  }
  const folder = await driveClient.files.create({
    requestBody: fileMetadata,
    fields: "id",
  })
  const folderId = folder.data.id
  if (!folderId) {
    throw new Error("Failed to create app storage folder in Google Drive")
  }
  return folderId
}

/**
 * Duplicates the master spreadsheet template and moves it to the tenant's folder.
 */
export async function duplicateSpreadsheetTemplate(
  cccName: string,
  driveClient: any,
  folderId: string
): Promise<string> {
  const templateId = process.env.TEMPLATE_SPREADSHEET_ID || process.env.DISCONNECTION_SHEET
  if (!templateId) {
    console.warn("⚠️ TEMPLATE_SPREADSHEET_ID or DISCONNECTION_SHEET is not defined in environment variables. Skipping sheet auto-provisioning.")
    return ""
  }

  const response = await driveClient.files.copy({
    fileId: templateId,
    requestBody: {
      name: `Disconnection_Management_${cccName}`,
      parents: [folderId],
    },
    fields: "id",
  })

  const newSheetId = response.data.id
  if (!newSheetId) {
    throw new Error("Failed to duplicate spreadsheet template")
  }
  return newSheetId
}
