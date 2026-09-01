"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Printer, Download, PowerOff } from "lucide-react"
import { PermanentDisconnection } from "@/lib/permanent-disconnection-types"

interface Props {
  isOpen: boolean
  onClose: () => void
  record: PermanentDisconnection | null
}

export function PDCertificateModal({ isOpen, onClose, record }: Props) {
  if (!record) return null

  const handlePrint = () => {
    window.print()
  }

  const photos = record.evidencePhotos ? record.evidencePhotos.split(",").map(s => s.trim()).filter(Boolean) : []

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <PowerOff className="h-5 w-5 text-rose-600" />
            <span>Permanent Disconnection Memo — #{record.pdId}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Printable Memo Container */}
        <div id="pd-printable-memo" className="p-6 border rounded-lg bg-white text-slate-900 space-y-6 print:p-0 print:border-0">
          {/* Header */}
          <div className="text-center border-b pb-4 space-y-1">
            <h2 className="text-lg font-black tracking-wide uppercase">West Bengal State Electricity Distribution Co. Ltd.</h2>
            <p className="text-xs font-semibold text-slate-600 uppercase">Permanent Disconnection & Meter Dismantling Memo</p>
            <div className="flex justify-between items-center text-xs pt-2 font-mono">
              <span><strong>Memo No:</strong> {record.pdId}</span>
              <span><strong>Date:</strong> {record.disconnectionDateTime ? new Date(record.disconnectionDateTime).toLocaleDateString("en-IN") : record.proposedDate}</span>
            </div>
          </div>

          {/* Consumer Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs border p-3 rounded-md bg-slate-50">
            <div>
              <p className="text-slate-500">Consumer ID:</p>
              <p className="font-mono font-bold text-slate-900 text-sm">#{record.consumerId}</p>
            </div>
            <div>
              <p className="text-slate-500">Consumer Name:</p>
              <p className="font-bold text-slate-900">{record.consumerName}</p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-500">Premises Address:</p>
              <p className="text-slate-800">{record.address}</p>
            </div>
            <div>
              <p className="text-slate-500">Contact Number:</p>
              <p className="font-mono text-slate-800">{record.mobile || "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500">Assigned Agency:</p>
              <p className="font-semibold text-slate-800">{record.agency || "N/A"}</p>
            </div>
          </div>

          {/* Meter & Disconnection Details */}
          <div className="border rounded-md p-3 text-xs space-y-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wide border-b pb-1">Site Dismantling & Execution Record</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-slate-500">Removed Meter Serial No:</p>
                <p className="font-mono font-bold text-blue-700">{record.removedMeterNo || "N/A"}</p>
              </div>
              <div>
                <p className="text-slate-500">Final Dial Reading:</p>
                <p className="font-mono font-bold text-emerald-700">{record.finalReading || "N/A"} kWh</p>
              </div>
              <div>
                <p className="text-slate-500">Physical Condition:</p>
                <p className="font-semibold capitalize text-slate-800">{record.meterCondition || "N/A"}</p>
              </div>
              <div>
                <p className="text-slate-500">Execution Date & Time:</p>
                <p className="font-mono text-slate-800">{record.disconnectionDateTime ? new Date(record.disconnectionDateTime).toLocaleString("en-IN") : "N/A"}</p>
              </div>
              <div>
                <p className="text-slate-500">GPS Coordinates:</p>
                <p className="font-mono text-slate-800">{record.latitude && record.longitude ? `${record.latitude}, ${record.longitude}` : "N/A"}</p>
              </div>
              <div>
                <p className="text-slate-500">Recorded Live OSD:</p>
                <p className="font-mono font-bold text-rose-700">₹{record.liveOsdAmount?.toLocaleString("en-IN") || "0"}</p>
              </div>
            </div>
          </div>

          {/* Store Return & Note Sheet */}
          <div className="grid grid-cols-2 gap-4 text-xs border rounded-md p-3">
            <div>
              <h5 className="font-bold text-slate-700 border-b pb-1 mb-1.5">Store Return Tracking</h5>
              <p><span className="text-slate-500">Return Status:</span> <strong className="capitalize">{record.meterReturnStatus || "Pending"}</strong></p>
              <p><span className="text-slate-500">Return Date:</span> {record.meterReturnDate || "N/A"}</p>
              <p><span className="text-slate-500">Return Remarks:</span> {record.meterReturnRemarks || "—"}</p>
            </div>
            <div>
              <h5 className="font-bold text-slate-700 border-b pb-1 mb-1.5">Office Note Sheet Tracking</h5>
              <p><span className="text-slate-500">Note Sheet No:</span> <strong className="font-mono text-purple-700">{record.noteSheetNo || "Pending"}</strong></p>
              <p><span className="text-slate-500">Note Sheet Date:</span> {record.noteSheetDate || "N/A"}</p>
              <p><span className="text-slate-500">Proposed Date / By:</span> {record.proposedDate} ({record.proposedBy || "Admin"})</p>
            </div>
          </div>

          {/* Evidence Photos */}
          {photos.length > 0 && (
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 uppercase tracking-wide">Photographic Evidence</h4>
              <div className="flex gap-3">
                {photos.map((p, idx) => (
                  <div key={idx} className="w-32 h-32 rounded border overflow-hidden bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature Block */}
          <div className="pt-8 grid grid-cols-2 text-center text-xs">
            <div className="space-y-8">
              <div className="h-8 border-b border-dashed border-slate-400 w-48 mx-auto" />
              <p className="font-semibold text-slate-700">Agency Lineman / Representative</p>
            </div>
            <div className="space-y-8">
              <div className="h-8 border-b border-dashed border-slate-400 w-48 mx-auto" />
              <p className="font-semibold text-slate-700">Sub-Division / CCC In-charge</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={handlePrint} className="bg-slate-900 hover:bg-slate-800 text-white">
            <Printer className="h-4 w-4 mr-1" /> Print Memo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
