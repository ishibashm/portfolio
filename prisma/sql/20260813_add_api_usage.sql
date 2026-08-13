-- 外部 API の呼び出し記録。従量課金の推定に使う。
--
-- page_views・favorite_properties と同じく、足すだけの DDL。
-- 二度当てても同じ結果になる。定義は prisma/schema.prisma の ApiUsage と揃える。
--
-- 1 回 1 行で持つ。日ごとに畳んだ形にすると、あとから「どの経路が高いか」を
-- 出したくなったときに戻せない。呼び出し自体が多くないので行数は問題にならない。
--
-- input_tokens / output_tokens は取れない経路では NULL にする。
-- **0 と NULL は別物**で、0 は「使わなかった」、NULL は「数えられなかった」。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS api_usage (
  id            text        PRIMARY KEY,
  day           text        NOT NULL,
  provider      text        NOT NULL,
  model         text        NOT NULL,
  route         text        NOT NULL,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 日別・提供元別の集計をこの並びで引く。
CREATE INDEX IF NOT EXISTS api_usage_day_provider_idx
  ON api_usage (day, provider);
