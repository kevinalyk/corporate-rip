import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    console.log("[v0] Fetching clients for super-admin")
    const payload = (await getCurrentUser()) as any

    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const account = payload.brand
      ? await prisma.brandUser.findUnique({ where: { id: payload.userId }, select: { role: true, clientId: true } })
      : await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true, clientId: true } })

    if (account?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Brand super admins see every Brand client plus the RIP client they are attached to.
    const clients = await prisma.client.findMany({
      where: {
        active: true,
        ...(payload.brand && {
          OR: [{ product: "brand" }, ...(account.clientId ? [{ id: account.clientId }] : [])],
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
    })

    console.log("[v0] Found clients:", clients.length, clients)
    return NextResponse.json(clients)
  } catch (error) {
    console.error("Error fetching clients:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
