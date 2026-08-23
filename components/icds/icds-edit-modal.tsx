"use client"

import { useState, useEffect } from "react"
import type { IcdsRecord, IcdsEditInput, PropertyStatus, JurisdictionStatus } from "@/lib/icds-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Edit3, Loader2, CheckCircle2 } from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  onSuccess: (updated: IcdsRecord) => void
  agencies?: string[]
}

export function IcdsEditModal({ record, open, onClose, onSuccess, agencies = [] }: Props) {
  const [submitting, setSubmitting] = useState(false)

  const [awcCode, setAwcCode] = useState("")
  const [awcName, setAwcName] = useState("")
  const [blockName, setBlockName] = useState("")
  const [gpName, setGpName] = useState("")
  const [awcAddress, setAwcAddress] = useState("")
  const [propertyStatus, setPropertyStatus] = useState<PropertyStatus>("OWN_BUILDING")
  const [awwName, setAwwName] = useState("")
  const [awwMobile, setAwwMobile] = useState("")
  const [cdpoName, setCdpoName] = useState("")
  const [assignedAgency, setAssignedAgency] = useState("")
  const [jurisdictionStatus, setJurisdictionStatus] = useState<JurisdictionStatus>("UNDER_OFFICE")
  const [jurisdictionOffice, setJurisdictionOffice] = useState("")
  const [agencyList, setAgencyList] = useState<string[]>(agencies)

  useEffect(() => {
    async function loadAgencies() {
      if (agencies.length > 0) {
        setAgencyList(agencies)
        return
      }
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) {
        setAgencyList(cached)
        return
      }
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* ignore */ }
    }
    if (open) loadAgencies()
  }, [open, agencies])

  if (!record) return null

  // Populate fields when modal is opened
  const handleOpen = () => {
    setAwcCode(record.awcCode)
    setAwcName(record.awcName)
    setBlockName(record.blockName)
    setGpName(record.gpName)
    setAwcAddress(record.awcAddress || "")
    setPropertyStatus((record.propertyStatus as PropertyStatus) || "OWN_BUILDING")
    setAwwName(record.awwName || "")
    setAwwMobile(record.awwMobile || "")
    setCdpoName(record.cdpoName || "")
    setAssignedAgency(record.assignedAgency || "")
    setJurisdictionStatus(record.jurisdictionStatus || "UNDER_OFFICE")
    setJurisdictionOffice(record.jurisdictionOffice || "")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!awcCode.trim() || !awcName.trim() || !blockName.trim() || !gpName.trim()) {
      toast.error("Please fill in Code, Name, Block, and Gram Panchayat")
      return
    }

    setSubmitting(true)
    try {
      const payload: IcdsEditInput = {
        awcCode: awcCode.trim(),
        awcName: awcName.trim(),
        blockName: blockName.trim(),
        gpName: gpName.trim(),
        awcAddress: awcAddress.trim(),
        propertyStatus,
        awwName: awwName.trim(),
        awwMobile: awwMobile.trim(),
        cdpoName: cdpoName.trim() || undefined,
        assignedAgency: (assignedAgency && assignedAgency !== "UNASSIGNED") ? assignedAgency.trim() : undefined,
        jurisdictionStatus,
        jurisdictionOffice: jurisdictionStatus === "OTHER_OFFICE" ? jurisdictionOffice.trim() || undefined : undefined,
      }

      const res = await fetch(`/api/icds/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update record")

      toast.success("Center details updated successfully!")
      onSuccess(data)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Update failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-blue-600" />
            Edit Anganwadi Center Master Data
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Correct Gram Panchayat, Anganwadi worker name, phone number, or assign agency contractor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* AWC Code (11 Digit) */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">11-Digit AWC Code *</Label>
              <Input
                value={awcCode}
                onChange={(e) => setAwcCode(e.target.value)}
                placeholder="19323010101"
                maxLength={15}
                required
                className="h-8 text-xs font-mono rounded-lg"
              />
            </div>

            {/* AWC Center Name */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">AWC Center Name *</Label>
              <Input
                value={awcName}
                onChange={(e) => setAwcName(e.target.value)}
                placeholder="e.g. Paschim Joynagar AWC No 4"
                required
                className="h-8 text-xs rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Block Name */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Block Name *</Label>
              <Input
                value={blockName}
                onChange={(e) => setBlockName(e.target.value)}
                placeholder="e.g. Joynagar-I"
                required
                className="h-8 text-xs rounded-lg"
              />
            </div>

            {/* Gram Panchayat (GP) */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Gram Panchayat (GP) *</Label>
              <Input
                value={gpName}
                onChange={(e) => setGpName(e.target.value)}
                placeholder="e.g. Baharu GP"
                required
                className="h-8 text-xs rounded-lg"
              />
            </div>
          </div>

          {/* Jurisdiction Status */}
          <div className="border border-blue-100 rounded-xl p-3.5 space-y-2 bg-blue-50/40">
            <Label className="font-bold text-xs text-blue-950">Office Jurisdiction</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select value={jurisdictionStatus} onValueChange={(v: JurisdictionStatus) => setJurisdictionStatus(v)}>
                <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="UNDER_OFFICE">Under This Office (Our CCC Jurisdiction)</SelectItem>
                  <SelectItem value="OTHER_OFFICE">Falls Under Another CCC / Office</SelectItem>
                </SelectContent>
              </Select>

              {jurisdictionStatus === "OTHER_OFFICE" && (
                <Input
                  value={jurisdictionOffice}
                  onChange={(e) => setJurisdictionOffice(e.target.value)}
                  placeholder="Specify Other CCC Name *"
                  className="h-8 text-xs bg-white rounded-lg"
                  required
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Property Status */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Property / Building Status</Label>
              <Select value={propertyStatus} onValueChange={(v: PropertyStatus) => setPropertyStatus(v)}>
                <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="OWN_BUILDING">Own Building (Dedicated ICDS)</SelectItem>
                  <SelectItem value="SCHOOL">School Premises</SelectItem>
                  <SelectItem value="RENTED">Rented House</SelectItem>
                  <SelectItem value="PRIVATE">Private House</SelectItem>
                  <SelectItem value="COMMUNITY_HALL">Community Hall</SelectItem>
                  <SelectItem value="OTHER">Other Premises</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assigned Agency */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Assigned Contractor / Agency</Label>
              <Select value={assignedAgency || "UNASSIGNED"} onValueChange={(v) => setAssignedAgency(v === "UNASSIGNED" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-slate-200">
                  <SelectValue placeholder="Select Agency..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-56">
                  <SelectItem value="UNASSIGNED">-- Unassigned --</SelectItem>
                  {agencyList.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Full Address */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">Address / Locality / Landmark</Label>
            <Input
              value={awcAddress}
              onChange={(e) => setAwcAddress(e.target.value)}
              placeholder="Village, PO, Landmark"
              className="h-8 text-xs rounded-lg"
            />
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Anganwadi Worker (AWW)</Label>
              <Input
                value={awwName}
                onChange={(e) => setAwwName(e.target.value)}
                placeholder="Worker Name"
                className="h-8 text-xs rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">AWW Mobile Number</Label>
              <Input
                value={awwMobile}
                onChange={(e) => setAwwMobile(e.target.value)}
                placeholder="10-digit mobile"
                maxLength={10}
                className="h-8 text-xs font-mono rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">CDPO Name</Label>
              <Input
                value={cdpoName}
                onChange={(e) => setCdpoName(e.target.value)}
                placeholder="CDPO Name"
                className="h-8 text-xs rounded-lg"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
