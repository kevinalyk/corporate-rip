import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

try {
  const sql = readFileSync("prisma/migrations/20261102130000_brand_user_role_and_client/migration.sql", "utf8")
  const statements = sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^--.*$/gm, "").trim())
    .filter(Boolean)

  // The DO $$ ... END $$ block contains inner semicolons, so run it whole.
  const doStart = sql.indexOf("DO $$")
  const head = sql.slice(0, doStart)
  const doBlock = sql.slice(doStart).trim()
  const headStatements = head
    .split(";")
    .map((s) => s.replace(/^--.*$/gm, "").trim())
    .filter(Boolean)

  for (const stmt of headStatements) await prisma.$executeRawUnsafe(stmt)
  await prisma.$executeRawUnsafe(doBlock)
  console.log("migration applied", statements.length > 0)

  const ripClient = await prisma.$queryRawUnsafe(`SELECT "id", "slug" FROM "Client" WHERE "slug" = 'rip' LIMIT 1`)
  console.log("rip client:", ripClient)

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "BrandUser" SET "role" = 'super_admin', "clientId" = $1 WHERE "email" = 'kevinalyk@gmail.com'`,
    ripClient[0]?.id ?? null,
  )
  console.log("updated rows:", updated)
} finally {
  await prisma.$disconnect()
}
