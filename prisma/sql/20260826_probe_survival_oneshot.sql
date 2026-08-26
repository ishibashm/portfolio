-- 生存分析（/relocation/market）の「中央存続期間 0 日」の切り分け。SELECT だけ。
--
-- 症状: Kaplan-Meier 曲線が初日で 40% まで急落し、中央値が 0 日になる。
-- 全掲載の 6 割が「一度しか観測されずに消えた」ことになっており、
-- 市場の実態としては考えにくい。候補は 3 つ:
--
--   a. 再掲載の URL 揺れ … 同じ部屋がポータル側の再掲載で別 URL になり、
--      旧行が「即死」・新行が「新規」に見える
--   b. 巡回の網羅漏れ … 県の巡回が 7 日以上空くと、生きている掲載まで
--      「7 日見かけない＝終了」に落ちる（#47 の時間逼迫と整合）
--   c. 打ち切り方向の過小評価 … dur = last_seen - first_seen は真の
--      寿命より最大で巡回間隔ぶん短い（一度きりの観測は必ず 0 日）
--
-- 実行: db-apply-sql（mode=apply。SELECT のみなので二度当てても同じ）。

-- A. 観測の内訳。dur × gone のクロス集計
SELECT (last_seen_at < now() - interval '7 days')          AS gone,
       CASE
         WHEN last_seen_at::date = first_seen_at::date     THEN 'a: 0d(一度きり)'
         WHEN last_seen_at::date - first_seen_at::date = 1 THEN 'b: 1d'
         WHEN last_seen_at::date - first_seen_at::date <= 3 THEN 'c: 2-3d'
         WHEN last_seen_at::date - first_seen_at::date <= 7 THEN 'd: 4-7d'
         WHEN last_seen_at::date - first_seen_at::date <= 30 THEN 'e: 8-30d'
         ELSE 'f: 31d+'
       END                                                 AS dur_bucket,
       count(*)                                            AS n
  FROM rental_properties
 WHERE first_seen_at IS NOT NULL AND last_seen_at IS NOT NULL
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- B. 「一度きりで消えた」行の取得元。取り込み経路に偏りがあるか
SELECT source_scraper, count(*) AS n
  FROM rental_properties
 WHERE last_seen_at < now() - interval '7 days'
   AND last_seen_at::date = first_seen_at::date
 GROUP BY 1
 ORDER BY 2 DESC;

-- C. 県ごとの最終巡回日。7 日以上空いた県があれば b（網羅漏れ）が濃い
SELECT COALESCE(substring(address from '^.{1,3}?[都道府県]'), '(住所なし)') AS pref,
       max(last_seen_at)::date AS last_crawl,
       count(*)                AS n,
       count(*) FILTER (WHERE last_seen_at < now() - interval '7 days') AS gone_n
  FROM rental_properties
 GROUP BY 1
 ORDER BY 2 ASC, 3 DESC
 LIMIT 20;

-- D. 再掲載の痕跡。「一度きりで消えた」行の名寄せキー（建物×階×間取り×
--    広さ×家賃）と同じ組が、後から別の行として現れているか。
--    直近 20,000 行の標本。EXISTS は (name_key, floor, layout, size_sqm,
--    rent) の索引で引ける
WITH oneshot AS (
  SELECT id, name_key, floor, layout, size_sqm, rent, first_seen_at
    FROM rental_properties
   WHERE last_seen_at < now() - interval '7 days'
     AND last_seen_at::date = first_seen_at::date
     AND name_key IS NOT NULL
   ORDER BY first_seen_at DESC
   LIMIT 20000
)
SELECT count(*) AS sampled,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1
           FROM rental_properties r
          WHERE r.name_key = o.name_key
            AND r.floor    IS NOT DISTINCT FROM o.floor
            AND r.layout   IS NOT DISTINCT FROM o.layout
            AND r.size_sqm IS NOT DISTINCT FROM o.size_sqm
            AND r.rent     IS NOT DISTINCT FROM o.rent
            AND r.id <> o.id
            AND r.first_seen_at > o.first_seen_at
       )) AS relisted_later
  FROM oneshot o;
