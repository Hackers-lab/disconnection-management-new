// app/api/upload-image/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { uploadImageToDrive } from "@/lib/google-drive" // Ensure this file exists now
import { withTenant } from "@/lib/tenant-context"

// Allow the function to run longer for slower uploads (Standard is 10s on Hobby, up to 60s on Pro)
export const maxDuration = 60;

export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const consumerId = formData.get("consumerId") as string
    const moduleName = (formData.get("module") || formData.get("moduleName")) as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!consumerId) {
      return NextResponse.json({ error: "No consumerId provided" }, { status: 400 })
    }

    // Upload to Google Drive
    const publicUrl = await uploadImageToDrive(file, consumerId, moduleName)

    return NextResponse.json({
      success: true,
      url: publicUrl,
      message: "Image uploaded successfully to Google Drive",
    })
  } catch (error) {
    console.error("Image upload error:", error)
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
  }
})