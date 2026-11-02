-- CreateTable
CREATE TABLE IF NOT EXISTS "UserBrand" (
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

    CONSTRAINT "UserBrand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserBrand_email_key" ON "UserBrand"("email");
