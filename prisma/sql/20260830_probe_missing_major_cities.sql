-- 大きい市が集計に載らない件を測る。SELECT だけ。
--
-- areaDirections.json（毎晩再生成）に、人口 47 万の**倉敷市が無い**。
-- 霧島市・八代市も無い。build_area_dataset は掲載 30 件（MIN_ROWS）
-- 未満の市区町村を落とすので、これらは掲載が 30 件に届いていない。
--
-- 岡山県は岡山市北区だけで 8,144 件あるのに倉敷が 30 件未満、という
-- 偏り方をしている。原因の候補は 3 つで、どれかを絞りたい。
--
--   (1) 巡回が倉敷まで届いていない（予算切れ・再開位置）
--   (2) nifty の市区町村一覧に倉敷が出ていない（一覧が細い。#648 の
--       probe で北海道が 10 件しか取れていなかったのと同じ症状）
--   (3) 住所の綴りが違って前方一致に掛からない
--
-- (3) なら DB に行はあるので A でわかる。A が 0 なら (1) か (2)。

-- A. 対象の市の在庫と最終巡回日。行があるのに集計に出ないなら綴りの問題
SELECT '倉敷市' AS city,
       count(*)                AS rows,
       max(last_seen_at)::date AS last_seen,
       min(first_seen_at)::date AS first_seen
  FROM rental_properties
 WHERE address LIKE '%倉敷市%'
UNION ALL
SELECT '霧島市', count(*), max(last_seen_at)::date, min(first_seen_at)::date
  FROM rental_properties WHERE address LIKE '%霧島市%'
UNION ALL
SELECT '八代市', count(*), max(last_seen_at)::date, min(first_seen_at)::date
  FROM rental_properties WHERE address LIKE '%八代市%'
UNION ALL
SELECT '（比較）岡山市北区', count(*), max(last_seen_at)::date, min(first_seen_at)::date
  FROM rental_properties WHERE address LIKE '%岡山市北区%';

-- B. 岡山県の市区町村ごとの在庫。どこまで届いているかを見る。
--    倉敷が 0 なら巡回か一覧の問題（A と合わせて判断）
SELECT COALESCE(substring(address from '岡山県([^0-9０-９]{2,8}?[市区町村])'), '(不明)') AS city,
       count(*)                AS rows,
       max(last_seen_at)::date AS last_seen
  FROM rental_properties
 WHERE address LIKE '岡山県%'
 GROUP BY 1
 ORDER BY 2 DESC
 LIMIT 40;

-- C. 同じことを鹿児島県・熊本県でも見る（霧島・八代の確認）
SELECT COALESCE(substring(address from '^(.{2,4}?[都道府県])'), '(不明)')             AS pref,
       COALESCE(substring(address from '[都道府県]([^0-9０-９]{2,8}?[市区町村])'), '(不明)') AS city,
       count(*)                AS rows,
       max(last_seen_at)::date AS last_seen
  FROM rental_properties
 WHERE address LIKE '鹿児島県%' OR address LIKE '熊本県%'
 GROUP BY 1, 2
 ORDER BY 3 DESC
 LIMIT 40;

-- D. 集計に載る条件（30 件）の際どい市区町村。閾値を下げる余地の見積もり
SELECT COALESCE(substring(address from '^(.{2,4}?[都道府県])'), '(不明)')             AS pref,
       COALESCE(substring(address from '[都道府県]([^0-9０-９]{2,8}?[市区町村])'), '(不明)') AS city,
       count(*) AS rows
  FROM rental_properties
 GROUP BY 1, 2
HAVING count(*) BETWEEN 5 AND 29
 ORDER BY 3 DESC
 LIMIT 30;
