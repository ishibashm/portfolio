-- Phase 1/2 の統合DDL。db-apply-sql.yml が単一トランザクションで適用する。
-- 再適用可能。labelId は本人が選択するまで NULL。旧 DROP NOT NULL は不要。
-- uuid() は Prisma 側で生成するため、DB の UUID デフォルトは設けない。
-- auth.users の外部キー・RLS・退会トリガーは Prisma モデル外の保護として維持する。
SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS "listing_candidates" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "url" VARCHAR(2048), "title" VARCHAR(120), "memo" VARCHAR(1000),
  "lat" DOUBLE PRECISION NOT NULL,
  "lon" DOUBLE PRECISION NOT NULL,
  "bearingDeg" DOUBLE PRECISION NOT NULL,
  "direction" VARCHAR(2) NOT NULL,
  "judgment" JSONB NOT NULL,
  "requestKey" UUID NOT NULL, "requestDigest" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL
);
-- 既存表にも不足する検査制約を追加する。制約名は旧SQLの自動命名と同じ。
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_candidates'::regclass AND conname = 'listing_candidates_lat_check') THEN
    ALTER TABLE listing_candidates ADD CONSTRAINT "listing_candidates_lat_check" CHECK ("lat" BETWEEN 20 AND 46);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_candidates'::regclass AND conname = 'listing_candidates_lon_check') THEN
    ALTER TABLE listing_candidates ADD CONSTRAINT "listing_candidates_lon_check" CHECK ("lon" BETWEEN 122 AND 154);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_candidates'::regclass AND conname = 'listing_candidates_bearingDeg_check') THEN
    ALTER TABLE listing_candidates ADD CONSTRAINT "listing_candidates_bearingDeg_check" CHECK ("bearingDeg" >= 0 AND "bearingDeg" < 360);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_candidates'::regclass AND conname = 'listing_candidates_direction_check') THEN
    ALTER TABLE listing_candidates ADD CONSTRAINT "listing_candidates_direction_check" CHECK ("direction" IN ('N','NE','E','SE','S','SW','W','NW'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "listing_candidates_userId_requestKey_key" ON "listing_candidates" ("userId", "requestKey");
CREATE INDEX IF NOT EXISTS "listing_candidates_userId_createdAt_id_idx" ON "listing_candidates" ("userId", "createdAt", "id");
CREATE TABLE IF NOT EXISTS "listing_candidate_rates" (
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
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_candidates'::regclass
      AND conname = 'listing_candidates_auth_user_fkey'
  ) THEN
    ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_auth_user_fkey"
      FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $guard$ BEGIN
  IF to_regprocedure('public.clear_listing_candidate_rates_on_account_delete()') IS NULL THEN
    CREATE FUNCTION public.clear_listing_candidate_rates_on_account_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.listing_candidate_rates
  WHERE key IN ('read:' || OLD.id::text, 'write:' || OLD.id::text, 'geocode:' || OLD.id::text);
  RETURN OLD;
END;
$$;
  END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.clear_listing_candidate_rates_on_account_delete() FROM PUBLIC;
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('auth.users')
      AND tgname = 'clear_listing_candidate_rates'
  ) THEN
    CREATE TRIGGER clear_listing_candidate_rates
      AFTER DELETE ON auth.users FOR EACH ROW
      EXECUTE FUNCTION public.clear_listing_candidate_rates_on_account_delete();
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS listing_email_connections (
  id UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "labelId" VARCHAR(200),
  "startedAt" TIMESTAMPTZ(6) NOT NULL,
  "sealedState" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "listing_email_connections_userId_idx" ON listing_email_connections ("userId");
CREATE TABLE IF NOT EXISTS listing_email_oauth_states (
  "userId" UUID PRIMARY KEY,
  "stateHash" VARCHAR(64) NOT NULL,
  "browserHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_email_connections'::regclass AND conname = 'listing_email_connection_owner_fk') THEN
      ALTER TABLE listing_email_connections ADD CONSTRAINT listing_email_connection_owner_fk FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listing_email_oauth_states'::regclass AND conname = 'listing_email_oauth_owner_fk') THEN
      ALTER TABLE listing_email_oauth_states ADD CONSTRAINT listing_email_oauth_owner_fk FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 旧SQLを途中まで適用したDBでは自動変更せず停止する。破壊的DDLはこの経路で行わない。
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.listing_email_connections'::regclass
      AND attname = 'labelId' AND attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'listing_email_connections.labelId must be nullable; review legacy schema before applying';
  END IF;
END $$;
