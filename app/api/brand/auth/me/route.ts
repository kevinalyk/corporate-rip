import { NextResponse } from "next/server"
import { getCurrentBrandUser, toPublicBrandUser } from "@/lib/brand-auth"

export async function GET() {
  try {
    const user = await getCurrentBrandUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    return NextResponse.json({ user: toPublicBrandUser(user) })
  } catch (error) {
    console.error("[Brand] Failed to load current user:", error)
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}
