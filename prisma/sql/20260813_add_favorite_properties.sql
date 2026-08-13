-- お気に入りに入れた物件。
--
-- page_views・practitioners と同じく、足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の FavoriteProperty と揃えること。
--
-- property_id は rental_properties.id を指すが、**外部キーにはしない**。
-- 掲載が終わった物件は行ごと消えることがあり、外部キーで縛るとお気に入りも
-- 一緒に消える。利用者からは「入れたはずのものが黙って減った」としか見えない。
-- 引けなかったものは画面側で「掲載終了」として出す。
--
-- (user_id, property_id) の一意は、二度押しで行が増えるのを防ぐため。
-- 増えると、外すときにどの行を消すかが決まらない。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS favorite_properties (
  id          text        PRIMARY KEY,
  user_id     uuid        NOT NULL,
  property_id text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 同じ人が同じ物件を二度入れられない。
CREATE UNIQUE INDEX IF NOT EXISTS favorite_properties_user_property_key
  ON favorite_properties (user_id, property_id);

-- 一覧は「新しく入れた順」で引く。
CREATE INDEX IF NOT EXISTS favorite_properties_user_created_idx
  ON favorite_properties (user_id, created_at DESC);
