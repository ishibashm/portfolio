-- BlogPost.authorId の NOT NULL を外す。
--
-- **このファイルは「足すだけ」ではない。**db-apply-sql の先頭に書いてある
-- 決め事の例外なので、実行するときは必ず利用者の了解を取ること。
--
-- なぜ要るか:
--   schema.prisma は authorId を `String?`（任意）と書いてある。管理画面から
--   書いた記事には紐づく NextAuth の User が居ないため、必須にすると記事を
--   1 本書くために User の行を先に作ることになる。認証の都合が記事の都合に
--   混ざるので任意にした、と schema.prisma のコメントに残っている。
--
--   ところが**実表には NOT NULL が残っていた**。Prisma は任意だと思って
--   いるので値を入れず、NULL が入って落ちる。
--
--     Null constraint violation on the (not available)   code: 'P2011'
--
--   Prisma は列名を出さないので、information_schema を読んで特定した
--   （20260822_probe_blogpost_columns.sql、2026-08-22 実行）。
--
--     authorId | text | NO | (既定値なし)
--
--   これで管理画面の「記事を作る」と scripts/import_blog_markdown.ts が
--   どちらも落ちていた。BlogPost に記事が 1 本も入らないので、管理画面の
--   記事一覧も編集画面も空のまま動かない。利用者の報告どおり。
--
-- 戻し方:
--   ALTER TABLE "BlogPost" ALTER COLUMN "authorId" SET NOT NULL;
--   **ただし authorId が NULL の行が 1 つでも入ると戻せなくなる。**
--   下の SELECT で、当てる前の行数と NULL の数をログに残す。
--
-- 二度当てても同じ結果になる（既に NULL 可なら何も起きない）。

SELECT
  count(*)                                    AS "BlogPost の行数",
  count(*) FILTER (WHERE "authorId" IS NULL)  AS "authorId が NULL の行"
FROM "BlogPost";

ALTER TABLE "BlogPost" ALTER COLUMN "authorId" DROP NOT NULL;

SELECT column_name AS "列", is_nullable AS "NULL可"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'BlogPost'
  AND column_name = 'authorId';
