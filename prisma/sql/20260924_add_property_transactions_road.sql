-- 成約価格に「前面道路」の 3 項目を持たせる（2026-09-24）
--
-- ## なぜ
--
-- 利用者の依頼「前面道路の方位も取り込めるようにして」。物件検索の
-- 「買うときの水準（成約価格）」を、土地が道路に面している向き（南道路・
-- 北道路など）で絞れるようにする。
--
-- 国交省の取引価格情報（XIT001）は 3 項目を返している。項目名と値の形は
-- probe（run 35997210798、愛知県 2025 年第 1 四半期）で実物を確かめた。
--
--   Direction       "北" / "南東" など。前面道路が土地のどちら側にあるか
--   Classification  "市道" / "県道" / "私道" など
--   Breadth         "9.1"（m）
--
-- マンション（中古マンション等）は 3 つとも "" で来る。建物の中の 1 室で
-- 土地の接道が無いため。**NULL のまま残す**（「北道路」と取り違えない）。
--
-- ## 足すだけ
--
-- `ADD COLUMN IF NOT EXISTS` の 3 列だけ。**既定値（DEFAULT）を置かない。**
-- 置くと、取り込み直す前の既存の行が全部その値を持ったことになる
-- （CLAUDE.md 6 節）。値は取り込み（fetch）を回し直したときに入る。
-- 取り込みの行の鍵（id）には入れない。入れると、回し直したときに同じ
-- 取引が別の行として増える。
--
-- ## 方位の判定とは別のもの
--
-- 前面道路の方位は**土地の上での向き**で、出発地から見た引越しの方位
-- （九星気学の判定に使う方位）とは関係が無い。画面でも別の欄として出す。

ALTER TABLE property_transactions ADD COLUMN IF NOT EXISTS road_direction text;
ALTER TABLE property_transactions ADD COLUMN IF NOT EXISTS road_classification text;
ALTER TABLE property_transactions ADD COLUMN IF NOT EXISTS road_breadth_m double precision;
