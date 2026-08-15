-- 郵便番号と住所・座標の対応表。
--
-- 入力を楽にするために足す。生年月日・出生地・現在地の 3 つでこのサイトの
-- 答えが決まるのに、場所の入力が一番の壁になっていた。番号さえ覚えていれば
-- 地名を思い出さずに済む（利用者の要望）。
--
-- 元データは日本郵便が配っている郵便番号データ（ken_all）。**あちらに座標は
-- 無い**ので、住所から座標は取り込みのときに国土地理院で引いて一緒に持つ。
-- 画面を開くたびに外へ出ないようにするため。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の postal_codes と揃えること
-- （db push はスキーマに無い表・索引を消す）。
--
-- 行数はおよそ 12 万。1 行が短いので、索引を含めても数十 MB に収まる。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS postal_codes (
  -- 7 桁。ハイフンは持たない（画面側で外してから引く）。
  code       char(7)     PRIMARY KEY,
  -- 「京都府京都市南区東九条」のように、都道府県から町域まで繋げた形。
  address    text        NOT NULL,
  -- 住所から引いた座標。**引けなかった番号は NULL で残す。**
  -- 行ごと消すと「表に無い」と「座標が出せない」の区別が付かなくなり、
  -- 取り込みを再開するときにどこから続けるか分からなくなる。
  lat        double precision,
  lon        double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 座標がまだ埋まっていない行を探して続きから取り込む。
CREATE INDEX IF NOT EXISTS postal_codes_missing_coords_idx
  ON postal_codes (code)
  WHERE lat IS NULL;
