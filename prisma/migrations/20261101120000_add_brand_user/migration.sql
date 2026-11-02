-- Additive only: nothing in the shared RIP/Brand database is dropped or altered.
-- If an earlier draft created "UserBrand", rename it; otherwise create "BrandUser".
DO $$
BEGIN
  IF to_regclass('public."UserBrand"') IS NOT NULL AND to_regclass('public."BrandUser"') IS NULL THEN
    ALTER TABLE "UserBrand" RENAME TO "BrandUser";
    ALTER TABLE "BrandUser" RENAME CONSTRAINT "UserBrand_pkey" TO "BrandUser_pkey";
    ALTER INDEX "UserBrand_email_key" RENAME TO "BrandUser_email_key";
  END IF;
END $$;

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
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandUser_email_key" ON "BrandUser"("email");
