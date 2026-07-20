"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Search, Upload, Loader2, MapPin, Phone, Monitor, Building2 } from "lucide-react"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import type { ConsumerMasterRow } from "@/components/consumer-master"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface Props {
  agencies: string[]
  onSave: (requestId: string) => void
  onCancel: () => void
}

export function ReconnectionCreateForm({ agencies, onSave, onCancel }: Props) {
  const [consumerId, setConsumerId] = useState("")
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<ConsumerData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [agencyList, setAgencyList] = useState<string[]>(agencies)
  const fileRef = useRef<HTMLInputElement>(null)
  const [lookupStatus, setLookupStatus] = useState("")

  // Load full agency list — session.agencies is empty for admin/executive
  useEffect(() => {
    async function loadAgencies() {
      // Try IndexedDB cache first (already populated by consumer-list)
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) { setAgencyList(cached); return }
      // Fallback: fetch from API
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* keep whatever was passed in */ }
    }
    loadAgencies()
  }, [])

  // Form state
  const [mobile, setMobile] = useState("")
  const [agency, setAgency] = useState("")
  const [manualName, setManualName] = useState("")
  const [manualAddress, setManualAddress] = useState("")
  const [manualDevice, setManualDevice] = useState("")
  const [requestImageUrl, setRequestImageUrl] = useState("")
  const [remarks, setRemarks] = useState("")

  // ── Lookup consumer from IndexedDB cache ─────────────────────────────────
  const handleLookup = async () => {
    const id = consumerId.trim()
    if (id.length !== 9) { alert("Consumer ID must be 9 digits."); return }
    setLooking(true)
    setFound(null)
    setNotFound(false)
    setLookupStatus("Searching active disconnection list...")
    try {
      // 1. Try active disconnection list cache first
      const cache = await getFromCache<ConsumerData[]>("consumers_data_cache")
      const match = cache?.find(c => c.consumerId === id) || null
      if (match) {
        setFound(match)
        setMobile(match.mobileNumber || "")
        setAgency(match.agency || "")
      } else {
        // 2. Fall back to consumer master cache
        setLookupStatus("Searching master database cache...")
        let masterCache = await getFromCache<ConsumerMasterRow[]>("consumer_master_cache")
        let masterMatch = masterCache?.find(c => c.consumerId === id) || null

        // 3. If not found in local cache, perform a live force-refresh from the server
        if (!masterMatch) {
          setLookupStatus("Fetching consumer master data...")
          try {
            const res = await fetch("/api/consumer-master?refresh=true")
            if (res.ok) {
              const fresh: ConsumerMasterRow[] = await res.json()
              setLookupStatus("Saving fetched data...")
              // Subtle delay so the user can read the friendly message
              await new Promise(resolve => setTimeout(resolve, 800))
              await saveToCache("consumer_master_cache", fresh)
              masterCache = fresh
              setLookupStatus("Searching updated master database...")
              masterMatch = fresh.find(c => c.consumerId === id) || null
            }
          } catch (e) {
            console.error("Failed to fetch fresh master data:", e)
          }
        }

        if (masterMatch) {
          // 4. Look up mapped agency from zone map cache
          setLookupStatus("Fetching agency mapping...")
          let mappedAgency = ""
          try {
            let zoneMap = await getFromCache<{ zone: string; agency: string }[]>("zone_map_cache")
            if (!zoneMap || zoneMap.length === 0) {
              const res = await fetch("/api/zone-map")
              if (res.ok) {
                const fresh = await res.json()
                await saveToCache("zone_map_cache", fresh)
                zoneMap = fresh
              }
            }
            if (zoneMap && masterMatch.zone) {
              setLookupStatus("Mapping agency from zone...")
              const normalizedZone = masterMatch.zone.trim().toUpperCase()
              const zoneMatch = zoneMap.find(z => z.zone.trim().toUpperCase() === normalizedZone)
              if (zoneMatch) {
                mappedAgency = zoneMatch.agency
              }
              // Subtle delay so the user can see the agency mapping complete
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } catch (e) {
            console.error("Failed to map agency from zone:", e)
          }

          const mapped: ConsumerData = {
            offCode: "",
            mru: "",
            consumerId: masterMatch.consumerId,
            name: masterMatch.name,
            address: masterMatch.address,
            baseClass: masterMatch.baseClass || "",
            class: "",
            natureOfConn: "",
            govNonGov: "",
            device: masterMatch.meterNo || "",
            osDuedateRange: "",
            d2NetOS: "",
            disconStatus: "", // Empty string represents that this is from master list (not in active DC list)
            disconDate: "",
            gisPole: "",
            mobileNumber: masterMatch.mobile || "",
            latitude: masterMatch.latitude || "",
            longitude: masterMatch.longitude || "",
            agency: mappedAgency,
          }
          setFound(mapped)
          setMobile(mapped.mobileNumber || "")
          setAgency(mappedAgency)
        } else {
          setNotFound(true)
        }
      }
    } finally {
      setLooking(false)
      setLookupStatus("")
    }
  }

  const handleImageUpload = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const dateStr = new Date().toLocaleString("en-IN", { 
        day: "2-digit", 
        month: "2-digit", 
        year: "numeric", 
        hour: "2-digit", 
        minute: "2-digit", 
        hour12: true 
      })
      const processed = await compressAndWatermarkImage(file, {
        maxDim: 800,
        watermarkLines: [`Reconnection Manual — ${consumerId || "manual"}`, `Date: ${dateStr}`],
        targetKb: 95
      })
      const fd = new FormData()
      fd.append("file", processed)
      fd.append("consumerId", consumerId || "manual")
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setRequestImageUrl(data.url)
    } catch { alert("Image upload failed.") }
    finally { setUploading(false) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!agency) { alert("Please select an agency."); return }
    if (!mobile.trim()) { alert("Mobile number is required."); return }

    setSubmitting(true)
    try {
      const payload = found
        ? {
            consumerId: found.consumerId,
            name: found.name,
            address: found.address,
            mobile: mobile.trim(),
            agency,
            device: found.device,
            source: "dc_list",
            remarks,
          }
        : {
            consumerId: consumerId.trim(),
            name: manualName.trim(),
            address: manualAddress.trim(),
            mobile: mobile.trim(),
            agency,
            device: manualDevice.trim(),
            source: "manual",
            requestImageUrl,
            remarks,
          }

      const res = await fetch("/api/reconnection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      window.dispatchEvent(new Event("notif-refresh"))
      onSave(data.requestId)
    } catch (e: any) {
      alert(e.message || "Failed to create request")
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = consumerId.trim().length === 9 && (found || notFound)

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">New Reconnection Request</h1>
      </div>

      {/* Consumer ID lookup */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label>Consumer ID (9 digits)</Label>
          <div className="flex gap-2">
            <Input
              value={consumerId}
              onChange={e => {
                setConsumerId(e.target.value.replace(/\D/g, "").slice(0, 9))
                setFound(null)
                setNotFound(false)
              }}
              placeholder="Enter 9-digit Consumer ID"
              maxLength={9}
              className="font-mono tracking-wider"
            />
            <Button onClick={handleLookup} disabled={looking || consumerId.length !== 9} variant="outline">
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {looking && lookupStatus && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 shadow-sm transition-all duration-300 mt-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100/80 text-blue-600 shrink-0">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="flex-1 space-y-0.5 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">System Lookup</p>
                <p className="text-sm text-blue-700 font-medium leading-none animate-pulse">{lookupStatus}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Found in DC list */}
      {found && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base text-green-800">
              {found.disconStatus ? "Consumer found in DC list" : "Consumer found in master database"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <p className="font-semibold text-gray-900">{found.name}</p>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
              <span>{found.address}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Monitor className="h-4 w-4 text-gray-400" />
              <span>Device: {found.device || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span>Agency: {found.agency || "—"}</span>
            </div>

            <div className="pt-2 space-y-2">
              <Label>Mobile Number (update if changed)</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign Agency</Label>
              <Select value={agency} onValueChange={setAgency}>
                <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
                <SelectContent>
                  {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not in DC list — manual entry */}
      {notFound && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base text-orange-800">Not in DC list — enter details manually</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              <Label>Consumer Name *</Label>
              <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Address *</Label>
              <Textarea value={manualAddress} onChange={e => setManualAddress(e.target.value)} placeholder="Full address" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Mobile Number *</Label>
              <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number" />
            </div>
            <div className="space-y-2">
              <Label>Device / Meter</Label>
              <Input value={manualDevice} onChange={e => setManualDevice(e.target.value)} placeholder="Meter / device number" />
            </div>
            <div className="space-y-2">
              <Label>Assign Agency *</Label>
              <Select value={agency} onValueChange={setAgency}>
                <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
                <SelectContent>
                  {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Request image — consumer details evidence */}
            <div className="space-y-2">
              <Label>Upload Consumer Details Image (for agency reference)</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              <Button type="button" variant="outline" className="w-full"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading..." : "Upload Image"}
              </Button>
              {previewUrl && (
                <img src={previewUrl} alt="Preview" className="w-full h-40 object-cover rounded-lg border" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      {canSubmit && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
          <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white"
            onClick={handleSubmit} disabled={submitting || uploading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Creating..." : "Create Reconnection Request"}
          </Button>
        </div>
      )}
    </div>
  )
}
