-- 九星気学の鑑定士の掲載。
--
-- direction_comments と同じく、足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の Practitioner と揃えること。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS practitioners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE,
  email        text        NOT NULL,
  display_name text        NOT NULL,
  headline     text        NOT NULL,
  area         text        NOT NULL,
  specialties  text[]      NOT NULL DEFAULT '{}',
  profile      text        NOT NULL,
  website_url  text,
  status       text        NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 一覧は公開中のものを新しい順に引く。
CREATE INDEX IF NOT EXISTS practitioners_status_created_idx
  ON practitioners (status, created_at);
