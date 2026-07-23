"use client"

import * as React from "react"
import { ChevronsUpDown, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface MultiSelectDropdownProps {
  placeholder?: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
  searchable?: boolean
}

export function MultiSelectDropdown({
  placeholder = "Select...",
  options,
  selected = [],
  onChange,
  className,
  searchable = true,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options
    const query = search.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(query))
  }, [options, search])

  const isAllSelected = React.useMemo(() => {
    if (options.length === 0) return false
    return options.every((opt) => selected.includes(opt))
  }, [options, selected])

  const handleToggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((item) => item !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  const handleSelectAll = () => {
    if (isAllSelected) {
      onChange([])
    } else {
      onChange([...options])
    }
  }

  const handleClear = () => {
    onChange([])
  }

  const displayText = React.useMemo(() => {
    if (selected.length === 0) return placeholder
    if (selected.length === 1) return selected[0]
    return `${selected.length} Selected`
  }, [selected, placeholder])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal text-left h-9 px-3 text-xs sm:text-sm",
            selected.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] sm:w-[320px] p-2" align="start">
        {searchable && options.length > 5 && (
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        )}

        <div className="flex items-center justify-between px-1 py-1 mb-1 border-b text-xs">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-blue-600 hover:underline font-medium text-[11px]"
          >
            {isAllSelected ? "Deselect All" : "Select All"}
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-red-500 hover:underline text-[11px] flex items-center gap-0.5"
            >
              <X className="h-3 w-3" /> Clear ({selected.length})
            </button>
          )}
        </div>

        <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
          {filteredOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No options found.</p>
          ) : (
            filteredOptions.map((option) => {
              const checked = selected.includes(option)
              return (
                <label
                  key={option}
                  className={cn(
                    "flex items-center space-x-2 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-accent transition-colors",
                    checked && "bg-accent/50 font-medium"
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    handleToggle(option)
                  }}
                >
                  <Checkbox checked={checked} onCheckedChange={() => handleToggle(option)} />
                  <span className="truncate flex-1">{option}</span>
                </label>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
