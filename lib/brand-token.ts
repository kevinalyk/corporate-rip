import { jwtVerify, SignJWT } from "jose"

// Kept free of prisma / next/headers so the middleware (edge runtime) can import it.
export const BRAND_COOKIE = "brand_token"
export const BRAND_SESSION_SECONDS = 60 * 60 * 24 * 7
const BRAND_AUDIENCE = "brandinbox"

const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-this-in-production")

// Same shape RIP puts in its own session token (userId, role, clientId, clientSlug) so the shared
// app code (sidebar, access checks) can read either kind of session the same way. The audience
// claim keeps a brand session from ever being accepted as a RIP session, even though both are
// signed with the same secret.
export type BrandSession = {
  userId: string
  email: string
  firstName: string
  lastName: string
  role: string
  clientId: string | null
  clientSlug: string | null
  brand: true
  iat?: number
}

export async function createBrandToken(user: {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  clientId: string | null
  client?: { slug: string } | null
}) {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    clientId: user.clientId,
    clientSlug: user.client?.slug ?? null,
    brand: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(BRAND_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${BRAND_SESSION_SECONDS}s`)
    .sign(secretKey)
}

export async function verifyBrandSession(token: string): Promise<BrandSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
      audience: BRAND_AUDIENCE,
    })
    if (typeof payload.userId !== "string") return null
    return payload as unknown as BrandSession
  } catch {
    return null
  }
}
