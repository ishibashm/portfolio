-- 公開 /api/mcp の IP ごとの呼び出し上限。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の McpPublicRate と揃える。
--
-- 保存するのは clientKey の HMAC（64 文字）だけで、生の IP は置かない。
-- 既定値は置かない。アプリが tokens と updated_at を毎回書く。
-- 表が無いあいだはアプリ側が通す（fail open）。
--
-- 適用はマージ後に人が判断する。この変更では本番へ当てない。
-- 適用: Actions → Apply additive SQL → file にこのファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS mcp_public_rate (
  ip_hash    CHAR(64)       PRIMARY KEY,
  tokens     DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS mcp_public_rate_updated_at_idx
  ON mcp_public_rate (updated_at);
