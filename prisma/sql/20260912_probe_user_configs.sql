-- user_configs の**行数と保存の有無だけ**を出す。読むだけ。何も変えない。
--
-- ## なぜ要るか
--
-- `/profile` の「保存する」を押すと「この端末に保存しました。ログインすると、
-- ほかの端末でも同じ設定が使えます。」と出る、という報告（2026-09-12）。
-- この文言は `saveSettings` が `synced: false` を返したときのもので、
-- **ログインしていない**ときと、**ログインしているのに POST /api/user-config
-- が 200 を返さなかった**ときの区別が付かない。
--
-- 本番のログでは同じ秒に 2 件ずつの GET 401 が 3 組あった（/profile を開くと
-- user-config と profile-presets を同時に引く形）。500 は直近 6 時間で 0 件、
-- POST の 4xx も直近の窓に無い。つまり「サーバが落ちている」のではなく
-- 「サーバがログインを認めていない」か「そもそも POST が届いていない」。
--
-- どちらかを切り分けるのに、**クラウド側に保存が届いているか**を見る。
-- 直近の更新があれば、少なくとも誰かの保存は通っている。
--
-- ## 個人情報は出さない
--
-- この表には生年月日・座標・メールアドレスが入っている。**1 行も出さない。**
-- 出すのは件数と、日ごとの更新の数（時刻の粗い集計）だけ。Actions のログは
-- 消せないので、迷ったら出さない側に倒す。
--
-- ## 実列も見る
--
-- 本番のスキーマは schema.prisma と両方向にずれることがある（BlogPost で
-- 実際に起きた。CLAUDE.md 3 節）。行が作れないなら NOT NULL のずれが
-- 疑わしいので、同じ機会に列と NULL 可を出しておく。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

\echo '--- 行数と、埋まっている項目の数（中身は出さない）---'

SELECT
  count(*)              AS "行数",
  count(user_id)        AS "user_id あり",
  count(birth_date)     AS "生年月日あり",
  count(birth_lat)      AS "出生地あり",
  count(base_lat)       AS "出発地あり",
  count(created_at)     AS "登録日あり"
FROM user_configs;

\echo '--- 日ごとの更新（直近 14 日。誰のものかは出さない）---'

SELECT
  date_trunc('day', updated_at)::date AS "日(UTC)",
  count(*)                            AS "更新された行"
FROM user_configs
WHERE updated_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

\echo '--- 直近の更新と、いまの時刻（時計のずれを見るため）---'

SELECT
  max(updated_at) AS "直近の更新",
  now()           AS "いま",
  now() - max(updated_at) AS "経過"
FROM user_configs;

\echo '--- 実列と NULL 可（NOT NULL で既定値の無いものが create を落とす）---'

SELECT
  column_name        AS "列",
  data_type          AS "型",
  is_nullable        AS "NULL可",
  COALESCE(column_default, '(既定値なし)') AS "既定値"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_configs'
ORDER BY ordinal_position;
