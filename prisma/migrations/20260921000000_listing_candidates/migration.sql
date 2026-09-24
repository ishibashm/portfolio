BEGIN;
CREATE TABLE "listing_candidates" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "url" VARCHAR(2048), "title" VARCHAR(120), "memo" VARCHAR(1000),
  "lat" DOUBLE PRECISION NOT NULL CHECK ("lat" BETWEEN 20 AND 46),
  "lon" DOUBLE PRECISION NOT NULL CHECK ("lon" BETWEEN 122 AND 154),
  "bearingDeg" DOUBLE PRECISION NOT NULL CHECK ("bearingDeg" >= 0 AND "bearingDeg" < 360),
  "direction" VARCHAR(2) NOT NULL CHECK ("direction" IN ('N','NE','E','SE','S','SW','W','NW')),
  "judgment" JSONB NOT NULL,
  "requestKey" UUID NOT NULL, "requestDigest" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "listing_candidates_userId_requestKey_key" ON "listing_candidates" ("userId", "requestKey");
CREATE INDEX "listing_candidates_userId_createdAt_id_idx" ON "listing_candidates" ("userId", "createdAt", "id");
CREATE TABLE "listing_candidate_rates" (
  "key" VARCHAR(100) PRIMARY KEY, "hits" INTEGER NOT NULL, "resetsAt" TIMESTAMPTZ(6) NOT NULL
);
-- No direct browser/Supabase data access; Prisma's service role owns CRUD.
ALTER TABLE "listing_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_candidate_rates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "listing_candidates", "listing_candidate_rates" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "listing_candidates", "listing_candidate_rates" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "listing_candidates", "listing_candidate_rates" FROM authenticated;
  END IF;
END $$;
-- Supabase account deletion must also remove candidates. Local DBs may have no auth schema.
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_auth_user_fkey"
      FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE FUNCTION public.clear_listing_candidate_rates_on_account_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.listing_candidate_rates
  WHERE key IN ('read:' || OLD.id::text, 'write:' || OLD.id::text, 'geocode:' || OLD.id::text);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_listing_candidate_rates_on_account_delete() FROM PUBLIC;
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    CREATE TRIGGER clear_listing_candidate_rates
      AFTER DELETE ON auth.users FOR EACH ROW
      EXECUTE FUNCTION public.clear_listing_candidate_rates_on_account_delete();
  END IF;
END $$;

COMMIT;
