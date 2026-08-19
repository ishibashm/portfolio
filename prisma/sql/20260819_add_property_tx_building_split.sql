-- property_transactions に「土地と建物の内訳（推定）」を足す。
--
-- 国交省の成約データは「宅地(土地と建物)」の取引を**総額でしか返さない**
-- （内訳は公開されていない）。そこで積算評価で分解した推定値を、
-- 取り込みのときに前計算して持つ。
--
--   建物推定額 = 延床面積 × 構造別の再調達単価 × 残存年数比（築年から）
--   土地推定額 = 総額 − 建物推定額
--
-- 画面で毎回計算しないための前計算（unit_price_sqm と同じ方針）。
-- 「建物がしっかりしているのに土地は普通」という絞り込みは
-- building_ratio の数値比較 1 本になるので、索引が効く。
--
-- ## 推定であることを列名に残す
--
-- est_ を付けるのは、実額と取り違えないため。単価表は目安であって
-- 個々の建物の実勢ではない（式と単価は scripts/propertyTxParse.ts に
-- 出典ごと書く）。
--
-- ## 既定値を置かない
--
-- NULL は「まだ計算していない / 計算に要る項目が欠けている」。
-- 既存の 247 万行は再取り込み（ON CONFLICT DO UPDATE）で順に埋まる。
-- id は延床・構造・築年まで含んだ決定的な鍵なので、再取り込みで
-- 行が増えることはない。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の property_transactions と揃えること。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

ALTER TABLE "property_transactions"
ADD COLUMN IF NOT EXISTS "total_floor_area_sqm" DOUBLE PRECISION;

ALTER TABLE "property_transactions"
ADD COLUMN IF NOT EXISTS "est_building_price" BIGINT;

ALTER TABLE "property_transactions"
ADD COLUMN IF NOT EXISTS "est_land_price" BIGINT;

ALTER TABLE "property_transactions"
ADD COLUMN IF NOT EXISTS "building_ratio" DOUBLE PRECISION;

-- 絞り込みは「種類 × 比率」で引くので複合にする。
CREATE INDEX IF NOT EXISTS "property_transactions_type_building_ratio_idx"
ON "property_transactions" ("property_type", "building_ratio");
