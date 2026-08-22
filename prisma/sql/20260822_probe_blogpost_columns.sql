-- BlogPost の実際の列を出す。**読むだけ。何も変えない。**
--
-- ## なぜ要るか
--
-- 列を足したあと（20260822_add_blogpost_missing_columns.sql）、取り込みが
-- 今度は **P2011 NullConstraintViolation** で落ちた。
--
--   Invalid `prisma.blogPost.create()` invocation
--   Null constraint violation on the (not available)
--   code: 'P2011'
--
-- Prisma は**どの列か教えてくれない**（"(not available)"）。
--
-- 取り込みは schema.prisma にある必須の列をすべて渡している。それでも
-- NULL 違反になるなら、**実表に schema.prisma が知らない NOT NULL の列が
-- 残っている**ということ。Prisma はその列に何も入れないので NULL になる。
--
-- 前回とは逆向きのずれ。前回は「スキーマにあって実表に無い」、今回は
-- 「実表にあってスキーマに無い」。
--
-- ## 直す前に見る
--
-- 当てずっぽうで ALTER COLUMN DROP NOT NULL を並べない。**それは
-- 足すだけの DDL ではない**し、消していい列なのかも分からない。
-- まず何があるのかを出す。
--
-- 読むだけなので二度回しても同じ。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

\echo '--- BlogPost の全列（NOT NULL で既定値の無いものが犯人）---'

SELECT
  column_name        AS "列",
  data_type          AS "型",
  is_nullable        AS "NULL可",
  COALESCE(column_default, '(既定値なし)') AS "既定値"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'BlogPost'
ORDER BY ordinal_position;

\echo '--- そのうち、Prisma が値を入れない可能性があるもの ---'

SELECT column_name AS "要注意な列"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'BlogPost'
  AND is_nullable = 'NO'
  AND column_default IS NULL
ORDER BY ordinal_position;
