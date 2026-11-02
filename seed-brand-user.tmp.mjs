import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const email = "kevinalyk@gmail.com"
const password = process.env.SEED_HASH

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BrandUser" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "firstName" TEXT NOT NULL,
      "lastName" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "company" TEXT,
      "jobTitle" TEXT,
      "agreedToTermsAt" TIMESTAMP(3) NOT NULL,
      "signupIp" TEXT,
      "lastLoginAt" TIMESTAMP(3),
      "blocked" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "BrandUser_pkey" PRIMARY KEY ("id")
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "BrandUser_email_key" ON "BrandUser"("email")`,
  )

  const user = await prisma.brandUser.upsert({
    where: { email },
    update: { password, blocked: false },
    create: {
      email,
      firstName: "Kevin",
      lastName: "Alyk",
      password,
      agreedToTermsAt: new Date(),
      lastLoginAt: new Date(),
    },
  })
  console.log("OK", user.id, user.email, "hashLength", user.password.length)
} catch (error) {
  console.error("FAILED", error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
