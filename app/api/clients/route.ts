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

    const role = payload.brand
      ? (await prisma.brandUser.findUnique({ where: { id: payload.userId }, select: { role: true } }))?.role
      : (await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } }))?.role

    if (role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const clients = await prisma.client.findMany({
      where: {
        active: true,
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
