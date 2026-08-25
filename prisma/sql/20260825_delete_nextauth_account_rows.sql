-- NextAuth の置き土産（Account の行）を消す。**表は消さない。**
--
-- ## 何を消すか
--
-- 本体アプリは NextAuth をやめて Supabase Auth に移っている。Account /
-- Session / VerificationToken はコードからの参照が 0 件で、
-- 20260825_probe_nextauth_tables.sql で中身を数えたところ、
--
--     Account            1 行
--     Session            0 行
--     VerificationToken  0 行
--     User               3 行  ← 残す
--
-- だった。Account の 1 行には Google の access_token と id_token が入って
-- いる（refresh_token は無い）。expires_at は 1775971156 ＝
-- 2026-04-12 14:19 JST で、すでに失効している。
--
-- 失効済みかつ refresh_token が無いので API を叩く経路は無いが、id_token は
-- 署名を検証しなくても中身が読める JWT で、Google アカウントのメール・sub・
-- 氏名・プロフィール画像 URL を持つ。使わない個人情報なので落とす。
-- 利用者の判断（2026-08-25）。
--
-- ## User は残す
--
-- BlogPost.authorId などから参照されている（CLAUDE.md 3 節の「本番のスキーマは
-- schema.prisma と両方向にずれている」の一件で、authorId が実表では NOT NULL
-- だと分かっている）。**消すと記事が壊れる。**
--
-- ## 表ごとは消さない
--
-- prisma/schema.prisma には 3 つの表の定義が残っている。表ごと落とすと
-- 次の run-seed（db push）で作り直され、スキーマと実表がまたずれる。
-- 表を外すなら schema.prisma と同時にやること。今回はやらない。
--
-- db-apply-sql が例外として認めている「表の定義を変えずに中身を空にする」
-- 形にしてある。二度当てても同じ結果になる（2 回目は 0 行）。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

\echo '--- 実行前 ---'

SELECT
  (SELECT count(*) FROM "Account")           AS "Account",
  (SELECT count(*) FROM "Session")           AS "Session",
  (SELECT count(*) FROM "VerificationToken") AS "VerificationToken",
  (SELECT count(*) FROM "User")              AS "User（残す）";

\echo '--- Account を空にする ---'

DELETE FROM "Account";

\echo '--- 実行後（User が減っていないことを確かめる）---'

SELECT
  (SELECT count(*) FROM "Account")           AS "Account",
  (SELECT count(*) FROM "Session")           AS "Session",
  (SELECT count(*) FROM "VerificationToken") AS "VerificationToken",
  (SELECT count(*) FROM "User")              AS "User（残す）";
