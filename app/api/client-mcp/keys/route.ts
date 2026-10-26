import { type NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import {
  CLIENT_MCP_LIMITS,
  CLIENT_MCP_SCOPE,
  ClientMcpError,
  clientMcpErrorResponse,
  generateClientMcpKey,
  getClientMcpEligibility,
  hasAcceptedCurrentTerms,
  resolveClientContext,
} from "@/lib/client-mcp"

export async function GET(request: NextRequest) {
  try {
    const { client } = await resolveClientContext(request, request.nextUrl.searchParams.get("clientSlug"))
    const keys = await prisma.apiKey.findMany({
      where: { clientId: client.id, keyPrefix: { startsWith: "rip_cm_" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        requestCount: true,
        isActive: true,
        revokedAt: true,
        createdAt: true,
      },
    })
    return Response.json({ data: keys })
  } catch (error) {
    return clientMcpErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { user, client } = await resolveClientContext(request, body.clientSlug)

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : ""
    if (!name) throw new ClientMcpError("A key name is required", 400)

    const eligibility = await getClientMcpEligibility(client.id)
    if (!eligibility.eligible) throw new ClientMcpError(eligibility.reason ?? "Not eligible", 403)

    if (!(await hasAcceptedCurrentTerms(client.id))) {
      throw new ClientMcpError("Accept the MCP Terms of Use before creating a key", 403)
    }

    const active = await prisma.apiKey.count({
      where: { clientId: client.id, keyPrefix: { startsWith: "rip_cm_" }, isActive: true, revokedAt: null },
    })
    if (active >= CLIENT_MCP_LIMITS.MAX_ACTIVE_KEYS_PER_CLIENT) {
      throw new ClientMcpError(
        `You can have at most ${CLIENT_MCP_LIMITS.MAX_ACTIVE_KEYS_PER_CLIENT} active keys. Revoke one first.`,
        400,
      )
    }

    const { key, keyHash, keyPrefix } = generateClientMcpKey()
    const created = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        clientId: client.id,
        scopes: [CLIENT_MCP_SCOPE],
        rateLimit: CLIENT_MCP_LIMITS.REQUESTS_PER_MINUTE_PER_KEY,
        createdBy: user.id,
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    })

    return Response.json({ key, data: created })
  } catch (error) {
    return clientMcpErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, client } = await resolveClientContext(request, request.nextUrl.searchParams.get("clientSlug"))
    const id = request.nextUrl.searchParams.get("id")
    if (!id) throw new ClientMcpError("Key id is required", 400)

    const result = await prisma.apiKey.updateMany({
      where: { id, clientId: client.id, keyPrefix: { startsWith: "rip_cm_" }, revokedAt: null },
      data: { isActive: false, revokedAt: new Date(), revokedBy: user.id },
    })
    if (result.count === 0) throw new ClientMcpError("Key not found", 404)
    return Response.json({ success: true })
  } catch (error) {
    return clientMcpErrorResponse(error)
  }
}
