import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { CORPORATE_ENTITY_WHERE } from "@/lib/corporate-scope"
import { canFollowMoreEntities, getCIFollowLimit, type SubscriptionPlan } from "@/lib/subscription-utils"

export async function POST(request: NextRequest) {
  try {
    const session = (await getCurrentUser()) as any

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.brand) {
      const brandUser = await prisma.brandUser.findUnique({
        where: { id: session.userId },
        include: { client: true },
      })

      if (!brandUser || !brandUser.clientId) {
        return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
      }

      const { entityId: brandEntityId } = await request.json()
      if (!brandEntityId) {
        return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
      }

      const existing = await prisma.brandEntitySubscription.findUnique({
        where: { userId_entityId: { userId: brandUser.id, entityId: brandEntityId } },
      })

      if (existing) {
        await prisma.brandEntitySubscription.delete({ where: { id: existing.id } })
        return NextResponse.json({ subscribed: false })
      }

      const entity = await prisma.ciEntity.findFirst({
        where: { id: brandEntityId, ...CORPORATE_ENTITY_WHERE },
        select: { id: true },
      })
      if (!entity) {
        return NextResponse.json({ error: "Entity not found" }, { status: 404 })
      }

      // Super admins are never limited by plan.
      if (brandUser.role !== "super_admin") {
        const brandPlan = (brandUser.client?.subscriptionPlan || "free") as SubscriptionPlan
        const brandFollowCount = await prisma.brandEntitySubscription.count({
          where: { clientId: brandUser.clientId, userId: brandUser.id },
        })
        if (!canFollowMoreEntities(brandPlan, brandFollowCount)) {
          const limit = getCIFollowLimit(brandPlan)
          return NextResponse.json(
            {
              error: "Follow limit reached",
              message: `Your plan allows following ${limit} ${limit === 1 ? "entity" : "entities"}. Upgrade to follow more.`,
              currentCount: brandFollowCount,
              limit,
            },
            { status: 403 },
          )
        }
      }

      await prisma.brandEntitySubscription.create({
        data: { clientId: brandUser.clientId, userId: brandUser.id, entityId: brandEntityId },
      })
      return NextResponse.json({ subscribed: true })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { client: true },
    })

    if (!user || !user.clientId) {
      return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
    }

    const { entityId } = await request.json()

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
    }

    // Check if subscription exists
    const existingSubscription = await prisma.ciEntitySubscription.findUnique({
      where: {
        userId_entityId: {
          userId: user.id,
          entityId,
        },
      },
    })

    if (existingSubscription) {
      // Unsubscribe
      await prisma.ciEntitySubscription.delete({
        where: { id: existingSubscription.id },
      })
      return NextResponse.json({ subscribed: false })
    } else {
      const subscriptionPlan = (user.client?.subscriptionPlan || "free") as SubscriptionPlan

      // Count current subscriptions
      const currentFollowCount = await prisma.ciEntitySubscription.count({
        where: { clientId: user.clientId, userId: user.id },
      })

      // Check if user can follow more entities
      if (!canFollowMoreEntities(subscriptionPlan, currentFollowCount)) {
        const limit = getCIFollowLimit(subscriptionPlan)
        return NextResponse.json(
          {
            error: "Follow limit reached",
            message: `Your plan allows following ${limit} ${limit === 1 ? "entity" : "entities"}. Upgrade to follow more.`,
            currentCount: currentFollowCount,
            limit: limit,
          },
          { status: 403 },
        )
      }

      // Subscribe
      await prisma.ciEntitySubscription.create({
        data: {
          clientId: user.clientId,
          userId: user.id,
          entityId,
        },
      })
      return NextResponse.json({ subscribed: true })
    }
  } catch (error) {
    console.error("Error toggling subscription:", error)
    return NextResponse.json({ error: "Failed to toggle subscription" }, { status: 500 })
  }
}
