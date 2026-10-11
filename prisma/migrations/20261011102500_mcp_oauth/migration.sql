-- Additive migration for the isolated Cloud Palette OAuth service.
-- Review against production schema and apply only after separate approval.
CREATE TABLE IF NOT EXISTS "McpOauthRecord" (
    "model" VARCHAR(64) NOT NULL,
    "idHash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(6),
    "consumedAt" TIMESTAMPTZ(6),
    "grantIdHash" CHAR(64),
    "uidHash" CHAR(64),
    "userCodeHash" CHAR(64),
    CONSTRAINT "McpOauthRecord_pkey" PRIMARY KEY ("model","idHash")
);

CREATE INDEX IF NOT EXISTS "McpOauthRecord_model_uidHash_idx" ON "McpOauthRecord"("model","uidHash");
CREATE INDEX IF NOT EXISTS "McpOauthRecord_model_userCodeHash_idx" ON "McpOauthRecord"("model","userCodeHash");
CREATE INDEX IF NOT EXISTS "McpOauthRecord_grantIdHash_idx" ON "McpOauthRecord"("grantIdHash");

CREATE TABLE IF NOT EXISTS "McpOauthConnection" (
    "grantIdHash" CHAR(64) NOT NULL,
    "encryptedGrantId" JSONB NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    CONSTRAINT "McpOauthConnection_pkey" PRIMARY KEY ("grantIdHash")
);

CREATE INDEX IF NOT EXISTS "McpOauthConnection_userId_revokedAt_expiresAt_idx" ON "McpOauthConnection"("userId","revokedAt","expiresAt");

-- OAuth credentials are server-only. Browser-facing Supabase roles must not
-- access even the encrypted payloads or connection metadata directly.
ALTER TABLE "McpOauthRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpOauthConnection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "McpOauthRecord", "McpOauthConnection" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "McpOauthRecord", "McpOauthConnection" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "McpOauthRecord", "McpOauthConnection" FROM authenticated;
  END IF;
END $$;
