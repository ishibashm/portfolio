-- 利回りマップが成り立つかを数える。**読むだけ。**
--
-- 表面利回りは「同じ場所の賃貸相場 ÷ 成約価格」で出す。区画（0.05 度、
-- 約 5km 四方）ごとに両側の中央値を取る設計にしてある
-- （src/utils/yieldStats.ts）。
--
-- ただし property_transactions の座標は**まだ全国に入っていない**。
-- 京都府から順に埋めている途中で、残りは NULL のはず。座標が無ければ
-- 区画に落とせないので、両側そろう区画は出ない。
--
-- **作る前に数える。**出る区画が数十しか無いなら、区画ではなく
-- 市区町村コードで突き合わせる設計に変えたほうがよい。当てずっぽうで
-- 画面まで作ってから「ほとんど白地図でした」を避ける。
--
-- 全行を読む集計なので、夜間の収集（scrape-rentals）と重ねないこと。
-- SELECT だけなので行は変えない。二度回しても同じ。

-- ① 座標と、利回りに使える値がどれだけ入っているか
SELECT
  '賃貸 rental_properties' AS "表",
  count(*)                                                        AS "全行",
  count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)     AS "座標あり",
  count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL
                     AND rent > 0 AND size_sqm > 0)               AS "利回りに使える"
FROM rental_properties
UNION ALL
SELECT
  '成約 property_transactions',
  count(*),
  count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL),
  count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL
                     AND unit_price_sqm > 0)
FROM property_transactions;

-- ② 区画（0.05 度）ごとに、片側 5 件以上そろう区画がいくつあるか。
--    5 件は MIN_SAMPLES_PER_SIDE と同じ。ここが両側で数十しか無ければ
--    地図はほぼ白いままになる。
WITH r AS (
  SELECT floor(lat / 0.05)::int AS y, floor(lon / 0.05)::int AS x, count(*) AS n
  FROM rental_properties
  WHERE lat IS NOT NULL AND lon IS NOT NULL AND rent > 0 AND size_sqm > 0
  GROUP BY 1, 2
), p AS (
  SELECT floor(lat / 0.05)::int AS y, floor(lon / 0.05)::int AS x, count(*) AS n
  FROM property_transactions
  WHERE lat IS NOT NULL AND lon IS NOT NULL AND unit_price_sqm > 0
  GROUP BY 1, 2
)
SELECT
  (SELECT count(*) FROM r WHERE n >= 5)                AS "賃貸が5件以上の区画",
  (SELECT count(*) FROM p WHERE n >= 5)                AS "成約が5件以上の区画",
  (SELECT count(*) FROM r JOIN p USING (y, x)
     WHERE r.n >= 5 AND p.n >= 5)                      AS "両側そろう区画";

-- ③ 都道府県ごとの座標の入り具合。どこなら地図が出せるかが分かる。
SELECT
  prefecture                                        AS "都道府県",
  count(*)                                          AS "成約行",
  count(*) FILTER (WHERE lat IS NOT NULL)           AS "座標あり"
FROM property_transactions
GROUP BY 1
ORDER BY 3 DESC, 2 DESC
LIMIT 15;
