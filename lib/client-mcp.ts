/**
 * Auth, plan gating, terms enforcement, throttling and audit logging for the
 * client-facing, read-only MCP server (app/api/mcp/client/route.ts).
 *
 * Deliberately separate from lib/ci-api-auth.ts (the internal write-capable
 * MCP). Client keys use their own "rip_cm_" prefix and a single
 * "client_mcp:read" scope, are always bound to a clientId, and are re-checked
 * on every call against the client's current plan, trial state, subscription
 * status and terms acceptance - so a downgrade or cancellation cuts access
 * immediately, without having to hunt down keys.
 */

import { createHash, randomBytes } from "crypto"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

export const CLIENT_MCP_KEY_PREFIX = "rip_cm_"
export const CLIENT_MCP_SCOPE = "client_mcp:read"

// Bump this whenever the terms text changes; every client must re-accept before
// creating keys or making calls.
export const CLIENT_MCP_TERMS_VERSION = "2026-10-26"

// Only the plans listed as "all" (Professional) and "enterprise" qualify.
export const CLIENT_MCP_ALLOWED_PLANS = ["all", "enterprise"] as const

// Pilot rollout: only these clients can use Client MCP, enforced server-side on
// every call (status, key creation, MCP requests). Remove the check in
// getClientMcpEligibility to open it to all Professional / Enterprise clients.
export const CLIENT_MCP_PILOT_SLUGS = ["rip", "redsparkstrategy"] as const

export const CLIENT_MCP_LIMITS = {
  MAX_ACTIVE_KEYS_PER_CLIENT: 5,
  REQUESTS_PER_MINUTE_PER_KEY: 30,
  // Rolling 30-day budget of result rows returned, per client (not per key, so
  // minting extra keys does not raise it). Counts rows, not requests.
  MONTHLY_RESULTS_PER_CLIENT: 20000,
  MAX_PAGE_SIZE: 25,
  // Hard cap on how deep a single query can be paged (page * limit).
  MAX_RESULT_DEPTH: 200,
  MAX_ENTITY_PAGE_SIZE: 50,
} as const

export class ClientMcpError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function generateClientMcpKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `${CLIENT_MCP_KEY_PREFIX}${randomBytes(24).toString("hex")}`
  return { key, keyHash: hashKey(key), keyPrefix: key.slice(0, 12) }
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export interface ClientMcpEligibility {
  eligible: boolean
  reason: string | null
  plan: string
}

/**
 * Plan gate. Trials are stored as plan "enterprise" with a future
 * trialExpiresAt, so the plan alone is not enough - trials are excluded.
 */
export async function getClientMcpEligibility(clientId: string): Promise<ClientMcpEligibility> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true, subscriptionPlan: true, subscriptionStatus: true, trialExpiresAt: true },
  })
  if (!client) return { eligible: false, reason: "Client not found", plan: "unknown" }

  const plan = client.subscriptionPlan
  if (!(CLIENT_MCP_PILOT_SLUGS as readonly string[]).includes(client.slug)) {
    return { eligible: false, reason: "MCP access is currently limited to pilot clients.", plan }
  }
  if (!(CLIENT_MCP_ALLOWED_PLANS as readonly string[]).includes(plan)) {
    return { eligible: false, reason: "MCP access requires a Professional or Enterprise plan.", plan }
  }
  if (client.subscriptionStatus !== "active") {
    return { eligible: false, reason: "Your subscription is not active.", plan }
  }
  if (client.trialExpiresAt && client.trialExpiresAt > new Date()) {
    return { eligible: false, reason: "MCP access is not available during a free trial.", plan }
  }
  return { eligible: true, reason: null, plan }
}

export async function hasAcceptedCurrentTerms(clientId: string): Promise<boolean> {
  const count = await prisma.clientMcpTermsAcceptance.count({
    where: { clientId, termsVersion: CLIENT_MCP_TERMS_VERSION },
  })
  return count > 0
}

export interface VerifiedClientMcpKey {
  id: string
  name: string
  clientId: string
}

/**
 * Validates the bearer token. Returns null for anything that is not a live,
 * client-bound "rip_cm_" key carrying the client MCP scope (this is what stops
 * internal/v1 keys from working on the client server).
 */
export async function verifyClientMcpToken(token: string | undefined): Promise<VerifiedClientMcpKey | null> {
  if (!token || !token.startsWith(CLIENT_MCP_KEY_PREFIX)) return null

  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(token) } })
  if (!apiKey || !apiKey.clientId) return null
  if (apiKey.revokedAt || !apiKey.isActive) return null
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null

  const scopes = Array.isArray(apiKey.scopes) ? (apiKey.scopes as string[]) : []
  if (!scopes.includes(CLIENT_MCP_SCOPE)) return null

  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date(), requestCount: { increment: 1 } } })
    .catch((err: unknown) => console.error("[v0] Failed to update client MCP key usage:", err))

  return { id: apiKey.id, name: apiKey.name, clientId: apiKey.clientId }
}

/**
 * Per-call gate: plan/trial/status, terms, per-minute throttle, monthly result
 * budget. Denials are written to the usage log so they are visible in audits.
 */
export async function assertClientMcpAccess(key: { id: string; clientId: string }, tool: string): Promise<void> {
  const deny = async (message: string, status: number): Promise<never> => {
    await logClientMcpUsage({ key, tool, status: "denied" })
    throw new ClientMcpError(message, status)
  }

  const eligibility = await getClientMcpEligibility(key.clientId)
  if (!eligibility.eligible) return deny(eligibility.reason ?? "MCP access is not available for this account.", 403)

  if (!(await hasAcceptedCurrentTerms(key.clientId))) {
    return deny("Your organization has not accepted the current MCP Terms of Use. Accept them in the RIP app.", 403)
  }

  const minuteAgo = new Date(Date.now() - 60 * 1000)
  const recent = await prisma.clientMcpUsageLog.count({ where: { apiKeyId: key.id, createdAt: { gte: minuteAgo } } })
  if (recent >= CLIENT_MCP_LIMITS.REQUESTS_PER_MINUTE_PER_KEY) {
    return deny(`Rate limit exceeded: max ${CLIENT_MCP_LIMITS.REQUESTS_PER_MINUTE_PER_KEY} requests per minute.`, 429)
  }

  const used = await getMonthlyResultsUsed(key.clientId)
  if (used >= CLIENT_MCP_LIMITS.MONTHLY_RESULTS_PER_CLIENT) {
    return deny(
      `Monthly result quota reached (${CLIENT_MCP_LIMITS.MONTHLY_RESULTS_PER_CLIENT} results per rolling 30 days).`,
      429,
    )
  }
}

export async function getMonthlyResultsUsed(clientId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const agg = await prisma.clientMcpUsageLog.aggregate({
    where: { clientId, createdAt: { gte: since } },
    _sum: { resultCount: true },
  })
  return agg._sum.resultCount ?? 0
}

export async function logClientMcpUsage(params: {
  key: { id: string; clientId: string }
  tool: string
  params?: unknown
  resultCount?: number
  messageIds?: string[]
  status?: "ok" | "error" | "denied"
}): Promise<void> {
  try {
    await prisma.clientMcpUsageLog.create({
      data: {
        apiKeyId: params.key.id,
        clientId: params.key.clientId,
        tool: params.tool,
        params: (params.params ?? undefined) as never,
        resultCount: params.resultCount ?? 0,
        messageIds: params.messageIds && params.messageIds.length ? (params.messageIds as never) : undefined,
        status: params.status ?? "ok",
      },
    })
  } catch (err) {
    console.error("[v0] Failed to write ClientMcpUsageLog row:", err)
  }
}

export interface ClientContext {
  user: { id: string; email: string; role: string }
  client: { id: string; slug: string; name: string }
}

/**
 * Resolves the signed-in user's client for the key-management routes. Regular
 * users always act on their own client; super admins may target a client by
 * slug (the Developers section is super-admin only for now).
 */
export async function resolveClientContext(request: Request, clientSlug?: string | null): Promise<ClientContext> {
  const authUser = await getAuthenticatedUser(request)
  const userId = authUser?.id || authUser?.userId
  if (!userId) throw new ClientMcpError("Unauthorized", 401)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, clientId: true },
  })
  if (!user) throw new ClientMcpError("Unauthorized", 401)

  let client: { id: string; slug: string; name: string } | null = null
  if (user.role === "super_admin" && clientSlug) {
    client = await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true, slug: true, name: true } })
  } else if (user.clientId) {
    client = await prisma.client.findUnique({ where: { id: user.clientId }, select: { id: true, slug: true, name: true } })
  }
  if (!client) throw new ClientMcpError("No client associated with this account", 404)

  return { user: { id: user.id, email: user.email, role: user.role }, client }
}

export function clientMcpErrorResponse(error: unknown): Response {
  if (error instanceof ClientMcpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error("[v0] Client MCP route error:", error)
  return Response.json({ error: "An unexpected error occurred" }, { status: 500 })
}
