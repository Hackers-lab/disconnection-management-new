import { NextRequest, NextResponse } from "next/server"
import { uploadImageToDrive } from "@/lib/google-drive"
import { saveGisCapture } from "@/lib/gis-service"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import type { GisPhotoRecord } from "@/lib/indexed-db"

export const maxDuration = 60
export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const context = getTenantContext()
    const tenantId = context?.cccCode || request.headers.get("x-tenant-id") || "default"

    const formData = await request.formData()
    const file = formData.get("file") as File
    const photoId = (formData.get("id") || formData.get("photoId") || `gis_${Date.now()}`) as string
    const note = ((formData.get("note") as string) || "").trim()
    const lat = parseFloat((formData.get("lat") as string) || "0") || 0
    const lng = parseFloat((formData.get("lng") as string) || "0") || 0
    const accuracy = parseFloat((formData.get("accuracy") as string) || "0") || undefined
    const locationName = ((formData.get("locationName") as string) || "").trim()
    const dateFormatted = ((formData.get("dateFormatted") as string) || "").trim()
    const timeFormatted = ((formData.get("timeFormatted") as string) || "").trim()
    const uploadedBy = ((formData.get("uploadedBy") as string) || "").trim()
    const uploadedByName = ((formData.get("uploadedByName") as string) || "").trim()
    const userRole = ((formData.get("userRole") as string) || "").trim()
    const officeCode = ((formData.get("officeCode") as string) || "").trim()
    const agency = ((formData.get("agency") as string) || "").trim()
    const timestamp = parseInt((formData.get("timestamp") as string) || "0", 10) || Date.now()

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No valid file provided or file is 0 bytes" }, { status: 400 })
    }

    if (!note) {
      return NextResponse.json({ error: "Note / Description is required" }, { status: 400 })
    }

    // 1. Upload to Tenant's Google Drive in 'gis_camera' subfolder
    const driveUrl = await uploadImageToDrive(file, `GIS_${photoId}`, "gis_camera")

    // Extract ONLY the Google Drive File ID
    let driveFileId = ""
    const fileIdMatch = driveUrl.match(/id=([a-zA-Z0-9_-]+)/) || driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (fileIdMatch && fileIdMatch[1]) {
      driveFileId = fileIdMatch[1]
    }

    // 2. Build record with driveFileId only
    const photoRecord: GisPhotoRecord = {
      id: photoId,
      driveFileId,
      driveUrl: undefined, // omitted in KV store to save bytes
      timestamp,
      dateFormatted,
      timeFormatted,
      lat,
      lng,
      accuracy,
      locationName,
      note,
      uploadedBy,
      uploadedByName,
      userRole,
      officeCode,
      agency,
      cloudSynced: true,
    }

    // 3. Save into KV store / Turso table 'GIS_captures' & log Delta Patch
    const savedPhoto = await saveGisCapture(tenantId, photoRecord)

    return NextResponse.json({
      success: true,
      fileId: driveFileId,
      photo: savedPhoto,
      message: "GIS Photo saved to GIS_captures table & Drive successfully"
    })
  } catch (error: any) {
    console.error("GIS Image upload error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to upload GIS photo" },
      { status: 500 }
    )
  }
})
