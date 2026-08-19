import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getKV, setKV } from "@/lib/kv-store"

export const dynamic = "force-dynamic"

export interface VercelMetricItem {
  id: string
  name: string
  category: "compute" | "bandwidth" | "edge" | "media" | "build"
  used: number
  limit: number
  unit: string
  formattedUsed: string
  formattedLimit: string
  percent: number
  isSpiked: boolean // true if percent >= 50
  severity: "normal" | "warning" | "high" | "critical"
  description: string
  recommendation?: string
}

export interface VercelUsageResponse {
  configured: boolean
  plan: string
  billingPeriod: {
    start: string
    end: string
    daysRemaining: number
    totalDays: number
    percentElapsed: number
  }
  summary: {
    totalSpikedCount: number
    criticalCount: number
    highestMetric: {
      name: string
      percent: number
    } | null
    burnRateStatus: "safe" | "elevated" | "critical"
  }
  metrics: VercelMetricItem[]
  spikedMetrics: VercelMetricItem[]
  lastChecked: number
  source: "live_api" | "manual_kv" | "default"
  debugInfo?: {
    tokenPresent: boolean
    teamIdPresent: boolean
    apiStatus?: string
    apiError?: string
    keysFound?: string[]
  }
}

// Standard Vercel Limits in human units
const PLAN_LIMITS = {
  hobby: {
    fastOriginTransferGB: 10, // 10 GB
    bandwidthGB: 100, // 100 GB
    serverlessGbHrs: 100, // 100 GB-Hrs
    serverlessInvocations: 100000, // 100k
    edgeRequests: 1000000, // 1M
    imageOptimization: 1000, // 1,000 images
    edgeMiddlewareInvocations: 1000000, // 1M
    buildMinutes: 6000, // 6,000 min
  },
  pro: {
    fastOriginTransferGB: 100,
    bandwidthGB: 1000,
    serverlessGbHrs: 1000,
    serverlessInvocations: 1000000,
    edgeRequests: 10000000,
    imageOptimization: 5000,
    edgeMiddlewareInvocations: 10000000,
    buildMinutes: 24000,
  },
}

function getSeverity(percent: number): "normal" | "warning" | "high" | "critical" {
  if (percent >= 90) return "critical"
  if (percent >= 75) return "high"
  if (percent >= 50) return "warning"
  return "normal"
}

// Universal parser for Vercel values (handles GB, raw bytes, seconds, and counts)
function parseVercelValue(rawVal: any, unitType: "gb" | "count" | "time"): number {
  if (rawVal === undefined || rawVal === null) return 0
  let num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal))
  if (isNaN(num)) return 0

  if (unitType === "gb") {
    // If value is > 10000, it's in raw bytes -> convert to GB
    if (num > 10000) {
      num = num / (1024 * 1024 * 1024)
    }
    // Round to 2 decimal places
    return Math.round(num * 100) / 100
  }

  if (unitType === "time") {
    // If value is > 10000, it might be in seconds -> convert to GB-Hrs or min
    return Math.round(num * 10) / 10
  }

  return Math.round(num)
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized: Superuser role required" }, { status: 401 })
    }

    // 1. Get Token from env or KV store
    let token =
      process.env.VERCEL_API_TOKEN ||
      process.env.VERCEL_ACCESS_TOKEN ||
      process.env.VERCEL_TOKEN ||
      process.env.VERCEL_BEARER_TOKEN ||
      (await getKV<string>("system_config:vercel_token")) ||
      ""

    const teamId =
      process.env.VERCEL_TEAM_ID ||
      (await getKV<string>("system_config:vercel_team_id")) ||
      ""

    const projectId =
      process.env.VERCEL_PROJECT_ID ||
      (await getKV<string>("system_config:vercel_project_id")) ||
      ""

    // Get any saved manual / snapshot metrics from KV
    const savedManualMetrics = (await getKV<Record<string, number>>("system_config:vercel_manual_metrics")) || {}

    // Current billing cycle dates
    const now = new Date()
    const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const totalDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24))
    const daysElapsed = Math.max(1, Math.round((now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)))
    const daysRemaining = Math.max(0, totalDays - daysElapsed)
    const percentElapsed = Math.round((daysElapsed / totalDays) * 100)

    let planName = "Hobby (Free)"
    let rawMetricsMap: Record<string, any> = {}
    let source: "live_api" | "manual_kv" | "default" = "default"
    let isConfigured = Boolean(token && token.trim())
    let apiStatus = "not_configured"
    let apiError: string | undefined

    // 2. Query Live Vercel API if Token is available
    if (isConfigured) {
      try {
        const teamParam = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""
        
        // 2a. Fetch User / Account Info to check Plan
        const userRes = await fetch(`https://api.vercel.com/v2/user${teamParam}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })

        if (userRes.ok) {
          const userData = await userRes.json()
          if (userData?.user?.billing?.plan) {
            planName = userData.user.billing.plan === "pro" ? "Pro Plan" : `${userData.user.billing.plan} Plan`
          }
          apiStatus = "user_ok"
        }

        // 2b. Attempt to fetch Vercel Usage API endpoints
        const endpoints = [
          `https://api.vercel.com/v2/usage${teamParam}`,
          `https://api.vercel.com/v1/billing/usage${teamParam}`,
          `https://api.vercel.com/v1/usage${teamParam}`,
        ]

        for (const ep of endpoints) {
          try {
            const usageRes = await fetch(ep, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            })

            if (usageRes.ok) {
              const usageData = await usageRes.json()
              source = "live_api"
              apiStatus = "usage_ok"

              // Flatten metrics into dictionary
              if (usageData?.metrics) {
                if (Array.isArray(usageData.metrics)) {
                  for (const m of usageData.metrics) {
                    if (m && m.name) rawMetricsMap[m.name] = m.value ?? m
                  }
                } else if (typeof usageData.metrics === "object") {
                  Object.assign(rawMetricsMap, usageData.metrics)
                }
              }

              if (usageData?.services && Array.isArray(usageData.services)) {
                for (const s of usageData.services) {
                  if (s && s.name) rawMetricsMap[s.name] = s.value ?? s
                }
              }

              if (usageData?.totals && typeof usageData.totals === "object") {
                Object.assign(rawMetricsMap, usageData.totals)
              }

              if (Object.keys(usageData).length > 0) {
                Object.assign(rawMetricsMap, usageData)
              }
              break
            }
          } catch {
            // try next endpoint
          }
        }
      } catch (apiErr: any) {
        console.warn("[Vercel Usage API] Live fetch error:", apiErr)
        apiError = apiErr?.message || "Failed to fetch live API"
      }
    }

    // 3. Fallback to / Merge with Saved Manual Metrics from KV if live API is missing specific readings
    if (Object.keys(savedManualMetrics).length > 0) {
      if (source !== "live_api") {
        source = "manual_kv"
      }
      for (const [k, v] of Object.entries(savedManualMetrics)) {
        if (rawMetricsMap[k] === undefined || rawMetricsMap[k] === 0) {
          rawMetricsMap[k] = v
        }
      }
    }

    // Helper to find a metric value by trying multiple aliases
    const findMetric = (aliases: string[], fallbackVal = 0): number => {
      for (const alias of aliases) {
        if (rawMetricsMap[alias] !== undefined) {
          const val = rawMetricsMap[alias]
          if (val && typeof val === "object" && val.value !== undefined) {
            return Number(val.value) || 0
          }
          const num = typeof val === "number" ? val : parseFloat(String(val))
          if (!isNaN(num)) return num
        }
      }
      return fallbackVal
    }

    // 4. Extract and Normalize All 8 Core Resources
    const limits = planName.toLowerCase().includes("pro") ? PLAN_LIMITS.pro : PLAN_LIMITS.hobby

    // 1. Fast Origin Transfer (Default fallback 9.44 GB if user specified or saved)
    const rawOrigin = findMetric([
      "fastOriginTransfer",
      "fast_origin_transfer",
      "fast-origin-transfer",
      "fastOriginTransferGB",
      "fastOriginTransferBytes",
      "originTransfer",
      "origin_transfer",
      "fastOrigin",
    ], savedManualMetrics.fastOriginTransfer ?? 0)
    const fastOriginUsed = parseVercelValue(rawOrigin, "gb")
    const fastOriginLimit = limits.fastOriginTransferGB
    const fastOriginPct = Math.round((fastOriginUsed / Math.max(fastOriginLimit, 1)) * 1000) / 10

    // 2. Fast Data Transfer / Bandwidth
    const rawBandwidth = findMetric([
      "bandwidth",
      "fastDataTransfer",
      "fast_data_transfer",
      "fast-data-transfer",
      "bandwidthBytes",
      "bandwidthGB",
      "dataTransfer",
    ], savedManualMetrics.bandwidth ?? 0)
    const bandwidthUsed = parseVercelValue(rawBandwidth, "gb")
    const bandwidthLimit = limits.bandwidthGB
    const bandwidthPct = Math.round((bandwidthUsed / Math.max(bandwidthLimit, 1)) * 1000) / 10

    // 3. Serverless Function Execution (GB-Hours)
    const rawFnExec = findMetric([
      "serverlessFunctionExecution",
      "functionExecution",
      "serverless_function_execution",
      "serverlessExecution",
      "computeGbHrs",
      "compute",
    ], savedManualMetrics.serverlessExecution ?? 0)
    const fnExecUsed = parseVercelValue(rawFnExec, "gb")
    const fnExecLimit = limits.serverlessGbHrs
    const fnExecPct = Math.round((fnExecUsed / Math.max(fnExecLimit, 1)) * 1000) / 10

    // 4. Serverless Function Invocations
    const rawFnInvoc = findMetric([
      "serverlessFunctionInvocations",
      "invocations",
      "serverless_function_invocations",
      "serverlessInvocations",
      "functionInvocations",
    ], savedManualMetrics.serverlessInvocations ?? 0)
    const fnInvocUsed = parseVercelValue(rawFnInvoc, "count")
    const fnInvocLimit = limits.serverlessInvocations
    const fnInvocPct = Math.round((fnInvocUsed / Math.max(fnInvocLimit, 1)) * 1000) / 10

    // 5. Edge Requests
    const rawEdgeReq = findMetric([
      "edgeRequests",
      "edgeRequest",
      "edge_requests",
      "edge_request",
    ], savedManualMetrics.edgeRequests ?? 0)
    const edgeReqUsed = parseVercelValue(rawEdgeReq, "count")
    const edgeReqLimit = limits.edgeRequests
    const edgeReqPct = Math.round((edgeReqUsed / Math.max(edgeReqLimit, 1)) * 1000) / 10

    // 6. Image Optimization
    const rawImages = findMetric([
      "imageOptimization",
      "images",
      "image_optimization",
      "sourceImages",
    ], savedManualMetrics.imageOptimization ?? 0)
    const imgUsed = parseVercelValue(rawImages, "count")
    const imgLimit = limits.imageOptimization
    const imgPct = Math.round((imgUsed / Math.max(imgLimit, 1)) * 1000) / 10

    // 7. Edge Middleware Invocations
    const rawEdgeMw = findMetric([
      "edgeMiddlewareInvocations",
      "edge_middleware_invocations",
      "middlewareInvocations",
    ], savedManualMetrics.edgeMiddleware ?? 0)
    const edgeMwUsed = parseVercelValue(rawEdgeMw, "count")
    const edgeMwLimit = limits.edgeMiddlewareInvocations
    const edgeMwPct = Math.round((edgeMwUsed / Math.max(edgeMwLimit, 1)) * 1000) / 10

    // 8. Build Minutes
    const rawBuild = findMetric([
      "buildMinutes",
      "buildTime",
      "build_minutes",
      "builds",
    ], savedManualMetrics.buildMinutes ?? 0)
    const buildUsed = parseVercelValue(rawBuild, "time")
    const buildLimit = limits.buildMinutes
    const buildPct = Math.round((buildUsed / Math.max(buildLimit, 1)) * 1000) / 10

    // 5. Construct Normalized Metrics List
    const allMetrics: VercelMetricItem[] = [
      {
        id: "fast_origin_transfer",
        name: "Fast Origin Transfer",
        category: "bandwidth",
        used: fastOriginUsed,
        limit: fastOriginLimit,
        unit: "GB",
        formattedUsed: `${fastOriginUsed.toFixed(2)} GB`,
        formattedLimit: `${fastOriginLimit} GB`,
        percent: fastOriginPct,
        isSpiked: fastOriginPct >= 50,
        severity: getSeverity(fastOriginPct),
        description: "Data transfer from Serverless API Functions / ISR to Vercel's Global Edge Network.",
        recommendation: "Enable caching on Google Sheet read queries and compress heavy JSON API responses to prevent reaching 10 GB limit.",
      },
      {
        id: "bandwidth",
        name: "Fast Data Transfer (Bandwidth)",
        category: "bandwidth",
        used: bandwidthUsed,
        limit: bandwidthLimit,
        unit: "GB",
        formattedUsed: `${bandwidthUsed.toFixed(1)} GB`,
        formattedLimit: `${bandwidthLimit} GB`,
        percent: bandwidthPct,
        isSpiked: bandwidthPct >= 50,
        severity: getSeverity(bandwidthPct),
        description: "Outgoing HTTP egress to client browsers and mobile field workers.",
        recommendation: "Ensure IndexedDB delta patching is enabled to prevent repeated full-dataset downloads.",
      },
      {
        id: "serverless_execution",
        name: "Serverless Function Execution",
        category: "compute",
        used: fnExecUsed,
        limit: fnExecLimit,
        unit: "GB-Hrs",
        formattedUsed: `${fnExecUsed.toFixed(1)} GB-Hrs`,
        formattedLimit: `${fnExecLimit} GB-Hrs`,
        percent: fnExecPct,
        isSpiked: fnExecPct >= 50,
        severity: getSeverity(fnExecPct),
        description: "CPU & Memory execution duration consumed by Next.js Serverless API endpoints.",
        recommendation: "Use short-lived server caching on Google Sheet fetches to avoid idle wait times.",
      },
      {
        id: "serverless_invocations",
        name: "Serverless Function Invocations",
        category: "compute",
        used: fnInvocUsed,
        limit: fnInvocLimit,
        unit: "Calls",
        formattedUsed: `${fnInvocUsed.toLocaleString()} calls`,
        formattedLimit: `${fnInvocLimit.toLocaleString()} calls`,
        percent: fnInvocPct,
        isSpiked: fnInvocPct >= 50,
        severity: getSeverity(fnInvocPct),
        description: "Total count of backend API route invocations executed this cycle.",
        recommendation: "Consolidate polling and sync intervals across active browser tabs.",
      },
      {
        id: "image_optimization",
        name: "Image Optimization",
        category: "media",
        used: imgUsed,
        limit: imgLimit,
        unit: "Images",
        formattedUsed: `${imgUsed.toLocaleString()} images`,
        formattedLimit: `${imgLimit.toLocaleString()} images`,
        percent: imgPct,
        isSpiked: imgPct >= 50,
        severity: getSeverity(imgPct),
        description: "Unique source images transformed and optimized by Next.js Image Service.",
        recommendation: "Serve static assets with long cache headers or link direct CDN assets.",
      },
      {
        id: "edge_requests",
        name: "Edge Network Requests",
        category: "edge",
        used: edgeReqUsed,
        limit: edgeReqLimit,
        unit: "Requests",
        formattedUsed: `${edgeReqUsed.toLocaleString()} reqs`,
        formattedLimit: `${edgeReqLimit.toLocaleString()} reqs`,
        percent: edgeReqPct,
        isSpiked: edgeReqPct >= 50,
        severity: getSeverity(edgeReqPct),
        description: "Global edge CDN requests routing to static pages and assets.",
      },
      {
        id: "edge_middleware",
        name: "Edge Middleware Invocations",
        category: "edge",
        used: edgeMwUsed,
        limit: edgeMwLimit,
        unit: "Invocations",
        formattedUsed: `${edgeMwUsed.toLocaleString()}`,
        formattedLimit: `${edgeMwLimit.toLocaleString()}`,
        percent: edgeMwPct,
        isSpiked: edgeMwPct >= 50,
        severity: getSeverity(edgeMwPct),
        description: "Authentication and tenant routing middleware checks performed at edge.",
      },
      {
        id: "build_minutes",
        name: "Build Minutes",
        category: "build",
        used: buildUsed,
        limit: buildLimit,
        unit: "Minutes",
        formattedUsed: `${buildUsed.toFixed(0)} min`,
        formattedLimit: `${buildLimit.toFixed(0)} min`,
        percent: buildPct,
        isSpiked: buildPct >= 50,
        severity: getSeverity(buildPct),
        description: "CI/CD deployment and build minutes utilized during git pushes.",
      },
    ]

    // Spiked metrics specifically >= 50%
    const spikedMetrics = allMetrics.filter(m => m.percent >= 50)
    spikedMetrics.sort((a, b) => b.percent - a.percent)
    allMetrics.sort((a, b) => b.percent - a.percent)

    // Highest metric
    const highestMetric = allMetrics.length > 0 && allMetrics[0].percent > 0
      ? { name: allMetrics[0].name, percent: allMetrics[0].percent }
      : null

    // Determine overall burn rate status
    let burnRateStatus: "safe" | "elevated" | "critical" = "safe"
    const hasCritical = allMetrics.some(m => m.percent >= 90)
    const hasHigh = allMetrics.some(m => m.percent >= 75)

    if (hasCritical) {
      burnRateStatus = "critical"
    } else if (hasHigh || spikedMetrics.length > 0) {
      burnRateStatus = "elevated"
    }

    const responseData: VercelUsageResponse = {
      configured: isConfigured || Object.keys(savedManualMetrics).length > 0,
      plan: planName,
      billingPeriod: {
        start: cycleStart.toISOString().split("T")[0],
        end: cycleEnd.toISOString().split("T")[0],
        daysRemaining,
        totalDays,
        percentElapsed,
      },
      summary: {
        totalSpikedCount: spikedMetrics.length,
        criticalCount: allMetrics.filter(m => m.percent >= 75).length,
        highestMetric,
        burnRateStatus,
      },
      metrics: allMetrics,
      spikedMetrics,
      lastChecked: Date.now(),
      source,
      debugInfo: {
        tokenPresent: Boolean(token),
        teamIdPresent: Boolean(teamId),
        apiStatus,
        apiError,
        keysFound: Object.keys(rawMetricsMap),
      },
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error("GET /api/superuser/vercel-usage error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch Vercel usage" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized: Superuser role required" }, { status: 401 })
    }

    const body = await request.json()
    const { action, token, teamId, projectId, metrics } = body

    if (action === "save_config") {
      if (token !== undefined) {
        await setKV("system_config:vercel_token", token.trim())
      }
      if (teamId !== undefined) {
        await setKV("system_config:vercel_team_id", teamId.trim())
      }
      if (projectId !== undefined) {
        await setKV("system_config:vercel_project_id", projectId.trim())
      }

      return NextResponse.json({
        success: true,
        message: "Vercel API credentials updated successfully in system KV.",
      })
    }

    // Direct save / sync of manual readings (e.g. Fast Origin = 9.44, Bandwidth = 45, etc.)
    if (action === "save_metrics") {
      if (metrics && typeof metrics === "object") {
        const existing = (await getKV<Record<string, number>>("system_config:vercel_manual_metrics")) || {}
        const updated = { ...existing, ...metrics }
        await setKV("system_config:vercel_manual_metrics", updated)
        return NextResponse.json({
          success: true,
          message: "Usage readings updated successfully.",
          metrics: updated,
        })
      }
      return NextResponse.json({ error: "Invalid metrics payload" }, { status: 400 })
    }

    // Test live token connection
    if (action === "test_token") {
      const testToken = token || (await getKV<string>("system_config:vercel_token")) || ""
      if (!testToken) {
        return NextResponse.json({ success: false, error: "No token provided to test." })
      }

      const teamParam = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""
      const userRes = await fetch(`https://api.vercel.com/v2/user${teamParam}`, {
        headers: { Authorization: `Bearer ${testToken}` },
        cache: "no-store",
      })

      if (!userRes.ok) {
        const errJson = await userRes.json().catch(() => ({}))
        return NextResponse.json({
          success: false,
          error: errJson?.error?.message || `Vercel API returned status ${userRes.status}`,
        })
      }

      const userData = await userRes.json()
      return NextResponse.json({
        success: true,
        user: userData?.user?.username || userData?.user?.email || "Connected",
        plan: userData?.user?.billing?.plan || "Hobby",
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("POST /api/superuser/vercel-usage error:", error)
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 })
  }
}
