-- 地価公示・都道府県地価調査を**地点のまま**持つ表を足す。
--
-- ## なぜ要るか
--
-- いま持っているのは municipality_wealth.land_price_per_sqm という
-- 市区町村ごとの 1 つの数字だけで、しかもその中身は「代表点が入る
-- 1.2km 四方（z=15 のタイル 1 枚）に含まれる地点の平均」だった。
-- probe（run 32305342276）の実測で 1 タイルあたり 4〜15 地点。
--
-- 「この土地の値段は普通か」を見るには、市の代表値ではなく
-- **近くの地点そのもの**が要る。成約価格（property_transactions）と
-- 同じ考え方で、地点を地点のまま持つ。
--
-- ## 何を入れるか
--
-- 項目名は probe で実物を確認済み（scripts/landPriceParse.ts に
-- 対応を書いた）。当年価格は u_current_years_price_ja に
-- "1,970,000(円/㎡)" の形で入るので、数値に直して price_per_sqm へ。
--
-- ## 鍵は (point_id, year, land_price_type)
--
-- point_id は地点の整理番号で、年をまたいで同じ地点を指す。年ごとに
-- 1 行持ちたいので year と組む。
--
-- **land_price_type も鍵に入れる。**この API は 2 つの制度を同じ形で
-- 返す（0 = 地価公示・1月1日時点 / 1 = 都道府県地価調査・7月1日時点）。
-- point_id が制度をまたいで一意かどうかは公表されておらず、probe で
-- 見えた 45 地点はすべて 0 だったので確かめようがない。もし制度ごとの
-- 採番なら、鍵に入れないと**片方がもう片方を黙って上書きする**。
-- 入れておけば、一意であってもただ列が 1 つ増えるだけで害が無い。
--
-- 鍵に入れる以上 NOT NULL。取り込み側は、この項目が無い地点を
-- 適当な値で埋めずに飛ばして件数を報告する。
--
-- ## 既定値を置かない
--
-- NULL は「その項目が応答に無かった」。DEFAULT を置くと、当てた日に
-- 既存の全行がその値を選んだことになる。用途区分や住所が空の地点は
-- 実際にあるので、空文字ではなく NULL のままにする。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の land_price_points と揃えること。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS "land_price_points" (
  -- 地点の整理番号。年をまたいで同じ地点を指す。
  "point_id" BIGINT NOT NULL,
  -- 基準年（2025 なら令和7年1月1日時点）。
  "year" INTEGER NOT NULL,

  -- 当年の価格（円/㎡）。読めなかった地点はそもそも入れない。
  "price_per_sqm" BIGINT NOT NULL,
  -- 前年の価格（円/㎡）。無い年・無い地点がある。
  "last_year_price_per_sqm" BIGINT,

  -- 0 = 地価公示（1月1日時点） / 1 = 都道府県地価調査（7月1日時点）。
  -- 鍵の一部なので NOT NULL。無い地点は取り込まない。
  "land_price_type" INTEGER NOT NULL,
  -- 「住宅地」「商業地」など。
  "use_category" TEXT,
  -- 「東京都千代田区富士見１丁目８番６」
  "location" TEXT,
  -- 「千代田-4」
  "standard_lot_number" TEXT,

  "prefecture" TEXT,
  "municipality" TEXT,

  -- 地点の座標。方位や距離で引くために持つ。
  "lat" DOUBLE PRECISION,
  "lon" DOUBLE PRECISION,

  -- 既存の property_transactions と同じ形（timestamptz + now()）。
  -- ここの DEFAULT は「行を作った時刻」であって、判定に使う値では
  -- ないので置いてよい（禁止しているのは、当てた日に全員が選んだ
  -- ことになってしまう類の既定値）。
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "land_price_points_pkey"
    PRIMARY KEY ("point_id", "year", "land_price_type")
);

-- 「この座標の近く」を矩形で絞ってから距離を測る。成約価格の
-- 引き方（lat/lon の複合索引）に合わせる。
CREATE INDEX IF NOT EXISTS "land_price_points_year_lat_lon_idx"
ON "land_price_points" ("year", "lat", "lon");

-- 市区町村ごとの集計（本当の市域平均を出すとき）に使う。
CREATE INDEX IF NOT EXISTS "land_price_points_year_pref_muni_idx"
ON "land_price_points" ("year", "prefecture", "municipality");

-- 「住宅地だけ」で絞ってから値段を見る、という読み方をするので
-- 用途区分と価格を複合で持つ。
CREATE INDEX IF NOT EXISTS "land_price_points_year_use_price_idx"
ON "land_price_points" ("year", "use_category", "price_per_sqm");
