"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Tenant, NewTenantForm, NewUserForm, EditUserForm } from "./types"
import {
  Building2,
  KeyRound,
  Pencil,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  CreditCard,
} from "lucide-react"

interface SuperuserModalsProps {
  tenants: Tenant[]
  // Add Tenant
  showAddTenantModal: boolean
  onAddTenantOpenChange: (open: boolean) => void
  newTenant: NewTenantForm
  setNewTenant: (val: NewTenantForm) => void
  tenantMsg: { type: "success" | "error"; text: string } | null
  submittingTenant: boolean
  onAddTenantSubmit: (e: React.FormEvent) => void
  // Add User
  showAddUserModal: boolean
  onAddUserOpenChange: (open: boolean) => void
  newUser: NewUserForm
  setNewUser: (val: NewUserForm) => void
  userMsg: { type: "success" | "error"; text: string } | null
  submittingUser: boolean
  onAddUserSubmit: (e: React.FormEvent) => void
  // Edit User
  showEditUserModal: boolean
  onEditUserOpenChange: (open: boolean) => void
  editForm: EditUserForm
  setEditForm: (val: EditUserForm) => void
  submittingEditUser: boolean
  onEditUserSubmit: (e: React.FormEvent) => void
  // Delete User
  pendingDeleteUser: { id: string; username: string } | null
  onCancelDeleteUser: () => void
  deletingUserId: string | null
  onConfirmDeleteUser: () => void
}

export function SuperuserModals({
  tenants,
  showAddTenantModal,
  onAddTenantOpenChange,
  newTenant,
  setNewTenant,
  tenantMsg,
  submittingTenant,
  onAddTenantSubmit,
  showAddUserModal,
  onAddUserOpenChange,
  newUser,
  setNewUser,
  userMsg,
  submittingUser,
  onAddUserSubmit,
  showEditUserModal,
  onEditUserOpenChange,
  editForm,
  setEditForm,
  submittingEditUser,
  onEditUserSubmit,
  pendingDeleteUser,
  onCancelDeleteUser,
  deletingUserId,
  onConfirmDeleteUser,
}: SuperuserModalsProps) {
  const [showNewPass, setShowNewPass] = useState(false)
  const [showEditPass, setShowEditPass] = useState(false)

  return (
    <>
      {/* MODAL 1: Register Care Center (Crisp Light Theme) */}
      <Dialog open={showAddTenantModal} onOpenChange={onAddTenantOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-white border border-slate-200 text-slate-900 p-5 sm:p-6 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <span>Register Care Center (Supply)</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Add a new CCC supply profile to the global superadmin routing registry.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onAddTenantSubmit} className="space-y-3.5 pt-2">
            {tenantMsg && (
              <Alert
                variant={tenantMsg.type === "error" ? "destructive" : "default"}
                className={
                  tenantMsg.type === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }
              >
                {tenantMsg.type === "error" ? (
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                <AlertDescription className="text-xs font-medium">{tenantMsg.text}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">
                  CCC Code <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. 6612107"
                  value={newTenant.cccCode}
                  onChange={(e) => setNewTenant({ ...newTenant, cccCode: e.target.value.toUpperCase() })}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 font-mono text-xs h-9 focus-visible:bg-white"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">
                  CCC Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. KUSHIDA CCC"
                  value={newTenant.cccName}
                  onChange={(e) => setNewTenant({ ...newTenant, cccName: e.target.value })}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 focus-visible:bg-white"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Contact Person</Label>
                <Input
                  placeholder="Officer / In-Charge"
                  value={newTenant.contactPerson}
                  onChange={(e) => setNewTenant({ ...newTenant, contactPerson: e.target.value })}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 focus-visible:bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Contact Mobile</Label>
                <Input
                  placeholder="10-digit mobile"
                  value={newTenant.mobileNumber}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })
                  }
                  className="bg-slate-50/70 border-slate-200 text-slate-900 font-mono text-xs h-9 focus-visible:bg-white"
                  maxLength={10}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Google Spreadsheet ID <span className="text-slate-400 font-normal">(Optional)</span>
              </Label>
              <Input
                placeholder="Leave blank if not linked yet"
                value={newTenant.spreadsheetId}
                onChange={(e) => setNewTenant({ ...newTenant, spreadsheetId: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 font-mono text-xs h-9 focus-visible:bg-white"
              />
            </div>

            <DialogFooter className="pt-3 flex gap-2 flex-row justify-end border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3.5 rounded-xl cursor-pointer"
                onClick={() => onAddTenantOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 rounded-xl cursor-pointer"
                disabled={submittingTenant}
              >
                {submittingTenant ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Register Supply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Create User Account (Crisp Light Theme) */}
      <Dialog open={showAddUserModal} onOpenChange={onAddUserOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-lg bg-white border border-slate-200 text-slate-900 p-5 sm:p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4 text-indigo-600" />
              </div>
              <span>Create Supply Access Account</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Provision login credentials for care center admins, agencies, or monitoring staff.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onAddUserSubmit} className="space-y-3.5 pt-2">
            {userMsg && (
              <Alert
                variant={userMsg.type === "error" ? "destructive" : "default"}
                className={
                  userMsg.type === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }
              >
                {userMsg.type === "error" ? (
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                <AlertDescription className="text-xs font-medium">{userMsg.text}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Full Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="e.g. Kushida Admin Officer"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 focus-visible:bg-white"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">
                  Username / Login ID <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. kushida_admin"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 font-mono text-xs h-9 focus-visible:bg-white"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">
                  Password <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showNewPass ? "text" : "password"}
                    placeholder="Enter password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="bg-slate-50/70 border-slate-200 text-slate-900 font-mono text-xs h-9 pr-9 focus-visible:bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={showNewPass ? "Hide password" : "Show password"}
                  >
                    {showNewPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">
                  Care Center (Supply) <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={newUser.cccCode}
                  onValueChange={(val) => setNewUser({ ...newUser, cccCode: val })}
                >
                  <SelectTrigger className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9">
                    <SelectValue placeholder="Select Supply" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs max-h-60">
                    <SelectItem value="SYSTEM">SYSTEM (Global)</SelectItem>
                    {tenants.map((t) => (
                      <SelectItem key={t.cccCode} value={t.cccCode}>
                        {t.cccCode} — {t.cccName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Access Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(val) => setNewUser({ ...newUser, role: val })}
                >
                  <SelectTrigger className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="agency">Agency</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="lt">LT</SelectItem>
                    <SelectItem value="painter">Painter</SelectItem>
                    <SelectItem value="superuser">Superuser</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Allowed Agencies <span className="text-slate-400 font-normal">(Comma separated)</span>
              </Label>
              <Input
                placeholder="e.g. POWER, MAITY"
                value={newUser.agencies}
                onChange={(e) => setNewUser({ ...newUser, agencies: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 focus-visible:bg-white"
              />
            </div>

            {/* Subscription Settings Card */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                <span>Subscription & Access Control</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600 font-medium">Status</Label>
                  <Select
                    value={newUser.subscriptionStatus || "active"}
                    onValueChange={(val) => setNewUser({ ...newUser, subscriptionStatus: val })}
                  >
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive / Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600 font-medium">Expiry Date</Label>
                  <Input
                    type="date"
                    value={newUser.subscriptionExpiresAt}
                    onChange={(e) => setNewUser({ ...newUser, subscriptionExpiresAt: e.target.value })}
                    className="bg-white border-slate-200 text-slate-900 text-xs h-8"
                  />
                </div>
              </div>
              <label
                htmlFor="new-user-bypass"
                className="flex items-center gap-2 pt-0.5 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  id="new-user-bypass"
                  checked={newUser.bypassSubscription}
                  onChange={(e) => setNewUser({ ...newUser, bypassSubscription: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300"
                />
                <span className="font-medium">Bypass Subscription (Free Pass / No Expiry Lock)</span>
              </label>
            </div>

            <DialogFooter className="pt-3 flex gap-2 flex-row justify-end border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3.5 rounded-xl cursor-pointer"
                onClick={() => onAddUserOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-4 rounded-xl cursor-pointer"
                disabled={submittingUser}
              >
                {submittingUser ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Edit User Account (Crisp Light Theme) */}
      <Dialog open={showEditUserModal} onOpenChange={onEditUserOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-lg bg-white border border-slate-200 text-slate-900 p-5 sm:p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center shrink-0">
                <Pencil className="h-4 w-4 text-blue-600" />
              </div>
              <span className="truncate">
                Edit Access <span className="font-mono text-blue-700">({editForm.username})</span>
              </span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Update role permissions, password, agency assignments, or subscription expiry.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onEditUserSubmit} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Full Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 focus-visible:bg-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                New Password <span className="text-slate-400 font-normal">(Leave blank to keep current)</span>
              </Label>
              <div className="relative">
                <Input
                  type={showEditPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="bg-slate-50/70 border-slate-200 text-slate-900 font-mono text-xs h-9 pr-9 focus-visible:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPass((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label={showEditPass ? "Hide password" : "Show password"}
                >
                  {showEditPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Care Center (Supply)</Label>
                <Select
                  value={editForm.cccCode}
                  onValueChange={(val) => setEditForm({ ...editForm, cccCode: val })}
                >
                  <SelectTrigger className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs max-h-60">
                    <SelectItem value="SYSTEM">SYSTEM (Global)</SelectItem>
                    {tenants.map((t) => (
                      <SelectItem key={t.cccCode} value={t.cccCode}>
                        {t.cccCode} — {t.cccName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Access Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(val) => setEditForm({ ...editForm, role: val })}
                >
                  <SelectTrigger className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="agency">Agency</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="lt">LT</SelectItem>
                    <SelectItem value="painter">Painter</SelectItem>
                    <SelectItem value="superuser">Superuser</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Allowed Agencies <span className="text-slate-400 font-normal">(Comma separated)</span>
              </Label>
              <Input
                placeholder="e.g. POWER, MAITY"
                value={editForm.agencies}
                onChange={(e) => setEditForm({ ...editForm, agencies: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 focus-visible:bg-white"
              />
            </div>

            {/* Subscription Settings Card */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                <span>Subscription & Access Control</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600 font-medium">Status</Label>
                  <Select
                    value={editForm.subscriptionStatus || "active"}
                    onValueChange={(val) => setEditForm({ ...editForm, subscriptionStatus: val })}
                  >
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive / Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600 font-medium">Expiry Date</Label>
                  <Input
                    type="date"
                    value={editForm.subscriptionExpiresAt || ""}
                    onChange={(e) => setEditForm({ ...editForm, subscriptionExpiresAt: e.target.value })}
                    className="bg-white border-slate-200 text-slate-900 text-xs h-8"
                  />
                </div>
              </div>
              <label
                htmlFor="edit-user-bypass"
                className="flex items-center gap-2 pt-0.5 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  id="edit-user-bypass"
                  checked={!!editForm.bypassSubscription}
                  onChange={(e) => setEditForm({ ...editForm, bypassSubscription: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300"
                />
                <span className="font-medium">Bypass Subscription (Free Pass / No Expiry Lock)</span>
              </label>
            </div>

            <DialogFooter className="pt-3 flex gap-2 flex-row justify-end border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3.5 rounded-xl cursor-pointer"
                onClick={() => onEditUserOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submittingEditUser}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 rounded-xl cursor-pointer"
              >
                {submittingEditUser ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: Delete User Confirmation */}
      <AlertDialog
        open={!!pendingDeleteUser}
        onOpenChange={(open) => {
          if (!open && !deletingUserId) onCancelDeleteUser()
        }}
      >
        <AlertDialogContent className="rounded-2xl bg-white border border-slate-200 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">Delete user access?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 text-sm">
              Are you sure you want to permanently remove login access for{" "}
              <strong className="font-mono text-slate-900">{pendingDeleteUser?.username}</strong>? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingUserId} className="rounded-xl cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                onConfirmDeleteUser()
              }}
              disabled={!!deletingUserId}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
            >
              {deletingUserId ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete User"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
