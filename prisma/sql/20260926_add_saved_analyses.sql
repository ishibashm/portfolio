-- 時期の分析（全期間の分析・/calendar の吉日）をアカウントに残す表を足す。
--
-- ## なぜ要るか
--
-- 利用者の依頼（2026-09-26）「どちらも引越し時期を分析したあと、それを
-- 保存できたらいい」「DB で保存してもいいかな。保存する方向で進めていいよ」。
-- 端末（localStorage）には #1541〜#1543 で残せるようにしたが、端末を変える・
-- 履歴を消すと消える。
--
-- ## 入るのは個人情報
--
-- 本文は lib/timingReport の Markdown。**生年月日と座標は入らない**が、
-- 本命星・空亡・方位ごとの吉日は生年月日から出た結果で、個人に紐づく。
-- CLAUDE.md 6 節の「戻せないもの」に当たるため、利用者の指示を受けてから
-- 作っている。
--
-- - 読み書きは本人だけ（API が必ず user_id で絞る）
-- - Supabase の匿名・authenticated ロールからは直接読めないようにする
--   （RLS を入れてポリシーを置かない＋権限を剥がす。listing_candidates と
--   同じ作り。アプリはサーバーの接続だけで読む）
-- - アカウントを消したら行も消える（auth.users への外部キー。
--   ON DELETE CASCADE。auth スキーマが無い環境では張らない）
--
-- ## 既定値
--
-- 利用者の値に DEFAULT は置かない。created_at の now() は行ができた
-- 時刻そのものなので置く。**新しい表**なので、当てた日に既存の行が
-- 値を持つことにはならない。
--
-- 足すだけ。DROP も ALTER COLUMN もしない。既存の表には触らない。

SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS saved_analyses (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  markdown    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.saved_analyses'::regclass AND conname = 'saved_analyses_kind_check') THEN
    ALTER TABLE saved_analyses ADD CONSTRAINT saved_analyses_kind_check CHECK (kind IN ('timing', 'calendar'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.saved_analyses'::regclass AND conname = 'saved_analyses_markdown_size') THEN
    ALTER TABLE saved_analyses ADD CONSTRAINT saved_analyses_markdown_size CHECK (length(markdown) <= 32768);
  END IF;
END $$;

-- 一覧は新しい順に本人の分だけ出す。
CREATE INDEX IF NOT EXISTS saved_analyses_user_created_at
  ON saved_analyses (user_id, created_at);

ALTER TABLE saved_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saved_analyses FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON saved_analyses FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON saved_analyses FROM authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.saved_analyses'::regclass
      AND conname = 'saved_analyses_auth_user_fkey'
  ) THEN
    ALTER TABLE saved_analyses ADD CONSTRAINT saved_analyses_auth_user_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
