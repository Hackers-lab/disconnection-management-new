"use client"

import React, { useState, useEffect } from "react"
import {
  InspectionCategory,
  InspectionPriority,
  CreateMiscInspectionInput,
  DynamicCategoryFields,
} from "@/lib/misc-inspection-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Building2,
  User,
  Phone,
  MapPin,
  Tag,
  ClipboardList,
  Check,
  Plus,
  Compass,
  Gauge,
  Zap,
  RadioTower,
  FileText,
  FileCheck2,
  Camera,
} from "lucide-react"

export const CATEGORY_OPTIONS: { id: InspectionCategory; label: string; description: string; icon: any; color: string; bgColor: string }[] = [
  {
    id: "SHIFTING",
    label: "Shifting Application",
    description: "Consumer meter, service line, or pole shifting",
    icon: Compass,
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
  },
  {
    id: "METER_CHECK",
    label: "Meter Reading / Verification",
    description: "Reading discrepancy, burnt meter, seal check",
    icon: Gauge,
    color: "text-purple-600",
    bgColor: "bg-purple-50 border-purple-200",
  },
  {
    id: "NETWORK_LINE",
    label: "Network & Line Inspection",
    description: "Low voltage, conductor sag, pole damage, clearance",
    icon: Zap,
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
  },
  {
    id: "DTR_LOAD",
    label: "DTR Load Inspection",
    description: "Overloaded DTR, phase load balance, oil leakage",
    icon: RadioTower,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
  },
  {
    id: "NSC_DRAWING",
    label: "NSC Drawing Verification",
    description: "New connection site sketch & partition dispute",
    icon: FileCheck2,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 border-indigo-200",
  },
  {
    id: "GENERAL",
    label: "General Office Inspection",
    description: "CT/PT ratio check, safety hazard, custom issue",
    icon: FileText,
    color: "text-slate-600",
    bgColor: "bg-slate-50 border-slate-200",
  },
]

interface MiscInspectionCreateFormProps {
  onSave: (data: any) => void
  onCancel: () => void
  userRole?: string
  userAgencies?: string[]
}

export function MiscInspectionCreateForm({
  onSave,
  onCancel,
  userRole,
  userAgencies = [],
}: MiscInspectionCreateFormProps) {
  const [loading, setLoading] = useState(false)
  const [agencyOptions, setAgencyOptions] = useState<string[]>(userAgencies.length > 0 ? userAgencies : ["Internal Team"])

  // Form Fields
  const [category, setCategory] = useState<InspectionCategory>("SHIFTING")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [referenceDocUrl, setReferenceDocUrl] = useState("")
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [priority, setPriority] = useState<InspectionPriority>("MEDIUM")
  const [agency, setAgency] = useState<string>(userAgencies.length > 0 ? userAgencies[0] : "")
  const [targetCompletionDate, setTargetCompletionDate] = useState("")

  // Consumer & Location Linkages
  const [consumerId, setConsumerId] = useState("")
  const [dtrId, setDtrId] = useState("")
  const [applicantName, setApplicantName] = useState("")
  const [address, setAddress] = useState("")
  const [mobile, setMobile] = useState("")

  // Category Specific Dynamic Fields
  const [proposedShiftAddress, setProposedShiftAddress] = useState("")
  const [shiftingType, setShiftingType] = useState<"METER_SHIFTING" | "LINE_SHIFTING" | "POLE_SHIFTING" | "OTHER">("METER_SHIFTING")
  const [meterSerialNo, setMeterSerialNo] = useState("")
  const [feederName, setFeederName] = useState("")
  const [poleNo, setPoleNo] = useState("")
  const [dtrName, setDtrName] = useState("")
  const [dtrCapacityKva, setDtrCapacityKva] = useState("")
  const [nscApplicationNo, setNscApplicationNo] = useState("")
  const [customCategoryTag, setCustomCategoryTag] = useState("")

  // Image & Document Upload State
  const [initialImageUrl, setInitialImageUrl] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image file size should be less than 8MB")
      return
    }
    setUploadingImage(true)
    const reader = new FileReader()
    reader.onload = () => {
      setInitialImageUrl(reader.result as string)
      if (!referenceDocUrl) setReferenceDocUrl(reader.result as string)
      setUploadingImage(false)
      toast.success("Inspection reference image uploaded!")
    }
    reader.onerror = () => {
      setUploadingImage(false)
      toast.error("Failed to read image file")
    }
    reader.readAsDataURL(file)
  }

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) throw new Error("Failed to upload document")
      const data = await res.json()
      const url = data.url || data.fileUrl
      setReferenceDocUrl(url)
      setInitialImageUrl(url)
      toast.success("Reference document uploaded successfully!")
    } catch (err: any) {
      // Fallback to Data URL for client-side preview
      const reader = new FileReader()
      reader.onload = () => {
        setReferenceDocUrl(reader.result as string)
        setInitialImageUrl(reader.result as string)
        toast.success("Reference document attached!")
      }
      reader.readAsDataURL(file)
    } finally {
      setUploadingDoc(false)
    }
  }

  // Fetch active agencies on mount
  useEffect(() => {
    async function loadAgencies() {
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            const activeNames = data.filter((a: any) => a.isActive !== false).map((a: any) => typeof a === "string" ? a : a.name)
            if (activeNames.length > 0) {
              setAgencyOptions(activeNames)
              setAgency((prev) => prev || activeNames[0])
              return
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch agencies", e)
      }
      if (userAgencies.length > 0) {
        setAgencyOptions(userAgencies)
        setAgency((prev) => prev || userAgencies[0])
      }
    }
    loadAgencies()
  }, [userAgencies])

  useEffect(() => {
    if (userRole?.toLowerCase() === "agency" && userAgencies.length > 0) {
      setAgency(userAgencies[0])
    }
  }, [userRole, userAgencies])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error("Please enter a title for the inspection request")
      return
    }
    const finalAgency = agency || (agencyOptions.length > 0 ? agencyOptions[0] : "Internal Team")

    setLoading(true)
    try {
      const categoryFields: DynamicCategoryFields = {
        proposedShiftAddress,
        shiftingType,
        meterSerialNo,
        feederName,
        poleNo,
        dtrName,
        dtrCapacityKva,
        nscApplicationNo,
        customCategoryTag: category === "GENERAL" ? customCategoryTag : undefined,
      }

      const input: CreateMiscInspectionInput & { initialImageUrl?: string } = {
        referenceNo: referenceNo.trim(),
        referenceDocUrl: referenceDocUrl.trim() || undefined,
        category,
        title: title.trim(),
        description: description.trim(),
        consumerId: consumerId.trim() || undefined,
        dtrId: dtrId.trim() || undefined,
        applicantName: applicantName.trim() || undefined,
        address: address.trim() || undefined,
        mobile: mobile.trim() || undefined,
        priority,
        agency: finalAgency,
        targetCompletionDate: targetCompletionDate || undefined,
        categoryFields,
        initialImageUrl: initialImageUrl || undefined,
      }

      const res = await fetch("/api/misc-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create inspection request")
      }

      const newRecord = await res.json()
      toast.success(`Misc Inspection ${newRecord.id || ""} logged successfully!`)
      onSave(newRecord)
    } catch (err: any) {
      toast.error(err.message || "Failed to save inspection")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-20">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b pb-3 bg-white p-3 rounded-xl shadow-sm border">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-2 font-bold text-xs">
          <ArrowLeft className="h-4 w-4" /> Back to Inspections
        </Button>
        <h2 className="text-base md:text-lg font-extrabold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-blue-600" /> Log New Misc Site Inspection
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Category Selection Grid */}
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-600" /> 1. Select Inspection Category *
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon
                const isSelected = category === cat.id
                return (
                  <div
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/80 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`p-2 rounded-lg ${cat.bgColor}`}>
                        <Icon className={`h-5 w-5 ${cat.color}`} />
                      </div>
                      {isSelected && (
                        <div className="h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5">
                      <h4 className="font-bold text-xs text-slate-900">{cat.label}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{cat.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Request Summary & Description */}
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" /> 2. Issue Summary & Instructions *
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Inspection Title / Short Summary *</Label>
              <Input
                placeholder="e.g., Shifting Feasibility Check at Consumer Premises"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-9 text-xs rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Detailed Issue Description & Office Instructions</Label>
              <Textarea
                placeholder="Provide detailed instructions or background notes for the field inspection team..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs rounded-lg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Category Dynamic Options */}
        <Card className="shadow-sm border-blue-200">
          <CardHeader className="py-3 px-4 bg-blue-50/50 border-b border-blue-100">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-600" /> 3. Category Details ({category})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {category === "SHIFTING" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Shifting Type</Label>
                  <Select value={shiftingType} onValueChange={(v: any) => setShiftingType(v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="METER_SHIFTING">Meter Shifting</SelectItem>
                      <SelectItem value="LINE_SHIFTING">Line Shifting</SelectItem>
                      <SelectItem value="POLE_SHIFTING">Pole Shifting</SelectItem>
                      <SelectItem value="OTHER">Other Shifting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Proposed Shift Location</Label>
                  <Input
                    placeholder="New location address"
                    value={proposedShiftAddress}
                    onChange={(e) => setProposedShiftAddress(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {category === "METER_CHECK" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Meter Serial No</Label>
                  <Input
                    placeholder="e.g. WB123456"
                    value={meterSerialNo}
                    onChange={(e) => setMeterSerialNo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Consumer ID / Account No</Label>
                  <Input
                    placeholder="Consumer ID"
                    value={consumerId}
                    onChange={(e) => setConsumerId(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {category === "NETWORK_LINE" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Feeder / Line Name</Label>
                  <Input
                    placeholder="Feeder Name"
                    value={feederName}
                    onChange={(e) => setFeederName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Pole / Tower No</Label>
                  <Input
                    placeholder="Pole Identification No"
                    value={poleNo}
                    onChange={(e) => setPoleNo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {category === "DTR_LOAD" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">DTR Name / Code</Label>
                  <Input
                    placeholder="DTR Code or Name"
                    value={dtrName}
                    onChange={(e) => setDtrName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">DTR Rating (kVA)</Label>
                  <Input
                    placeholder="e.g., 100 kVA, 250 kVA"
                    value={dtrCapacityKva}
                    onChange={(e) => setDtrCapacityKva(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {category === "NSC_DRAWING" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">NSC Application No</Label>
                <Input
                  placeholder="e.g. NSC/2026/0045"
                  value={nscApplicationNo}
                  onChange={(e) => setNscApplicationNo(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {category === "GENERAL" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Custom Category / Tag</Label>
                <Input
                  placeholder="e.g. Safety Audit, CT Ratio Check, Office Complaint"
                  value={customCategoryTag}
                  onChange={(e) => setCustomCategoryTag(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Consumer & Location Linkage */}
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" /> 4. Consumer & Location Details (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Ref / File No</Label>
                <Input
                  placeholder="File Ref No"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="h-9 text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Applicant / Consumer Name</Label>
                <Input
                  placeholder="Full Name"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  className="h-9 text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Mobile No</Label>
                <Input
                  placeholder="10-digit mobile"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="h-9 text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Site Address / Landmark</Label>
              <Input
                placeholder="Full premises address or location landmark"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-9 text-xs rounded-lg"
              />
            </div>

            {/* Reference Document File / URL */}
            <div className="space-y-1 pt-1 border-t border-slate-100">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-blue-600" /> Reference Document / Office Notice (PDF or Photo)
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="https://... (or upload file)"
                    value={referenceDocUrl}
                    onChange={(e) => setReferenceDocUrl(e.target.value)}
                    className="h-9 text-xs rounded-lg flex-1"
                  />
                  {referenceDocUrl && (
                    <a
                      href={referenceDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-blue-600 hover:underline shrink-0 bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200"
                    >
                      View Document ↗
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex-1 border border-dashed rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 transition text-xs font-medium text-slate-600">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>{uploadingDoc ? "Uploading..." : referenceDocUrl ? "Change Document" : "Upload Reference PDF/Photo"}</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleDocFileUpload} disabled={uploadingDoc} />
                  </label>
                  {referenceDocUrl && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-red-500 hover:text-red-700" onClick={() => setReferenceDocUrl("")}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 4B: Image / Photo Reference Upload */}
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-600" /> 5. Reference Site Photo (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <label className="flex items-center justify-center h-20 w-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-500 bg-slate-50 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                  disabled={uploadingImage}
                />
                {uploadingImage ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : initialImageUrl ? (
                  <img src={initialImageUrl} alt="Preview" className="h-full w-full object-cover rounded-xl" />
                ) : (
                  <div className="text-center p-2">
                    <Camera className="h-5 w-5 mx-auto text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-500 font-semibold">Upload Photo</span>
                  </div>
                )}
              </label>
              <div className="text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-800">Attach site, meter, pole or DTR reference photo</p>
                <p className="text-[11px]">Upload an initial site picture to guide field inspection staff (Max 8MB).</p>
                {initialImageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-500 h-6 px-2 text-[11px]"
                    onClick={() => setInitialImageUrl("")}
                  >
                    Remove Photo
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 5: Agency Assignment & Urgency Priority */}
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" /> 6. Agency Assignment & Priority *
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Assigned Agency *</Label>
                {userRole?.toLowerCase() === "agency" && userAgencies.length > 0 ? (
                  <Input value={agency} disabled className="h-9 text-xs bg-slate-100" />
                ) : (
                  <Select value={agency} onValueChange={setAgency}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select Agency" />
                    </SelectTrigger>
                    <SelectContent>
                      {agencyOptions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Urgency Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as InspectionPriority)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low Priority</SelectItem>
                    <SelectItem value="MEDIUM">Medium Priority</SelectItem>
                    <SelectItem value="HIGH">High Priority</SelectItem>
                    <SelectItem value="CRITICAL">Critical / Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Target Completion Date</Label>
                <Input
                  type="date"
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                  className="h-9 text-xs rounded-lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} className="h-10 px-5 text-xs font-bold">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="h-10 px-6 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & Assign Inspection
          </Button>
        </div>
      </form>
    </div>
  )
}
