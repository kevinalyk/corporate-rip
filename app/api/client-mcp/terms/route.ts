import { type NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import { getRequestIp } from "@/lib/auth"
import {
  CLIENT_MCP_TERMS_VERSION,
  ClientMcpError,
  clientMcpErrorResponse,
  getClientMcpEligibility,
  resolveClientContext,
} from "@/lib/client-mcp"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { user, client } = await resolveClientContext(request, body.clientSlug)

    const eligibility = await getClientMcpEligibility(client.id)
    if (!eligibility.eligible) throw new ClientMcpError(eligibility.reason ?? "Not eligible", 403)

    if (body.agree !== true) throw new ClientMcpError("You must agree to the terms to continue", 400)

    await prisma.clientMcpTermsAcceptance.create({
      data: {
        clientId: client.id,
        userId: user.id,
        userEmail: user.email,
        termsVersion: CLIENT_MCP_TERMS_VERSION,
        ipAddress: getRequestIp(request),
      },
    })
    return Response.json({ success: true, termsVersion: CLIENT_MCP_TERMS_VERSION })
  } catch (error) {
    return clientMcpErrorResponse(error)
  }
}
