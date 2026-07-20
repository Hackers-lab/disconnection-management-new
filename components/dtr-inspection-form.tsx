"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  ArrowLeft,
  Camera,
  Upload,
  Loader2,
  MapPin,
  RadioTower,
  Sparkles,
  AlertTriangle,
  Brush,
  Zap,
  Info,
  ShieldCheck
} from "lucide-react"
import type { DTRRecord } from "@/lib/dtr-service"
import { compressAndWatermarkImage } from "@/lib/image-processor"

interface Props {
  dtr: DTRRecord
  userRole: string
  username: string
  onSave: () => void
  onCancel: () => void
  feeders?: string[]
}

function getGoogleDriveDirectLink(url: string): string {
  if (!url) return ""
  if (url.includes("drive.google.com")) {
    let fileId = ""
    if (url.includes("/file/d/")) {
      const parts = url.split("/file/d/")
      if (parts[1]) fileId = parts[1].split("/")[0]
    } else if (url.includes("id=")) {
      const match = url.match(/[?&]id=([^&]+)/)
      if (match && match[1]) fileId = match[1]
    }
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
  }
  return url
}

export function DTRInspectionForm({ dtr, userRole, username, onSave, onCancel, feeders = [] }: Props) {
  // Store original DTR code to support admin code edits
  const [originalDtrCode] = useState(dtr.dtrCode)
  const [dtrCode, setDtrCode] = useState(dtr.dtrCode || "")

  // Prep populate with existing values if available
  const [actualFeeder, setActualFeeder] = useState(dtr.actualFeeder || dtr.feederName || "")
  const [actualRating, setActualRating] = useState(dtr.actualRating || dtr.kvCapacity || "")
  const [actualLocation, setActualLocation] = useState(dtr.actualLocation || dtr.locationName || "")
  const [supplyOffice, setSupplyOffice] = useState(dtr.supplyOffice || "KUSHIDA")
  
  const [latlong, setLatlong] = useState(dtr.latlong || "")
  const [imageUrl, setImageUrl] = useState(userRole === "painter" ? (dtr.paintingImage || "") : (dtr.image || ""))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  // Inspection parameters
  const [painting, setPainting] = useState<string>(dtr.painting || "Pending")
  const [kiosk, setKiosk] = useState<string>(dtr.kiosk || "Good")
  const [la, setLa] = useState<string>(dtr.la || "Good")
  const [ne, setNe] = useState<string>(dtr.ne || "Good")
  const [paintingAgency, setPaintingAgency] = useState<string>(dtr.paintingAgency || "")
  const [auditAgency, setAuditAgency] = useState<string>(dtr.auditAgency || "")
  
  // RYBN Loads
  const [loadR, setLoadR] = useState(dtr.loadR || "")
  const [loadY, setLoadY] = useState(dtr.loadY || "")
  const [loadB, setLoadB] = useState(dtr.loadB || "")
  const [loadN, setLoadN] = useState(dtr.loadN || "")
  
  const [remarks, setRemarks] = useState(dtr.remarks || "")
  
  // State helpers
  const [uploading, setUploading] = useState(false)
  const [fetchingLocation, setFetchingLocation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  
  // Feeder selection helpers
  const [feederSelectValue, setFeederSelectValue] = useState<string>("")
  const [customFeeder, setCustomFeeder] = useState("")

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isPainter = userRole === "painter"
  const isAdmin = userRole === "admin"

  // Initialize actual feeder selector value
  useEffect(() => {
    const defaultFeeder = dtr.actualFeeder || dtr.feederName || ""
    const matched = feeders.find(f => f.toUpperCase().trim() === defaultFeeder.toUpperCase().trim())
    if (matched) {
      setFeederSelectValue(matched)
      setActualFeeder(matched)
    } else if (defaultFeeder) {
      setFeederSelectValue("other")
      setCustomFeeder(defaultFeeder)
      setActualFeeder(defaultFeeder)
    }
  }, [dtr, feeders])

  // Handle feeder selection changes
  const handleFeederSelection = (val: string) => {
    setFeederSelectValue(val)
    if (val !== "other") {
      setActualFeeder(val)
      setCustomFeeder("")
    } else {
      setActualFeeder(customFeeder)
    }
  }

  const handleCustomFeederChange = (val: string) => {
    setCustomFeeder(val)
    setActualFeeder(val)
  }

  // ── Camera helpers ────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = s
      setCameraOn(true)
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = s })
    } catch { alert("Camera unavailable.") }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  const capturePhoto = () => {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement("canvas")
    canvas.width = v.videoWidth; canvas.height = v.videoHeight
    canvas.getContext("2d")?.drawImage(v, 0, 0)
    canvas.toBlob(blob => {
      if (blob) { stopCamera(); uploadImage(new File([blob], "capture.jpg", { type: "image/jpeg" })) }
    }, "image/jpeg")
  }

  // ── Image compression (watermark with DTR Code) ───────────────────
  const processImage = async (file: File): Promise<File> => {
    const dateStr = new Date().toLocaleString("en-IN", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric", 
      hour: "2-digit", 
      minute: "2-digit", 
      hour12: true 
    })
    return compressAndWatermarkImage(file, {
      maxDim: 800,
      watermarkLines: [`Date: ${dateStr}`, `DTR Code — ID: ${dtrCode}`],
      targetKb: 95
    })
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadImage = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    setFormError(null)
    try {
      const compressed = await processImage(file)
      const fd = new FormData()
      fd.append("file", compressed)
      fd.append("consumerId", dtrCode)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setImageUrl(data.url)
    } catch { setFormError("Failed to upload image. Please try again.") }
    finally { setUploading(false) }
  }

  // ── Geolocation ───────────────────────────────────────────────────────────
  const getGeolocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      return
    }
    setFetchingLocation(true)
    setFormError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6)
        const lng = position.coords.longitude.toFixed(6)
        setLatlong(`${lat}, ${lng}`)
        setFetchingLocation(false)
      },
      () => {
        setFormError("Unable to retrieve GPS location coordinates. Please check your browser permission.")
        setFetchingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // ── Submit & Validate ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError(null)

    // Validation checks for Painter vs standard Inspector
    if (isPainter) {
      // Painters only need to specify painting status and upload the image!
      if (painting !== "Done") {
        setFormError("Painting status must be marked as Completed (Done) to register painting.")
        return
      }
      if (!imageUrl) {
        setFormError("A mandatory photographic proof of DTR painting must be uploaded or captured.")
        return
      }
    } else {
      // Standard inspections require ALL DTR fields filled!
      if (!dtrCode.trim()) { setFormError("DTR Code is required."); return }
      if (!actualFeeder.trim()) { setFormError("Actual Feeder is required. Please select or specify a feeder."); return }
      if (!actualRating.trim()) { setFormError("Actual KV Rating capacity is required."); return }
      if (!actualLocation.trim()) { setFormError("Actual Location name / Landmark is required."); return }
      if (!latlong.trim()) { setFormError("GPS Lat/Long coordinates are mandatory."); return }
      
      // Select Status validations
      if (!painting) { setFormError("Painting status must be selected."); return }
      if (!kiosk) { setFormError("Kiosk status must be selected."); return }
      if (!la) { setFormError("Lightning Arrester (LA) status must be selected."); return }
      if (!ne) { setFormError("Neutral Earthing (NE) status must be selected."); return }
      
      // Load current validations
      if (!loadR.trim() || !loadY.trim() || !loadB.trim() || !loadN.trim()) {
        setFormError("All phase load current parameters (R, Y, B, N) are mandatory.");
        return
      }
      
      // Image validation
      if (!imageUrl) {
        setFormError("A photographic evidence of the distribution transformer is mandatory.");
        return
      }
    }

    setSubmitting(true)
    try {
      // Send parameters. If Painter, send DTR record defaults for all inspector parameters
      const payload = {
        dtrCode: dtrCode.trim(),
        originalDtrCode: originalDtrCode,
        feederName: dtr.feederName,
        locationName: dtr.locationName,
        kvCapacity: dtr.kvCapacity,
        status: isPainter ? dtr.status : "EXIST",
        actualFeeder: isPainter ? dtr.actualFeeder : actualFeeder.trim(),
        actualRating: isPainter ? dtr.actualRating : actualRating.trim(),
        actualLocation: isPainter ? dtr.actualLocation : actualLocation.trim(),
        supplyOffice: isPainter ? dtr.supplyOffice : supplyOffice.trim(),
        latlong: isPainter ? dtr.latlong : latlong.trim(),
        image: isPainter ? dtr.image : imageUrl,
        paintingImage: isPainter ? imageUrl : (dtr.paintingImage || ""),
        painting: painting,
        kiosk: isPainter ? dtr.kiosk : kiosk,
        la: isPainter ? dtr.la : la,
        ne: isPainter ? dtr.ne : ne,
        loadR: isPainter ? dtr.loadR : loadR.trim(),
        loadY: isPainter ? dtr.loadY : loadY.trim(),
        loadB: isPainter ? dtr.loadB : loadB.trim(),
        loadN: isPainter ? dtr.loadN : loadN.trim(),
        remarks: remarks.trim(),
        paintingAgency: isPainter ? (dtr.paintingAgency || paintingAgency) : paintingAgency,
        auditAgency: isPainter ? (dtr.auditAgency || auditAgency) : auditAgency,
      }

      const res = await fetch("/api/dtr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit DTR verification data")
      onSave()
    } catch (e: any) {
      setFormError(e.message || "Failed to save verification updates.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {isPainter ? "DTR Painting Work Order" : "DTR Physical Audit Form"}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Asset Code Reference: {originalDtrCode}</p>
          </div>
        </div>
        {isPainter && (
          <span className="bg-orange-50 text-orange-700 border border-orange-100 rounded-lg px-2.5 py-1 text-xs font-bold flex items-center gap-1">
            <Brush className="h-3.5 w-3.5" /> Painter Role
          </span>
        )}
      </div>

      {/* Reference Alertbox */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm grid sm:grid-cols-3 gap-4 items-center border border-slate-800">
        <div className="flex items-center gap-2.5 col-span-2">
          <span className="p-2 bg-slate-800 rounded-xl">
            <RadioTower className="h-5 w-5 text-blue-400" />
          </span>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sheet Metadata Reference</p>
            <p className="text-sm font-bold text-white mt-0.5">{dtr.locationName || "No location name assigned"}</p>
            <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <span>Feeder: <strong className="text-white">{dtr.feederName || "—"}</strong></span>
              <span>Capacity: <strong className="text-white">{dtr.kvCapacity ? `${dtr.kvCapacity} kVA` : "—"}</strong></span>
            </div>
          </div>
        </div>
        <div className="text-right border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 pl-0 sm:pl-4">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Inspected status</span>
          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${dtr.status === "EXIST" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
            {dtr.status === "EXIST" ? "Verified" : "Pending Audit"}
          </span>
        </div>
      </div>

      {/* Error Alert Box */}
      {formError && (
        <Alert variant="destructive" className="border-red-200 bg-red-50/50 rounded-2xl">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-bold text-red-800">Incomplete Form / Error</AlertTitle>
          <AlertDescription className="text-red-700 font-medium">{formError}</AlertDescription>
        </Alert>
      )}

      {/* MAIN REDESIGNED FORM COLUMNS */}
      <div className="space-y-6">
        
        {/* CARD 1: GENERAL DTR ASSET DETAILS */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
            <Info className="h-4.5 w-4.5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">1. DTR Asset Specifications</h3>
          </div>
          <CardContent className="p-5 space-y-4">
            {/* DTR Code (Editable for Admin only) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-650 flex items-center gap-1.5">
                DTR Code {isAdmin && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold">Admin Update</span>}
              </Label>
              {isAdmin ? (
                <Input
                  value={dtrCode}
                  onChange={(e) => setDtrCode(e.target.value.toUpperCase().trim())}
                  className="h-11 rounded-xl font-mono"
                  placeholder="Enter unique DTR Code"
                  disabled={submitting}
                />
              ) : (
                <div className="bg-slate-100 border border-slate-200 text-slate-600 p-2.5 rounded-xl text-sm font-mono font-bold">
                  {dtrCode}
                </div>
              )}
            </div>

            {/* If Painter, show general specification as read-only labels */}
            {isPainter ? (
              <div className="flex flex-col gap-1.5 mt-2 text-sm text-blue-900">
                <div className="flex justify-between border-b border-blue-100/50 pb-1 flex-wrap gap-2">
                  <span><span className="opacity-75">Feeder:</span> <strong>{dtr.feederName || "—"}</strong></span>
                  <span><span className="opacity-75">Capacity:</span> <strong>{dtr.kvCapacity ? `${dtr.kvCapacity} kVA` : "—"}</strong></span>
                </div>
                <div><span className="opacity-75">Location:</span> <strong>{dtr.locationName || "—"}</strong></div>
              </div>
            ) : (
              <>
                {/* Feeder Selector dropdown */}
                <div className="space-y-1.5">
                  <Label htmlFor="actualFeeder" className="text-xs font-semibold text-slate-650">Actual Feeder Name</Label>
                  <Select value={feederSelectValue} onValueChange={handleFeederSelection}>
                    <SelectTrigger id="actualFeeder" className="h-11 rounded-xl bg-white border-slate-200">
                      <SelectValue placeholder="Select Feeder" />
                    </SelectTrigger>
                    <SelectContent>
                      {feeders.map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (Specify Custom)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {feederSelectValue === "other" && (
                    <Input
                      placeholder="Type custom feeder name here..."
                      value={customFeeder}
                      onChange={(e) => handleCustomFeederChange(e.target.value.toUpperCase())}
                      className="h-11 rounded-xl mt-2 border-indigo-200 focus:ring-indigo-500"
                      disabled={submitting}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Rating / Capacity */}
                  <div className="space-y-1.5">
                    <Label htmlFor="actualRating" className="text-xs font-semibold text-slate-650">Actual KV Rating</Label>
                    <Input
                      id="actualRating"
                      placeholder="e.g. 25, 63, 100"
                      value={actualRating}
                      onChange={e => setActualRating(e.target.value)}
                      className="h-11 rounded-xl"
                      disabled={submitting}
                    />
                  </div>

                  {/* Supply Office */}
                  <div className="space-y-1.5">
                    <Label htmlFor="supplyOffice" className="text-xs font-semibold text-slate-650">Supply Office</Label>
                    <Input
                      id="supplyOffice"
                      value={supplyOffice}
                      onChange={e => setSupplyOffice(e.target.value)}
                      className="h-11 rounded-xl"
                      disabled={submitting}
                    />
                  </div>
                </div>

                {/* Actual Location Landmark */}
                <div className="space-y-1.5">
                  <Label htmlFor="actualLocation" className="text-xs font-semibold text-slate-650">Actual Location / Landmark</Label>
                  <Input
                    id="actualLocation"
                    placeholder="Where is the transformer located?"
                    value={actualLocation}
                    onChange={e => setActualLocation(e.target.value)}
                    className="h-11 rounded-xl"
                    disabled={submitting}
                  />
                </div>

                {/* Assign Painting & Audit Agencies (Admin only) */}
                {isAdmin && (
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <div className="space-y-1.5">
                      <Label htmlFor="paintingAgency" className="text-xs font-bold text-indigo-650 flex items-center gap-1.5">
                        Assign Painting Agency
                      </Label>
                      <Input
                        id="paintingAgency"
                        placeholder="e.g. Painting Agency A"
                        value={paintingAgency}
                        onChange={e => setPaintingAgency(e.target.value)}
                        className="h-11 rounded-xl"
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="auditAgency" className="text-xs font-bold text-indigo-650 flex items-center gap-1.5">
                        Assign Audit Agency
                      </Label>
                      <Input
                        id="auditAgency"
                        placeholder="e.g. Audit Agency B"
                        value={auditAgency}
                        onChange={e => setAuditAgency(e.target.value)}
                        className="h-11 rounded-xl"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* CARD 2: LOCATION AND COORDINATES */}
        {!isPainter && (
          <Card className="border border-slate-200 shadow-sm rounded-2xl">
            <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
              <MapPin className="h-4.5 w-4.5 text-red-650" />
              <h3 className="text-sm font-bold text-slate-800">2. GPS Coordinates & Mapping</h3>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="latlong" className="text-xs font-semibold text-slate-650">GPS Coordinates (Latitude, Longitude)</Label>
                <div className="flex gap-2">
                  <Input
                    id="latlong"
                    placeholder="e.g. 25.452202, 88.021090"
                    value={latlong}
                    onChange={e => setLatlong(e.target.value)}
                    className="h-11 rounded-xl font-mono text-sm"
                    disabled={submitting}
                  />
                  <Button 
                    type="button" 
                    onClick={getGeolocation} 
                    disabled={fetchingLocation || submitting}
                    variant="outline"
                    className="h-11 px-4 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 shrink-0"
                  >
                    {fetchingLocation ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <MapPin className="h-5 w-5 mr-1" />
                        Capture GPS
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Mini Map Preview */}
              {latlong && latlong.includes(",") && (
                <div className="mt-2 rounded-xl overflow-hidden border border-slate-200">
                  <iframe
                    title="DTR Mini Map"
                    width="100%"
                    height="180"
                    className="w-full"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(latlong)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    loading="lazy"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(latlong)}`, "_blank")}
                    className="w-full text-[10px] text-blue-600 bg-blue-50/50 hover:bg-blue-50 py-1.5 rounded-none font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                  >
                    <MapPin className="h-3 w-3" /> Click to open Google Maps navigation
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* CARD 3: PHYSICAL INSPECTION AND PAINTING */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
            <Brush className="h-4.5 w-4.5 text-orange-655" />
            <h3 className="text-sm font-bold text-slate-800">
              {isPainter ? "2. Painting Work Status" : "3. Physical Inspections & Painting"}
            </h3>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Painting Status (Always Editable) */}
              <div className="space-y-2 col-span-1 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-650">DTR Painting Status</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPainting("Pending")}
                    className={`h-11 rounded-xl text-xs font-bold transition-all duration-300 border flex items-center justify-center gap-1.5 ${
                      painting === "Pending"
                        ? "bg-orange-50 text-orange-700 border-orange-300 ring-2 ring-orange-500/10 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                    disabled={submitting}
                  >
                    <span className={`h-2 w-2 rounded-full ${painting === "Pending" ? "bg-orange-500 animate-pulse" : "bg-slate-350"}`} />
                    Pending (Not Painted)
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPainting("Done")}
                    className={`h-11 rounded-xl text-xs font-bold transition-all duration-300 border flex items-center justify-center gap-1.5 ${
                      painting === "Done"
                        ? "bg-green-50 text-green-700 border-green-300 ring-2 ring-green-500/10 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                    disabled={submitting}
                  >
                    <span className={`h-2 w-2 rounded-full ${painting === "Done" ? "bg-green-500 animate-ping absolute" : ""}`} />
                    <span className={`h-2 w-2 rounded-full relative ${painting === "Done" ? "bg-green-600" : "bg-slate-350"}`} />
                    Done (Completed)
                  </Button>
                </div>
              </div>

              {/* Painting Agency assignment (Editable for Admin / Inspector) */}
              <div className="space-y-1.5">
                <Label htmlFor="paintingAgency" className="text-xs font-semibold text-slate-650">Painting Agency / Vendor</Label>
                {isPainter ? (
                  <div className="bg-slate-100 border border-slate-200 text-slate-600 p-2.5 rounded-xl text-sm font-semibold">
                    {paintingAgency || "None / Self"}
                  </div>
                ) : (
                  <Input
                    id="paintingAgency"
                    placeholder="Enter painting agency name"
                    value={paintingAgency}
                    onChange={e => setPaintingAgency(e.target.value)}
                    className="h-11 rounded-xl"
                    disabled={submitting}
                  />
                )}
              </div>
            </div>

            {/* Inspected checklist (Hidden for Painters) */}
            {!isPainter && (
              <div className="grid grid-cols-3 gap-4 pt-3 border-t">
                {/* Kiosk status */}
                <div className="space-y-1.5">
                  <Label htmlFor="kiosk" className="text-xs font-semibold text-slate-650">Kiosk Box</Label>
                  <Select value={kiosk} onValueChange={setKiosk} disabled={submitting}>
                    <SelectTrigger id="kiosk" className="h-11 rounded-xl bg-white border-slate-200">
                      <SelectValue placeholder="Kiosk Box" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Defective">Defective</SelectItem>
                      <SelectItem value="Missing">Missing / None</SelectItem>
                      <SelectItem value="Not Applicable">N/A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* LA status */}
                <div className="space-y-1.5">
                  <Label htmlFor="la" className="text-xs font-semibold text-slate-650">LA (Arrester)</Label>
                  <Select value={la} onValueChange={setLa} disabled={submitting}>
                    <SelectTrigger id="la" className="h-11 rounded-xl bg-white border-slate-200">
                      <SelectValue placeholder="LA status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Defective">Defective</SelectItem>
                      <SelectItem value="Missing">Missing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* NE status */}
                <div className="space-y-1.5">
                  <Label htmlFor="ne" className="text-xs font-semibold text-slate-650">NE (Earthing)</Label>
                  <Select value={ne} onValueChange={setNe} disabled={submitting}>
                    <SelectTrigger id="ne" className="h-11 rounded-xl bg-white border-slate-200">
                      <SelectValue placeholder="NE status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Defective">Defective</SelectItem>
                      <SelectItem value="Missing">Missing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARD 4: RYBN LOAD CURRENTS & COMMENTS */}
        {!isPainter && (
          <Card className="border border-slate-200 shadow-sm rounded-2xl">
            <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
              <Zap className="h-4.5 w-4.5 text-yellow-600" />
              <h3 className="text-sm font-bold text-slate-800">4. Electrical Phase Loads (Amps)</h3>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <Label htmlFor="loadR" className="text-[10px] text-red-550 font-bold uppercase block mb-1">R-Phase</Label>
                  <Input
                    id="loadR"
                    type="number"
                    placeholder="Amps"
                    value={loadR}
                    onChange={e => setLoadR(e.target.value)}
                    className="h-11 rounded-xl text-center font-bold"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <Label htmlFor="loadY" className="text-[10px] text-amber-500 font-bold uppercase block mb-1">Y-Phase</Label>
                  <Input
                    id="loadY"
                    type="number"
                    placeholder="Amps"
                    value={loadY}
                    onChange={e => setLoadY(e.target.value)}
                    className="h-11 rounded-xl text-center font-bold"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <Label htmlFor="loadB" className="text-[10px] text-blue-600 font-bold uppercase block mb-1">B-Phase</Label>
                  <Input
                    id="loadB"
                    type="number"
                    placeholder="Amps"
                    value={loadB}
                    onChange={e => setLoadB(e.target.value)}
                    className="h-11 rounded-xl text-center font-bold"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <Label htmlFor="loadN" className="text-[10px] text-slate-600 font-bold uppercase block mb-1">Neutral (N)</Label>
                  <Input
                    id="loadN"
                    type="number"
                    placeholder="Amps"
                    value={loadN}
                    onChange={e => setLoadN(e.target.value)}
                    className="h-11 rounded-xl text-center font-bold"
                    disabled={submitting}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CARD 5: EVIDENCE IMAGE CAPTURE */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
            <Camera className="h-4.5 w-4.5 text-indigo-650" />
            <h3 className="text-sm font-bold text-slate-800">
              {isPainter ? "3. Painting Site Photo" : "5. DTR Photographic Verification"}
            </h3>
          </div>
          <CardContent className="p-5 space-y-4">
            <input 
              ref={fileRef} 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} 
            />
            
            {cameraOn ? (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                  <Button type="button" onClick={capturePhoto} className="bg-red-600 hover:bg-red-700 text-white rounded-full h-12 px-6">
                    Capture
                  </Button>
                  <Button type="button" variant="secondary" onClick={stopCamera} className="rounded-full h-12 px-6">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-14 rounded-2xl border-dashed border-slate-300 hover:bg-slate-50 flex items-center justify-center"
                  onClick={startCamera} 
                  disabled={uploading || submitting}
                >
                  <Camera className="h-5 w-5 mr-2 text-indigo-600 animate-pulse" />
                  Capture Photo
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-14 rounded-2xl border-dashed border-slate-300 hover:bg-slate-50 flex items-center justify-center"
                  onClick={() => fileRef.current?.click()} 
                  disabled={uploading || submitting}
                >
                  <Upload className="h-5 w-5 mr-2 text-blue-600" />
                  Upload Photo
                </Button>
              </div>
            )}

            {/* Preview image */}
            {(previewUrl || imageUrl) && !cameraOn && (
              <div className="relative rounded-2xl overflow-hidden border mt-3 max-h-64 bg-slate-100 flex items-center justify-center">
                <img 
                  src={previewUrl || getGoogleDriveDirectLink(imageUrl)} 
                  alt="DTR evidence" 
                  className={`max-h-64 object-contain ${uploading ? 'opacity-40' : ''}`} 
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/20">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remarks Card */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl">
          <div className="px-5 py-4 border-b bg-slate-50/50 rounded-t-2xl">
            <Label htmlFor="remarks" className="text-sm font-bold text-slate-800">Inspection Notes / Remarks</Label>
          </div>
          <CardContent className="p-5">
            <Textarea
              id="remarks"
              placeholder="Enter additional remarks or observations regarding DTR physical state..."
              rows={3}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="rounded-xl resize-none"
              disabled={submitting}
            />
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 rounded-xl text-slate-700 border-slate-200"
          onClick={onCancel}
          disabled={submitting || uploading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-[2] h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100 flex items-center justify-center"
          onClick={handleSubmit}
          disabled={submitting || uploading}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Saving updates...
            </>
          ) : (
            "Save Verification"
          )}
        </Button>
      </div>
    </div>
  )
}
