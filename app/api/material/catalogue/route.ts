import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { getCatalogue, addMaterial, deleteMaterialFromCatalogue, updateMaterial } from "@/lib/material-service"
import type { MaterialUnit } from "@/lib/material-types"
import { uploadImageToDrive } from "@/lib/google-drive"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["read", "stock", "receive", "issue", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const { searchParams } = new URL(req.url)
    if (searchParams.get("revalidate") === "true") {
      const { invalidateMaterialCache } = await import("@/lib/material-service")
      invalidateMaterialCache()
    }
    const id = getSpreadsheetId()
    const catalogue = await getCatalogue(id)
    return NextResponse.json(catalogue, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e: any) {
    console.error("Material catalogue error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const POST = withTenant(async function POST(req: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("material", ["create", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const formData = await req.formData()
    const materialNo = formData.get("materialNo") as string
    const description = formData.get("description") as string
    const unit = formData.get("unit") as string
    const category = formData.get("category") as string
    const threshold = formData.get("threshold") as string
    const photoFile = formData.get("photo") as File | null

    if (!description?.trim()) {
      return NextResponse.json({ error: "Material description is required" }, { status: 400 })
    }

    let photoUrl = ""
    if (photoFile && photoFile.size > 0) {
      photoUrl = await uploadImageToDrive(photoFile, `MAT-CAT-${Date.now()}`)
    }

    const material = await addMaterial({
      materialNo:  materialNo?.trim() || "",
      description: description.trim(),
      unit:        (unit || "nos") as MaterialUnit,
      category:    category?.trim() || "Other",
      createdBy:   session.agencies?.[0] || session.role || "unknown",
      threshold:   parseFloat(threshold || "0"),
      photoUrl,
    })

    return NextResponse.json(material)
  } catch (e: any) {
    console.error("Add material error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const PUT = withTenant(async function PUT(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["create", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const formData = await req.formData()
    const materialId = formData.get("materialId") as string
    const materialNo = formData.get("materialNo") as string
    const description = formData.get("description") as string
    const unit = formData.get("unit") as string
    const category = formData.get("category") as string
    const threshold = formData.get("threshold") as string
    const photoFile = formData.get("photo") as File | null
    const existingPhotoUrl = formData.get("existingPhotoUrl") as string

    if (!materialId) {
      return NextResponse.json({ error: "Material ID is required" }, { status: 400 })
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "Material description is required" }, { status: 400 })
    }

    let photoUrl = existingPhotoUrl || ""
    if (photoFile && photoFile.size > 0) {
      photoUrl = await uploadImageToDrive(photoFile, `MAT-CAT-${materialId}`)
    }

    const material = await updateMaterial(materialId, {
      materialNo:  materialNo?.trim() || "",
      description: description.trim(),
      unit:        (unit || "nos") as MaterialUnit,
      category:    category?.trim() || "Other",
      threshold:   parseFloat(threshold || "0"),
      photoUrl,
    })

    return NextResponse.json(material)
  } catch (e: any) {
    console.error("Update material error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const DELETE = withTenant(async function DELETE(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["delete", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const { searchParams } = new URL(req.url)
    const materialId = searchParams.get("materialId")

    if (!materialId) {
      return NextResponse.json({ error: "Material ID is required" }, { status: 400 })
    }

    await deleteMaterialFromCatalogue(materialId)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Delete material error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})
