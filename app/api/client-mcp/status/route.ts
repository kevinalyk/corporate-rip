import { type NextRequest } from "next/server"
import {
  CLIENT_MCP_LIMITS,
  CLIENT_MCP_TERMS_VERSION,
  clientMcpErrorResponse,
  getClientMcpEligibility,
  getMonthlyResultsUsed,
  hasAcceptedCurrentTerms,
  resolveClientContext,
} from "@/lib/client-mcp"

export async function GET(request: NextRequest) {
  try {
    const { client } = await resolveClientContext(request, request.nextUrl.searchParams.get("clientSlug"))
    const [eligibility, termsAccepted, resultsUsed] = await Promise.all([
      getClientMcpEligibility(client.id),
      hasAcceptedCurrentTerms(client.id),
      getMonthlyResultsUsed(client.id),
    ])
    return Response.json({
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      plan: eligibility.plan,
      termsAccepted,
      termsVersion: CLIENT_MCP_TERMS_VERSION,
      usage: { resultsUsed, resultsLimit: CLIENT_MCP_LIMITS.MONTHLY_RESULTS_PER_CLIENT },
      limits: {
        requestsPerMinute: CLIENT_MCP_LIMITS.REQUESTS_PER_MINUTE_PER_KEY,
        maxPageSize: CLIENT_MCP_LIMITS.MAX_PAGE_SIZE,
        maxResultDepth: CLIENT_MCP_LIMITS.MAX_RESULT_DEPTH,
      },
    })
  } catch (error) {
    return clientMcpErrorResponse(error)
  }
}
