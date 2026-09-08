-- 架空の生年月日・出生地が登録内容として残っている行を**数えるだけ。
-- 何も変えない。**
--
-- ## なぜ要るか
--
-- ホームのプロフィールの「保存」は、生年月日を入れていない人でも
-- 初期値（"2000-01-01T00:00"・出生地 35.6895 / 139.6917 = 東京駅）を
-- そのまま user_configs へ書いていた（#1126 で止めた。自動保存は #1100）。
-- 一度書かれると、他の画面がそれを「登録済み」として読む。
--
-- 止めただけでは、すでに書かれた行は残る。消すかどうかは利用者の判断
-- （データの変更なので、CLAUDE.md 6 節の「戻せないもの」）。判断の前に
-- 何行あるかを出す。
--
-- 出すのは件数だけ。個人を特定できる列は読まない。
--
-- 読むだけなので二度回しても同じ。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

SELECT
  count(*)                                                        AS total_rows,
  count(*) FILTER (WHERE birth_date = '2000-01-01T00:00')         AS placeholder_birth_date,
  count(*) FILTER (WHERE birth_lat = 35.6895 AND birth_lon = 139.6917)
                                                                  AS placeholder_birth_place,
  count(*) FILTER (WHERE birth_date = '2000-01-01T00:00'
                     AND birth_lat = 35.6895 AND birth_lon = 139.6917)
                                                                  AS both_placeholders,
  count(*) FILTER (WHERE birth_date IS NULL)                       AS no_birth_date
FROM user_configs;
