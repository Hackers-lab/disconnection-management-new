import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import { fetchConsumerData, ConsumerData } from "@/lib/google-sheets"

export interface DivisionSearchResult extends ConsumerData {
  cccCode: string
  cccName: string
}

export async function GET(request: Request) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("q") || "").trim().toLowerCase()
  let divPrefix = searchParams.get("division") || ""

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  if (!divPrefix) {
    const uname = String(session.username || "").trim()
    if (/^\d{4}000$/.test(uname)) {
      divPrefix = uname.slice(0, 4)
    } else if (session.cccCode && session.cccCode.length >= 4) {
      divPrefix = session.cccCode.slice(0, 4)
    }
  }

  if (!divPrefix || divPrefix.length < 3) {
    return NextResponse.json({ error: "Invalid division code prefix" }, { status: 400 })
  }

  try {
    const registry = await getTenantRegistry()
    const childTenants = Object.values(registry).filter(t =>
      t.cccCode.startsWith(divPrefix) && t.cccCode !== `${divPrefix}000`
    )

    const searchResults: DivisionSearchResult[] = []

    await Promise.all(
      childTenants.map(async (tenant) => {
        const consumers = await fetchConsumerData(tenant.spreadsheetId)
        for (const c of consumers) {
          if (
            c.consumerId.toLowerCase().includes(query) ||
            c.name.toLowerCase().includes(query) ||
            c.mobileNumber.includes(query) ||
            c.address.toLowerCase().includes(query) ||
            c.gisPole.toLowerCase().includes(query)
          ) {
            searchResults.push({
              ...c,
              cccCode: tenant.cccCode,
              cccName: tenant.cccName || `CCC ${tenant.cccCode}`,
            })
          }
          if (searchResults.length >= 50) break
        }
      })
    )

    return NextResponse.json({ results: searchResults.slice(0, 50) })
  } catch (error: any) {
    console.error("Error in Division Search API:", error)
    return NextResponse.json({ error: error.message || "Failed to search division consumers" }, { status: 500 })
  }
}
