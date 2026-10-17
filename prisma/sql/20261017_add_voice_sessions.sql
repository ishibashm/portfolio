-- Grok 音声の秒数予約・セッション・call_id を Cloud Run 全個体で共有する。
-- Supabase user id は置かず、サーバーの秘密鍵による HMAC だけを保存する。
-- 予約と精算はアプリ側の短い transaction で原子的に更新する。
CREATE TABLE IF NOT EXISTS voice_usage_ledgers (
  day VARCHAR(10) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  seconds DOUBLE PRECISION NOT NULL CHECK (seconds >= 0),
  updated_at TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY (day, subject_hash)
);

CREATE TABLE IF NOT EXISTS voice_sessions (
  session_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_subject CHAR(64) NOT NULL,
  day VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  reserved_seconds DOUBLE PRECISION NOT NULL CHECK (reserved_seconds >= 0),
  actual_seconds DOUBLE PRECISION CHECK (actual_seconds >= 0),
  tool_call_count INTEGER NOT NULL CHECK (tool_call_count >= 0),
  ended BOOLEAN NOT NULL,
  model TEXT NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (actual_seconds IS NULL OR actual_seconds <= reserved_seconds)
);
CREATE INDEX IF NOT EXISTS voice_sessions_ended_expires_at_idx
  ON voice_sessions (ended, expires_at);
CREATE INDEX IF NOT EXISTS voice_sessions_user_subject_created_at_idx
  ON voice_sessions (user_subject, created_at);

CREATE TABLE IF NOT EXISTS voice_tool_calls (
  session_hash CHAR(64) NOT NULL,
  call_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY (session_hash, call_id)
);
