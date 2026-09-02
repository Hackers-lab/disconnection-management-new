"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Send } from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  pdIds: string[]
  agencies: string[]
  currentAgency?: string
}

export function PDIssueDialog({ isOpen, onClose, onSuccess, pdIds, agencies = [], currentAgency = "" }: Props) {
  const { toast } = useToast()
  const [agenciesList, setAgenciesList] = useState<string[]>(agencies)
  const [selectedAgency, setSelectedAgency] = useState(currentAgency)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (currentAgency) {
      setSelectedAgency(currentAgency)
    }
  }, [currentAgency, isOpen])

  useEffect(() => {
    async function loadAgencies() {
      const allAgencies = new Set<string>(agencies.filter(Boolean))
      try {
        const [cachedAgencies, cachedZoneMap, cachedConsumers] = await Promise.all([
          getFromCache<string[]>("agencies_data_cache"),
          getFromCache<{ zone: string; agency: string }[]>("zone_map_cache"),
          getFromCache<any[]>("consumers_data_cache"),
        ])
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
          const res = await fetch("/api/admin/agencies")
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              data.filter((a: any) => a.isActive !== false).forEach((a: any) => {
                if (a.name) allAgencies.add(a.name.trim())
              })
            }
          }
        }
      } catch { /* ignore */ }

      const sorted = Array.from(allAgencies).filter(Boolean).sort()
      if (sorted.length > 0) {
        setAgenciesList(sorted)
        if (!selectedAgency && !currentAgency && sorted.length > 0) {
          setSelectedAgency(sorted[0])
        }
      }
    }
    if (isOpen) {
      loadAgencies()
    }
  }, [isOpen, agencies])

  const count = pdIds.length

  const handleIssue = async () => {
    if (!selectedAgency) {
      toast({ title: "Please select an agency", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/permanent-disconnection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue",
          pdIds,
          agency: selectedAgency
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to issue PD to agency")
      }

      toast({
        title: "Dispatched to Agency",
        description: `Successfully assigned ${count} record(s) to ${selectedAgency}.`
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({ title: e.message || "Failed to issue", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <Send className="h-5 w-5 text-blue-600" />
            <span>{count > 1 ? `Issue ${count} Consumers to Agency` : "Issue to Agency"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-blue-900 font-medium">
            {count > 1
              ? `You are about to issue ${count} selected permanent disconnection proposals to an agency for field execution.`
              : `Assign this consumer to an agency for site meter dismantling and disconnection.`}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-agency" className="text-xs font-semibold text-slate-700">
              Target Agency *
            </Label>
            <Select value={selectedAgency} onValueChange={setSelectedAgency}>
              <SelectTrigger id="issue-agency" className="text-xs">
                <SelectValue placeholder="Select Agency" />
              </SelectTrigger>
              <SelectContent>
                {agenciesList.map(ag => (
                  <SelectItem key={ag} value={ag} className="text-xs">
                    {ag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleIssue}
            disabled={submitting || !selectedAgency}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Confirm Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
