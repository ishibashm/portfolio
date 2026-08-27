-- content/blog のファイルと BlogPost の本文が一致しているかの照合。SELECT のみ。
--
-- 目的: 記事の更新を blog-import の overwrite（既存も上書き）で流す前に、
-- DB 側で編集された記事（管理画面のエディタ経由）が無いかを確かめる。
-- overwrite は**既存の全記事**をファイルの内容で上書きするので、
-- ファイルより新しい編集が DB にあると、それを消してしまう。
--
-- md5 はファイル側と同じ取り出し（getBlogPost(slug).body、frontmatter を
-- 除いた本文）に対して計算した値。2026-08-27 時点の master の内容。
--
-- 読み方:
--   same = t          … ファイルと DB が一致（overwrite しても変わらない）
--   same = f          … 食い違い。どちらが新しいかを updatedAt で確かめる
--   file_md5 が NULL  … DB にだけある記事（ファイル由来でない。import は触らない）
--   db_md5 が NULL    … ファイルにだけある記事（import で追加される）

WITH file_hash(slug, md5) AS (
  VALUES
    ('honmeisatsu-year-board-next-move', '0445caa9f9a2b2405a89978b29ad8e96'),
    ('what-is-honmei-teki-satsu', '37909ee743a8a2bf6a9468159b988d13'),
    ('can-you-recover-from-honmei-teki', '5678c5f73803e40b4f59d82afed6b2c1'),
    ('how-much-does-distance-matter', '96d3fb8bd858aa728e814e7414d8b8e9'),
    ('how-we-analyze-the-rental-market', '916fc181f7379ea4bf5f8ee0613c66a2'),
    ('tenchusatsu-names-and-schools', '483a89a8876d96fa14b2edde4ba2acba'),
    ('year-board-blocks-a-whole-year', 'a2ec62d09ee9829cba486e411755be0f'),
    ('can-good-outweigh-a-bad-move', '40488daa93ac8c203ee2ba755824cf37'),
    ('does-bad-direction-last-60-years', '9e6ce363efc20f1561c706861f13b87c'),
    ('moved-to-an-unlucky-direction', 'de37bf0b27d1be063e71e16828c7ce07'),
    ('how-many-schools-are-there', '07ff4c0de1462f732cd2e5da632ca9eb'),
    ('is-there-statistical-evidence-for-houi', 'ed0f23c612a2791295ca56b3327f18e4'),
    ('other-systems-beyond-kigaku', '50913071b5083117d8cb16d748639b72'),
    ('tenchusatsu-origin-and-what-not-to-do', '73966178c07bcb27179005a654546f02'),
    ('where-kigaku-and-houi-came-from', '72f7668b0e1a4aa1b23a6302f87180b6'),
    ('who-decided-the-prohibitions', '72975158e96bf02f5c1f44274ab15d4c'),
    ('why-directions-were-thought-lucky', '550383516d9d98b16ecc60e413d34d72'),
    ('why-time-was-thought-lucky', 'f934e9397a275a401643fa6d2de327d8'),
    ('direction-seen-from-the-original-home', '81656c31ddd2572d160bd9ce8d4d1369'),
    ('tenchusatsu-and-lucky-directions', '169b42c71a8e00de77dc06d57ec2c30a'),
    ('does-a-lucky-move-cancel-an-unlucky-move', '3b8d7409fe92949a747c4c4d780cd52f')
)
SELECT
  COALESCE(b.slug, f.slug) AS slug,
  md5(b.content)           AS db_md5,
  f.md5                    AS file_md5,
  (md5(b.content) = f.md5) AS same,
  b."updatedAt"            AS db_updated_at
FROM "BlogPost" b
FULL OUTER JOIN file_hash f ON f.slug = b.slug
ORDER BY (md5(b.content) = f.md5) NULLS FIRST, slug;
