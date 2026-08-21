"use client"

import { useState } from "react"
import type { IcdsRecord, IcdsEquipmentInput, CsrEquipmentChecklist } from "@/lib/icds-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Layers, Loader2, CheckCircle2, PackageCheck, AlertCircle, Building2 } from "lucide-react"

interface Props {
  record: IcdsRecord | null
  open: boolean
  onClose: () => void
  onSuccess: (updated: IcdsRecord) => void
  username: string
}

export function IcdsEquipmentModal({ record, open, onClose, onSuccess, username }: Props) {
  const [submitting, setSubmitting] = useState(false)

  const [equipmentPackageInstalled, setEquipmentPackageInstalled] = useState(true)
  const [mainSwitch, setMainSwitch] = useState(true)
  const [switchBoard, setSwitchBoard] = useState(true)
  const [wiring, setWiring] = useState(true)
  const [earthing, setEarthing] = useState(true)
  const [ledBulbsCount, setLedBulbsCount] = useState(3)
  const [fan80WCount, setFan80WCount] = useState(1)
  const [fanBrand, setFanBrand] = useState("CGL/Orient/Phillips")
  const [installDate, setInstallDate] = useState(new Date().toISOString().slice(0, 10))
  const [agency, setAgency] = useState("")

  if (!record) return null

  const handleOpen = () => {
    const cl = record.equipmentChecklist
    setEquipmentPackageInstalled(record.equipmentPackageInstalled ?? true)
    setMainSwitch(cl?.mainSwitch16ADp ?? true)
    setSwitchBoard(cl?.switchBoard5S1R1P ?? true)
    setWiring(cl?.frlsWiringConduit ?? true)
    setEarthing(cl?.earthingArrangement ?? true)
    setLedBulbsCount(cl?.ledBulbsCount ?? 3)
    setFan80WCount(cl?.fan80WCount ?? 1)
    setFanBrand(cl?.fanBrand || "CGL/Orient/Phillips")
    setInstallDate(record.equipmentInstallDate || new Date().toISOString().slice(0, 10))
    setAgency(record.equipmentAgency || record.assignedAgency || "")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const checklist: CsrEquipmentChecklist = {
        mainSwitch16ADp: mainSwitch,
        switchBoard5S1R1P: switchBoard,
        frlsWiringConduit: wiring,
        earthingArrangement: earthing,
        ledBulbsCount,
        fan80WCount,
        fanBrand: fanBrand.trim(),
        packageRateRs: 6611,
      }

      const payload: IcdsEquipmentInput = {
        equipmentPackageInstalled,
        equipmentChecklist: checklist,
        equipmentInstallDate: installDate,
        equipmentAgency: agency.trim() || record.assignedAgency || undefined,
      }

      const res = await fetch(`/api/icds/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "equipment", ...payload }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update CSR package details")

      toast.success("Standard CSR equipment checklist saved successfully!")
      onSuccess(data.record)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to save equipment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-600" />
            Stage 3: Standard CSR Electrification Package (EDD/49 Rates)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            WBSEDCL CSR internal wiring package checklist (₹6,611 + 18% GST).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* Header Summary */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-extrabold text-slate-900 text-sm">{record.awcName}</p>
              <p className="text-slate-500 font-mono text-[11px]">Code: {record.awcCode} • {record.blockName} • {record.gpName}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Standard Package Rate</span>
              <p className="font-extrabold text-purple-700">₹6,611 + 18% GST</p>
            </div>
          </div>

          {/* Standard Bill of Quantities / Checklist */}
          <div className="border border-purple-100 rounded-xl p-3.5 space-y-3 bg-purple-50/40">
            <Label className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4 text-purple-600" />
              WBSEDCL EDD/49 Standard Internal Wiring Package Items
            </Label>

            <div className="space-y-2.5 pt-1">
              {/* Item 1 */}
              <div className="flex items-start space-x-2 bg-white p-2.5 rounded border">
                <Checkbox id="eq-main-switch" checked={mainSwitch} onCheckedChange={(v) => setMainSwitch(Boolean(v))} />
                <div className="space-y-0.5 leading-none">
                  <label htmlFor="eq-main-switch" className="font-semibold text-slate-800 cursor-pointer">
                    16A-DP Main Switch (1 No.)
                  </label>
                  <p className="text-[11px] text-slate-500">Includes enclosure, isolating mechanism & bus connection.</p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex items-start space-x-2 bg-white p-2.5 rounded border">
                <Checkbox id="eq-switchboard" checked={switchBoard} onCheckedChange={(v) => setSwitchBoard(Boolean(v))} />
                <div className="space-y-0.5 leading-none">
                  <label htmlFor="eq-switchboard" className="font-semibold text-slate-800 cursor-pointer">
                    Switch Board (5 Switches, 1 Step Regulator, 1 Indicator, 1 3-Pin Plug)
                  </label>
                  <p className="text-[11px] text-slate-500">Modular / surface gang box with electronic step regulator.</p>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex items-start space-x-2 bg-white p-2.5 rounded border">
                <Checkbox id="eq-wiring" checked={wiring} onCheckedChange={(v) => setWiring(Boolean(v))} />
                <div className="space-y-0.5 leading-none">
                  <label htmlFor="eq-wiring" className="font-semibold text-slate-800 cursor-pointer">
                    FRLS Cu Internal Wiring in 20mm PVC Conduit
                  </label>
                  <p className="text-[11px] text-slate-500">2.5 sq mm power wire & 1.5 sq mm lighting wire in rigid PVC conduit casing.</p>
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex items-start space-x-2 bg-white p-2.5 rounded border">
                <Checkbox id="eq-earthing" checked={earthing} onCheckedChange={(v) => setEarthing(Boolean(v))} />
                <div className="space-y-0.5 leading-none">
                  <label htmlFor="eq-earthing" className="font-semibold text-slate-800 cursor-pointer">
                    Earthing Arrangement (Earth Spike & 8 SWG GI Wire)
                  </label>
                  <p className="text-[11px] text-slate-500">Proper neutral-earth bond and safety grounding for child center.</p>
                </div>
              </div>
            </div>

            {/* Bulbs and Fan Specifications */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-purple-200">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">LED Bulbs Count</Label>
                <Input
                  type="number"
                  value={ledBulbsCount}
                  onChange={(e) => setLedBulbsCount(Number(e.target.value))}
                  min={1}
                  max={10}
                  className="h-8 text-xs bg-white"
                />
                <span className="text-[10px] text-slate-400">Standard: 20Wx2 + 9Wx1 (3 Nos)</span>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">80W Ceiling Fan Count</Label>
                <Input
                  type="number"
                  value={fan80WCount}
                  onChange={(e) => setFan80WCount(Number(e.target.value))}
                  min={1}
                  max={5}
                  className="h-8 text-xs bg-white"
                />
                <span className="text-[10px] text-slate-400">Standard: 1 No.</span>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Fan Make / Brand</Label>
                <Input
                  value={fanBrand}
                  onChange={(e) => setFanBrand(e.target.value)}
                  placeholder="CGL / Orient / Phillips"
                  className="h-8 text-xs bg-white"
                />
              </div>
            </div>
          </div>

          {/* Installation Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Wiring Installation Date</Label>
              <Input
                type="date"
                value={installDate}
                onChange={(e) => setInstallDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Executing Electrical Contractor</Label>
              <Input
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                placeholder="Agency Name"
                className="h-8 text-xs"
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
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Save Wiring Package
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
