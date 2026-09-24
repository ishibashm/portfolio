BEGIN;
CREATE TABLE listing_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "labelId" VARCHAR(200) NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "sealedState" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "listing_email_connections_userId_idx" ON listing_email_connections ("userId");
CREATE TABLE listing_email_oauth_states (
  "userId" UUID PRIMARY KEY,
  "stateHash" VARCHAR(64) NOT NULL,
  "browserHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
ALTER TABLE listing_email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_email_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON listing_email_connections, listing_email_oauth_states FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON listing_email_connections, listing_email_oauth_states FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON listing_email_connections, listing_email_oauth_states FROM authenticated;
  END IF;
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE listing_email_connections ADD CONSTRAINT listing_email_connection_owner_fk FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
    ALTER TABLE listing_email_oauth_states ADD CONSTRAINT listing_email_oauth_owner_fk FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
COMMIT;
