import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const session = (await getCurrentUser()) as any

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Following is stored against RIP users only; brand accounts have no subscriptions yet.
    if (session.brand) {
      return NextResponse.json({ entityIds: [] })
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

    const entityIds = subscriptions.map((sub) => sub.entityId)

    return NextResponse.json({ entityIds })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 })
  }
}
