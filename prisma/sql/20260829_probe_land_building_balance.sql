-- 「どこなら土地と建物にバランスよく予算を配分できるか」の実測（SELECT のみ）
--
-- 記事にする前に、本番の成約データで分布を出す。building_ratio は
-- est_building_price / trade_price（積算評価による**推定**。式と出典は
-- scripts/propertyTxParse.ts）。0 = 全部土地代、1 = 全部建物代。
--
-- 「バランス帯」= 0.40〜0.60。土地と建物に予算がほぼ半々に配分された取引。
-- 直近に絞る（trade_year >= 2021）。古い成約を混ぜると相場が薄まる。

-- A. 県別: 中央値と、バランス帯に入る取引の割合
SELECT prefecture,
       count(*)                                                          AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY trade_price)::bigint  AS price_p50,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY area_sqm)::int        AS area_p50,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio)::numeric, 3) AS ratio_p50,
       round(100.0 * count(*) FILTER (WHERE building_ratio BETWEEN 0.40 AND 0.60)
             / count(*), 1)                                              AS balanced_pct
  FROM property_transactions
 WHERE property_type = '宅地(土地と建物)'
   AND building_ratio IS NOT NULL
   AND trade_price IS NOT NULL
   AND trade_year >= 2021
 GROUP BY prefecture
 ORDER BY balanced_pct DESC;

-- B. 市区町村別: バランス帯の中央値を持つ街（件数が十分なもの）を、
--    総額の安い順に。都市圏の通勤県に絞る
SELECT prefecture, municipality,
       count(*)                                                          AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY trade_price)::bigint  AS price_p50,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY area_sqm)::int        AS area_p50,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio)::numeric, 3) AS ratio_p50
  FROM property_transactions
 WHERE property_type = '宅地(土地と建物)'
   AND building_ratio IS NOT NULL AND trade_price IS NOT NULL
   AND trade_year >= 2021
   AND prefecture IN ('東京都','神奈川県','埼玉県','千葉県','愛知県','大阪府','京都府','兵庫県','奈良県','福岡県')
 GROUP BY prefecture, municipality
HAVING count(*) >= 200
   AND percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio) BETWEEN 0.40 AND 0.60
 ORDER BY price_p50 ASC
 LIMIT 30;

-- C. 両極: 土地に寄っている街（都心型）
SELECT prefecture, municipality, count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY trade_price)::bigint AS price_p50,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio)::numeric, 3) AS ratio_p50
  FROM property_transactions
 WHERE property_type = '宅地(土地と建物)'
   AND building_ratio IS NOT NULL AND trade_price IS NOT NULL AND trade_year >= 2021
 GROUP BY prefecture, municipality
HAVING count(*) >= 500
 ORDER BY percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio) ASC
 LIMIT 12;

-- D. 両極: 建物に寄っている街
SELECT prefecture, municipality, count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY trade_price)::bigint AS price_p50,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio)::numeric, 3) AS ratio_p50
  FROM property_transactions
 WHERE property_type = '宅地(土地と建物)'
   AND building_ratio IS NOT NULL AND trade_price IS NOT NULL AND trade_year >= 2021
 GROUP BY prefecture, municipality
HAVING count(*) >= 500
 ORDER BY percentile_cont(0.5) WITHIN GROUP (ORDER BY building_ratio) DESC
 LIMIT 12;
