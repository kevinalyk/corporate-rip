"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { ClientMcpContent } from "@/components/client-mcp-content"
import { useCurrentUser } from "@/lib/hooks/use-current-user"

export default function ClientMcpPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const { user, loading } = useCurrentUser()

  // Super-admin only for now, same as the other Developers pages. The plan gate
  // (Professional / Enterprise) is enforced server-side and shown in the content.
  const allowed = !loading && user?.role === "super_admin" && (clientSlug === "rip" || clientSlug === "m2x")

  useEffect(() => {
    if (loading) return
    if (!user) router.push("/login")
    else if (!allowed) router.push(`/${clientSlug}/ci/campaigns`)
  }, [loading, user, allowed, router, clientSlug])

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-rip-red" />
      </div>
    )
  }

  return (
    <AppLayout isAdminView={true}>
      <div className="container mx-auto px-4 py-8">
        <ClientMcpContent clientSlug={clientSlug} />
      </div>
    </AppLayout>
  )
}
