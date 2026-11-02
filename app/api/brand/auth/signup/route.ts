import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { checkMobileRateLimit } from "@/lib/mobile-auth"
import { createBrandToken, getRequestIp, setBrandCookie, toPublicBrandUser } from "@/lib/brand-auth"

const MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW = 60 * 60 * 1000

function passwordError(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters long"
  if (!/\d/.test(password)) return "Password must contain at least one number"
  if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter"
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one symbol"
  return null
}

const clean = (value: unknown, max = 120) => (typeof value === "string" ? value.trim().slice(0, max) : "")

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request)

    const allowed = await checkMobileRateLimit(`brand-signup:${ip}`, MAX_ATTEMPTS, RATE_LIMIT_WINDOW)
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": "3600" } },
      )
    }

    const body = await request.json()

    if (body._hp) {
      return NextResponse.json({ error: "Invalid submission" }, { status: 400 })
    }
    if (typeof body._ts === "number" && Date.now() - body._ts < 3000) {
      return NextResponse.json({ error: "Submission too fast" }, { status: 400 })
    }

    const firstName = clean(body.firstName)
    const lastName = clean(body.lastName)
    const company = clean(body.company, 160) || null
    const jobTitle = clean(body.jobTitle, 160) || null
    const email = clean(body.email, 254).toLowerCase()
    const password = typeof body.password === "string" ? body.password : ""

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: "First name, last name, email and password are required" }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }
    const pwError = passwordError(password)
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 })
    }
    if (body.agreeToTerms !== true) {
      return NextResponse.json({ error: "You must agree to the Terms of Service and Privacy Policy" }, { status: 400 })
    }

    const existing = await prisma.brandUser.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 })
    }

    const user = await prisma.brandUser.create({
      data: {
        email,
        firstName,
        lastName,
        company,
        jobTitle,
        password: await bcryptjs.hash(password, 10),
        agreedToTermsAt: new Date(),
        signupIp: ip !== "unknown" ? ip : null,
        lastLoginAt: new Date(),
      },
    })

    const response = NextResponse.json({ user: toPublicBrandUser(user) }, { status: 201 })
    setBrandCookie(response, await createBrandToken(user))
    return response
  } catch (error) {
    console.error("[Brand] Signup failed:", error)
    return NextResponse.json({ error: "An error occurred during signup. Please try again." }, { status: 500 })
  }
}
