-- 日取りのお気に入り（/calendar の表の ☆）をアカウントに残す表を足す。
--
-- ## なぜ要るか
--
-- 利用者の依頼（2026-09-29）「日取りもお気に入りできるようにしてほしい」
-- 「日取りのお気に入りもアカウントに保存していいよ」。端末（localStorage、
-- favorite_days_v1）には先に残せるようにしたが、端末を変える・履歴を消すと
-- 消える。
--
-- ## 入るのは個人情報
--
-- 1 行は「日付 × 方位」と、保存した時点の判定の表示（年盤・月盤・日盤の
-- 呼び名、暦注、天中殺）。**生年月日と座標は入らない**が、判定は生年月日から
-- 出た結果で、個人に紐づく。CLAUDE.md 6 節の「戻せないもの」に当たるため、
-- 利用者の了承を受けてから作っている。saved_analyses と同じ守りにする。
--
-- - 読み書きは本人だけ（API が必ず user_id で絞る）
-- - Supabase の匿名・authenticated ロールからは直接読めないようにする
--   （RLS を入れてポリシーを置かない＋権限を剥がす）
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

CREATE TABLE IF NOT EXISTS favorite_days (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,
  day         TEXT NOT NULL,
  direction   TEXT NOT NULL,
  verdict     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.favorite_days'::regclass AND conname = 'favorite_days_day_format') THEN
    ALTER TABLE favorite_days ADD CONSTRAINT favorite_days_day_format CHECK (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.favorite_days'::regclass AND conname = 'favorite_days_direction_check') THEN
    ALTER TABLE favorite_days ADD CONSTRAINT favorite_days_direction_check CHECK (direction IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.favorite_days'::regclass AND conname = 'favorite_days_verdict_size') THEN
    ALTER TABLE favorite_days ADD CONSTRAINT favorite_days_verdict_size CHECK (length(verdict::text) <= 4096);
  END IF;
END $$;

-- 同じ人の同じ日・同じ方位は 1 行だけ（押し直しは上書き）。名前は Prisma の
-- @@unique([user_id, day, direction]) の既定名に合わせる。
CREATE UNIQUE INDEX IF NOT EXISTS favorite_days_user_id_day_direction_key
  ON favorite_days (user_id, day, direction);

ALTER TABLE favorite_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON favorite_days FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON favorite_days FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON favorite_days FROM authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.favorite_days'::regclass
      AND conname = 'favorite_days_auth_user_fkey'
  ) THEN
    ALTER TABLE favorite_days ADD CONSTRAINT favorite_days_auth_user_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
