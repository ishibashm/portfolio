-- 案内役（/annai）の同意した人だけの長期記憶（/annai/memory）。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の GuideMemory と揃える。
--
-- 状態: 未適用。本人の承認後に適用する。
-- 適用: Actions → Apply additive SQL → file にこのファイル名 / mode: dry-run の後 mode: apply
--
-- 識別子はブラウザのランダム Cookie（annai_mem）の HMAC-SHA256（64 文字）だけを保存し、
-- 生の Cookie ID・質問文・回答文・生年月日・氏名・連絡先・IP アドレスは置かない。
-- 本体（payload）は AES-256-GCM で暗号化し、id_hash と key_version を AAD に束縛する。
--
-- 期限切れ行（expires_at <= now()）の削除は、Supabase 無料枠で pg_cron が使えない場合があるため、
-- アプリ側の読み書き・削除時（piggyback cleanup）に行う。

CREATE TABLE IF NOT EXISTS guide_memory (
  id_hash         CHAR(64)       PRIMARY KEY,           -- HMAC-SHA256 of the random cookie ID (raw ID never stored)
  payload         BYTEA          NOT NULL CHECK (octet_length(payload) <= 4096),  -- AES-256-GCM
  key_version     TEXT           NOT NULL,
  consent_version TEXT           NOT NULL,              -- no DEFAULT (choice column)
  created_at      TIMESTAMPTZ(3) NOT NULL,
  last_used_at    TIMESTAMPTZ(3) NOT NULL,
  expires_at      TIMESTAMPTZ(3) NOT NULL,
  CHECK (expires_at <= created_at + interval '366 days')
);

CREATE INDEX IF NOT EXISTS guide_memory_expires_at_idx ON guide_memory (expires_at);

ALTER TABLE guide_memory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON guide_memory FROM anon, authenticated;
