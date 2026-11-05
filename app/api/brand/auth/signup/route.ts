import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { checkMobileRateLimit } from "@/lib/mobile-auth"
import { createBrandToken, getBrandHomePath, getRequestIp, setBrandCookie, toPublicBrandUser } from "@/lib/brand-auth"
import type { BrandRole } from "@/lib/brand-roles"

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

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  )
}

// Client.name and Client.slug are globally unique across both products. The slug is also a top-level
// URL segment (/<slug>/ci/...), so the random suffix keeps it from ever colliding with an app route.
async function createUserWithWorkspace(input: {
  email: string
  firstName: string
  lastName: string
  company: string | null
  jobTitle: string | null
  hashedPassword: string
  workspaceName: string
  signupIp: string | null
}) {
  const suffix = randomBytes(3).toString("hex")
  const slug = `${slugify(input.workspaceName)}-${suffix}`
  const nameTaken = await prisma.client.findUnique({ where: { name: input.workspaceName }, select: { id: true } })
  const name = nameTaken ? `${input.workspaceName} (${suffix})` : input.workspaceName

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const client = await tx.client.create({
      data: { id: `brand_${slug}`, name, slug, product: "brand" },
    })
    return tx.brandUser.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company,
        jobTitle: input.jobTitle,
        password: input.hashedPassword,
        agreedToTermsAt: new Date(),
        signupIp: input.signupIp,
        lastLoginAt: new Date(),
        role: "owner" satisfies BrandRole,
        clientId: client.id,
      },
      include: { client: { select: { id: true, name: true, slug: true } } },
    })
  })
}

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

    const hashedPassword = await bcryptjs.hash(password, 10)
    const workspaceName = company || `${firstName} ${lastName}`

    let user: Awaited<ReturnType<typeof createUserWithWorkspace>> | null = null
    for (let attempt = 0; attempt < 3 && !user; attempt++) {
      try {
        user = await createUserWithWorkspace({
          email,
          firstName,
          lastName,
          company,
          jobTitle,
          hashedPassword,
          workspaceName,
          signupIp: ip !== "unknown" ? ip : null,
        })
      } catch (error) {
        const isUniqueConflict = (error as { code?: string })?.code === "P2002"
        if (!isUniqueConflict || attempt === 2) throw error
        const taken = await prisma.brandUser.findUnique({ where: { email }, select: { id: true } })
        if (taken) {
          return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 })
        }
      }
    }
    if (!user) throw new Error("Workspace creation failed")

    const response = NextResponse.json({ user: toPublicBrandUser(user), redirectTo: getBrandHomePath(user) }, { status: 201 })
    setBrandCookie(response, await createBrandToken(user))
    return response
  } catch (error) {
    console.error("[Brand] Signup failed:", error)
    return NextResponse.json({ error: "An error occurred during signup. Please try again." }, { status: 500 })
  }
}
