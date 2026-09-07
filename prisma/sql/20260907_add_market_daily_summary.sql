-- 県別の家賃水準を**毎晩 1 行ずつ**積む表を足す。
--
-- ## なぜ要るか
--
-- scripts/build_market_stats.ts は毎晩、県ごとの中央値・㎡単価・四分位を
-- 計算して src/data/marketStats.json に焼いている。ただし JSON は
-- **上書き**なので、水準の推移は残らない。/relocation/market の
-- 「家賃指数」は 5 日ぶん貯まるまで「蓄積中（現在 0 日ぶん）」と出す
-- 設計で、スクリプトはこの表へ upsert してから直近 180 日を読み返す。
--
-- **その表が本番に無い。**スキーマ（prisma/schema.prisma の
-- MarketDailySummary）には 2026-08 からあるが、足したのは run-seed を
-- 使わなくなった後で、この表だけ当て漏れていた。スクリプトは
--
--     MarketDailySummary への蓄積をスキップ（テーブル未作成？ …）
--
-- と警告して続行するので、毎晩の集計は成功扱いのまま、marketStats.json
-- の rentIndexSeries は導入日からずっと空配列だった（2026-09-07 の
-- 焼き上がりで確認）。画面は「蓄積中（0 日ぶん）」を出し続けている。
--
-- 地域ニュース（県ごとの「今週の動き」）はこの表の前週比から書くので、
-- ここが最初の 1 歩になる。
--
-- ## 鍵は (date, prefecture)
--
-- 1 県 1 日 1 行。全国合算は prefecture = '全国' で同じ表に入れる
-- （スクリプトがそうしている。別表にすると読む側が 2 度引く）。
--
-- ## 既定値を置かない
--
-- n / 中央値 / 四分位は毎晩の実測で、取れなければ行を作らない。
-- DEFAULT を置くと「掲載 0 件の日」と「集計が落ちた日」の区別が消える。
-- createdAt の DEFAULT now() は「行を作った時刻」で、集計に使う値では
-- ないので置いてよい（search_console_daily と同じ）。
--
-- ## 個人情報は入らない
--
-- 県単位の集計値だけ。物件も利用者も特定できない。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の MarketDailySummary と揃えてある
-- （Prisma の既定どおり、表名・列名は camelCase のまま引用符つき）。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS "MarketDailySummary" (
  -- 集計した日（DB の CURRENT_DATE。スクリプトが INSERT で置く）。
  "date" DATE NOT NULL,
  -- 県名。全国合算は '全国'。
  "prefecture" TEXT NOT NULL,

  -- 集計対象の掲載数。
  "n" INTEGER NOT NULL,
  -- 総家賃（管理費込み）の中央値（円）。
  "medianRent" INTEGER NOT NULL,
  -- ㎡単価の中央値（円/㎡）。面積構成の変化に強い実質的な指数。
  "medianSqmRent" INTEGER NOT NULL,
  "p25Rent" INTEGER NOT NULL,
  "p75Rent" INTEGER NOT NULL,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketDailySummary_pkey" PRIMARY KEY ("date", "prefecture")
);

-- 「この県は最近どうなっているか」を日付順に引く。県ページの
-- 「今週の動き」と、全国の家賃指数（prefecture = '全国'）の入口。
CREATE INDEX IF NOT EXISTS "MarketDailySummary_prefecture_date_idx"
ON "MarketDailySummary" ("prefecture", "date");
