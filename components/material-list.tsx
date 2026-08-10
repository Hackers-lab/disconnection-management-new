"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import {
  Package, Search, Plus, ArrowDownToLine, ArrowUpFromLine,
  ListChecks, Loader2, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Trash2,
  FileDown, FileSpreadsheet, Eye, Settings, AlertTriangle, ArrowLeft,
  Pencil, Check, MoreVertical, X, ImageIcon, Printer
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { Material, MaterialStock, MaterialReceive, MaterialIssue } from "@/lib/material-types"
import { MATERIAL_CATEGORIES } from "@/lib/material-types"
import { MaterialReceiveForm } from "./material-receive-form"
import { MaterialIssueForm } from "./material-issue-form"
import { MaterialHistoryDialog } from "./material-history-dialog"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const CACHE_KEY = "material_data_cache"

type MainView = "menu" | "stock" | "settings" | "receive" | "issue"
type SettingsSubTab = "catalogue" | "transactions"

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
  userRole: string
  userAgencies: string[]
  username: string
  permissions?: Record<string, string[]>
}

export function MaterialList({ userRole, userAgencies, username, permissions }: Props) {
  const { toast } = useToast()
  const [view, setView] = useHashState<MainView>("material", "menu")
  const [settingsTab, setSettingsTab] = useState<SettingsSubTab>("catalogue")

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [showOutOfStock, setShowOutOfStock] = useState(false)
 
  // Stock sub-tabs & filters
  const [stockSubTab, setStockSubTab] = useState<"register" | "history">("register")
  const [historyMaterialFilter, setHistoryMaterialFilter] = useState<string>("all")
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"all" | "receive" | "issue">("all")
  const [historySearch, setHistorySearch] = useState("")
  const [historyPage, setHistoryPage] = useState(1)

  // Data
  const [stock, setStock] = useState<MaterialStock[]>([])
  const [catalogue, setCatalogue] = useState<Material[]>([])
  const [receives, setReceives] = useState<MaterialReceive[]>([])
  const [issues, setIssues] = useState<MaterialIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<"idle" | "loading" | "updated">("loading")
  const [error, setError] = useState<string | null>(null)

  // Dialogs
  const [historyMaterial, setHistoryMaterial] = useState<MaterialStock | null>(null)
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null)

  // Add material states
  const [newMatDesc, setNewMatDesc] = useState("")
  const [newMatNo, setNewMatNo] = useState("")
  const [newMatUnit, setNewMatUnit] = useState("nos")
  const [newMatCategory, setNewMatCategory] = useState("Other")
  const [newMatThreshold, setNewMatThreshold] = useState("0")
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  
  const [newMatPhoto, setNewMatPhoto] = useState<File | null>(null)
  const [newMatPhotoPreview, setNewMatPhotoPreview] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startEditMaterial = (m: Material) => {
    setEditingMaterial(m)
    setNewMatDesc(m.description)
    setNewMatNo(m.materialNo || "")
    setNewMatUnit(m.unit)
    setNewMatCategory(m.category)
    setNewMatThreshold(String(m.threshold || 0))
    setNewMatPhoto(null)
    setNewMatPhotoPreview(m.photoUrl || null)
  }

  const cancelEditMaterial = () => {
    setEditingMaterial(null)
    setNewMatDesc("")
    setNewMatNo("")
    setNewMatUnit("nos")
    setNewMatCategory("Other")
    setNewMatThreshold("0")
    setNewMatPhoto(null)
    setNewMatPhotoPreview(null)
  }

  // Fine-grained permission checks for Material Management sections
  const materialPermissions = useMemo(() => {
    return permissions?.material || []
  }, [permissions])

  const hasReceiveAccess = useMemo(() => {
    return userRole === "admin" || userRole === "executive" || materialPermissions.includes("receive") || materialPermissions.includes("create")
  }, [userRole, materialPermissions])

  const hasIssueAccess = useMemo(() => {
    return userRole === "admin" || userRole === "executive" || materialPermissions.includes("issue") || materialPermissions.includes("update")
  }, [userRole, materialPermissions])

  const hasStockAccess = useMemo(() => {
    return userRole === "admin" || userRole === "executive" || materialPermissions.includes("stock") || materialPermissions.includes("read")
  }, [userRole, materialPermissions])

  const hasSettingsAccess = useMemo(() => {
    return userRole === "admin" || userRole === "executive" || materialPermissions.includes("settings") || materialPermissions.includes("delete")
  }, [userRole, materialPermissions])

  // Redirect back to menu if user accesses a view they don't have permission for
  useEffect(() => {
    if (view === "receive" && !hasReceiveAccess) {
      setView("menu")
    } else if (view === "issue" && !hasIssueAccess) {
      setView("menu")
    } else if (view === "stock" && !hasStockAccess) {
      setView("menu")
    } else if (view === "settings" && !hasSettingsAccess) {
      setView("menu")
    }
  }, [view, hasReceiveAccess, hasIssueAccess, hasStockAccess, hasSettingsAccess, setView])

  const canWrite = userRole === "admin" || userRole === "executive"

  // ── Caching & Fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false, force = false) => {
    if (!silent) setSyncState("loading")
    try {
      setError(null)
      
      // Try local cache hit (unless forcing a hard reload)
      if (!force) {
        const cached = await getFromCache<any>(CACHE_KEY)
        if (cached && !silent) {
          setStock(cached.stock || [])
          setCatalogue(cached.catalogue || [])
          setReceives(cached.receives || [])
          setIssues(cached.issues || [])
          setLoading(false)
        }
      }

      // 2. Fetch fresh
      const revalQuery = force ? "?revalidate=true" : ""
      const [stockRes, receiveRes, issueRes] = await Promise.all([
        fetch(`/api/material${revalQuery}`),
        fetch(`/api/material/receive${revalQuery}`),
        fetch(`/api/material/issue${revalQuery}`),
      ])

      let freshStock: MaterialStock[] = []
      let freshCatalogue: Material[] = []
      let freshReceives: MaterialReceive[] = []
      let freshIssues: MaterialIssue[] = []

      if (stockRes.ok) {
        const data = await stockRes.json()
        freshStock = data.stock || []
        freshCatalogue = data.catalogue || []
        setStock(freshStock)
        setCatalogue(freshCatalogue)
      }
      if (receiveRes.ok) {
        freshReceives = await receiveRes.json()
        setReceives(freshReceives)
      }
      if (issueRes.ok) {
        freshIssues = await issueRes.json()
        setIssues(freshIssues)
      }

      // 3. Update cache
      await saveToCache(CACHE_KEY, {
        stock: freshStock,
        catalogue: freshCatalogue,
        receives: freshReceives,
        issues: freshIssues,
      })

      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 2500)
    } catch (e: any) {
      setError(e.message || "Failed to load fresh material data")
      setSyncState("idle")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePrintSlip = (issueId: string) => {
    const itemsToPrint = issues.filter(i => i.issueId === issueId)
    if (itemsToPrint.length === 0) {
      toast({ title: "No items found for this Issue ID" })
      return
    }

    const first = itemsToPrint[0]
    const win = window.open("", "_blank")
    if (!win) {
      alert("Pop-up blocked. Please allow pop-ups.")
      return
    }

    const rows = itemsToPrint.map((item, idx) => `
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 10px; text-align: center;">${idx + 1}</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px; font-family: monospace; font-weight: bold;">${item.materialId}</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px; font-weight: 600;">${item.materialDesc}</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px; text-align: right; font-weight: bold; color: #c2410c;">${item.quantity} ${item.unit}</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px; font-style: italic; color: #64748b;">${item.remarks || "—"}</td>
      </tr>
    `).join("")

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Store Requisition & Issue Note (SRIN)</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 40px; color: #1e293b; background-color: #fff; font-size: 13px; line-height: 1.5; }
          .container { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 30px; }
          .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #0f172a; padding-bottom: 15px; }
          .header h1 { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; }
          .header h2 { font-size: 12px; color: #64748b; margin-top: 5px; font-weight: 600; }
          .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 25px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 15px; }
          .meta-item { display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; }
          .meta-item:last-child { border-bottom: none; }
          .meta-label { font-weight: 700; color: #475569; text-transform: uppercase; font-size: 11px; }
          .meta-value { font-weight: 600; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #0f172a; color: #fff; padding: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #0f172a; }
          .footer-signs { display: flex; justify-content: space-between; margin-top: 60px; gap: 20px; }
          .sign-box { flex: 1; text-align: center; }
          .sign-line { width: 100%; border-top: 1px solid #0f172a; margin: 45px auto 8px; }
          .sign-title { font-weight: 700; font-size: 11px; color: #475569; text-transform: uppercase; }
          .sign-subtitle { font-size: 10px; color: #94a3b8; margin-top: 2px; }
          .notice { background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; padding: 10px 15px; font-size: 11px; margin-bottom: 25px; border-radius: 8px; font-weight: 500; display: flex; gap: 10px; align-items: center; }
          @media print {
            body { padding: 0; }
            .container { border: none; padding: 0; }
            .no-print { display: none; }
            @page { size: A4 portrait; margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Store Requisition & Issue Note</h1>
            <h2>SRIN • Material Management Slip</h2>
          </div>
          
          <div class="notice">
            <span>⚠️</span>
            <span>Important: This note must be filed and registered at the central store database. Obtain all physical signatures before dispatch.</span>
          </div>

          <div class="meta-grid">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div class="meta-item">
                <span class="meta-label">Requisition ID:</span>
                <span class="meta-value" style="font-family: monospace; color: #2563eb;">${first.issueId}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Recipient Name:</span>
                <span class="meta-value">${first.recipientName}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Purpose:</span>
                <span class="meta-value">${first.purpose || "—"}</span>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div class="meta-item">
                <span class="meta-label">Date of Issue:</span>
                <span class="meta-value">${first.issueDate}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Issued By (User):</span>
                <span class="meta-value">${first.issuedBy}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Print Time:</span>
                <span class="meta-value">${new Date().toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th style="width: 120px;">Material No</th>
                <th>Material Description</th>
                <th style="width: 100px; text-align: right;">Quantity</th>
                <th style="width: 200px;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="footer-signs">
            <div class="sign-box">
              <div class="sign-line"></div>
              <div class="sign-title">Issued By</div>
              <div class="sign-subtitle">(Store Keeper / Clerk)</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div class="sign-title">Received By</div>
              <div class="sign-subtitle">(Recipient Signature)</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div class="sign-title">Authorized By</div>
              <div class="sign-subtitle">(Officer-in-Charge)</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.focus();
            window.print();
          }
        </script>
      </body>
      </html>
    `)
    win.document.close()
  }

  // ── Filters & Search ───────────────────────────────────────────────────────────
  const q = search.toLowerCase()

  const filteredStock = useMemo(() =>
    stock.filter(s => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false
      if (!q) return true
      return s.description.toLowerCase().includes(q) ||
             s.materialNo.toLowerCase().includes(q) ||
             s.category.toLowerCase().includes(q)
    })
  , [stock, q, categoryFilter])

  const { inStockItems, outOfStockItems } = useMemo(() => {
    const inStock: MaterialStock[] = []
    const outStock: MaterialStock[] = []
    filteredStock.forEach(s => {
      if (s.currentStock === 0) {
        outStock.push(s)
      } else {
        inStock.push(s)
      }
    })
    return { inStockItems: inStock, outOfStockItems: outStock }
  }, [filteredStock])

  const filteredCatalogue = useMemo(() =>
    catalogue.filter(m => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false
      if (!q) return true
      return m.description.toLowerCase().includes(q) ||
             m.materialNo.toLowerCase().includes(q)
    })
  , [catalogue, q, categoryFilter])

  const filteredReceives = useMemo(() =>
    receives.filter(r => {
      if (!q) return true
      return r.materialDesc.toLowerCase().includes(q) ||
             r.receiveId.toLowerCase().includes(q) ||
             r.challanRef.toLowerCase().includes(q) ||
             r.receivedFrom.toLowerCase().includes(q)
    })
  , [receives, q])

  const filteredIssues = useMemo(() =>
    issues.filter(i => {
      if (!q) return true
      return i.materialDesc.toLowerCase().includes(q) ||
             i.issueId.toLowerCase().includes(q) ||
             i.recipientName.toLowerCase().includes(q) ||
             i.purpose.toLowerCase().includes(q)
    })
  , [issues, q])

  // ── Unified Stock Transaction Ledger ──────────────────────────────────────────
  const unifiedHistory = useMemo(() => {
    const allReceives = receives.map(r => ({
      type: "receive" as const,
      id: r.receiveId,
      date: r.receivedDate,
      materialId: r.materialId,
      materialDesc: r.materialDesc,
      quantity: r.quantity,
      unit: r.unit,
      by: r.createdBy,
      ref: r.challanRef || "—",
      party: r.receivedFrom,
      remarks: r.remarks,
      photoUrl: r.photoUrl
    }))

    const allIssues = issues.map(i => ({
      type: "issue" as const,
      id: i.issueId,
      date: i.issueDate,
      materialId: i.materialId,
      materialDesc: i.materialDesc,
      quantity: i.quantity,
      unit: i.unit,
      by: i.issuedBy,
      ref: i.purpose || "—",
      party: i.recipientName,
      remarks: i.remarks,
      photoUrl: i.photoUrl
    }))

    const combined = [...allReceives, ...allIssues]

    // Sort chronologically: newest first (date format DD-MM-YYYY)
    const parseDate = (d: string) => {
      if (!d) return 0
      const [dd, mm, yy] = d.split("-").map(Number)
      return new Date(yy, mm - 1, dd).getTime()
    }
    combined.sort((a, b) => parseDate(b.date) - parseDate(a.date))
    return combined
  }, [receives, issues])

  // Filtered unified history for the ledger sub-tab
  const filteredUnifiedHistory = useMemo(() => {
    let list = unifiedHistory

    // Material Filter
    if (historyMaterialFilter !== "all") {
      list = list.filter(h => h.materialId === historyMaterialFilter)
    }

    // Type Filter
    if (historyTypeFilter !== "all") {
      list = list.filter(h => h.type === historyTypeFilter)
    }

    // Search query
    if (historySearch) {
      const qH = historySearch.toLowerCase()
      list = list.filter(h => 
        h.materialDesc.toLowerCase().includes(qH) ||
        h.id.toLowerCase().includes(qH) ||
        h.party.toLowerCase().includes(qH) ||
        h.ref.toLowerCase().includes(qH) ||
        h.by.toLowerCase().includes(qH) ||
        (h.remarks && h.remarks.toLowerCase().includes(qH))
      )
    }

    return list
  }, [unifiedHistory, historyMaterialFilter, historyTypeFilter, historySearch])

  // Calculate summary metrics for unified ledger
  const ledgerMetrics = useMemo(() => {
    if (historyMaterialFilter !== "all") {
      // Find material unit and details
      const matStock = stock.find(s => s.materialId === historyMaterialFilter)
      const unit = matStock?.unit || "nos"
      const currentStock = matStock?.currentStock || 0
      const threshold = matStock?.threshold || 0
      
      const matHistory = unifiedHistory.filter(h => h.materialId === historyMaterialFilter)
      const totalRec = matHistory.filter(h => h.type === "receive").reduce((acc, curr) => acc + curr.quantity, 0)
      const totalIss = matHistory.filter(h => h.type === "issue").reduce((acc, curr) => acc + curr.quantity, 0)

      return {
        isMaterialSelected: true,
        unit,
        currentStock,
        threshold,
        totalReceived: totalRec,
        totalIssued: totalIss
      }
    } else {
      // Global metrics
      const totalRec = unifiedHistory.filter(h => h.type === "receive").length
      const totalIss = unifiedHistory.filter(h => h.type === "issue").length
      return {
        isMaterialSelected: false,
        unit: "",
        currentStock: 0,
        threshold: 0,
        totalReceived: totalRec, // Count of transactions
        totalIssued: totalIss    // Count of transactions
      }
    }
  }, [unifiedHistory, historyMaterialFilter, stock])

  const HISTORY_PAGE_SIZE = 15
  const totalHistoryPages = Math.ceil(filteredUnifiedHistory.length / HISTORY_PAGE_SIZE)
  const paginatedHistory = useMemo(() => {
    return filteredUnifiedHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)
  }, [filteredUnifiedHistory, historyPage])

  useEffect(() => {
    setHistoryPage(1)
  }, [historyMaterialFilter, historyTypeFilter, historySearch])

  // ── Add/Edit Catalogue Item ───────────────────────────────────────────────────
  const handleAddMaterial = async () => {
    if (!newMatDesc.trim()) return
    setAddingMaterial(true)
    try {
      const isEdit = !!editingMaterial
      const url = "/api/material/catalogue"
      const method = isEdit ? "PUT" : "POST"
      
      const fd = new FormData()
      if (editingMaterial) {
        fd.append("materialId", editingMaterial.materialId)
      }
      fd.append("materialNo", newMatNo.trim())
      fd.append("description", newMatDesc.trim())
      fd.append("unit", newMatUnit)
      fd.append("category", newMatCategory)
      fd.append("threshold", newMatThreshold)
      
      if (newMatPhoto) {
        fd.append("photo", newMatPhoto)
      } else if (editingMaterial && editingMaterial.photoUrl) {
        fd.append("existingPhotoUrl", editingMaterial.photoUrl)
      }

      const res = await fetch(url, {
        method,
        body: fd,
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
      
      cancelEditMaterial()
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAddingMaterial(false)
    }
  }

  // ── Delete Transactions ───────────────────────────────────────────────────────
  const handleDeleteReceive = async (receiveId: string) => {
    if (!confirm("Are you sure you want to delete this receive transaction? This will restore stock levels.")) return
    try {
      const res = await fetch(`/api/material/receive?receiveId=${receiveId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleDeleteIssue = async (issueId: string) => {
    if (!confirm("Are you sure you want to delete this issue transaction? This will return materials to stock.")) return
    try {
      const res = await fetch(`/api/material/issue?issueId=${issueId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleDeleteCatalogueItem = async (materialId: string) => {
    if (!confirm("Are you sure you want to delete this material from the catalogue?")) return
    try {
      const res = await fetch(`/api/material/catalogue?materialId=${materialId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    }
  }

  // ── Reports ───────────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()

      // Sheet 1: Stock Register
      const stockRows = stock.map((s, idx) => ({
        "S.No": idx + 1,
        "Material ID": s.materialId,
        "Material No": s.materialNo || "—",
        "Description": s.description,
        "Category": s.category,
        "Total Received": s.totalReceived,
        "Total Issued": s.totalIssued,
        "Available Stock": s.currentStock,
        "Unit": s.unit,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows), "Stock Register")

      // Sheet 2: Received Receipts
      const recvRows = receives.map((r, idx) => ({
        "S.No": idx + 1,
        "Challan / Receive ID": r.receiveId,
        "Material ID": r.materialId,
        "Description": r.materialDesc,
        "Qty": r.quantity,
        "Unit": r.unit,
        "Challan Ref": r.challanRef || "—",
        "Date Received": r.receivedDate,
        "Source / Received From": r.receivedFrom,
        "Recorded By": r.createdBy,
        "Remarks": r.remarks || "—",
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recvRows), "Received History")

      // Sheet 3: Issued Receipts
      const issueRows = issues.map((i, idx) => ({
        "S.No": idx + 1,
        "Issue ID": i.issueId,
        "Material ID": i.materialId,
        "Description": i.materialDesc,
        "Qty": i.quantity,
        "Unit": i.unit,
        "Recipient Name": i.recipientName,
        "Recipient Designation": i.recipientDesignation || "—",
        "Purpose": i.purpose || "—",
        "Date Issued": i.issueDate,
        "Issued By": i.issuedBy,
        "Remarks": i.remarks || "—",
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issueRows), "Issued History")

      XLSX.writeFile(wb, `Material_Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      console.error(e)
      alert("Failed to export Excel report")
    }
  }

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const doc = new jsPDF({ orientation: "landscape" })
      doc.setFontSize(14)
      doc.setTextColor(30, 41, 59)
      doc.text("Office Store Material Stock Register", 14, 15)

      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")} · User: ${username}`, 14, 20)

      const headers = [["Material ID", "Material No", "Description", "Category", "Unit", "Total Inward", "Total Outward", "Available Stock"]]
      const body = stock.map(s => [
        s.materialId,
        s.materialNo || "—",
        s.description,
        s.category,
        s.unit,
        s.totalReceived.toString(),
        s.totalIssued.toString(),
        s.currentStock.toString()
      ])

      autoTable(doc, {
        startY: 24,
        head: headers,
        body: body,
        styles: { fontSize: 7.5, font: "helvetica" },
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: { 2: { cellWidth: 80 } }
      })

      doc.save(`Material_Stock_Register_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error(e)
      alert("Failed to export PDF report")
    }
  }

  if (loading && stock.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          <p className="text-sm text-gray-500">Loading store inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* ── HEADER ── */}
      {view !== "receive" && view !== "issue" && (
        <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-4">
          <div className="flex items-center gap-2">
            {view !== "menu" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setView("menu")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 leading-none">
                <Package className="h-6 w-6 text-amber-600" />
                {view === "menu" && "Material Management"}
                {view === "stock" && "Stock Register"}
                {view === "settings" && "Settings"}
              </h2>
              <p className="text-[11px] text-gray-500 mt-1">
                {view === "menu" && "Store stock keeping, challan inward entry, and tool/material issues."}
                {view === "stock" && "View balance stock and activity timelines."}
                {view === "settings" && "Manage item catalogue lists and delete logs."}
              </p>
            </div>
          </div>
          <div />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── 1. MAIN MENU PANEL ── */}
      {view === "menu" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          {/* Receive Card */}
          {hasReceiveAccess && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-emerald-200 hover:bg-emerald-50/20 cursor-pointer overflow-hidden group"
              onClick={() => setView("receive")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 transition group-hover:scale-105">
                  <ArrowDownToLine className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Receive Material</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Challan Inward entry (Multi-item)</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Issue Card */}
          {hasIssueAccess && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-orange-200 hover:bg-orange-50/20 cursor-pointer overflow-hidden group"
              onClick={() => setView("issue")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 transition group-hover:scale-105">
                  <ArrowUpFromLine className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Issue Material</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Handover to recipient (Multi-item)</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stock Card */}
          {hasStockAccess && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-amber-200 hover:bg-amber-50/20 cursor-pointer overflow-hidden group col-span-1"
              onClick={() => setView("stock")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 transition group-hover:scale-105">
                  <Package className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Stock Register</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">View balance stock & histories</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Settings Card */}
          {hasSettingsAccess && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-gray-300 hover:bg-gray-50/50 cursor-pointer overflow-hidden group col-span-1"
              onClick={() => setView("settings")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 transition group-hover:scale-105">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Settings</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Manage catalogue & clear errors</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── 2. STOCK REGISTER VIEW ── */}
      {view === "stock" && (
        <div className="space-y-4">
          {/* Sub Tab Selector */}
          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setStockSubTab("register")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
                stockSubTab === "register"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 bg-slate-50/50 hover:bg-slate-100"
              }`}
            >
              📦 Current Stock Register
            </button>
            <button
              onClick={() => setStockSubTab("history")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
                stockSubTab === "history"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 bg-slate-50/50 hover:bg-slate-100"
              }`}
            >
              ⏳ Transaction History / Ledger
            </button>
          </div>

          {stockSubTab === "register" ? (
            <>
              {/* Controls Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search description or code..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 pr-8 rounded-xl h-9 text-sm"
                  />
                  {search && (
                    <X 
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" 
                      onClick={() => setSearch("")} 
                    />
                  )}
                </div>

                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="h-9 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold hover:bg-gray-100 transition-colors shrink-0 outline-none"
                >
                  <option value="all">All Categories</option>
                  {MATERIAL_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchData(true, true)}
                  disabled={syncState === "loading"}
                  className="shrink-0 rounded-xl h-9 w-9 p-0 bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors"
                  title="Refresh stock data"
                >
                  <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin text-blue-500" : "text-gray-600"}`} />
                </Button>

                <div className="relative">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="shrink-0 rounded-xl h-9 w-9 p-0 bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors"
                    title="Export Options"
                  >
                    <MoreVertical className="h-4 w-4 text-gray-600" />
                  </Button>
                  {showExportMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                      <div className="absolute right-0 mt-1.5 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 text-xs">
                        <button
                          onClick={() => { exportExcel(); setShowExportMenu(false) }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 font-medium text-gray-700"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
                        </button>
                        <button
                          onClick={() => { exportPDF(); setShowExportMenu(false) }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 font-medium text-gray-700"
                        >
                          <FileDown className="h-3.5 w-3.5 text-blue-600" /> Export PDF
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Stock Table */}
              <Card className="overflow-hidden border border-gray-200">
                <Table>
                  <TableHeader className="bg-slate-900 hover:bg-slate-900">
                    <TableRow>
                      <TableHead className="text-xs text-white">Item Name</TableHead>
                      <TableHead className="text-xs text-white text-right">Available Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inStockItems.map((s, idx) => {
                      const isLow = s.currentStock < s.threshold
                      const stockColor = isLow ? "text-red-600 font-bold" : "text-gray-900 font-semibold"
                      return (
                        <TableRow key={`${s.materialId}-${idx}`} className="hover:bg-slate-50/50">
                          <TableCell className="text-xs flex items-center gap-2">
                            {s.photoUrl ? (
                              <img 
                                src={getGoogleDriveDirectLink(s.photoUrl)} 
                                alt="" 
                                className="h-7 w-7 rounded-lg object-cover border bg-gray-50 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPreviewImage({ url: getGoogleDriveDirectLink(s.photoUrl || ""), title: s.description })
                                }}
                              />
                            ) : (
                              <div className="h-7 w-7 rounded-lg border bg-gray-50 flex items-center justify-center flex-shrink-0 text-gray-400">
                                <Package className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <span 
                              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                              onClick={() => setHistoryMaterial(s)}
                            >
                              {s.description}
                            </span>
                          </TableCell>
                          <TableCell className={`text-xs text-right ${stockColor}`}>
                            <span className={isLow ? "bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block" : ""}>
                              {s.currentStock} {s.unit}
                            </span>
                            {isLow && (
                              <span className="block text-[9px] text-red-500 font-medium mt-0.5">
                                Min Threshold: {s.threshold}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}

                    {outOfStockItems.length > 0 && (
                      <>
                        <TableRow 
                          className="bg-slate-50 hover:bg-slate-100 cursor-pointer select-none border-t border-b font-semibold"
                          onClick={() => setShowOutOfStock(!showOutOfStock)}
                        >
                          <TableCell colSpan={2} className="text-xs py-2.5 px-4">
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2 text-slate-700">
                                {showOutOfStock ? (
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-500" />
                                )}
                                <span>Out of Stock Items ({outOfStockItems.length})</span>
                              </div>
                              <span className="text-[10px] bg-slate-200/80 text-slate-650 px-2 py-0.5 rounded-full font-mono font-medium">
                                {showOutOfStock ? "Click to collapse" : "Click to expand"}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>

                        {showOutOfStock && outOfStockItems.map((s, idx) => {
                          const isLow = s.currentStock < s.threshold
                          const stockColor = isLow ? "text-red-600 font-bold" : "text-gray-900 font-semibold"
                          return (
                            <TableRow key={`out-${s.materialId}-${idx}`} className="hover:bg-slate-50/50 bg-red-50/10">
                              <TableCell className="text-xs flex items-center gap-2 pl-6">
                                {s.photoUrl ? (
                                  <img 
                                    src={getGoogleDriveDirectLink(s.photoUrl)} 
                                    alt="" 
                                    className="h-7 w-7 rounded-lg object-cover border bg-gray-50 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPreviewImage({ url: getGoogleDriveDirectLink(s.photoUrl || ""), title: s.description })
                                    }}
                                  />
                                ) : (
                                  <div className="h-7 w-7 rounded-lg border bg-gray-50 flex items-center justify-center flex-shrink-0 text-gray-400">
                                    <Package className="h-3.5 w-3.5" />
                                  </div>
                                )}
                                <span 
                                  className="text-blue-655 hover:text-blue-855 hover:underline cursor-pointer font-semibold"
                                  onClick={() => setHistoryMaterial(s)}
                                >
                                  {s.description}
                                </span>
                              </TableCell>
                              <TableCell className={`text-xs text-right ${stockColor}`}>
                                <span className="bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block text-red-600">
                                  {s.currentStock} {s.unit}
                                </span>
                                {isLow && (
                                  <span className="block text-[9px] text-red-500 font-medium mt-0.5">
                                    Min Threshold: {s.threshold}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </>
                    )}

                    {filteredStock.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-10 text-xs text-gray-400">
                          No matching material stock found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          ) : (
            <>
              {/* History Ledger Controls Bar */}
              <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search recipient, challan, remarks..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="pl-10 pr-8 rounded-xl h-9 text-sm bg-white"
                  />
                  {historySearch && (
                    <X 
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" 
                      onClick={() => setHistorySearch("")} 
                    />
                  )}
                </div>

                {/* Material Filter */}
                <select
                  value={historyMaterialFilter}
                  onChange={e => setHistoryMaterialFilter(e.target.value)}
                  className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold hover:bg-gray-55 transition-colors shrink-0 outline-none max-w-[250px]"
                >
                  <option value="all">All Materials</option>
                  {catalogue.map(m => (
                    <option key={m.materialId} value={m.materialId}>{m.description} {m.materialNo ? `(${m.materialNo})` : ""}</option>
                  ))}
                </select>

                {/* Type Filter */}
                <select
                  value={historyTypeFilter}
                  onChange={e => setHistoryTypeFilter(e.target.value as any)}
                  className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold hover:bg-gray-55 transition-colors shrink-0 outline-none w-[130px]"
                >
                  <option value="all">All Types</option>
                  <option value="receive">📥 Inward (Receive)</option>
                  <option value="issue">📤 Outward (Issue)</option>
                </select>
              </div>

              {/* Ledger Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    {ledgerMetrics.isMaterialSelected ? "Total Inward (Received)" : "Inward Entries"}
                  </span>
                  <p className="text-2xl font-bold mt-1 text-emerald-600">
                    {ledgerMetrics.isMaterialSelected 
                      ? `${ledgerMetrics.totalReceived} ${ledgerMetrics.unit}` 
                      : `${ledgerMetrics.totalReceived} transactions`
                    }
                  </p>
                </div>
                
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    {ledgerMetrics.isMaterialSelected ? "Total Outward (Issued)" : "Outward Entries"}
                  </span>
                  <p className="text-2xl font-bold mt-1 text-orange-600">
                    {ledgerMetrics.isMaterialSelected 
                      ? `${ledgerMetrics.totalIssued} ${ledgerMetrics.unit}` 
                      : `${ledgerMetrics.totalIssued} transactions`
                    }
                  </p>
                </div>

                {ledgerMetrics.isMaterialSelected && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm col-span-2 md:col-span-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Available Balance</span>
                      <p className={`text-2xl font-bold mt-1 ${ledgerMetrics.currentStock < ledgerMetrics.threshold ? "text-red-650" : "text-gray-900"}`}>
                        {ledgerMetrics.currentStock} {ledgerMetrics.unit}
                      </p>
                    </div>
                    {ledgerMetrics.currentStock < ledgerMetrics.threshold && (
                      <span className="text-[9px] font-bold text-red-500 block mt-1 animate-pulse">
                        ⚠️ Below safety threshold ({ledgerMetrics.threshold})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* History Ledger Cards Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column: Inward Receipts (Receive Logs) */}
                {(historyTypeFilter === "all" || historyTypeFilter === "receive") && (
                  <div className={`space-y-2.5 ${historyTypeFilter === "receive" ? "col-span-full" : ""}`}>
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5 px-1">
                      <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                      Inward Receipts (Challan Logs)
                    </p>
                    <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-2.5 space-y-2.5 max-h-[60vh] overflow-y-auto shadow-inner">
                      {filteredUnifiedHistory.filter(h => h.type === "receive").map((r, idx) => (
                        <div key={`${r.id}-${idx}`} className="p-3.5 text-xs bg-white border border-slate-100 rounded-xl space-y-1.5 relative group shadow-sm">
                          <div className="flex items-start justify-between pr-8">
                            <div>
                              <p className="font-semibold text-slate-900">{r.materialDesc}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                ID: {r.id} · Qty: <span className="font-bold text-emerald-700">+{r.quantity} {r.unit}</span>
                              </p>
                            </div>
                            {r.photoUrl && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-blue-650 hover:text-blue-855 hover:bg-blue-50 absolute top-3 right-3"
                                onClick={() => setPreviewImage({ url: getGoogleDriveDirectLink(r.photoUrl || ""), title: r.materialDesc })}
                                title="View Attached Photo"
                              >
                                <ImageIcon className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-450 border-t pt-1.5 border-dashed border-slate-100">
                            <div><span className="font-semibold text-slate-600">Challan:</span> {r.ref || "—"}</div>
                            <div><span className="font-semibold text-slate-600">From:</span> {r.party}</div>
                            <div><span className="font-semibold text-slate-600">Date:</span> {r.date}</div>
                            <div><span className="font-semibold text-slate-600">By:</span> {r.by}</div>
                          </div>
                          {r.remarks && (
                            <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 p-2 rounded-lg italic">
                              Remarks: {r.remarks}
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredUnifiedHistory.filter(h => h.type === "receive").length === 0 && (
                        <p className="text-center py-10 text-xs text-slate-450 bg-white border border-dashed rounded-xl">No inward records found</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Right Column: Outward Handovers (Issue Logs) */}
                {(historyTypeFilter === "all" || historyTypeFilter === "issue") && (
                  <div className={`space-y-2.5 ${historyTypeFilter === "issue" ? "col-span-full" : ""}`}>
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5 px-1">
                      <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
                      Outward Handovers (Issues Logs)
                    </p>
                    <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-2.5 space-y-2.5 max-h-[60vh] overflow-y-auto shadow-inner">
                      {filteredUnifiedHistory.filter(h => h.type === "issue").map((i, idx) => (
                        <div key={`${i.id}-${idx}`} className="p-3.5 text-xs bg-white border border-slate-100 rounded-xl space-y-1.5 relative group shadow-sm">
                          <div className="flex items-start justify-between pr-8">
                            <div>
                              <p className="font-semibold text-slate-900">{i.materialDesc}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                ID: {i.id} · Qty: <span className="font-bold text-orange-700">-{i.quantity} {i.unit}</span>
                              </p>
                            </div>
                            <div className="absolute top-3 right-3 flex items-center gap-1">
                              {i.photoUrl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-blue-650 hover:text-blue-855 hover:bg-blue-50"
                                  onClick={() => setPreviewImage({ url: getGoogleDriveDirectLink(i.photoUrl || ""), title: i.materialDesc })}
                                  title="View Attached Photo"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 text-slate-500 hover:text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
                                onClick={() => handlePrintSlip(i.id)}
                                title="Print Requisition Note"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-450 border-t pt-1.5 border-dashed border-slate-100">
                            <div><span className="font-semibold text-slate-600">To:</span> {i.party}</div>
                            <div><span className="font-semibold text-slate-600">Purpose:</span> {i.ref || "—"}</div>
                            <div><span className="font-semibold text-slate-600">Date:</span> {i.date}</div>
                            <div><span className="font-semibold text-slate-600">By:</span> {i.by}</div>
                          </div>
                          {i.remarks && (
                            <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 p-2 rounded-lg italic">
                              Remarks: {i.remarks}
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredUnifiedHistory.filter(h => h.type === "issue").length === 0 && (
                        <p className="text-center py-10 text-xs text-slate-450 bg-white border border-dashed rounded-xl">No outward records found</p>
                      )}
                    </div>
                  </div>
                )}

              </div>
</>
          )}
        </div>
      )}

      {/* ── 3. SETTINGS & ADMIN PANEL ── */}
      {view === "settings" && hasSettingsAccess && (
        <div className="space-y-4">
          {/* Sub Tab selector */}
          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setSettingsTab("catalogue")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                settingsTab === "catalogue" ? "bg-slate-900 text-white" : "text-gray-500 hover:text-slate-900"
              }`}
            >
              Configure Catalogue
            </button>
            <button
              onClick={() => setSettingsTab("transactions")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                settingsTab === "transactions" ? "bg-slate-900 text-white" : "text-gray-500 hover:text-slate-900"
              }`}
            >
              Delete Wrong Entries
            </button>
          </div>

          {/* Sub-view A: Manage Catalogue */}
          {settingsTab === "catalogue" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Add/Edit form */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader className="py-3.5 border-b">
                    <CardTitle className="text-sm font-bold">
                      {editingMaterial ? "Edit Material Definition" : "Add Material Definition"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Material Description *</Label>
                      <Input
                        placeholder="e.g. 11KV AAAC WSL 30SMM"
                        value={newMatDesc}
                        onChange={e => setNewMatDesc(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">SAP Code / Material No</Label>
                      <Input
                        placeholder="e.g. 592010621"
                        value={newMatNo}
                        onChange={e => setNewMatNo(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Measurement Unit</Label>
                        <select
                          value={newMatUnit}
                          onChange={e => setNewMatUnit(e.target.value)}
                          className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs"
                        >
                          <option value="nos">nos (Numbers)</option>
                          <option value="km">km (Kilometers)</option>
                          <option value="kg">kg (Kilograms)</option>
                          <option value="meters">meters</option>
                          <option value="sets">sets</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Category</Label>
                        <select
                          value={newMatCategory}
                          onChange={e => setNewMatCategory(e.target.value)}
                          className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs"
                        >
                          {MATERIAL_CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Minimum Stock Threshold</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 10"
                        value={newMatThreshold}
                        onChange={e => setNewMatThreshold(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Material Photo</Label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed rounded-xl p-3 text-center cursor-pointer hover:bg-slate-50 transition-colors flex flex-col items-center justify-center min-h-[90px] relative bg-white overflow-hidden group"
                      >
                        {newMatPhotoPreview ? (
                          <>
                            <img src={newMatPhotoPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold">
                              Change Photo
                            </div>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-5 w-5 text-gray-400 mb-1" />
                            <span className="text-[10px] text-gray-400">Drag & drop or click to upload</span>
                          </>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) {
                              setNewMatPhoto(file)
                              const reader = new FileReader()
                              reader.onload = ev => setNewMatPhotoPreview(ev.target?.result as string)
                              reader.readAsDataURL(file)
                            }
                          }}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      {editingMaterial && (
                        <Button
                          onClick={cancelEditMaterial}
                          variant="outline"
                          className="flex-1 h-9 text-xs"
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        onClick={handleAddMaterial}
                        disabled={addingMaterial || !newMatDesc.trim()}
                        className={`bg-slate-900 hover:bg-slate-800 text-white h-9 text-xs ${editingMaterial ? "flex-1" : "w-full"}`}
                      >
                        {addingMaterial ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : editingMaterial ? (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        {editingMaterial ? "Save Changes" : "Add to Catalogue"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Catalogue Table List */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Filter catalogue..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px]"
                  >
                    <option value="all">All Categories</option>
                    {MATERIAL_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <Card className="overflow-hidden border border-gray-200 max-h-[50vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="text-xs py-2 h-8">Code</TableHead>
                        <TableHead className="text-xs py-2 h-8">Description</TableHead>
                        <TableHead className="text-xs py-2 h-8">Category</TableHead>
                        <TableHead className="text-xs py-2 h-8 text-center w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCatalogue.map((m, idx) => (
                        <TableRow key={`${m.materialId}-${idx}`} className="hover:bg-slate-50/30">
                          <TableCell className="font-mono text-[11px] py-2 leading-none">
                            {m.materialNo || m.materialId}
                          </TableCell>
                          <TableCell className="text-xs py-2 font-medium flex items-center gap-2">
                            {m.photoUrl ? (
                              <img 
                                src={getGoogleDriveDirectLink(m.photoUrl)} 
                                alt="" 
                                className="h-7 w-7 rounded-lg object-cover border bg-gray-50 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPreviewImage({ url: getGoogleDriveDirectLink(m.photoUrl || ""), title: m.description })
                                }}
                              />
                            ) : (
                              <div className="h-7 w-7 rounded-lg border bg-gray-50 flex items-center justify-center flex-shrink-0 text-gray-400">
                                <Package className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <span>{m.description}</span>
                          </TableCell>
                          <TableCell className="text-[10px] py-2"><Badge variant="secondary">{m.category}</Badge></TableCell>
                          <TableCell className="py-2 text-center">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-blue-500 rounded-full hover:bg-blue-50"
                                onClick={() => startEditMaterial(m)}
                                title="Edit Material"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-500 rounded-full hover:bg-red-50"
                                onClick={() => handleDeleteCatalogueItem(m.materialId)}
                                title="Delete Material"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            </div>
          )}

          {/* Sub-view B: Deleting Incorrect Entries */}
          {settingsTab === "transactions" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Receives List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                  Inward Receipts (Challan Logs)
                </p>
                <div className="border rounded-lg bg-white divide-y max-h-[60vh] overflow-y-auto">
                  {receives.map((r, idx) => (
                    <div key={`${r.receiveId}-${idx}`} className="p-3 text-xs space-y-1.5 relative group">
                      <div className="flex items-start justify-between pr-8">
                        <div>
                          <p className="font-semibold text-gray-900">{r.materialDesc}</p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            ID: {r.receiveId} · Qty: <span className="font-bold text-emerald-700">{r.quantity} {r.unit}</span>
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 bg-white border-red-100 hover:bg-red-50 absolute top-3 right-3 opacity-80 group-hover:opacity-100"
                          onClick={() => handleDeleteReceive(r.receiveId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-gray-400">
                        <div><span className="font-medium text-gray-500">Challan:</span> {r.challanRef || "—"}</div>
                        <div><span className="font-medium text-gray-500">From:</span> {r.receivedFrom}</div>
                        <div><span className="font-medium text-gray-500">Date:</span> {r.receivedDate}</div>
                        <div><span className="font-medium text-gray-500">By:</span> {r.createdBy}</div>
                      </div>
                    </div>
                  ))}
                  {receives.length === 0 && (
                    <p className="text-center py-10 text-xs text-gray-400">No inward records found</p>
                  )}
                </div>
              </div>

              {/* Issues List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
                  Outward Handovers (Issues Logs)
                </p>
                <div className="border rounded-lg bg-white divide-y max-h-[60vh] overflow-y-auto">
                  {issues.map((i, idx) => (
                    <div key={`${i.issueId}-${idx}`} className="p-3 text-xs space-y-1.5 relative group">
                      <div className="flex items-start justify-between pr-8">
                        <div>
                          <p className="font-semibold text-gray-900">{i.materialDesc}</p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            ID: {i.issueId} · Qty: <span className="font-bold text-orange-700">-{i.quantity} {i.unit}</span>
                          </p>
                        </div>
                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
                            onClick={() => handlePrintSlip(i.issueId)}
                            title="Print Requisition Note"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {canWrite && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700 bg-white border-red-100 hover:bg-red-50"
                              onClick={() => handleDeleteIssue(i.issueId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-gray-400">
                        <div><span className="font-medium text-gray-500">To:</span> {i.recipientName} ({i.recipientDesignation || "—"})</div>
                        <div><span className="font-medium text-gray-500">Purpose:</span> {i.purpose || "—"}</div>
                        <div><span className="font-medium text-gray-500">Date:</span> {i.issueDate}</div>
                        <div><span className="font-medium text-gray-500">By:</span> {i.issuedBy}</div>
                      </div>
                    </div>
                  ))}
                  {issues.length === 0 && (
                    <p className="text-center py-10 text-xs text-gray-400">No outward records found</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

         {/* ── 4. RECEIVE FORM VIEW ── */}
         {view === "receive" && (
           <MaterialReceiveForm
             catalogue={catalogue.filter(m => m.isActive)}
             onSuccess={() => { setView("menu"); fetchData(true) }}
             onCancel={() => setView("menu")}
           />
         )}

         {/* ── 5. ISSUE FORM VIEW ── */}
         {view === "issue" && (
           <MaterialIssueForm
             catalogue={catalogue.filter(m => m.isActive)}
             stock={stock}
             onSuccess={(issueId) => { 
                setView("menu")
                fetchData(true)
                if (issueId) {
                  setTimeout(() => {
                    handlePrintSlip(issueId)
                  }, 500)
                }
              }}
             onCancel={() => setView("menu")}
           />
         )}

      <MaterialHistoryDialog
        material={historyMaterial}
        open={!!historyMaterial}
        onClose={() => setHistoryMaterial(null)}
        receives={receives}
        issues={issues}
      />

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-xl p-4 bg-white rounded-2xl border">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-sm font-bold text-slate-800">{previewImage?.title}</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="flex items-center justify-center pt-4 pb-2 bg-slate-50 rounded-xl overflow-hidden mt-2">
              <img 
                src={previewImage.url} 
                alt={previewImage.title} 
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
