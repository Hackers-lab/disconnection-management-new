import { AsyncLocalStorage } from "async_hooks"
import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "./session"
import { getTenantConfig } from "./tenant-resolver"

export interface TenantStore {
  spreadsheetId: string
  cccCode: string
  driveFolderId?: string
  googleDriveRefreshToken?: string
}

export const tenantContext = new AsyncLocalStorage<TenantStore>()

/**
 * Executes a function within the specified tenant context.
 */
export function runWithTenant<T>(store: TenantStore, fn: () => T | Promise<T>): T | Promise<T> {
  return tenantContext.run(store, fn)
}

/**
 * Retrieves the active tenant context if one is set.
 */
export function getTenantContext(): TenantStore | undefined {
  return tenantContext.getStore()
}

/**
 * Route handler decorator/wrapper that automatically extracts the session cccCode,
 * resolves the tenant configuration, and executes the route inside the tenant context.
 */
export function withTenant(handler: Function) {
  return async function (request: NextRequest, ...args: any[]) {
    try {
      const session = await verifySession()
      if (session?.cccCode) {
        const config = await getTenantConfig(session.cccCode)
        return await tenantContext.run(
          {
            spreadsheetId: config.spreadsheetId,
            cccCode: session.cccCode,
            driveFolderId: config.driveFolderId,
            googleDriveRefreshToken: config.googleDriveRefreshToken,
          },
          async () => {
            return await handler(request, ...args)
          }
        )
      }
    } catch (e) {
      console.error("Error setting tenant context in route:", e)
    }
    return await handler(request, ...args)
  }
}
