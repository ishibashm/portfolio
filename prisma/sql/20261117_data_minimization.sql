-- 既存値や処理済み日時を推測して埋めず、所有者が保持を判断できるよう列だけ足す。
ALTER TABLE user_configs
  ADD COLUMN IF NOT EXISTS personal_cloud_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ask_data_last_used_at TIMESTAMPTZ NULL;
ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;
