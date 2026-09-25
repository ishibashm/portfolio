-- 前面道路の 3 列の埋まり方を見る（SELECT のみ）
--
-- 2026-09-25 に全国を取り直した（import-property-transactions の fetch、
-- run 36147445420。2,471,817 件を上書き、件数は前後で同じ）。画面に
-- 「前面道路の方位」の絞り込みを足す前に、どの種類の取引にどれだけ
-- 値が入ったか、値の綴りが何通りあるかを確かめる。
--
-- マンションは接道が無く "" で来るので NULL のまま（propertyTxParse）。

-- A. 種類別: 前面道路の方位が入った割合
SELECT property_type,
       count(*)                                                    AS n,
       count(road_direction)                                       AS with_dir,
       round(100.0 * count(road_direction) / count(*), 1)          AS dir_pct,
       count(road_breadth_m)                                       AS with_breadth
  FROM property_transactions
 GROUP BY property_type
 ORDER BY n DESC;

-- B. 方位の値の綴り（何通りあるか。画面の選択肢をここから決める）
SELECT road_direction, count(*) AS n
  FROM property_transactions
 WHERE road_direction IS NOT NULL
 GROUP BY road_direction
 ORDER BY n DESC;

-- C. 道路の種類の綴り（上位 20）
SELECT road_classification, count(*) AS n
  FROM property_transactions
 WHERE road_classification IS NOT NULL
 GROUP BY road_classification
 ORDER BY n DESC
 LIMIT 20;

-- D. 年別に入っているか（取り直しが全年に及んだか）
SELECT trade_year,
       count(*)              AS n,
       count(road_direction) AS with_dir
  FROM property_transactions
 GROUP BY trade_year
 ORDER BY trade_year;
