import { type NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { ClientMcpError, clientMcpErrorResponse } from "@/lib/client-mcp"

const ALLOWED_RANGES = [7, 30, 90]

interface ClientTotalsRow {
  clientId: string
  calls: number
  results: number
  denied: number
  errors: number
  keys: number
  lastCallAt: Date | null
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    const userId = authUser?.id || authUser?.userId
    if (!userId) throw new ClientMcpError("Unauthorized", 401)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (user?.role !== "super_admin") throw new ClientMcpError("Forbidden", 403)

    const requested = Number(request.nextUrl.searchParams.get("days"))
    const days = ALLOWED_RANGES.includes(requested) ? requested : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [totals, distinct, tools, daily] = await Promise.all([
      prisma.$queryRaw<ClientTotalsRow[]>`
        SELECT "clientId",
               COUNT(*)::int AS calls,
               COALESCE(SUM("resultCount"), 0)::int AS results,
               (COUNT(*) FILTER (WHERE status = 'denied'))::int AS denied,
               (COUNT(*) FILTER (WHERE status = 'error'))::int AS errors,
               COUNT(DISTINCT "apiKeyId")::int AS keys,
               MAX("createdAt") AS "lastCallAt"
        FROM "ClientMcpUsageLog"
        WHERE "createdAt" >= ${since}
        GROUP BY "clientId"`,
      prisma.$queryRaw<{ clientId: string; distinctMessages: number }[]>`
        SELECT l."clientId", COUNT(DISTINCT m)::int AS "distinctMessages"
        FROM "ClientMcpUsageLog" l, jsonb_array_elements_text(l."messageIds") AS m
        WHERE l."createdAt" >= ${since}
          AND l."messageIds" IS NOT NULL
          AND jsonb_typeof(l."messageIds") = 'array'
        GROUP BY l."clientId"`,
      prisma.$queryRaw<{ clientId: string; tool: string; calls: number }[]>`
        SELECT "clientId", tool, COUNT(*)::int AS calls
        FROM "ClientMcpUsageLog"
        WHERE "createdAt" >= ${since}
        GROUP BY "clientId", tool`,
      prisma.$queryRaw<{ day: string; calls: number; results: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS calls,
               COALESCE(SUM("resultCount"), 0)::int AS results
        FROM "ClientMcpUsageLog"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1`,
    ])

    const clients = await prisma.client.findMany({
      where: { id: { in: totals.map((t) => t.clientId) } },
      select: { id: true, name: true, slug: true },
    })
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const distinctByClient = new Map(distinct.map((d) => [d.clientId, d.distinctMessages]))

    const rows = totals
      .map((t) => ({
        clientId: t.clientId,
        name: clientById.get(t.clientId)?.name ?? "Unknown client",
        slug: clientById.get(t.clientId)?.slug ?? null,
        calls: t.calls,
        results: t.results,
        distinctMessages: distinctByClient.get(t.clientId) ?? 0,
        denied: t.denied,
        errors: t.errors,
        activeKeys: t.keys,
        lastCallAt: t.lastCallAt,
        tools: Object.fromEntries(tools.filter((x) => x.clientId === t.clientId).map((x) => [x.tool, x.calls])),
      }))
      .sort((a, b) => b.calls - a.calls)

    return Response.json({ days, clients: rows, daily })
  } catch (error) {
    return clientMcpErrorResponse(error)
  }
}
