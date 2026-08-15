-- 不動産の成約価格（実際に売買された価格）。
--
-- 土地・マンション・戸建の購入を扱えるようにするための受け皿（利用者の要望）。
-- 元データは国土交通省「不動産情報ライブラリ」の取引価格情報。**地価公示
-- （scripts/import_land_prices.ts）と同じ API キーで引ける**ので、鍵の追加は
-- 要らない。無料・公開データ。
--
-- HOME'S や SUUMO の公開 API は無いため、売り出し中の個別物件はここには
-- 入らない。ここに入るのは「いくらで売れたか」の実績で、相場の基準になる。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の property_transactions と揃えること
-- （db push はスキーマに無い表・索引を消す）。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS property_transactions (
  -- 国交省の応答に安定した id は無い。同じ取引を二度入れないための鍵を
  -- こちらで作る（下の unique を参照）。
  id             text        PRIMARY KEY,

  -- いつの取引か。「2023年第3四半期」のような期でしか出ない。
  trade_year     integer     NOT NULL,
  trade_quarter  integer     NOT NULL,

  -- どこか。市区町村コードは国交省の値をそのまま持つ。
  municipality_code text     NOT NULL,
  prefecture     text        NOT NULL,
  municipality   text        NOT NULL,
  -- 地区名（「東九条」など）。町名までしか出ない。番地は公開されない。
  district_name  text,

  -- 種類（「宅地(土地)」「中古マンション等」「宅地(土地と建物)」など）。
  -- 土地とマンションを分けて見るのに使う。
  property_type  text,

  -- 取引価格（総額・円）。
  trade_price    bigint,
  -- 面積（㎡）。土地は敷地、マンションは専有。
  area_sqm       double precision,
  -- ㎡単価。総額 / 面積を取り込み時に出して持つ。**割り算を画面でしない**
  -- （面積 0 の行が混ざると画面側で Infinity になる）。
  unit_price_sqm double precision,

  -- 建物の年（西暦）。土地のみの取引では NULL。
  building_year  integer,
  structure      text,
  use_type       text,

  -- 地区名から引いた座標。**引けなかった行は NULL で残す。**
  -- 方位はここから測る。郵便番号の表と同じ考え方で、取り込み時に引く。
  lat            double precision,
  lon            double precision,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 市区町村と期で引く。画面は「この市の直近の相場」を出す。
CREATE INDEX IF NOT EXISTS property_transactions_muni_period_idx
  ON property_transactions (municipality_code, trade_year DESC, trade_quarter DESC);

-- 種類で分けて見る（土地とマンションを混ぜない）。
CREATE INDEX IF NOT EXISTS property_transactions_type_idx
  ON property_transactions (property_type);

-- 方位で絞るときに使う。物件走査（rental_properties）と同じ形。
CREATE INDEX IF NOT EXISTS property_transactions_latlon_idx
  ON property_transactions (lat, lon);

-- 座標がまだ埋まっていない行を探して続きから取り込む。
CREATE INDEX IF NOT EXISTS property_transactions_missing_coords_idx
  ON property_transactions (id)
  WHERE lat IS NULL;
