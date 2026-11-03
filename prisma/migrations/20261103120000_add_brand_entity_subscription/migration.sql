-- Additive only: creates "BrandEntitySubscription" so Brand users can follow entities.
-- The RIP "CiUserEntitySubscription" table is untouched.
CREATE TABLE IF NOT EXISTS "BrandEntitySubscription" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandEntitySubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandEntitySubscription_userId_entityId_key" ON "BrandEntitySubscription"("userId", "entityId");
CREATE INDEX IF NOT EXISTS "BrandEntitySubscription_clientId_userId_idx" ON "BrandEntitySubscription"("clientId", "userId");
CREATE INDEX IF NOT EXISTS "BrandEntitySubscription_entityId_idx" ON "BrandEntitySubscription"("entityId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandEntitySubscription_clientId_fkey') THEN
    ALTER TABLE "BrandEntitySubscription" ADD CONSTRAINT "BrandEntitySubscription_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandEntitySubscription_userId_fkey') THEN
    ALTER TABLE "BrandEntitySubscription" ADD CONSTRAINT "BrandEntitySubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "BrandUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandEntitySubscription_entityId_fkey') THEN
    ALTER TABLE "BrandEntitySubscription" ADD CONSTRAINT "BrandEntitySubscription_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
