-- 公開エージェント（/api/mcp-chain 等）の日次利用量台帳。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の AgentUsageDaily と揃える。
--
-- 保存するのは識別子の HMAC（64 文字）だけで、生の IP や user_id は置かない。
-- 全体行の subject_hash は "global" の HMAC（64 文字）を使う。
--
-- 2026-11-03 に本人の承認あり（MCP セキュリティ修正）。マージ後に Apply additive SQL で当てる。
-- 適用: Actions → Apply additive SQL → file にこのファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS agent_usage_daily (
  day          DATE             NOT NULL,
  subject_hash CHAR(64)         NOT NULL,
  requests     INTEGER          NOT NULL DEFAULT 0,
  tokens       BIGINT           NOT NULL DEFAULT 0,
  cost_usd     DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ(3)   NOT NULL DEFAULT now(),
  PRIMARY KEY (day, subject_hash)
);

CREATE INDEX IF NOT EXISTS agent_usage_daily_day_idx
  ON agent_usage_daily (day);
