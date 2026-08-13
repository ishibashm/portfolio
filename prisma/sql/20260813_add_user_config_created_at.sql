-- user_configs に「行が作られた日時」を足す。
--
-- 管理ページの「新規登録の推移」に使う。updated_at は保存のたびに
-- 上書きされるので、登録日の代わりにはならない（最後に保存した日に
-- なってしまう）。
--
-- **既定値を置かない。** DEFAULT now() で足すと、この DDL を当てた日に
-- 既存の全員が「今日登録した」ことになる。列の追加より前からいる人は
-- NULL のままにし、管理ページでは「記録開始前」として数える。
-- 以後の新規行はアプリ側（/api/user-config, /api/profile-presets の
-- create）が明示的に入れる。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の user_configs と揃えること。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

ALTER TABLE "user_configs" ADD COLUMN IF NOT EXISTS created_at timestamptz;
