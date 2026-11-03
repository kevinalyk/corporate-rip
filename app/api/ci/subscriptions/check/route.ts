import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

// Rate limiting: max 30 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const MAX_REQUESTS = 30
const WINDOW_MS = 60 * 1000 // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_REQUESTS) return false
  entry.count++
  return true
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  try {
    const session = (await getCurrentUser()) as any

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.brand) {
      const brandEntityId = new URL(request.url).searchParams.get("entityId")
      if (!brandEntityId) {
        return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
      }
      const brandSubscription = await prisma.brandEntitySubscription.findUnique({
        where: { userId_entityId: { userId: session.userId, entityId: brandEntityId } },
      })
      return NextResponse.json({ subscribed: !!brandSubscription })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })

    if (!user || !user.clientId) {
      return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get("entityId")

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
    }

    const subscription = await prisma.ciEntitySubscription.findUnique({
      where: {
        userId_entityId: {
          userId: user.id,
          entityId,
        },
      },
    })

    return NextResponse.json({ subscribed: !!subscription })
  } catch (error) {
    console.error("Error checking subscription:", error)
    return NextResponse.json({ error: "Failed to check subscription" }, { status: 500 })
  }
}
