import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import type { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const BRAND_COOKIE = "brand_token"
const BRAND_AUDIENCE = "brandinbox"
const SESSION_SECONDS = 60 * 60 * 24 * 7

const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-this-in-production")

// The audience claim keeps a brand session from ever being accepted as a RIP
// session (and vice versa), even though both are signed with the same secret.
export async function createBrandToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(BRAND_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey)
}

async function verifyBrandToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
      audience: BRAND_AUDIENCE,
    })
    return typeof payload.userId === "string" ? payload.userId : null
  } catch {
    return null
  }
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
  createdAt: Date
}) {
  return {
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

  const userId = await verifyBrandToken(token)
  if (!userId) return null

  const user = await prisma.brandUser.findUnique({ where: { id: userId } })
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
