"use server"

import { getAgencies } from "@/lib/agency-storage"

export async function getAgencyDescription(agencyName: string) {
  try {
    const agencies = await getAgencies()
    // Find the agency by name
    const agency = agencies.find((a: any) => a?.name === agencyName)
    return agency?.description || null
  } catch (error) {
    console.error("Failed to fetch agency description:", error)
    return null
  }
}
