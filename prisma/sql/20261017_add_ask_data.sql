-- 「AIに聞く」の複数会話・相談メモ・人物プロフィール。
-- 匿名利用者は端末だけ、ログイン中の利用者だけこの欄へ同期する。
-- DEFAULT は置かない。既存利用者が保存を選んだことにしないため。
ALTER TABLE user_configs
  ADD COLUMN IF NOT EXISTS ask_data JSONB;

COMMENT ON COLUMN user_configs.ask_data IS
  'Versioned private /ask workspace; null until a signed-in user saves it';
