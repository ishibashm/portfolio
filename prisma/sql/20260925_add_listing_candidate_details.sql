-- 本人が明示保存した候補の構造化項目だけ。メール本文は保存しない。
-- Apply additive SQL の単一トランザクションで適用。再実行可能。
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "propertyName" VARCHAR(120);
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "rentYen" INTEGER;
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "managementFeeYen" INTEGER;
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "deposit" VARCHAR(80);
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "keyMoney" VARCHAR(80);
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "layout" VARCHAR(40);
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "floorAreaM2" DOUBLE PRECISION;
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "nearestStation" VARCHAR(120);
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "walkMinutes" INTEGER;
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "address" VARCHAR(256);
ALTER TABLE public.listing_candidates ADD COLUMN IF NOT EXISTS "buildingAgeYears" INTEGER;
