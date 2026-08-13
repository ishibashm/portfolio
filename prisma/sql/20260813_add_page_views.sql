-- ページ閲覧の記録。「どれくらい利用者がいるのか」を測る最初の置き場。
--
-- practitioners と同じく、足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の PageView と揃えること。
--
-- 個人を特定できるものは持たない。visitor_hash は sha256(IP + UA + 日付) で、
-- 日付が入るので翌日には同じ人を追えない。IP そのものは保存しない。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS page_views (
  id            text        PRIMARY KEY,
  day           text        NOT NULL,
  path          text        NOT NULL,
  visitor_hash  text        NOT NULL,
  referrer_host text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 日別の PV/UV 集計と、ページ別の内訳の両方をこの並びで引く。
CREATE INDEX IF NOT EXISTS page_views_day_path_idx
  ON page_views (day, path);
