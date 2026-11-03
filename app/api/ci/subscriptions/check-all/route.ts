import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const session = (await getCurrentUser()) as any

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Brand accounts follow through their own table (BrandEntitySubscription).
    if (session.brand) {
      const brandSubscriptions = await prisma.brandEntitySubscription.findMany({
        where: { userId: session.userId },
        select: { entityId: true },
      })
      return NextResponse.json({ entityIds: brandSubscriptions.map((sub: { entityId: string }) => sub.entityId) })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })

    if (!user || !user.clientId) {
      return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
    }

    // Following is personal, including for super-admins viewing another client.
    const subscriptions = await prisma.ciEntitySubscription.findMany({
      where: { clientId: user.clientId, userId: user.id },
      select: { entityId: true },
    })

    const entityIds = subscriptions.map((sub: { entityId: string }) => sub.entityId)

    return NextResponse.json({ entityIds })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 })
  }
}
