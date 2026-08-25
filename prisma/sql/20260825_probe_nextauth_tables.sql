-- NextAuth の置き土産（Account / Session / VerificationToken）に
-- 行が残っているかを出す。**読むだけ。何も変えない。**
--
-- ## なぜ要るか
--
-- 本体アプリは NextAuth をやめて Supabase Auth に移っている
-- （scripts/deploy.sh に「NextAuth削除したので」と残っていた）。
-- ところが prisma/schema.prisma には NextAuth のテーブルがそのまま
-- 残っていて、コードからの参照は 0 件。
--
--   grep -rn "prisma\.account\b"           src/ scripts/   → 0
--   grep -rn "prisma\.session\b"           src/ scripts/   → 0
--   grep -rn "prisma\.verificationToken\b" src/ scripts/   → 0
--
-- 問題は Account の列で、**OAuth のトークンをそのまま持つ**。
--
--   refresh_token / access_token / id_token / session_state
--
-- 行が残っていれば、使われなくなった Google のトークンが本番の DB に
-- 眠っていることになる。消してよいかを決める前に、まず何行あるかを見る。
--
-- ## 消す前に見る
--
-- DROP TABLE は戻らない（CLAUDE.md 6 節）。当てずっぽうで消さない。
-- 行数と、いちばん新しい行がいつのものかを出してから判断する。
--
-- 読むだけなので二度回しても同じ。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

\echo '--- そもそも実表にあるか ---'

SELECT
  t.table_name AS "表",
  CASE WHEN c.n IS NULL THEN '(取得できず)' ELSE c.n::text END AS "行数"
FROM (
  VALUES ('Account'), ('Session'), ('VerificationToken'), ('User')
) AS t(table_name)
LEFT JOIN LATERAL (
  SELECT
    CASE t.table_name
      WHEN 'Account'           THEN (SELECT count(*) FROM "Account")
      WHEN 'Session'           THEN (SELECT count(*) FROM "Session")
      WHEN 'VerificationToken' THEN (SELECT count(*) FROM "VerificationToken")
      WHEN 'User'              THEN (SELECT count(*) FROM "User")
    END AS n
) AS c ON TRUE
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables it
  WHERE it.table_schema = 'public' AND it.table_name = t.table_name
);

\echo '--- Account: トークンが入っている行がどれだけあるか（値は出さない）---'

SELECT
  count(*)                                              AS "行数",
  count(*) FILTER (WHERE refresh_token IS NOT NULL)     AS "refresh_token あり",
  count(*) FILTER (WHERE access_token  IS NOT NULL)     AS "access_token あり",
  count(*) FILTER (WHERE id_token      IS NOT NULL)     AS "id_token あり",
  count(DISTINCT provider)                              AS "provider の種類",
  max(expires_at)                                       AS "expires_at の最大"
FROM "Account";

\echo '--- Session: 有効期限が切れていない行があるか ---'

SELECT
  count(*)                                     AS "行数",
  count(*) FILTER (WHERE expires > now())      AS "まだ切れていない",
  max(expires)                                 AS "expires の最大"
FROM "Session";

\echo '--- VerificationToken ---'

SELECT count(*) AS "行数", max(expires) AS "expires の最大"
FROM "VerificationToken";

\echo '--- User: Supabase Auth 側と紐づいているか（BlogPost の著者で使う）---'

SELECT
  count(*)                                          AS "行数",
  count(*) FILTER (WHERE "emailVerified" IS NOT NULL) AS "emailVerified あり"
FROM "User";
