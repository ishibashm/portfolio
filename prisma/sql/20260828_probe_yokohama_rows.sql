-- 横浜市の行が DB にあるか、集計（areaDirections.json）に載るかの切り分け。SELECT のみ。
--
-- 経緯: 神奈川県の市区町村別データに**横浜市の区が 1 件も無い**（川崎市の区はある）
-- ことに 2026-08-28 の都道府県ページ作成中に気付いた。
--
-- 収集側のログでは、横浜は nifty の一覧に `yokohamashi`（区ごとではなく市ひとつ）
-- として入っており、2026-08-28 の run で 311 ページ・37,657 件を取り込んでいる。
-- ただし予算 160 分を使い切って**途中で打ち切られた**（区の全部は回りきっていない）。
--
-- 集計側（scripts/build_area_dataset.ts）は jis_city_codes の
-- `full`（例: 神奈川県横浜市西区）で `address LIKE full || '%'` を引き、
-- 生きている掲載が 30 件（MIN_ROWS）以上ある市区町村だけを載せる。
--
-- そこで、区ごとに「生きている行が何件あるか」を数えて、
-- 30 件に届いていないだけなのか、住所の形が違って当たらないのかを見分ける。

-- A. 神奈川県の市区町村ごとの生存件数（上位 25）。横浜の区が並ぶか。
SELECT
  substring(address from '^神奈川県[^0-9]{2,8}?[市区町村]') AS city_guess,
  count(*) AS rows_live
FROM rental_properties
WHERE address LIKE '神奈川県%'
  AND last_seen_at > now() - interval '30 days'
GROUP BY 1
ORDER BY rows_live DESC
LIMIT 25;

-- B. 「神奈川県横浜市」で始まる行の総数と、区ごとの内訳。
SELECT
  substring(address from '^神奈川県横浜市[^0-9]{1,6}区') AS ward,
  count(*) FILTER (WHERE last_seen_at > now() - interval '30 days') AS rows_live,
  count(*) AS rows_all,
  max(last_seen_at) AS last_seen
FROM rental_properties
WHERE address LIKE '神奈川県横浜市%'
GROUP BY 1
ORDER BY rows_live DESC NULLS LAST
LIMIT 25;

-- C. 住所の形そのものを見る（先頭が県名で始まらない行が混ざっていないか）。
SELECT left(address, 24) AS sample, count(*) AS n
FROM rental_properties
WHERE address ILIKE '%横浜%'
GROUP BY 1
ORDER BY n DESC
LIMIT 15;
