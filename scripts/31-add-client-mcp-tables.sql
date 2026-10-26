-- Client-facing MCP: terms acceptance + usage/audit log.
CREATE TABLE IF NOT EXISTS "ClientMcpTermsAcceptance" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "ipAddress" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClientMcpTermsAcceptance_clientId_termsVersion_idx" ON "ClientMcpTermsAcceptance"("clientId", "termsVersion");
CREATE INDEX IF NOT EXISTS "ClientMcpTermsAcceptance_userId_idx" ON "ClientMcpTermsAcceptance"("userId");

CREATE TABLE IF NOT EXISTS "ClientMcpUsageLog" (
  "id" TEXT PRIMARY KEY,
  "apiKeyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "params" JSONB,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "messageIds" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClientMcpUsageLog_apiKeyId_createdAt_idx" ON "ClientMcpUsageLog"("apiKeyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClientMcpUsageLog_clientId_createdAt_idx" ON "ClientMcpUsageLog"("clientId", "createdAt");
