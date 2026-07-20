"use client"

import { useState, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, ArrowUpFromLine, Plus, Trash2, Camera, Upload, Package, AlertTriangle } from "lucide-react"
import type { Material, MaterialStock } from "@/lib/material-types"

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

interface Props {
  catalogue: Material[]
  stock: MaterialStock[]
  onSuccess: (issueId?: string) => void
  onCancel: () => void
}

export function MaterialIssueForm({ catalogue, stock, onSuccess, onCancel }: Props) {
  const [items, setItems] = useState<{ materialId: string; quantity: number }[]>([])
  const [recipientName, setRecipientName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [issueDate, setIssueDate] = useState(() => {
    const d = new Date()
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`
  })
  const [remarks, setRemarks] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form add-item states
  const [tempMaterialId, setTempMaterialId] = useState("")
  const [tempQuantity, setTempQuantity] = useState("")
  const [tempSearch, setTempSearch] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedTempMat = catalogue.find(m => m.materialId === tempMaterialId)
  const selectedStock = stock.find(s => s.materialId === tempMaterialId)
  const availableQty = selectedStock?.currentStock ?? 0

  // Filter catalogue to only materials that are currently in stock AND not already added to the cart
  const availableMats = useMemo(() => {
    return catalogue.filter(m => {
      const s = stock.find(st => st.materialId === m.materialId)
      return s && s.currentStock > 0 && !items.some(x => x.materialId === m.materialId)
    })
  }, [catalogue, stock, items])

  const filteredMats = useMemo(() => {
    return availableMats.filter(m =>
      m.description.toLowerCase().includes(tempSearch.toLowerCase()) ||
      m.materialNo.toLowerCase().includes(tempSearch.toLowerCase())
    )
  }, [availableMats, tempSearch])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhoto(file)
      const reader = new FileReader()
      reader.onload = ev => setPhotoPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const triggerCamera = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment")
      fileInputRef.current.click()
    }
  }

  const triggerGallery = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute("capture")
      fileInputRef.current.click()
    }
  }

  const handleAddItem = () => {
    if (!tempMaterialId || !tempQuantity || parseFloat(tempQuantity) <= 0) return
    const qty = parseFloat(tempQuantity)
    if (qty > availableQty) {
      alert("Entered quantity exceeds available stock!")
      return
    }
    setItems(prev => {
      const idx = prev.findIndex(x => x.materialId === tempMaterialId)
      if (idx !== -1) {
        const copy = [...prev]
        copy[idx].quantity = Math.round((copy[idx].quantity + qty) * 1000) / 1000
        return copy
      }
      return [...prev, { materialId: tempMaterialId, quantity: qty }]
    })
    setTempMaterialId("")
    setTempQuantity("")
    setTempSearch("")
  }

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(x => x.materialId !== id))
  }

  const tempQtyNum = parseFloat(tempQuantity) || 0
  const tempOverStock = tempQtyNum > availableQty

  const handleSubmit = async () => {
    if (items.length === 0 || !recipientName.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("items", JSON.stringify(items))
      fd.append("recipientName", recipientName)
      fd.append("recipientDesignation", "") // Obsolete, send empty string
      fd.append("purpose", purpose)
      fd.append("issueDate", issueDate)
      fd.append("remarks", remarks)
      if (photo) fd.append("photo", photo)

      const res = await fetch("/api/material/issue", { method: "POST", body: fd })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to submit")
      const result = await res.json()

      // Reset
      setItems([])
      setRecipientName("")
      setPurpose("")
      setRemarks("")
      setPhoto(null)
      setPhotoPreview(null)
      onSuccess(result?.issueId)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 md:px-6 space-y-5 pb-28 min-w-0 overflow-x-hidden bg-[#F8FAFC]">
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
            onCancel()
          }} 
          className="rounded-full hover:bg-slate-100 h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </Button>
        <h1 className="text-xl font-bold text-slate-900 flex-1">Issue (Handover Outward)</h1>
      </div>

      {/* --- 1. RECIPIENT DETAILS CARD --- */}
      <Card className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recipient Name *</Label>
            <Input
              placeholder="e.g. Sanjay Kumar Sahoo (JE)..."
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              className="h-10 rounded-xl border-slate-200 focus-visible:ring-orange-500 text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Issue Date *</Label>
              <Input
                placeholder="DD-MM-YYYY"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="h-10 rounded-xl border-slate-200 focus-visible:ring-orange-500 text-sm font-semibold font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Purpose of Issuance *</Label>
            <Input
              placeholder="e.g. 11KV Line Maintenance, NSC Works..."
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              className="h-10 rounded-xl border-slate-200 focus-visible:ring-orange-500 text-sm font-semibold"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remarks</Label>
            <Input
              placeholder="Any additional notes..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="h-10 rounded-xl border-slate-200 focus-visible:ring-orange-500 text-sm font-semibold"
            />
          </div>
        </CardContent>
      </Card>

      {/* --- 2. EVIDENCE PHOTO CARD --- */}
      <Card className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Signature / Handover Copy Receipt</Label>
          
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handlePhotoChange}
          />

          <div className="grid grid-cols-2 gap-3">
            <Button 
              type="button" 
              variant="outline"
              className="h-11 rounded-xl border border-slate-200 text-slate-650 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50/50 flex items-center justify-center gap-2 font-bold text-xs transition-all duration-200"
              onClick={triggerCamera}
              disabled={submitting}
            >
              <Camera className="h-4.5 w-4.5 text-slate-550" />
              <span>Camera (Live)</span>
            </Button>
            <Button 
              type="button" 
              variant="outline"
              className="h-11 rounded-xl border border-slate-200 text-slate-650 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50/50 flex items-center justify-center gap-2 font-bold text-xs transition-all duration-200"
              onClick={triggerGallery}
              disabled={submitting}
            >
              <Upload className="h-4.5 w-4.5 text-slate-550" />
              <span>Gallery</span>
            </Button>
          </div>

          {photoPreview && (
            <div className="relative mt-2 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
              <img src={photoPreview} alt="Handover Evidence" className="w-full h-48 object-cover" />
              <Button 
                variant="destructive" 
                size="sm" 
                className="absolute top-2 right-2 text-xs h-7 rounded-lg"
                onClick={() => { setPhoto(null); setPhotoPreview(null) }}
              >
                Remove
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- 3. SELECT MATERIAL CARD --- */}
      <Card className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Select Item (in stock)</Label>
            {!selectedTempMat ? (
              <div className="space-y-2">
                <Input
                  placeholder="Type description or number to search..."
                  value={tempSearch}
                  onChange={e => setTempSearch(e.target.value)}
                  className="h-10 rounded-xl border-slate-200 focus-visible:ring-orange-500 text-sm font-semibold"
                />
                <div className="max-h-40 overflow-y-auto border border-slate-100 bg-white rounded-xl divide-y shadow-inner">
                  {filteredMats.slice(0, 10).map(m => {
                    const s = stock.find(st => st.materialId === m.materialId)
                    return (
                      <button
                        key={m.materialId}
                        onClick={() => { setTempMaterialId(m.materialId); setTempSearch("") }}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50/30 transition-colors text-xs flex items-center gap-2.5"
                      >
                        {m.photoUrl ? (
                          <img src={getGoogleDriveDirectLink(m.photoUrl)} alt="" className="h-7 w-7 rounded object-cover border bg-gray-50 shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded border bg-gray-50 flex items-center justify-center shrink-0 text-gray-400">
                            <Package className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-900 truncate">{m.description}</p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">{m.materialNo || m.materialId}</p>
                          </div>
                          <Badge className="bg-orange-100 text-orange-800 text-[10px] shrink-0 border border-orange-200">
                            {s?.currentStock ?? 0} {m.unit} in stock
                          </Badge>
                        </div>
                      </button>
                    )
                  })}
                  {filteredMats.length === 0 && (
                    <p className="text-center py-4 text-xs text-gray-400">No matching items in stock</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-orange-50/40 rounded-xl p-3 border border-orange-100 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {selectedTempMat.photoUrl ? (
                    <img src={getGoogleDriveDirectLink(selectedTempMat.photoUrl)} alt="" className="h-8 w-8 rounded object-cover border bg-white shrink-0" />
                  ) : (
                    <div className="h-8 w-8 rounded border bg-white flex items-center justify-center shrink-0 text-gray-400">
                      <Package className="h-4.5 w-4.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-orange-950 truncate">{selectedTempMat.description}</p>
                    <p className="text-[10px] text-orange-700 font-mono mt-0.5">{selectedTempMat.materialNo || selectedTempMat.materialId} · {selectedTempMat.unit}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-3 ml-2">
                  <div className="text-[10px] text-gray-500 font-semibold bg-white border px-2 py-1 rounded-md">
                    Stock: {availableQty} {selectedTempMat.unit}
                  </div>
                  <Button variant="ghost" size="sm" className="text-[10px] h-7 text-orange-800 bg-white border border-orange-250 hover:bg-orange-100/50 rounded-lg shrink-0" onClick={() => setTempMaterialId("")}>Change</Button>
                </div>
              </div>
            )}
          </div>

          {selectedTempMat && (
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quantity to Issue ({selectedTempMat.unit})</Label>
                <Input
                  type="number"
                  placeholder={`Max: ${availableQty}`}
                  value={tempQuantity}
                  onChange={e => setTempQuantity(e.target.value)}
                  className={`h-10 rounded-xl border-slate-200 focus-visible:ring-orange-500 text-sm font-semibold ${tempOverStock ? "border-red-500 text-red-600 focus-visible:ring-red-550" : ""}`}
                />
              </div>
              <Button
                onClick={handleAddItem}
                disabled={!tempQuantity || parseFloat(tempQuantity) <= 0 || tempOverStock}
                className="bg-orange-600 hover:bg-orange-700 text-white h-10 rounded-xl px-4 flex gap-1 shadow-sm font-bold text-xs"
              >
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>
          )}

          {tempOverStock && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-2.5 text-[10px] flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Quantity exceeds available stock of {availableQty} {selectedTempMat?.unit}.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- 4. CART LIST CARD --- */}
      <Card className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
            <span>Selected Items List</span>
            <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded-full text-slate-650 font-bold">{items.length} items</span>
          </Label>
          {items.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400">
              <Package className="h-8 w-8 mx-auto opacity-20 mb-2" />
              No items added yet.
            </div>
          ) : (
            <div className="border border-slate-100 rounded-xl divide-y bg-white overflow-hidden">
              {items.map((item, idx) => {
                const m = catalogue.find(x => x.materialId === item.materialId)
                return (
                  <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50/50">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                      {m?.photoUrl ? (
                        <img src={getGoogleDriveDirectLink(m.photoUrl)} alt="" className="h-8 w-8 rounded object-cover border bg-gray-50 shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded border bg-gray-50 flex items-center justify-center shrink-0 text-gray-400">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">{m?.description || "Unknown"}</p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{m?.materialNo || m?.materialId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border text-xs">{item.quantity} {m?.unit}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                        onClick={() => handleRemoveItem(item.materialId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky footer using React Portal to keep layout and styles aligned to consumer-form */}
      {typeof window !== "undefined" && createPortal(
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-[60] flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button
            variant="outline"
            className="flex-1 h-12 border-gray-300 text-gray-700 text-sm font-bold rounded-xl"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
              onCancel()
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            className="flex-[2] h-12 text-sm shadow-sm bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl"
            onClick={handleSubmit}
            disabled={submitting || items.length === 0 || !recipientName.trim() || !purpose.trim()}
          >
            {submitting ? "Saving..." : "Submit Handover"}
          </Button>
        </div>,
        document.body
      )}

    </div>
  )
}
