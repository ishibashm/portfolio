-- 方位・日取りについての利用者の投稿を入れる表。
--
-- prisma db push で作ることもできるが、run-seed.yml の db push は
-- --accept-data-loss 付きで、そのあとに取り込みスクリプトが 3 本走る。
-- 表を 1 つ足すためだけに回すには重い。ここは足すだけの DDL にして、
-- 既にあれば何もしない形にしておく。
--
-- 定義は prisma/schema.prisma の DirectionComment と揃えること。
-- db push はスキーマに無い索引を消すので、片方だけ変えると次の
-- run-seed で消える。

CREATE TABLE IF NOT EXISTS direction_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key    text        NOT NULL,
  user_id      uuid        NOT NULL,
  display_name text        NOT NULL,
  body         text        NOT NULL,
  status       text        NOT NULL DEFAULT 'published',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 一覧は topic_key で引いて新しい順に並べる。
CREATE INDEX IF NOT EXISTS direction_comments_topic_created_idx
  ON direction_comments (topic_key, created_at);

-- 連投の抑制で「この 24 時間に何件書いたか」を数える。
CREATE INDEX IF NOT EXISTS direction_comments_user_created_idx
  ON direction_comments (user_id, created_at);
