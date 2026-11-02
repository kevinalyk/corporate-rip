import { cookies } from "next/headers"
import type { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { BRAND_COOKIE, BRAND_SESSION_SECONDS, createBrandToken, verifyBrandSession } from "@/lib/brand-token"

export { BRAND_COOKIE, createBrandToken }

const SESSION_SECONDS = BRAND_SESSION_SECONDS

// Where a signed-in brand user lands: their client's CI workspace, or RIP's for super admins.
export function getBrandHomePath(user: { role: string; client?: { slug: string } | null }) {
  if (user.client?.slug) return `/${user.client.slug}/ci/campaigns`
  if (user.role === "super_admin") return "/rip/ci/campaigns"
  return "/account"
}

export function setBrandCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: BRAND_COOKIE,
    value: token,
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_SECONDS,
  })
}

export function clearBrandCookie(response: NextResponse) {
  response.cookies.set({
    name: BRAND_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  })
}

export function toPublicBrandUser(user: {
  id: string
  email: string
  firstName: string
  lastName: string
  company: string | null
  jobTitle: string | null
  role?: string
  client?: { slug: string } | null
  createdAt: Date
}) {
  return {
    role: user.role,
    clientSlug: user.client?.slug ?? null,
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    company: user.company,
    jobTitle: user.jobTitle,
    createdAt: user.createdAt,
  }
}

// Returns the signed-in brand user, or null when there is no valid session or
// the account has been blocked. Always reloads from the database.
export async function getCurrentBrandUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(BRAND_COOKIE)?.value
  if (!token) return null

  const session = await verifyBrandSession(token)
  if (!session) return null

  const user = await prisma.brandUser.findUnique({
    where: { id: session.userId },
    include: { client: { select: { id: true, name: true, slug: true } } },
  })
  if (!user || user.blocked) return null

  return user
}

export function getRequestIp(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}
