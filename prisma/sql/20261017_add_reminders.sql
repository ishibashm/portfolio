-- しるべの「吉日のお知らせ」（Phase 2）の表を足す。
--
-- ## なぜ要るか
--
-- 利用者の依頼（2026-10-17、Phase 1〜3 の承認）。しるべの相談で出た吉日を、
-- その数日前にメールでお知らせする。メールの送信は RESEND_API_KEY などが
-- そろうまで止まっている（src/lib/reminders.ts の remindersConfig）。表が
-- 先にあっても、送信も画面も動かない。
--
-- ## 入るのは個人情報
--
-- - reminders … 「誰が・いつの・どの方位の」吉日のお知らせを望んだか。
--   生年月日・座標・メールアドレスは入れない（送り先は送る時点で
--   user_configs.user_email を引く）
-- - notification_consents … メールでのお知らせに同意した日時と撤回した日時、
--   同意した時点のポリシーの版。特定電子メール法の同意の記録として残す
--
-- CLAUDE.md 6 節の「戻せないもの」に当たるため、利用者の了承を受けてから作る。
-- favorite_days と同じ守りにする。
--
-- - 読み書きは本人だけ（API が必ず user_id で絞る）
-- - Supabase の anon / authenticated からは直接読めない（RLS＋権限を剥がす）
-- - アカウントを消したら行も消える（auth.users への外部キー。
--   auth スキーマが無い環境では張らない）。「登録内容をすべて消す」でも消す
--
-- ## 既定値
--
-- 利用者の値に DEFAULT は置かない。created_at の now() は行ができた
-- 時刻そのものなので置く。新しい表なので、既存の誰かが値を持つことはない。
--
-- 足すだけ。DROP も ALTER COLUMN もしない。既存の表には触らない。

SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,
  kind        TEXT NOT NULL,
  target_date TEXT NOT NULL,
  direction   TEXT,
  lead_days   INTEGER NOT NULL,
  send_on     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  status      TEXT NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_kind_check') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_kind_check CHECK (kind IN ('auspicious_day'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_target_date_format') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_target_date_format CHECK (target_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_send_on_format') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_send_on_format CHECK (send_on ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_direction_check') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_direction_check CHECK (direction IS NULL OR direction IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_lead_days_check') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_lead_days_check CHECK (lead_days IN (1, 3, 7));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_channel_check') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_channel_check CHECK (channel IN ('email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_status_check') THEN
    ALTER TABLE reminders ADD CONSTRAINT reminders_status_check CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled', 'failed'));
  END IF;
END $$;

-- 同じ人の同じ日・同じ方位は 1 件だけ。名前は Prisma の @@unique の既定名。
CREATE UNIQUE INDEX IF NOT EXISTS reminders_user_id_target_date_direction_key
  ON reminders (user_id, target_date, direction);
CREATE INDEX IF NOT EXISTS reminders_status_send_on_idx
  ON reminders (status, send_on);

CREATE TABLE IF NOT EXISTS notification_consents (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL,
  channel        TEXT NOT NULL,
  purpose        TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notification_consents'::regclass AND conname = 'notification_consents_channel_check') THEN
    ALTER TABLE notification_consents ADD CONSTRAINT notification_consents_channel_check CHECK (channel IN ('email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notification_consents'::regclass AND conname = 'notification_consents_purpose_check') THEN
    ALTER TABLE notification_consents ADD CONSTRAINT notification_consents_purpose_check CHECK (purpose IN ('reminder'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_consents_user_id_channel_purpose_idx
  ON notification_consents (user_id, channel, purpose);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reminders FROM PUBLIC;
REVOKE ALL ON notification_consents FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON reminders FROM anon;
    REVOKE ALL ON notification_consents FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON reminders FROM authenticated;
    REVOKE ALL ON notification_consents FROM authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reminders'::regclass AND conname = 'reminders_auth_user_fkey') THEN
      ALTER TABLE reminders ADD CONSTRAINT reminders_auth_user_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notification_consents'::regclass AND conname = 'notification_consents_auth_user_fkey') THEN
      ALTER TABLE notification_consents ADD CONSTRAINT notification_consents_auth_user_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
