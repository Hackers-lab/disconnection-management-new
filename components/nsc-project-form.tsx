"use client"

import { useState } from "react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge }    from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"
import type { NSCApplication, NSCProject } from "@/lib/nsc-types"

// ── Client-side image compression (target < maxKB) ───────────────────────────
async function compressImage(file: File, maxKB = 100): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement("canvas")
      let { width, height } = img
      const maxDim = 1200
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
        else                 { width = Math.round(width * maxDim / height); height = maxDim }
      }
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas not supported")); return }
      ctx.drawImage(img, 0, 0, width, height)
      // Try progressively lower quality until binary size < maxKB
      let quality = 0.8
      let dataUrl = canvas.toDataURL("image/jpeg", quality)
      while (quality > 0.1) {
        const base64 = dataUrl.split(",")[1] || ""
        const binaryBytes = Math.ceil(base64.length * 0.75)
        if (binaryBytes <= maxKB * 1024) break
        quality = Math.round((quality - 0.1) * 10) / 10
        dataUrl = canvas.toDataURL("image/jpeg", quality)
      }
      const base64Final = dataUrl.split(",")[1] || ""
      const finalBytes  = Math.ceil(base64Final.length * 0.75)
      if (finalBytes > maxKB * 1024) {
        reject(new Error(`Image too large (${Math.round(finalBytes / 1024)} KB) even at lowest quality`))
      } else {
        resolve(dataUrl)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")) }
    img.src = objectUrl
  })
}

// ── Work type options ──────────────────────────────────────────────────────────
const WORK_TYPES = [
  { value: "pole", label: "Pole" },
  { value: "line", label: "Line" },
  { value: "dtr",  label: "DTR" },
]

// ── Create Project Form (admin/exec only) ─────────────────────────────────────
interface CreateProjectFormProps {
  // Application that triggered the project creation (must be quotation_issued)
  application:  NSCApplication
  // All applications (so admin can pick more to link to the same project)
  allApps:      NSCApplication[]
  agencies:     string[]
  onSuccess:    () => void
  onCancel:     () => void
}

export function CreateProjectForm({ application, allApps, agencies, onSuccess, onCancel }: CreateProjectFormProps) {
  const { toast } = useToast()
  const [projectSuffix, setProjectSuffix] = useState("")
  const [workTypes, setWorkTypes]         = useState<string[]>([])
  const [agency, setAgency]               = useState(application.agency)
  const [linkedApps, setLinkedApps]       = useState<string[]>([application.receiveNo])
  const [saving, setSaving]               = useState(false)

  // Other quotation_issued apps that don't already have a project
  const linkable = allApps.filter(a =>
    a.receiveNo !== application.receiveNo &&
    ["quotation_issued", "project_required"].includes(a.status) &&
    !a.projectId
  )

  const toggleWork = (v: string) =>
    setWorkTypes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  const toggleApp = (rn: string) =>
    setLinkedApps(prev => prev.includes(rn) ? prev.filter(x => x !== rn) : [...prev, rn])

  const handleCreate = async () => {
    const suffix = projectSuffix.trim()
    if (!suffix)            { toast({ title: "Project ID required", variant: "destructive" }); return }
    if (workTypes.length === 0) { toast({ title: "Select at least one work type", variant: "destructive" }); return }
    if (!agency)                { toast({ title: "Agency required", variant: "destructive" }); return }
    const projectId = `NPC/${suffix}`
    setSaving(true)
    try {
      const res = await fetch("/api/nsc/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", projectId, workTypes, agency, linkedApps }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      toast({ title: `Project ${data.projectId} created` })
      onSuccess()
    } catch (e: any) {
      toast({ title: "Failed to create project", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Creating project for</p>
        <p className="font-medium">{application.receiveNo} — {application.applicantName}</p>
        {application.officeRefNo && <p className="text-xs text-muted-foreground">Office Ref: {application.officeRefNo}</p>}
      </div>

      <div className="space-y-1">
        <Label>Project ID <span className="text-red-500">*</span></Label>
        <div className="flex items-center">
          <span className="bg-muted border border-r-0 rounded-l px-3 py-2 text-sm font-mono select-none">NPC/</span>
          <Input
            className="rounded-l-none font-mono"
            placeholder="6612107/04/25/001"
            value={projectSuffix}
            onChange={e => setProjectSuffix(e.target.value)}
          />
        </div>
        {projectSuffix && (
          <p className="text-xs text-muted-foreground font-mono">Full ID: NPC/{projectSuffix.trim()}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Work Required <span className="text-red-500">*</span></Label>
        <div className="flex gap-4">
          {WORK_TYPES.map(wt => (
            <div key={wt.value} className="flex items-center gap-2">
              <Checkbox
                id={`wt-${wt.value}`}
                checked={workTypes.includes(wt.value)}
                onCheckedChange={() => toggleWork(wt.value)}
              />
              <Label htmlFor={`wt-${wt.value}`} className="font-normal">{wt.label}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Assigned Agency <span className="text-red-500">*</span></Label>
        <Input value={agency} onChange={e => setAgency(e.target.value)} placeholder="Agency name" />
      </div>

      {linkable.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm">Link More Applications to Same Project/PO</Label>
          <p className="text-xs text-muted-foreground">Applications awaiting infrastructure can share the same PO number.</p>
          <div className="border rounded-md divide-y max-h-40 overflow-y-auto text-sm">
            {linkable.map(a => (
              <div key={a.receiveNo} className="flex items-center gap-2 px-3 py-1.5">
                <Checkbox
                  id={`link-${a.receiveNo}`}
                  checked={linkedApps.includes(a.receiveNo)}
                  onCheckedChange={() => toggleApp(a.receiveNo)}
                />
                <Label htmlFor={`link-${a.receiveNo}`} className="font-normal flex-1 cursor-pointer">
                  {a.receiveNo}
                  {a.officeRefNo && <span className="text-muted-foreground ml-1">({a.officeRefNo})</span>}
                  {" — "}{a.applicantName}
                </Label>
                <Badge variant="outline" className="text-xs">{a.phase}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleCreate} disabled={saving}>
          {saving ? "Creating…" : "Create Project"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  )
}

// ── PO Entry Form (admin/exec — after project is created) ─────────────────────
interface POFormProps {
  project:   NSCProject
  onSuccess: () => void
  onCancel:  () => void
}

export function ProjectPOForm({ project, onSuccess, onCancel }: POFormProps) {
  const { toast }  = useToast()
  const [po, setPo] = useState(project.poNumber)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (po.length !== 10 || !/^\d+$/.test(po)) {
      toast({ title: "PO number must be exactly 10 digits", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/nsc/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_po", projectId: project.projectId, poNumber: po }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: "PO number saved" })
      onSuccess()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Project</p>
        <p className="font-medium">{project.projectId}</p>
        <p className="text-xs text-muted-foreground">{project.workTypes.split(",").join(" + ")} — {project.agency}</p>
      </div>
      <div className="space-y-1">
        <Label>PO Number (10 digits) <span className="text-red-500">*</span></Label>
        <Input
          value={po}
          onChange={e => setPo(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="Enter 10-digit PO number"
          maxLength={10}
        />
        <p className="text-xs text-muted-foreground">{po.length}/10 digits</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || po.length !== 10}>{saving ? "Saving…" : "Save PO"}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Agency Complete Form ───────────────────────────────────────────────────────
interface AgencyCompleteFormProps {
  project:   NSCProject
  onSuccess: () => void
  onCancel:  () => void
}

export function AgencyCompleteProjectForm({ project, onSuccess, onCancel }: AgencyCompleteFormProps) {
  const { toast }               = useToast()
  const [remarks, setRemarks]   = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)

  const handlePhotoUpload = async (file: File) => {
    setUploading(true)
    try {
      const dataUrl = await compressImage(file, 100)
      setPhotoUrl(dataUrl)
    } catch (e: any) {
      toast({ title: "Photo processing failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const handleComplete = async () => {
    if (!photoUrl) { toast({ title: "Site photo is required", variant: "destructive" }); return }
    setSaving(true)
    try {
      const res = await fetch("/api/nsc/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "agency_complete",
          projectId: project.projectId,
          agencyRemarks: remarks,
          sitePhotoUrl: photoUrl,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: "Project marked complete. Awaiting admin approval." })
      onSuccess()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{project.projectId}</p>
        <p className="text-sm text-muted-foreground">{project.workTypes.split(",").join(" + ")}</p>
        {project.poNumber && <p className="text-xs text-muted-foreground">PO: {project.poNumber}</p>}
      </div>

      <div className="space-y-1">
        <Label>Remarks</Label>
        <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Work completion remarks…" rows={3} />
      </div>

      <div className="space-y-2">
        <Label>Site Photo <span className="text-red-500">*</span></Label>
        <Input
          type="file"
          accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }}
          disabled={uploading}
        />
        {uploading && <p className="text-xs text-muted-foreground">Compressing…</p>}
        {photoUrl && (
          <img src={photoUrl} alt="Site" className="w-full max-h-40 object-cover rounded border" />
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleComplete} disabled={saving || uploading || !photoUrl}>
          {saving ? "Submitting…" : "Mark Complete"}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Admin Approve Form ─────────────────────────────────────────────────────────
interface AdminApproveFormProps {
  project:   NSCProject
  onSuccess: () => void
  onCancel:  () => void
}

export function AdminApproveProjectForm({ project, onSuccess, onCancel }: AdminApproveFormProps) {
  const { toast }               = useToast()
  const [remarks, setRemarks]   = useState("")
  const [saving, setSaving]     = useState(false)

  const handleApprove = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/nsc/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_approve", projectId: project.projectId, adminRemarks: remarks }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: "Project approved. Linked applications are now ready for meter issue." })
      onSuccess()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{project.projectId}</p>
        <p className="text-sm text-muted-foreground">{project.workTypes.split(",").join(" + ")} — {project.agency}</p>
        {project.poNumber && <p className="text-xs">PO: <span className="font-mono">{project.poNumber}</span></p>}
        {project.sitePhotoUrl && (
          <a href={project.sitePhotoUrl} target="_blank" rel="noopener noreferrer">
            <img src={project.sitePhotoUrl} alt="Site photo" className="mt-2 w-full max-h-40 object-cover rounded border" />
          </a>
        )}
        {project.agencyRemarks && <p className="text-xs text-muted-foreground mt-1">Agency: {project.agencyRemarks}</p>}
      </div>

      <div className="space-y-1">
        <Label>Admin Remarks</Label>
        <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks…" rows={2} />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleApprove} disabled={saving}>
          {saving ? "Approving…" : "Approve Project"}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Project Card (read-only summary) ─────────────────────────────────────────
interface ProjectCardProps {
  project:    NSCProject
  userRole:   string
  userAgencies?: string[]
  onAction:   (project: NSCProject, action: "po" | "complete" | "approve") => void
}

export function ProjectCard({ project, userRole, userAgencies = [], onAction }: ProjectCardProps) {
  const isAdmin  = userRole === "admin" || userRole === "executive"
  const isAgency = userRole === "agency" || (userRole !== "admin" && userRole !== "executive" && !!(userAgencies && userAgencies.length > 0))
  const myAgency = isAgency && (userAgencies || []).some(a => a.toUpperCase() === project.agency.toUpperCase())

  const statusLabel: Record<string, string> = {
    ongoing:  "Ongoing",
    done:     "Submitted — Pending Approval",
    approved: "Approved",
  }
  const statusColor: Record<string, string> = {
    ongoing:  "bg-amber-100 text-amber-800",
    done:     "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
  }

  return (
    <Card className="text-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-mono">{project.projectId}</CardTitle>
          <Badge className={statusColor[project.status] || "bg-gray-100 text-gray-800"}>
            {statusLabel[project.status] || project.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {project.workTypes.split(",").map(w => (
            <Badge key={w} variant="outline" className="text-xs">{w.trim().toUpperCase()}</Badge>
          ))}
        </div>
        <p className="text-muted-foreground"><span className="font-medium">Agency:</span> {project.agency}</p>
        {project.poNumber && <p><span className="font-medium">PO:</span> <span className="font-mono">{project.poNumber}</span></p>}
        <p className="text-muted-foreground text-xs">
          Apps: {project.linkedApps.split(",").filter(Boolean).join(", ")}
        </p>
        {project.completedAt && <p className="text-xs text-muted-foreground">Completed: {project.completedAt}</p>}
        {project.approvedAt  && <p className="text-xs text-muted-foreground">Approved: {project.approvedAt}</p>}

        <div className="flex gap-2 pt-1 flex-wrap">
          {isAdmin && project.status === "ongoing" && !project.poNumber && (
            <Button size="sm" variant="outline" onClick={() => onAction(project, "po")}>Enter PO</Button>
          )}
          {isAdmin && project.status === "ongoing" && project.poNumber && (
            <Button size="sm" variant="outline" onClick={() => onAction(project, "po")}>Update PO</Button>
          )}
          {(isAgency && myAgency || isAdmin) && project.status === "ongoing" && project.poNumber && (
            <Button size="sm" onClick={() => onAction(project, "complete")}>Mark Complete</Button>
          )}
          {isAdmin && project.status === "done" && (
            <Button size="sm" onClick={() => onAction(project, "approve")}>Approve</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Legacy Import Panel (admin/exec only) ─────────────────────────────────────
interface LegacyImportPanelProps {
  onSuccess: (count: number) => void
  onCancel:  () => void
}

export function LegacyImportPanel({ onSuccess, onCancel }: LegacyImportPanelProps) {
  const { toast } = useToast()
  const [file, setFile]         = useState<File | null>(null)
  const [parsed, setParsed]     = useState<any[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string, number>>({})
  const [defaultAgency, setDefaultAgency] = useState("")
  const [defaultPhase,  setDefaultPhase]  = useState("1P")
  const [defaultClass,  setDefaultClass]  = useState("domestic")
  const [uploading, setUploading] = useState(false)

  const FIELDS = [
    { key: "officeRefNo",  label: "Office Ref / Serial No", required: true,  hint: "Original manual serial (e.g. SL-001 or 23-24/001)" },
    { key: "applicantName",label: "Applicant Name",         required: true,  hint: "Full name of the applicant" },
    { key: "receivedDate", label: "Date",                   required: true,  hint: "YYYY-MM-DD format — e.g. 2023-04-15" },
    { key: "careOf",       label: "C/O",                   required: false, hint: "Father / husband name" },
    { key: "address",      label: "Address",               required: false, hint: "Full address in a single column" },
    { key: "mobile",       label: "Mobile",                required: false, hint: "10-digit mobile number" },
    { key: "agency",       label: "Agency",                required: false, hint: "Inspection agency name (or set default below)" },
    { key: "appliedClass", label: "Class",                 required: false, hint: "domestic · commercial · stw · industrial" },
    { key: "phase",        label: "Phase",                 required: false, hint: "1P  or  3P" },
    { key: "status",       label: "Status",                required: false, hint: "pending · quotation_issued · meter_issued · meter_returned · connection_effected" },
  ]

  const handleFile = async (f: File) => {
    setFile(f)
    const { default: Papa } = await import("papaparse")
    ;(Papa as any).parse(f, {
      header: false, skipEmptyLines: true,
      complete: (res: any) => {
        const rows = res.data as string[][]
        if (rows.length < 2) return
        const hdrs = rows[0].map(String)
        setHeaders(hdrs)
        setParsed(rows.slice(1))
        // Auto-detect
        const auto: Record<string, number> = {}
        hdrs.forEach((h, i) => {
          const l = h.toLowerCase().replace(/[\s_-]/g, "")
          if (l.includes("serial") || l.includes("refno") || l.includes("slno")) auto.officeRefNo = i
          else if (l.includes("name"))  auto.applicantName = i
          else if (l.includes("date"))  auto.receivedDate  = i
          else if (l.includes("co") || l.includes("careof")) auto.careOf = i
          else if (l.includes("address")) auto.address     = i
          else if (l.includes("mobile")) auto.mobile       = i
          else if (l.includes("agency")) auto.agency       = i
          else if (l.includes("class") || l.includes("category")) auto.appliedClass = i
          else if (l.includes("phase")) auto.phase         = i
          else if (l.includes("status")) auto.status       = i
        })
        setMapping(auto)
      },
    })
  }

  const handleImport = async () => {
    if (!mapping.officeRefNo && mapping.officeRefNo !== 0) {
      toast({ title: "Map 'Office Ref / Serial No' column", variant: "destructive" }); return
    }
    if (!mapping.applicantName && mapping.applicantName !== 0) {
      toast({ title: "Map 'Applicant Name' column", variant: "destructive" }); return
    }
    if (!mapping.receivedDate && mapping.receivedDate !== 0) {
      toast({ title: "Map 'Date' column", variant: "destructive" }); return
    }

    const rows = parsed.map(r => ({
      officeRefNo:   String(r[mapping.officeRefNo]   ?? "").trim(),
      applicantName: String(r[mapping.applicantName] ?? "").trim(),
      receivedDate:  String(r[mapping.receivedDate]  ?? "").trim(),
      careOf:        mapping.careOf       !== undefined ? String(r[mapping.careOf]       ?? "").trim() : "",
      address:       mapping.address      !== undefined ? String(r[mapping.address]      ?? "").trim() : "",
      mobile:        mapping.mobile       !== undefined ? String(r[mapping.mobile]       ?? "").trim() : "",
      agency:        mapping.agency       !== undefined ? String(r[mapping.agency]       ?? "").trim() || defaultAgency : defaultAgency,
      appliedClass:  mapping.appliedClass !== undefined ? String(r[mapping.appliedClass] ?? "").trim() || defaultClass  : defaultClass,
      phase:         mapping.phase        !== undefined ? String(r[mapping.phase]        ?? "").trim() || defaultPhase  : defaultPhase,
      status:        mapping.status       !== undefined ? String(r[mapping.status]       ?? "").trim() || "quotation_issued" : "quotation_issued",
    })).filter(r => r.applicantName && r.officeRefNo)

    setUploading(true)
    try {
      const res = await fetch("/api/nsc/legacy-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: `${data.count} legacy applications imported` })
      onSuccess(data.count)
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Import Legacy NSC Applications</h3>
          <p className="text-sm text-muted-foreground">Original serial numbers → Office Reference Numbers. All imported entries flagged as legacy.</p>
        </div>
        <Button
          size="sm" variant="outline" className="shrink-0"
          onClick={() => {
            const q = (v: string) => /[,"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
            const row = (vals: string[]) => vals.map(q).join(",")
            const headers = ["Office Ref No", "Applicant Name", "Date", "C/O", "Address", "Mobile", "Agency", "Class", "Phase", "Status"]
            const sample  = ["SL-001", "Ram Kumar Singh", "2023-04-15", "Shyam Kumar", "Village Rampur Block ABC Dist XYZ", "9876543210", "AGENCY NAME", "domestic", "1P", "quotation_issued"]
            const csv     = [row(headers), row(sample)].join("\n")
            const blob    = new Blob([csv], { type: "text/csv" })
            const url     = URL.createObjectURL(blob)
            const a       = document.createElement("a")
            a.href        = url
            a.download    = "legacy_nsc_template.csv"
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Download Template
        </Button>
      </div>

      {/* Column guide */}
      <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
        <p className="font-semibold text-sm mb-2">Column Guide</p>
        {FIELDS.map(f => (
          <div key={f.key} className="flex gap-2">
            <span className={`font-medium w-36 shrink-0 ${f.required ? "text-foreground" : "text-muted-foreground"}`}>
              {f.label}{f.required ? " *" : ""}
            </span>
            <span className="text-muted-foreground">{f.hint}</span>
          </div>
        ))}
      </div>

      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary"
        onClick={() => document.getElementById("legacy-file-input")?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <input id="legacy-file-input" type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {file ? <p className="font-medium">{file.name} — {parsed.length} rows</p>
              : <p className="text-muted-foreground">Drop CSV or click to choose</p>}
      </div>

      {headers.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</Label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={mapping[f.key] !== undefined ? String(mapping[f.key]) : "__none"}
                  onChange={e => {
                    const v = e.target.value
                    setMapping(prev => {
                      const next = { ...prev }
                      if (v === "__none") delete next[f.key]
                      else next[f.key] = Number(v)
                      return next
                    })
                  }}
                >
                  <option value="__none">— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground leading-tight">{f.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 border rounded bg-muted/40">
            <div>
              <Label className="text-xs">Default Agency (if not in CSV)</Label>
              <Input value={defaultAgency} onChange={e => setDefaultAgency(e.target.value)} placeholder="Agency name" className="h-8 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Default Phase</Label>
              <select className="w-full border rounded px-2 py-1 text-sm mt-1" value={defaultPhase} onChange={e => setDefaultPhase(e.target.value)}>
                <option value="1P">1P — Single Phase</option>
                <option value="3P">3P — Three Phase</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Default Class</Label>
              <select className="w-full border rounded px-2 py-1 text-sm mt-1" value={defaultClass} onChange={e => setDefaultClass(e.target.value)}>
                <option value="domestic">LT Domestic</option>
                <option value="commercial">LT Commercial</option>
                <option value="stw">STW</option>
                <option value="industrial">LT Industrial</option>
              </select>
            </div>
          </div>

          {parsed.length > 0 && (
            <div className="text-xs border rounded p-2 bg-muted space-y-1">
              <p className="font-medium">Preview (first 3):</p>
              {parsed.slice(0, 3).map((r, i) => (
                <p key={i} className="text-muted-foreground truncate">
                  {mapping.officeRefNo !== undefined && `[${String(r[mapping.officeRefNo]).trim()}] `}
                  {mapping.applicantName !== undefined && String(r[mapping.applicantName]).trim()}
                  {mapping.receivedDate !== undefined && ` — ${String(r[mapping.receivedDate]).trim()}`}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={uploading}>
              {uploading ? "Importing…" : `Import ${parsed.filter(r => r[mapping.applicantName ?? -1]).length} records`}
            </Button>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </>
      )}

      {!file && (
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      )}
    </div>
  )
}
