-- BlogPost に足りていない列を足す。
--
-- ## なぜ要るか
--
-- content/blog/*.md を DB へ取り込む "Import blog articles into the
-- database" を apply で回したところ、**P2022 ColumnNotFound** で落ちた。
--
--   code: 'P2022'
--   meta: { modelName: 'BlogPost', driverAdapterError: ColumnNotFound }
--
-- dry-run は書き込まないので通っていた。実際に INSERT した瞬間に、
-- schema.prisma にはあるが DB には無い列に当たって落ちる。
--
-- そのため管理画面の一覧に記事が 1 本しか出ず、**残り 14 本は編集
-- できない**状態だった（読者には Markdown 側が見えているので、
-- 画面だけを見ていると「編集が機能していない」としか映らない）。
-- 利用者からその報告があった。
--
-- ## db push を使わない理由
--
-- 失敗時のヒントは「Setup Database Schema and Seed Data を実行」と
-- 出るが、あれは prisma db push で、**スキーマに無い表・列を消す。**
-- 適用は一方向で、消えたデータは revert で戻らない（CLAUDE.md 6 節）。
-- 足りない列を足すだけで済む話に、その手段は釣り合わない。
--
-- ## どの列が足りないかを特定していない
--
-- P2022 は列名を出さない。**schema.prisma にある列を全部 IF NOT EXISTS
-- で並べる。**既にある列は何も起きないので、当てても害が無く、どれが
-- 欠けていても 1 回で揃う。特定のために本番へ問い合わせる往復を挟むより
-- 確実で、結果も同じ。
--
-- ## 既定値について
--
-- featured / published の DEFAULT false は schema.prisma と同じ。
-- **判定に関わる既定値ではない**（記事の公開状態で、後から画面で
-- 変えられる）。既存の行が「公開」になってしまうと読者に見えてしまう
-- ので、安全な側の false に倒すのが正しい。
--
-- publishedAt の DEFAULT now() は、列が無かった既存行に「当てた日」が
-- 入るということ。BlogPost は現状 1 行しか無く、その 1 行は既に
-- publishedAt を持っている（一覧に公開日が出ている）ので実害は無い。
--
-- tags は NOT NULL だが DEFAULT を置けない列ではない。既存行に何を
-- 入れるか決める必要があるので、**空文字**にする。カンマ区切りの
-- 「タグ無し」がまさに空文字で、フォーマット上も正しい。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "excerpt" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "authorId" TEXT;

ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "tags" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BlogPost"
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BlogPost"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 一覧は「公開済みを新しい順」でしか引かない。schema.prisma の
-- @@index([published, publishedAt]) に対応する。
CREATE INDEX IF NOT EXISTS "BlogPost_published_publishedAt_idx"
ON "BlogPost" ("published", "publishedAt");

-- slug は @unique。取り込みは slug で upsert するので、これが無いと
-- 同じ記事が二重に入る。
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key"
ON "BlogPost" ("slug");
