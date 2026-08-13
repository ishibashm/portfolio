-- ページ閲覧の記録に、デバイス種別の列を足す。
--
-- 管理ページで「スマホから見られているのか PC なのか」を読むため。
-- 保存するのは 'pc' / 'mobile' / 'tablet' の 3 値（と判定不能の NULL）だけで、
-- User-Agent そのものは保存しない。列を足す前の行は NULL のままにし、
-- 集計では「不明」として出す（さかのぼって埋めない。UA を保存していない
-- ので埋めようがない）。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の PageView と揃えること。
--
-- 適用: Actions → Apply additive SQL → file に このファイル名 / mode: apply

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS device text;
