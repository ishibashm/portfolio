-- Additive only; DO NOT apply as part of implementation/testing.
-- No existing rows/defaults, no relation to legacy NextAuth User.
-- RLS has no client policies: only the privileged server DB role may access.
-- Provider payload encryption and atomic consumption belong to the AS adapter.
CREATE TABLE IF NOT EXISTS "McpGrant" (
  "id" UUID NOT NULL PRIMARY KEY,
  "providerGrantId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "clientId" TEXT NOT NULL,
  "allowedProfileIds" TEXT[] NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "lastUsedAt" TIMESTAMPTZ(3),
  CHECK (cardinality("allowedProfileIds") BETWEEN 1 AND 100),
  CHECK (array_position("allowedProfileIds", NULL) IS NULL),
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '30 days')
);
CREATE UNIQUE INDEX IF NOT EXISTS "McpGrant_providerGrantId_key" ON "McpGrant" ("providerGrantId");
CREATE INDEX IF NOT EXISTS "McpGrant_userId_revokedAt_idx" ON "McpGrant" ("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "McpGrant_expiresAt_idx" ON "McpGrant" ("expiresAt");
ALTER TABLE "McpGrant" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "McpProviderState" (
  "model" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "payload" BYTEA NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "grantId" TEXT,
  "uidHash" TEXT,
  "userCodeHash" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  PRIMARY KEY ("model", "keyHash")
);
CREATE UNIQUE INDEX IF NOT EXISTS "McpProviderState_uidHash_key" ON "McpProviderState" ("uidHash");
CREATE UNIQUE INDEX IF NOT EXISTS "McpProviderState_userCodeHash_key" ON "McpProviderState" ("userCodeHash");
CREATE INDEX IF NOT EXISTS "McpProviderState_grantId_idx" ON "McpProviderState" ("grantId");
CREATE INDEX IF NOT EXISTS "McpProviderState_expiresAt_idx" ON "McpProviderState" ("expiresAt");
ALTER TABLE "McpProviderState" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "McpAccessAudit" (
  "requestId" UUID NOT NULL PRIMARY KEY,
  "userId" UUID,
  "grantId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "event" TEXT NOT NULL CHECK ("event" IN ('authorize', 'refresh', 'revoke', 'initialize', 'tools/list', 'ping', 'notification', 'unknown_method', 'unknown_tool', 'invalid_request', 'get_honmei_star', 'get_kanshi', 'judge_directions', 'find_auspicious_days', 'search_municipality', 'area_directions', 'prefecture_summary', 'list_profiles', 'get_profile', 'judge_profile_directions', 'judge_time_slots', 'list_memories', 'get_memory', 'create_memory', 'update_memory', 'delete_memory')),
  "result" TEXT NOT NULL CHECK ("result" IN ('success', 'denied', 'revoked', 'invalid', 'limited', 'unavailable')),
  "durationMs" INTEGER NOT NULL CHECK ("durationMs" >= 0),
  CHECK ("expiresAt" > "occurredAt" AND "expiresAt" <= "occurredAt" + INTERVAL '30 days')
);
CREATE INDEX IF NOT EXISTS "McpAccessAudit_userId_occurredAt_idx" ON "McpAccessAudit" ("userId", "occurredAt");
CREATE INDEX IF NOT EXISTS "McpAccessAudit_expiresAt_idx" ON "McpAccessAudit" ("expiresAt");
ALTER TABLE "McpAccessAudit" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "McpRateBucket" (
  "userId" UUID NOT NULL,
  "category" TEXT NOT NULL CHECK ("category" IN ('request', 'time_calculation')),
  "tokens" DOUBLE PRECISION NOT NULL CHECK ("tokens" >= 0 AND "tokens" <= 20),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("userId", "category"),
  CHECK ("expiresAt" > "updatedAt"),
  CHECK ("category" <> 'request' OR "tokens" <= 10)
);
CREATE INDEX IF NOT EXISTS "McpRateBucket_expiresAt_idx" ON "McpRateBucket" ("expiresAt");
ALTER TABLE "McpRateBucket" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "McpCalculationLease" (
  "userId" UUID NOT NULL,
  "slot" INTEGER NOT NULL CHECK ("slot" IN (0, 1)),
  "requestId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("userId", "slot")
);
CREATE UNIQUE INDEX IF NOT EXISTS "McpCalculationLease_requestId_key" ON "McpCalculationLease" ("requestId");
CREATE INDEX IF NOT EXISTS "McpCalculationLease_expiresAt_idx" ON "McpCalculationLease" ("expiresAt");
ALTER TABLE "McpCalculationLease" ENABLE ROW LEVEL SECURITY;
