-- 巡回の再開位置を DB に置く。**足すだけ**（CREATE TABLE IF NOT EXISTS）。
--
-- ## なぜ
--
-- 再開位置は今 GitHub Actions の cache に置いている。ところが実測
-- （2026-08-30、okayama の巡回ログ）で、**復元できない回がある**と
-- 分かった。
--
--   2026-08-21  Cache restored ... Loaded state {"city":"okayamashikitaku","page":132}
--   2026-08-24  Cache not found for input keys: nifty-scraper-state-okayama-...
--               State file does not exist.
--
-- 保存自体は成功している（Cache saved with key ... が出ている）のに、
-- 3 日後に restore-keys の前方一致で引けない。県ごと × 毎晩でエントリが
-- 増えるので、退避されていると思われる。
--
-- 復元できないと**先頭の市から回り直す**。岡山は 50 分の予算を岡山市で
-- 使い切るので、倉敷市には永久に到達しない（#767 で 1 回の進みは
-- 増やしたが、戻されると同じことになる）。
--
-- DB なら退避されない。表は 47 県 × スクレイパー種別ぶんの数十行しか
-- 増えない。
--
-- ## 決め事どおりのところ
--
-- - **DEFAULT を置かない。**値は書き手が必ず入れる（CLAUDE.md 6 節）
-- - 個人情報は入らない。入るのは県名・市区町村名・ページ番号だけ
-- - IF NOT EXISTS なので、当て直しても何も起きない

CREATE TABLE IF NOT EXISTS scraper_state (
  -- 「どのスクレイパーの、どの県か」。例: nifty:okayama
  key        text        NOT NULL,
  -- 再開位置そのもの。{"pref","city","cityIndex","page"}。
  -- 形が増えても DDL を当て直さなくて済むよう jsonb で持つ
  state      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT scraper_state_pkey PRIMARY KEY (key)
);
