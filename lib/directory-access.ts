import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

// Resolves the signed-in session (RIP or Brand cookie) and whether it gets the full,
// un-gated communication history on directory profiles. super_admin always does.
export async function getDirectoryAccess(): Promise<{
  isAuthenticated: boolean
  clientSlug: string
  hasFullAccess: boolean
}> {
  try {
    const session = await getCurrentUser()
    if (!session?.userId) return { isAuthenticated: false, clientSlug: "", hasFullAccess: false }

    const select = { role: true, client: { select: { hasCompetitiveInsights: true } } } as const
    const userId = session.userId as string
    const record = session.brand
      ? await prisma.brandUser.findUnique({ where: { id: userId }, select })
      : await prisma.user.findUnique({ where: { id: userId }, select })

    return {
      isAuthenticated: true,
      clientSlug: (session.clientSlug as string) || "",
      hasFullAccess: !!record && (record.role === "super_admin" || (record.client?.hasCompetitiveInsights ?? false)),
    }
  } catch {
    return { isAuthenticated: false, clientSlug: "", hasFullAccess: false }
  }
}
