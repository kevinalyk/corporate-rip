import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { checkMobileRateLimit } from "@/lib/mobile-auth"
import { createBrandToken, getRequestIp, setBrandCookie, toPublicBrandUser } from "@/lib/brand-auth"

const MAX_ATTEMPTS = 10
const RATE_LIMIT_WINDOW = 15 * 60 * 1000
const INVALID = "Invalid email or password"

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request)

    const allowed = await checkMobileRateLimit(`brand-login:${ip}`, MAX_ATTEMPTS, RATE_LIMIT_WINDOW)
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": "900" } },
      )
    }

    const body = await request.json()
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!email || !password) {
      return NextResponse.json({ error: INVALID }, { status: 401 })
    }

    const user = await prisma.brandUser.findUnique({ where: { email } })
    if (!user || !(await bcryptjs.compare(password, user.password))) {
      return NextResponse.json({ error: INVALID }, { status: 401 })
    }
    if (user.blocked) {
      return NextResponse.json({ error: "This account has been suspended." }, { status: 403 })
    }

    await prisma.brandUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const response = NextResponse.json({ user: toPublicBrandUser(user) })
    setBrandCookie(response, await createBrandToken(user.id))
    return response
  } catch (error) {
    console.error("[Brand] Login failed:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
