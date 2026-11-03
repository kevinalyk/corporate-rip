// Same vocabulary RIP stores in User.role and shows in its team UI: Owner, Admin, User.
// "super_admin" is the internal RIP staff role and is never assigned through Brand signup or invites.
export const BRAND_ROLES = ["owner", "admin", "user"] as const

export type BrandRole = (typeof BRAND_ROLES)[number]

export const BRAND_ROLE_LABELS: Record<BrandRole, string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
}

export function isBrandRole(value: unknown): value is BrandRole {
  return typeof value === "string" && (BRAND_ROLES as readonly string[]).includes(value)
}
