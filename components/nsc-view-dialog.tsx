"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NSC_STATUS_COLORS, NSC_STATUS_LABELS } from "@/lib/nsc-types"
import type { NSCApplication } from "@/lib/nsc-types"
import {
  Check, ChevronDown, ChevronRight,
  Zap, ClipboardList, Clock,
  AlertTriangle, ImageIcon,
} from "lucide-react"

const CLASS_LABELS: Record<string, string> = {
  domestic:   "LT Domestic",
  commercial: "LT Commercial",
  stw:        "STW",
  industrial: "LT Industrial",
}

type TabId = "application" | "inspection" | "history"

interface RowData { label: string; value: string; mono?: boolean; link?: boolean }

interface StepConfig {
  label:    string
  date:     string
  done:     boolean
  details?: RowData[]
}

interface Props {
  app:     NSCApplication | null
  open:    boolean
  onClose: () => void
}

export function NscViewDialog({ app, open, onClose }: Props) {
  const [activeTab,     setActiveTab]     = useState<TabId>("history")
  const [expandedStep,  setExpandedStep]  = useState<number | null>(null)

  if (!app) return null

  // ── History steps ──────────────────────────────────────────────────────────
  const steps: StepConfig[] = [
    {
      label: "Application Received",
      date:  app.receivedDate,
      done:  !!app.receivedDate,
      details: [
        { label: "Receive No",      value: app.receiveNo,                  mono: true },
        { label: "Office Ref No",   value: app.officeRefNo   || "—",       mono: true },
        { label: "Received Date",   value: app.receivedDate  || "—",       mono: true },
        { label: "Applicant",       value: app.applicantName },
        { label: "C/O",             value: app.careOf        || "—" },
        { label: "Address",         value: app.address },
        { label: "Mobile",          value: app.mobile,                     mono: true },
        { label: "Class / Phase",   value: `${CLASS_LABELS[app.appliedClass] || app.appliedClass} · ${app.phase}` },
        { label: "Assigned Agency", value: app.agency },
        { label: "Created By",      value: app.createdBy },
        ...(app.applicationFormUrl ? [{ label: "Application Form PDF", value: app.applicationFormUrl, link: true }] : []),
      ],
    },
    {
      label: "Inspection Completed",
      date:  app.inspectedAt,
      done:  !!app.inspectedAt,
      details: [
        { label: "Inspected At",     value: app.inspectedAt    || "—", mono: true },
        { label: "Inspected By",     value: app.inspectedBy    || "—" },
        { label: "Agency Decision",  value: app.agencyDecision || "—" },
        { label: "Agency Remarks",   value: app.agencyRemarks  || "—" },
        { label: "Name Verified",    value: app.verifyName    === "ok" ? `✓ ${app.applicantName}` : (app.verifyName    || "—") },
        { label: "Address Verified", value: app.verifyAddress === "ok" ? "✓ Confirmed"            : (app.verifyAddress || "—") },
        { label: "Class Verified",   value: app.verifyClass   === "ok" ? "✓ Confirmed"            : (app.verifyClass   || "—") },
        { label: "Existing Meter",   value: app.existingMeter === "yes" ? `Yes — ${app.existingMeterNo || "?"}` : "No" },
        { label: "Valid Partition",  value: app.validPartition === "yes" ? "Yes" : "No" },
        { label: "Dispute Noted",    value: app.dispute        || "—" },
        { label: "Load",             value: app.load           ? `${app.load} kW`         : "—", mono: true },
        { label: "Service Length",   value: app.serviceLength  ? `${app.serviceLength} m` : "—", mono: true },
        { label: "DTR Capacity",     value: app.dtrCapacity    ? `${app.dtrCapacity} KVA` : "—", mono: true },
        { label: "DTR Load",         value: app.dtrLoad        ? `${app.dtrLoad} KVA`     : "—", mono: true },
        { label: "Pole Required",    value: app.poleRequired === "yes" ? "Yes" : "No" },
        ...(app.siteImg           ? [{ label: "Site Photo",      value: app.siteImg,           link: true }] : []),
        ...(app.inspectionFormImg ? [{ label: "Inspection Form", value: app.inspectionFormImg, link: true }] : []),
        ...(app.existingMeterImg  ? [{ label: "Existing Meter",  value: app.existingMeterImg,  link: true }] : []),
        ...(app.poleDrawingImg    ? [{ label: "Pole Drawing",    value: app.poleDrawingImg,    link: true }] : []),
      ],
    },
    {
      label: app.finalAction === "dispute_letter" ? "Dispute Letter Issued" : "Quotation Issued",
      date:  app.finalizedAt,
      done:  !!app.finalizedAt && (app.finalAction === "quotation" || app.finalAction === "dispute_letter"),
      details: [
        { label: "Admin Decision",       value: app.adminDecision        || "—" },
        { label: "Admin Remarks",        value: app.adminRemarks         || "—" },
        { label: "Final Action",         value: app.finalAction          || "—" },
        { label: "Application No",       value: app.applicationNo        || "—", mono: true },
        { label: "Memo No",              value: app.memoNo               || "—", mono: true },
        { label: "Existing Consumer ID", value: app.existingConsumerId   || "—", mono: true },
        { label: "Finalized At",         value: app.finalizedAt          || "—", mono: true },
        { label: "Finalized By",         value: app.finalizedBy          || "—" },
      ],
    },
    {
      label: "Meter Issued",
      date:  app.meterIssuedAt ? `${app.meterIssuedAt}${app.meterSerialNo ? ` · ${app.meterSerialNo}` : ""}` : "",
      done:  !!app.meterIssuedAt,
      details: [
        { label: "Meter Serial No", value: app.meterSerialNo  || "—", mono: true },
        { label: "Issued At",       value: app.meterIssuedAt  || "—", mono: true },
      ],
    },
    {
      label: "Connection Effected",
      date:  app.connectionEffectedAt,
      done:  !!app.connectionEffectedAt,
      details: [
        { label: "Connection Date", value: app.connectionEffectedAt || "—", mono: true },
      ],
    },
  ]

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "application", label: "Application", icon: <ClipboardList className="h-3.5 w-3.5" /> },
    { id: "inspection",  label: "Inspection",  icon: <Zap className="h-3.5 w-3.5" /> },
    { id: "history",     label: "History",     icon: <Clock className="h-3.5 w-3.5" /> },
  ]

  const Row = ({ label, value, mono, link }: RowData) => (
    <div className="flex justify-between items-start py-1.5 border-b last:border-0 gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      {link
        ? <a href={value} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 underline flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />Open ↗
          </a>
        : <span className={`text-xs font-medium text-gray-800 text-right ${mono ? "font-mono" : ""}`}>{value}</span>
      }
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); setActiveTab("application"); setExpandedStep(null) } }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold truncate">{app.applicantName}</DialogTitle>
              <p className="text-xs font-mono text-gray-500 mt-0.5">{app.receiveNo}</p>
              {app.careOf && <p className="text-xs text-gray-500">C/O {app.careOf}</p>}
            </div>
            <Badge className={`shrink-0 text-xs ${NSC_STATUS_COLORS[app.status] || "bg-gray-100 text-gray-700"}`}>
              {NSC_STATUS_LABELS[app.status] || app.status}
            </Badge>
          </div>
          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 font-medium">
              {CLASS_LABELS[app.appliedClass] || app.appliedClass}
            </span>
            <span className="text-xs bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 font-medium">
              {app.phase}
            </span>
            {app.poleRequired === "yes" && (
              <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">Pole Required</span>
            )}
            {app.dispute && (
              <span className="text-xs bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5 font-medium">
                <AlertTriangle className="h-3 w-3 inline mr-0.5" />Dispute
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b shrink-0 bg-gray-50">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors
                ${activeTab === t.id
                  ? "border-b-2 border-slate-900 text-slate-900 bg-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

          {/* ── Application ─────────────────────────────────────────────────── */}
          {activeTab === "application" && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-3 space-y-0">
                <Row label="Receive No"    value={app.receiveNo}                       mono />
                {app.officeRefNo && <Row label="Office Ref No" value={app.officeRefNo} mono />}
                <Row label="Received Date" value={app.receivedDate}                    mono />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 space-y-0">
                <Row label="Applicant"     value={app.applicantName} />
                {app.careOf && <Row label="C/O" value={app.careOf} />}
                <Row label="Address"       value={app.address} />
                <Row label="Mobile"        value={app.mobile} mono />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 space-y-0">
                <Row label="Applied Class" value={CLASS_LABELS[app.appliedClass] || app.appliedClass} />
                <Row label="Phase"         value={app.phase} />
                <Row label="Agency"        value={app.agency} />
              </div>
              {app.existingConsumerId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <Row label="Existing Consumer ID" value={app.existingConsumerId} mono />
                </div>
              )}
              {(app.applicationNo || app.memoNo) && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-0">
                  {app.applicationNo && <Row label="Application No" value={app.applicationNo} mono />}
                  {app.memoNo        && <Row label="Memo No"        value={app.memoNo}        mono />}
                </div>
              )}
              {app.meterSerialNo && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-0">
                  <Row label="Meter Serial No"  value={app.meterSerialNo}        mono />
                  {app.meterIssuedAt && <Row label="Issued At" value={app.meterIssuedAt} mono />}
                </div>
              )}
            </div>
          )}

          {/* ── Inspection ──────────────────────────────────────────────────── */}
          {activeTab === "inspection" && (
            <div className="space-y-3">
              {!app.inspectedAt ? (
                <div className="text-center py-10 text-gray-400">
                  <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Inspection not yet submitted</p>
                </div>
              ) : (
                <>
                  <div className={`rounded-xl p-3 flex items-center justify-between
                    ${app.agencyDecision === "accepted"
                      ? "bg-green-50 border border-green-200"
                      : "bg-red-50 border border-red-200"}`}>
                    <div>
                      <p className="text-xs text-gray-500">Agency Decision</p>
                      <p className={`text-sm font-bold ${app.agencyDecision === "accepted" ? "text-green-700" : "text-red-700"}`}>
                        {app.agencyDecision === "accepted" ? "✓ Accepted" : "✗ Rejected"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 font-mono">{app.inspectedAt}</p>
                      <p className="text-xs text-gray-500">{app.inspectedBy}</p>
                    </div>
                  </div>

                  {app.agencyRemarks && (
                    <p className="text-xs text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2">"{app.agencyRemarks}"</p>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">Verified Details</p>
                    <div className="bg-gray-50 rounded-xl p-3 space-y-0">
                      <Row label="Name"    value={app.verifyName    === "ok" ? `✓ ${app.applicantName}` : (app.verifyName    || "—")} />
                      <Row label="C/O"     value={app.verifyCO      === "ok" ? `✓ ${app.careOf}`        : (app.verifyCO      || "—")} />
                      <Row label="Address" value={app.verifyAddress === "ok" ? "✓ Confirmed"            : (app.verifyAddress || "—")} />
                      <Row label="Class"   value={app.verifyClass   === "ok" ? "✓ Confirmed"            : (app.verifyClass   || "—")} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">Technical</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { l: "Load",        v: app.load          ? `${app.load} kW`          : "—" },
                        { l: "Service Len", v: app.serviceLength ? `${app.serviceLength} m`  : "—" },
                        { l: "DTR Capacity",v: app.dtrCapacity   ? `${app.dtrCapacity} KVA`  : "—" },
                        { l: "DTR Load",    v: app.dtrLoad       ? `${app.dtrLoad} KVA`      : "—" },
                      ].map(({ l, v }) => (
                        <div key={l} className="bg-gray-50 rounded-lg p-2">
                          <p className="text-xs text-gray-400">{l}</p>
                          <p className="text-xs font-semibold font-mono">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {app.existingMeter  === "yes" && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Existing Meter: {app.existingMeterNo || "?"}</span>}
                    {app.validPartition === "no"  && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Invalid Partition</span>}
                    {app.poleRequired   === "yes" && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Pole Required</span>}
                    {app.dispute                  && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Dispute: {app.dispute}</span>}
                  </div>

                  {(app.siteImg || app.inspectionFormImg || app.existingMeterImg || app.poleDrawingImg) && (
                    <div className="flex flex-wrap gap-2">
                      {app.siteImg           && <a href={app.siteImg}           target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100 flex items-center gap-1"><ImageIcon className="h-3 w-3" />Site Photo ↗</a>}
                      {app.inspectionFormImg && <a href={app.inspectionFormImg} target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100 flex items-center gap-1"><ImageIcon className="h-3 w-3" />Insp. Form ↗</a>}
                      {app.existingMeterImg  && <a href={app.existingMeterImg}  target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100 flex items-center gap-1"><ImageIcon className="h-3 w-3" />Meter Img ↗</a>}
                      {app.poleDrawingImg    && <a href={app.poleDrawingImg}    target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100 flex items-center gap-1"><ImageIcon className="h-3 w-3" />Pole Drawing ↗</a>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── History ─────────────────────────────────────────────────────── */}
          {activeTab === "history" && (
            <div className="space-y-2">
              {steps.map((step, i) => {
                const isExp     = expandedStep === i
                const hasDets   = step.details && step.details.length > 0
                return (
                  <div
                    key={i}
                    className={`rounded-xl border transition-all
                      ${step.done
                        ? "border-green-200 bg-green-50/40"
                        : "border-gray-100 bg-gray-50/50"}`}
                  >
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left"
                      onClick={() => hasDets && setExpandedStep(isExp ? null : i)}
                    >
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0
                        ${step.done ? "bg-green-500" : "bg-gray-200"}`}>
                        {step.done
                          ? <Check className="h-3.5 w-3.5 text-white" />
                          : <span className="text-xs text-gray-400 font-bold">{i + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${step.done ? "text-gray-800" : "text-gray-400"}`}>
                          {step.label}
                        </p>
                        {step.done && step.date && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{step.date}</p>
                        )}
                      </div>
                      {hasDets && step.done && (
                        isExp
                          ? <ChevronDown  className="h-4 w-4 text-gray-400 shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                    </button>

                    {isExp && step.details && (
                      <div className="border-t border-green-100 px-3 pb-3 pt-1 space-y-0">
                        {step.details.map((d, di) => (
                          <Row key={di} label={d.label} value={d.value} mono={d.mono} link={d.link} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}
