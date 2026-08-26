-- 巡回の網羅を測る。SELECT だけ。#648（再開位置の固定）の効果測定にも使う。
--
-- #648 で「完了時に再開位置のファイルを消す」を直した。効果は翌朝の
-- 巡回から出るので、**同じ SQL を前後で回して比べる**ためのもの。
--
-- あわせて、まだ答えの出ていない問いを 1 つ測る:
--
--   市区町村一覧が細すぎないか。nifty は都道府県トップページの
--   `_ct/` リンクから一覧を作っており、2026-08-25 の実測では北海道が
--   **10 件**しか取れていなかった（在庫 43,688 件）。しかも再開位置に
--   入っていた fukagawashi はその 10 件に含まれない＝日によって中身が
--   変わる。一覧が細いなら、再開位置を直しても届かない市区町村が残る。
--   D の「DB が知っている市区町村の数」がその上限を示す。

-- A. 一度きり観測の割合（#647 の 53% と比べる指標）
SELECT source_scraper,
       count(*)                                                   AS total,
       count(*) FILTER (WHERE last_seen_at::date = first_seen_at::date) AS oneshot,
       round(100.0 * count(*) FILTER (WHERE last_seen_at::date = first_seen_at::date)
             / nullif(count(*), 0), 1)                            AS oneshot_pct
  FROM rental_properties
 WHERE first_seen_at IS NOT NULL AND last_seen_at IS NOT NULL
 GROUP BY 1
 ORDER BY 2 DESC;

-- B. 県ごとの最終巡回日。#648 が効けば「今日か昨日」に寄るはず
SELECT COALESCE(substring(address from '^.{1,3}?[都道府県]'), '(住所なし)') AS pref,
       max(last_seen_at)::date                                  AS last_crawl,
       count(*)                                                 AS n,
       round(100.0 * count(*) FILTER (WHERE last_seen_at > now() - interval '7 days')
             / nullif(count(*), 0), 1)                          AS fresh_pct
  FROM rental_properties
 GROUP BY 1
 ORDER BY 2 ASC, 3 DESC;

-- C. 直近 24 時間に触れた行数。巡回が予算を使えているかの直接の指標。
--    #648 の前は長崎 1.2 分・北海道 1.2 分で終わっていた
SELECT COALESCE(substring(address from '^.{1,3}?[都道府県]'), '(住所なし)') AS pref,
       count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours') AS touched_24h,
       count(*)                                                           AS inventory
  FROM rental_properties
 GROUP BY 1
 ORDER BY 2 DESC
 LIMIT 25;

-- D. DB が知っている市区町村の数（＝これまでに一覧へ出たことのある数）。
--    トリガーが埋める municipality_key を使う。1 回の巡回で見えるのが
--    10 件でも、ここが大きければ「日替わりで違う 10 件が出ている」ことに
--    なる。近ければ、一覧そのものが上限になっている
SELECT COALESCE(substring(address from '^.{1,3}?[都道府県]'), '(住所なし)') AS pref,
       count(DISTINCT municipality_key)                          AS municipalities,
       count(*)                                                  AS inventory
  FROM rental_properties
 WHERE municipality_key IS NOT NULL
 GROUP BY 1
 ORDER BY 2 DESC
 LIMIT 25;
