-- Additive only: adds role + client link to "BrandUser". Nothing is dropped or altered in RIP tables.
ALTER TABLE "BrandUser" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE "BrandUser" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

CREATE INDEX IF NOT EXISTS "BrandUser_clientId_idx" ON "BrandUser"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrandUser_clientId_fkey'
  ) THEN
    ALTER TABLE "BrandUser"
      ADD CONSTRAINT "BrandUser_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
