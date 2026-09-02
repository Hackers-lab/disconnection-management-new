"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, PowerOff, AlertTriangle, CheckCircle2, IndianRupee, Search } from "lucide-react"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import type { PermanentDisconnection } from "@/lib/permanent-disconnection-types"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newRecord?: any) => void
  agencies?: string[]
  existingRecords?: PermanentDisconnection[]
}

interface OSDResult {
  consumerId: string
  name?: string
  address?: string
  osdAmount: number
  lpscAmount: number
  totalDues: number
  billDetails?: any[]
  docType?: string
}

export function PDProposeDialog({ isOpen, onClose, onSuccess, agencies = [], existingRecords = [] }: Props) {
  const { toast } = useToast()
  const [consumerId, setConsumerId] = useState("")
  const [consumerName, setConsumerName] = useState("")
  const [address, setAddress] = useState("")
  const [meterNumber, setMeterNumber] = useState("")
  const [mobile, setMobile] = useState("")
  const [agency, setAgency] = useState("")
  const [liveOsdAmount, setLiveOsdAmount] = useState<number>(0)
  const [osdData, setOsdData] = useState<OSDResult | null>(null)
  const [osdFetchStatus, setOsdFetchStatus] = useState<"idle" | "checking" | "live_verified" | "offline_cached" | "unverified">("idle")
  const [checkingOsd, setCheckingOsd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [duplicateRecord, setDuplicateRecord] = useState<PermanentDisconnection | null>(null)
  const [masterMap, setMasterMap] = useState<Record<string, any>>({})
  const [zoneMap, setZoneMap] = useState<{ zone: string; agency: string }[]>([])
  const [agenciesList, setAgenciesList] = useState<string[]>(agencies)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load consumer master cache, zone mapping, and dynamic agency list
  useEffect(() => {
    async function loadMasterAndZoneMap() {
      try {
        const [cachedMaster, cachedConsumers, cachedZoneMap, cachedAgencies] = await Promise.all([
          getFromCache<any[]>("consumer_master_cache"),
          getFromCache<any[]>("consumers_data_cache"),
          getFromCache<{ zone: string; agency: string }[]>("zone_map_cache"),
          getFromCache<string[]>("agencies_data_cache")
        ])

        // 1. Populate Agencies List
        const allAgencies = new Set<string>(agencies.filter(Boolean))
        if (cachedAgencies && Array.isArray(cachedAgencies)) {
          cachedAgencies.forEach(a => { if (a && typeof a === "string") allAgencies.add(a.trim()) })
        }
        if (cachedZoneMap && Array.isArray(cachedZoneMap)) {
          cachedZoneMap.forEach(z => { if (z.agency) allAgencies.add(z.agency.trim()) })
        }
        if (cachedConsumers && Array.isArray(cachedConsumers)) {
          cachedConsumers.forEach(c => { if (c.agency) allAgencies.add(c.agency.trim()) })
        }

        if (allAgencies.size === 0) {
          try {
            const res = await fetch("/api/admin/agencies")
            if (res.ok) {
              const data = await res.json()
              if (Array.isArray(data)) {
                data.filter((a: any) => a.isActive !== false).forEach((a: any) => {
                  if (a.name) allAgencies.add(a.name.trim())
                })
              }
            }
          } catch { /* ignore */ }
        }

        const sortedAgencies = Array.from(allAgencies).filter(Boolean).sort()
        if (sortedAgencies.length > 0) {
          setAgenciesList(sortedAgencies)
        }

        const map: Record<string, any> = {}
        if (cachedMaster && Array.isArray(cachedMaster)) {
          cachedMaster.forEach(c => {
            if (c.consumerId) map[String(c.consumerId).trim()] = c
          })
        }
        if (cachedConsumers && Array.isArray(cachedConsumers)) {
          cachedConsumers.forEach(c => {
            const cid = String(c.consumerId || "").trim()
            if (cid && !map[cid]) {
              map[cid] = {
                consumerId: cid,
                name: c.consumerName || c.name || "",
                address: c.address || "",
                meterNo: c.meterNo || c.meterNumber || c.deviceNo || c.serialNo || "",
                mobile: c.mobile || c.mobileNumber || "",
                zone: c.mru || c.zone || "",
                mru: c.mru || "",
                agency: c.agency || "",
                d2NetOS: parseFloat(c.d2NetOS || c.netOS || "0") || 0
              }
            }
          })
        }
        setMasterMap(map)

        if (cachedZoneMap && Array.isArray(cachedZoneMap) && cachedZoneMap.length > 0) {
          setZoneMap(cachedZoneMap)
        } else {
          const res = await fetch("/api/zone-map")
          if (res.ok) {
            const fresh = await res.json()
            if (Array.isArray(fresh)) {
              setZoneMap(fresh)
              await saveToCache("zone_map_cache", fresh)
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load consumer master or zone map cache", e)
      }
    }
    if (isOpen) {
      loadMasterAndZoneMap()
    }
  }, [isOpen, agencies])

  // When 9-digit consumer ID is entered, autofill, map agency by zone, and trigger Live OSD fetch
  const handleConsumerIdChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 9)
    setConsumerId(clean)

    if (clean.length === 9) {
      // 1. Duplicate check against existing active records
      const dup = existingRecords.find(r => r.consumerId === clean && r.status !== "closed")
      if (dup) {
        setDuplicateRecord(dup)
        toast({
          title: "Consumer Already in PD List",
          description: `Consumer #${clean} is already active under record ${dup.pdId} (${dup.status.toUpperCase()}).`,
          variant: "destructive"
        })
      } else {
        setDuplicateRecord(null)
      }

      // 2. Check local master / consumer list
      const match = masterMap[clean]
      if (match) {
        if (!consumerName) setConsumerName(match.name || match.consumerName || "")
        if (!address) setAddress(match.address || "")
        if (!meterNumber) setMeterNumber(match.meterNo || match.meterNumber || match.deviceNo || match.serialNo || "")
        if (!mobile) setMobile(match.mobile || match.mobileNumber || "")

        // Auto assign agency as per Zone / MRU
        const zoneOrMru = (match.zone || match.mru || "").trim().toUpperCase()
        if (zoneOrMru && zoneMap.length > 0) {
          const zMatch = zoneMap.find(z => (z.zone || "").trim().toUpperCase() === zoneOrMru)
          if (zMatch && zMatch.agency) {
            setAgency(zMatch.agency)
          }
        } else if (match.agency) {
          setAgency(match.agency)
        }
      }
      // 3. Trigger Live OSD if not duplicate
      if (!dup) {
        fetchLiveOSD(clean, match)
      }
    } else {
      setOsdData(null)
      setLiveOsdAmount(0)
      setOsdFetchStatus("idle")
      setDuplicateRecord(null)
    }
  }

  const fetchLiveOSD = async (cid: string, fallbackMatch?: any) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setCheckingOsd(true)
    setOsdFetchStatus("checking")

    try {
      const res = await fetch(`/api/osd-details?consumerId=${cid}`, {
        signal: controller.signal
      })
      const json = await res.json().catch(() => ({}))

      if (json.success && json.data) {
        const total = json.data.totalDues ?? json.data.osd ?? 0
        const parsedOsd: OSDResult = {
          consumerId: cid,
          name: json.data.name,
          address: json.data.address,
          osdAmount: json.data.osd || 0,
          lpscAmount: json.data.lpsc || 0,
          totalDues: total,
          billDetails: json.data.billDetails,
          docType: json.data.docType
        }
        setOsdData(parsedOsd)
        setLiveOsdAmount(total)
        setOsdFetchStatus("live_verified")

        // If name/address are empty or generic, use portal data
        if (json.data.name && json.data.name !== "N/A" && !consumerName) {
          setConsumerName(json.data.name)
        }
        if (json.data.address && json.data.address !== "N/A" && !address) {
          setAddress(json.data.address)
        }

        if (total > 0) {
          toast({
            title: `Live OSD: ₹${total.toLocaleString("en-IN")}`,
            description: `Live portal verified unpaid dues (${json.data.docType || "Outstanding"})`,
            variant: "destructive"
          })
        }
      } else {
        // Portal offline or error fallback to local master
        const localDues = fallbackMatch ? (parseFloat(fallbackMatch.d2NetOS || fallbackMatch.netOS || "0") || 0) : 0
        if (localDues > 0) {
          setLiveOsdAmount(localDues)
          setOsdData({
            consumerId: cid,
            name: consumerName || fallbackMatch.name || "",
            address: address || fallbackMatch.address || "",
            osdAmount: localDues,
            lpscAmount: 0,
            totalDues: localDues,
            docType: "OFFLINE CACHED DUES"
          })
          setOsdFetchStatus("offline_cached")
        } else {
          setOsdData(null)
          setLiveOsdAmount(0)
          setOsdFetchStatus("unverified")
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.warn("Live OSD fetch error:", e)
        const localDues = fallbackMatch ? (parseFloat(fallbackMatch.d2NetOS || fallbackMatch.netOS || "0") || 0) : 0
        if (localDues > 0) {
          setLiveOsdAmount(localDues)
          setOsdData({
            consumerId: cid,
            name: consumerName || fallbackMatch.name || "",
            address: address || fallbackMatch.address || "",
            osdAmount: localDues,
            lpscAmount: 0,
            totalDues: localDues,
            docType: "OFFLINE CACHED DUES"
          })
          setOsdFetchStatus("offline_cached")
        } else {
          setOsdData(null)
          setLiveOsdAmount(0)
          setOsdFetchStatus("unverified")
        }
      }
    } finally {
      setCheckingOsd(false)
    }
  }

  const handlePropose = async () => {
    if (!consumerId || consumerId.length !== 9) {
      toast({ title: "Please enter a valid 9-digit Consumer ID", variant: "destructive" })
      return
    }
    if (!consumerName.trim()) {
      toast({ title: "Please enter Consumer Name", variant: "destructive" })
      return
    }
    if (!address.trim()) {
      toast({ title: "Please enter Consumer Address", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/permanent-disconnection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId,
          consumerName: consumerName.trim(),
          address: address.trim(),
          meterNumber: meterNumber.trim(),
          mobile: mobile.trim(),
          agency: agency.trim(),
          liveOsdAmount: liveOsdAmount || 0
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to propose permanent disconnection")
      }

      const data = await res.json()
      toast({
        title: "Permanent Disconnection Proposed",
        description: `Reference ID: ${data.pdId || "Created successfully"}. Record placed in Proposed stage.`
      })

      const newRec: PermanentDisconnection = data.record || {
        pdId: data.pdId,
        consumerId,
        consumerName: consumerName.trim(),
        address: address.trim(),
        meterNumber: meterNumber.trim(),
        mobile: mobile.trim(),
        agency: agency.trim(),
        liveOsdAmount: liveOsdAmount || 0,
        status: "proposed",
        proposedDate: new Date().toISOString().split("T")[0],
        meterReturnStatus: "pending"
      }

      onSuccess(newRec)
      handleClose()
    } catch (e: any) {
      toast({ title: e.message || "Failed to submit proposal", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setConsumerId("")
    setConsumerName("")
    setAddress("")
    setMeterNumber("")
    setMobile("")
    setAgency("")
    setLiveOsdAmount(0)
    setOsdData(null)
    setOsdFetchStatus("idle")
    setCheckingOsd(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <PowerOff className="h-5 w-5 text-rose-600" />
            <span>Mark for Permanent Disconnection</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          {/* Consumer ID with Live Check Status */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="pd-cid" className="text-xs font-semibold text-slate-700">
                Consumer ID (9 Digits) *
              </Label>
              {checkingOsd && (
                <span className="flex items-center text-[11px] text-amber-600 font-medium animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Checking Live OSD...
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                id="pd-cid"
                value={consumerId}
                onChange={e => handleConsumerIdChange(e.target.value)}
                placeholder="Enter 9-digit Consumer ID"
                maxLength={9}
                className="font-mono text-sm tracking-wide pr-9"
                autoFocus
              />
              {consumerId.length === 9 && !checkingOsd && (
                <div className="absolute right-2.5 top-2.5 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}
            </div>
          </div>

          {/* Duplicate Consumer Error Banner */}
          {duplicateRecord && (
            <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs space-y-1 animate-in fade-in-50 duration-200">
              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                Duplicate Consumer: Already in PD Workflow
              </div>
              <p className="text-[11px] text-rose-700 leading-tight">
                Consumer <strong>#{duplicateRecord.consumerId}</strong> is already registered under record <strong>{duplicateRecord.pdId}</strong> (Stage: <strong>{duplicateRecord.status.toUpperCase()}</strong>). A consumer cannot be proposed multiple times.
              </p>
            </div>
          )}

          {/* OSD Status & Intimation Alert Banner */}
          {!duplicateRecord && osdFetchStatus === "live_verified" && osdData && (
            <div
              className={`p-3 rounded-xl border text-xs space-y-1.5 transition-all ${
                osdData.totalDues > 0
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : "bg-emerald-50 border-emerald-200 text-emerald-900"
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  {osdData.totalDues > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  )}
                  {osdData.totalDues > 0 ? "Live Portal OSD Verified" : "Live Verified: No Unpaid Dues (Clear)"}
                </span>
                <span className="text-sm font-mono font-black">
                  ₹{osdData.totalDues.toLocaleString("en-IN")}
                </span>
              </div>
              {osdData.totalDues > 0 ? (
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-rose-200/60">
                  <div>
                    <span className="text-rose-700">Unpaid Bills:</span> ₹
                    {osdData.osdAmount.toLocaleString("en-IN")}
                  </div>
                  <div>
                    <span className="text-rose-700">LPSC Dues:</span> ₹
                    {osdData.lpscAmount.toLocaleString("en-IN")}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-emerald-700">
                  WBSEDCL portal confirms zero outstanding dues for this consumer.
                </p>
              )}
            </div>
          )}

          {!duplicateRecord && osdFetchStatus === "offline_cached" && osdData && (
            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  Live Portal Unavailable &bull; Using Offline Cached Dues
                </span>
                <span className="text-sm font-mono font-black text-blue-900">
                  ₹{osdData.totalDues.toLocaleString("en-IN")}
                </span>
              </div>
              <p className="text-[11px] text-blue-700">
                WBSEDCL portal is currently offline (503). Outstanding dues loaded from CCC offline database records.
              </p>
            </div>
          )}

          {!duplicateRecord && osdFetchStatus === "unverified" && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                Live OSD Check Unavailable (Portal 503)
              </div>
              <p className="text-[11px] text-amber-800">
                WBSEDCL portal is temporarily unreachable and no offline dues record was found. Live OSD could not be checked. You may enter the OSD manually below if known.
              </p>
            </div>
          )}

          {/* Consumer Name */}
          <div className="space-y-1.5">
            <Label htmlFor="pd-name" className="text-xs font-semibold text-slate-700">
              Consumer Name *
            </Label>
            <Input
              id="pd-name"
              value={consumerName}
              onChange={e => setConsumerName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="text-xs"
              disabled={!!duplicateRecord}
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="pd-addr" className="text-xs font-semibold text-slate-700">
              Address *
            </Label>
            <Input
              id="pd-addr"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Premises / Location address"
              className="text-xs"
              disabled={!!duplicateRecord}
            />
          </div>

          {/* Meter Number (Col E: after Address, before Mobile) */}
          <div className="space-y-1.5">
            <Label htmlFor="pd-meter" className="text-xs font-semibold text-slate-700">
              Meter Number
            </Label>
            <Input
              id="pd-meter"
              value={meterNumber}
              onChange={e => setMeterNumber(e.target.value.toUpperCase())}
              placeholder="e.g. WB123456 / SP098765"
              className="font-mono text-xs"
              disabled={!!duplicateRecord}
            />
          </div>

          {/* Mobile & Live OSD Readout */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pd-mob" className="text-xs font-semibold text-slate-700">
                Mobile Number
              </Label>
              <Input
                id="pd-mob"
                value={mobile}
                onChange={e => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile"
                maxLength={10}
                className="font-mono text-xs"
                disabled={!!duplicateRecord}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pd-osd-amt" className="text-xs font-semibold text-slate-700">
                  Recorded OSD (₹)
                </Label>
                {osdFetchStatus === "live_verified" && (
                  <span className="text-[10px] font-bold text-emerald-600">✓ Live Verified</span>
                )}
                {osdFetchStatus === "offline_cached" && (
                  <span className="text-[10px] font-bold text-blue-600">Cached Record</span>
                )}
                {osdFetchStatus === "unverified" && (
                  <span className="text-[10px] font-bold text-amber-600">Not Checked</span>
                )}
              </div>
              <Input
                id="pd-osd-amt"
                type="number"
                value={liveOsdAmount || ""}
                onChange={e => setLiveOsdAmount(parseFloat(e.target.value) || 0)}
                placeholder={osdFetchStatus === "unverified" ? "Enter OSD if known" : "0"}
                disabled={!!duplicateRecord}
                className={`font-mono text-xs ${
                  osdFetchStatus === "unverified" ? "border-amber-300 bg-amber-50/40" : "bg-slate-50"
                }`}
              />
            </div>
          </div>

          {/* Direct Agency Assignment */}
          <div className="space-y-1.5">
            <Label htmlFor="pd-agency" className="text-xs font-semibold text-slate-700">
              Assign Agency (Auto-selected by Zone / MRU)
            </Label>
            <Select
              disabled={!!duplicateRecord}
              value={agency || "unassigned"}
              onValueChange={v => setAgency(v === "unassigned" ? "" : v)}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select Agency (or leave unassigned)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">— Leave Unassigned —</SelectItem>
                {agenciesList.map(ag => (
                  <SelectItem key={ag} value={ag} className="text-xs">
                    {ag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">
              Assigned agency is recorded. The record will remain in the <strong>Proposed</strong> tab until explicitly marked as Issued.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePropose}
            disabled={submitting || consumerId.length !== 9 || !!duplicateRecord}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Submit PD Proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
