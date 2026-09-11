-- 市区町村別の住宅の統計（家賃・空き家）を積む表を足す。
--
-- ## なぜ要るか
--
-- 利用者の判断（2026-09-11）。物件の在庫を持つのをやめ、方位別の相場を
-- 公的データで出す（docs/improvement-backlog.md 26 節）。「その方位は
-- いくらで住めるか」「空き家が多いか」を、地価公示・成約価格の隣に
-- 並べる。個別の物件は載せない。
--
-- ## 出どころ
--
-- e-Stat「統計でみる市区町村のすがた」の表 0000020108（Ｈ 居住）。
-- 富裕度（municipalities_wealth）が同じ体系の 0000020103（Ｃ 経済基盤）
-- を取っていて、地域コードも年度の付け方も同じ。項目は探索
-- （run 34649544727）で実物を見て決めた。
--
--   H1100    総住宅数（戸）
--   H110202  空き家数（戸）                → 空き家率 = H110202 / H1100
--   H4104    専用住宅の 1 畳当たり家賃（円）  → 円/㎡ は ÷ 1.62 で出す
--   H212020  1 住宅当たり居住室の畳数（借家）（畳）
--   H213020  1 住宅当たり延べ面積（借家）（㎡）
--
-- 「1 か月当たり家賃」そのものは e-Stat に市区町村別の平均が無い
-- （住調の表は 10 区分の戸数＝分布）。月額は H4104 × H212020 を目安と
-- して画面で出す。ここには元の値だけを置き、割り算・掛け算は読む側で
-- 行う（丸めた値を積むと出どころに戻れない）。
--
-- ## 鍵は地域コード × 調査年
--
-- 住調は 5 年ごと（2018・2023）。年を鍵に入れて、次の調査を足しても
-- 前の年が残るようにする（land_price_points と同じ考え方）。
--
-- 座標は持たない。方位の判定は areaDirections.json の代表点
-- （src/lib/areaContent の AREAS）と地域コードで結ぶ。
--
-- ## 既定値を置かない
--
-- 数値の列は e-Stat の実測で、欠測（"-" や "***"。町村は住調の対象外
-- のことがある）は NULL のまま置く。DEFAULT を置くと「無い」と「0」の
-- 区別が消える。created_at / updated_at の now() は行の時刻で、
-- land_price_points と同じ。
--
-- ## 個人情報は入らない
--
-- 市区町村の集計値だけ。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の municipality_housing_stats と揃えてある。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS municipality_housing_stats (
  -- e-Stat の地域コード（5 桁。/houi/area/{code} と同じ JIS コード）。
  area_code             TEXT NOT NULL,
  -- 住宅・土地統計調査の調査年（2018 / 2023）。
  data_year             INTEGER NOT NULL,
  area_name             TEXT,
  -- H1100 総住宅数（戸）
  total_dwellings       INTEGER,
  -- H110202 空き家数（戸）
  vacant_dwellings      INTEGER,
  -- H4104 専用住宅の 1 畳当たり家賃（円）
  rent_per_tatami_yen   INTEGER,
  -- H212020 1 住宅当たり居住室の畳数（借家）（畳）
  tatami_per_rental     DOUBLE PRECISION,
  -- H213020 1 住宅当たり延べ面積（借家）（㎡）
  floor_area_per_rental DOUBLE PRECISION,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (area_code, data_year)
);

-- 最新の調査年を全件引く（方位別の口は年で 1 回読んで地域コードで結ぶ）。
CREATE INDEX IF NOT EXISTS municipality_housing_stats_data_year_idx
ON municipality_housing_stats (data_year);
