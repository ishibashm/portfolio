-- 未適用。Supabase環境専用。サーバー専用接続で所有者を必ず絞る。
CREATE TABLE IF NOT EXISTS "MemoryEntry" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "payload" BYTEA NOT NULL CHECK (octet_length("payload") <= 8220),
  "keyVersion" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "MemoryEntry_userId_id_idx" ON "MemoryEntry" ("userId", "id");
ALTER TABLE "MemoryEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MemoryEntry" FROM anon, authenticated;
-- 記憶権限は新しいOAuth同意でのみ発行する。既存grantへの値の補完はしない。
-- scopeは暗号化済みprovider GrantとAccessTokenを正とし、列の追加は不要。
