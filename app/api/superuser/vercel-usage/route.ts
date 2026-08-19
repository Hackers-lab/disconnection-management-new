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
  source: "live_api" | "estimated"
}

// Fallback limits for Vercel Hobby & Pro plans
const HOBBY_LIMITS = {
  bandwidthBytes: 100 * 1024 * 1024 * 1024, // 100 GB
  serverlessGbHrs: 100, // 100 GB-Hrs
  serverlessInvocations: 100000, // 100k
  edgeRequests: 1000000, // 1M
  edgeMiddlewareInvocations: 1000000, // 1M
  imageOptimization: 1000, // 1,000 source images
  fastOriginTransferBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  buildMinutes: 6000, // 6,000 min
  webAnalyticsEvents: 2500, // 2,500 events
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getSeverity(percent: number): "normal" | "warning" | "high" | "critical" {
  if (percent >= 90) return "critical"
  if (percent >= 75) return "high"
  if (percent >= 50) return "warning"
  return "normal"
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

    // Current billing cycle dates (Vercel cycles monthly based on calendar month or account creation)
    const now = new Date()
    const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const totalDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24))
    const daysElapsed = Math.max(1, Math.round((now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)))
    const daysRemaining = Math.max(0, totalDays - daysElapsed)
    const percentElapsed = Math.round((daysElapsed / totalDays) * 100)

    let planName = "Hobby (Free)"
    let rawMetrics: Record<string, any> = {}
    let source: "live_api" | "estimated" = "estimated"
    let isConfigured = Boolean(token && token.trim())

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
        }

        // 2b. Fetch Vercel Usage API
        const usageUrl = `https://api.vercel.com/v2/usage${teamParam}`
        const usageRes = await fetch(usageUrl, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })

        if (usageRes.ok) {
          const usageData = await usageRes.json()
          source = "live_api"
          if (usageData?.metrics) {
            rawMetrics = usageData.metrics
          }
        } else {
          // Fallback to v1 usage
          const v1Url = `https://api.vercel.com/v1/usage${teamParam}`
          const v1Res = await fetch(v1Url, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })
          if (v1Res.ok) {
            const v1Data = await v1Res.json()
            source = "live_api"
            rawMetrics = v1Data?.metrics || v1Data || {}
          }
        }
      } catch (apiErr) {
        console.warn("[Vercel Usage API] Failed to fetch live Vercel metrics:", apiErr)
      }
    }

    // 3. Assemble Normalized Metric Definitions
    // Helper to safely extract usage value and limit from raw Vercel response or fallback
    const extractUsage = (metricKey: string, defaultLimit: number, rawKeyAlternative?: string) => {
      const item = rawMetrics[metricKey] || (rawKeyAlternative ? rawMetrics[rawKeyAlternative] : null)
      if (item && typeof item === "object") {
        const val = typeof item.value === "number" ? item.value : (Number(item.value) || 0)
        const lim = typeof item.limit === "number" ? item.limit : (Number(item.limit) || defaultLimit)
        return { value: val, limit: lim }
      }
      if (typeof item === "number") {
        return { value: item, limit: defaultLimit }
      }
      return { value: 0, limit: defaultLimit }
    }

    // Metric 1: Fast Data Transfer / Bandwidth
    const bandwidthData = extractUsage("bandwidth", HOBBY_LIMITS.bandwidthBytes, "fastDataTransfer")
    const bandwidthUsed = bandwidthData.value
    const bandwidthLimit = bandwidthData.limit
    const bandwidthPct = Math.round((bandwidthUsed / Math.max(bandwidthLimit, 1)) * 1000) / 10

    // Metric 2: Serverless Function Execution (GB-Hours)
    const fnExecData = extractUsage("serverlessFunctionExecution", HOBBY_LIMITS.serverlessGbHrs, "functionExecution")
    const fnExecUsed = fnExecData.value
    const fnExecLimit = fnExecData.limit
    const fnExecPct = Math.round((fnExecUsed / Math.max(fnExecLimit, 1)) * 1000) / 10

    // Metric 3: Serverless Function Invocations
    const fnInvocData = extractUsage("serverlessFunctionInvocations", HOBBY_LIMITS.serverlessInvocations, "invocations")
    const fnInvocUsed = fnInvocData.value
    const fnInvocLimit = fnInvocData.limit
    const fnInvocPct = Math.round((fnInvocUsed / Math.max(fnInvocLimit, 1)) * 1000) / 10

    // Metric 4: Edge Requests
    const edgeReqData = extractUsage("edgeRequests", HOBBY_LIMITS.edgeRequests, "edgeRequest")
    const edgeReqUsed = edgeReqData.value
    const edgeReqLimit = edgeReqData.limit
    const edgeReqPct = Math.round((edgeReqUsed / Math.max(edgeReqLimit, 1)) * 1000) / 10

    // Metric 5: Edge Middleware Invocations
    const edgeMwData = extractUsage("edgeMiddlewareInvocations", HOBBY_LIMITS.edgeMiddlewareInvocations)
    const edgeMwUsed = edgeMwData.value
    const edgeMwLimit = edgeMwData.limit
    const edgeMwPct = Math.round((edgeMwUsed / Math.max(edgeMwLimit, 1)) * 1000) / 10

    // Metric 6: Image Optimization (Source Images)
    const imgData = extractUsage("imageOptimization", HOBBY_LIMITS.imageOptimization, "images")
    const imgUsed = imgData.value
    const imgLimit = imgData.limit
    const imgPct = Math.round((imgUsed / Math.max(imgLimit, 1)) * 1000) / 10

    // Metric 7: Fast Origin Transfer
    const originData = extractUsage("fastOriginTransfer", HOBBY_LIMITS.fastOriginTransferBytes)
    const originUsed = originData.value
    const originLimit = originData.limit
    const originPct = Math.round((originUsed / Math.max(originLimit, 1)) * 1000) / 10

    // Metric 8: Build Minutes
    const buildData = extractUsage("buildMinutes", HOBBY_LIMITS.buildMinutes, "buildTime")
    const buildUsed = buildData.value
    const buildLimit = buildData.limit
    const buildPct = Math.round((buildUsed / Math.max(buildLimit, 1)) * 1000) / 10

    // Assemble Metric Items
    const allMetrics: VercelMetricItem[] = [
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
        description: "CPU & Memory execution time consumed by Next.js Serverless API endpoints.",
        recommendation: "Use server-side caching on Google Sheet fetch endpoints to reduce execution duration.",
      },
      {
        id: "bandwidth",
        name: "Fast Data Transfer (Bandwidth)",
        category: "bandwidth",
        used: bandwidthUsed,
        limit: bandwidthLimit,
        unit: "Bytes",
        formattedUsed: formatBytes(bandwidthUsed),
        formattedLimit: formatBytes(bandwidthLimit),
        percent: bandwidthPct,
        isSpiked: bandwidthPct >= 50,
        severity: getSeverity(bandwidthPct),
        description: "Outgoing HTTP egress and page/data transfer to users and field workers.",
        recommendation: "Ensure IndexedDB delta patching is enabled to prevent repeated full-dataset downloads.",
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
        description: "Unique source photos transformed and compressed by Next.js Image Optimization.",
        recommendation: "Deliver high-resolution consumer site photos via direct CDN links rather than server re-encoding.",
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
        description: "Total number of serverless backend route calls executed.",
        recommendation: "Batch API requests and use client-side IndexedDB caching.",
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
        id: "fast_origin_transfer",
        name: "Fast Origin Transfer",
        category: "bandwidth",
        used: originUsed,
        limit: originLimit,
        unit: "Bytes",
        formattedUsed: formatBytes(originUsed),
        formattedLimit: formatBytes(originLimit),
        percent: originPct,
        isSpiked: originPct >= 50,
        severity: getSeverity(originPct),
        description: "Transfer volume between Vercel Edge CDN nodes and Serverless origins.",
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

    // Filter to spiked metrics only (>= 50%)
    const spikedMetrics = allMetrics.filter(m => m.percent >= 50)

    // Sort spiked metrics descending by percentage
    spikedMetrics.sort((a, b) => b.percent - a.percent)
    allMetrics.sort((a, b) => b.percent - a.percent)

    // Find highest metric
    const highestMetric = allMetrics.length > 0 && allMetrics[0].percent > 0
      ? { name: allMetrics[0].name, percent: allMetrics[0].percent }
      : null

    // Determine overall burn rate status
    let burnRateStatus: "safe" | "elevated" | "critical" = "safe"
    const hasCritical = allMetrics.some(m => m.percent >= 90)
    const hasHigh = allMetrics.some(m => m.percent >= 75)
    const hasElevatedBurn = allMetrics.some(m => m.percent > percentElapsed + 25)

    if (hasCritical) {
      burnRateStatus = "critical"
    } else if (hasHigh || hasElevatedBurn || spikedMetrics.length > 0) {
      burnRateStatus = "elevated"
    }

    const responseData: VercelUsageResponse = {
      configured: isConfigured,
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
    const { action, token, teamId, projectId } = body

    if (action === "save_config") {
      if (token !== undefined) {
        if (token.trim()) {
          await setKV("system_config:vercel_token", token.trim())
        } else {
          // If empty string passed, clear token
          await setKV("system_config:vercel_token", "")
        }
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

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("POST /api/superuser/vercel-usage error:", error)
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 })
  }
}
