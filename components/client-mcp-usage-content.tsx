"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ClientUsageRow {
  clientId: string
  name: string
  slug: string | null
  calls: number
  results: number
  distinctMessages: number
  denied: number
  errors: number
  activeKeys: number
  lastCallAt: string | null
  tools: Record<string, number>
}

interface UsageResponse {
  days: number
  clients: ClientUsageRow[]
  daily: { day: string; calls: number; results: number }[]
}

const RANGES = [7, 30, 90]

const chartConfig = {
  calls: { label: "Calls", color: "var(--chart-1)" },
} satisfies ChartConfig

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed")
  return res.json()
}

const fmt = (n: number) => n.toLocaleString()

export function ClientMcpUsageContent() {
  const [days, setDays] = useState(30)
  const { data, error, isLoading } = useSWR<UsageResponse>(`/api/admin/client-mcp-usage?days=${days}`, fetcher)

  const totals = (data?.clients ?? []).reduce(
    (acc, c) => ({
      calls: acc.calls + c.calls,
      results: acc.results + c.results,
      distinctMessages: acc.distinctMessages + c.distinctMessages,
      denied: acc.denied + c.denied,
    }),
    { calls: 0, results: 0, distinctMessages: 0, denied: 0 },
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Client MCP Usage</h1>
          <p className="text-sm text-muted-foreground">
            Per-client usage of the client MCP, for working out future pricing. Nothing is billed today.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <Button key={r} size="sm" variant={days === r ? "default" : "outline"} onClick={() => setDays(r)}>
              {r} days
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading usage
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Calls" value={fmt(totals.calls)} />
            <Stat label="Results returned" value={fmt(totals.results)} />
            <Stat label="Distinct messages seen" value={fmt(totals.distinctMessages)} hint="Summed per client" />
            <Stat label="Denied calls" value={fmt(totals.denied)} hint="Rate limit, quota or access" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Calls per day</CardTitle>
              <CardDescription>All clients, last {data.days} days</CardDescription>
            </CardHeader>
            <CardContent>
              {data.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls in this period.</p>
              ) : (
                <ChartContainer config={chartConfig} className="h-56 w-full">
                  <BarChart data={data.daily}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="calls" fill="var(--color-calls)" radius={3} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By client</CardTitle>
              <CardDescription>
                Distinct messages counts unique message IDs returned, a better measure of data pulled than raw calls.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Results</TableHead>
                    <TableHead className="text-right">Distinct messages</TableHead>
                    <TableHead className="text-right">Denied</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">Keys used</TableHead>
                    <TableHead>Tool mix</TableHead>
                    <TableHead>Last call</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No usage in this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.clients.map((c) => (
                    <TableRow key={c.clientId}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.calls)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.results)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.distinctMessages)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.denied)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.errors)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.activeKeys}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {Object.entries(c.tools)
                          .sort((a, b) => b[1] - a[1])
                          .map(([tool, n]) => `${tool} ${n}`)
                          .join(", ")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {c.lastCallAt ? new Date(c.lastCallAt).toLocaleString() : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  )
}
