# /relocation/dashboard の入力なし要約と FAQ（2026-11-23）

- 依頼: 検索回復プロジェクトの設計書どおり、`/relocation/dashboard` を改修する。初期 HTML に入力なしで見える「今日の要約」（日付、全員共通の日盤の凶方位、東京基準のいまの刻と次の切り替わり）を既存の暦・方位の計算関数から出す。title / description / H1 / H2 / FAQ / WebPage・FAQPage の JSON-LD を整える。本命星別の全表は載せない。マージはしない。コードは box 上の Codex CLI（`codex exec -s workspace-write`）。
- PR: https://github.com/ishibashm/portfolio/pull/1910 （未マージ。ブランチ `feat/relocation-dashboard-seo-summary`、基点は origin/master の 9bf4e561 = #1908）
  - e79d2f65 今日の方位と時間の画面に、入力なしで見える要約とFAQを出す
  - 82f4549d 今日の方位と時間の画面で、プロフィールの帯と canonical の書き方を検査に合わせる
- 変更内容:
  - 要約は `buildRelocationDashboardSummary` が `buildTodayBoard` と `buildCurrentDirections`（経度は既存の東京基準 139.6917）を合成する。数値は手書きしていない。
  - title: 今日の方位と時間｜目的地と出発地の真太陽時で確認。description と `CORE_ROUTES` の summary を一致させた。H1 は「今日の方位と時間を確かめる」。ナビ用ラベルは「今日の方位と時刻を確かめる」のまま。
  - H2（この順）: 今日の要約 / この画面で分かること（しるべは既存の `GuideCharacter`） / 生年月日と場所を入れる / いまの要点 / 計算の基準 / よくある質問 / 次に見る。
  - FAQ 6問は頁の本文と FAQPage で同じ文言。既存のサイト全体 JSON-LD（WebSite / Organization / WebApplication）は残し、この頁の WebPage と FAQPage を足した。
  - 内部リンク（本番で 200 を確認）: `/houi/today`、`/blog/todays-lucky-direction-by-hour`、`/guide/honmei`。
  - 地色は既存トークン（`bg-background text-ink`）。`SolarTimeClock` は最外周の地色と、要約に装飾グリッドが被らないよう `absolute` にした最小限だけ。内部のライト配色は残件。
  - PR #1909 と同じファイルは避けた。
- 要約の計算例（いずれも `buildRelocationDashboardSummary` の戻り）:
  - 2026-11-23 12:00 JST: 日付 2026-11-23、全員共通の日盤の凶方位は南西（日破）、午の刻、次の切り替わり 12:28（日本標準時）。
  - ローカル SSR（20:27 頃 JST）: 戌の刻、次の切り替わり 20:28。
  - スクショ時（20:29 頃 JST）: 亥の刻、次の切り替わり 22:28。刻の境目をまたいでも関数の戻りに追随した。
- ローカル確認（`http://127.0.0.1:3091/relocation/dashboard`、curl の初期 HTML）: 200。title / description / H1 / 7つの H2 / FAQ 6問 / 指定の内部リンク / JSON-LD 3本（既存グラフ + WebPage + FAQPage）を確認。「Cloud Paletteでは」は無い。HTML は `/workspace/relocation-seo/ssr-dashboard.html`、メモは `ssr-check.txt`。
- スクリーンショット（`/workspace/relocation-seo/`）: `mobile-light.png`、`mobile-dark.png`、`pc-light.png`、`pc-dark.png`。ダークの地色は `#151722`（`rgb(21, 23, 34)`）。新しい要約・しるべ・見出しはライト／ダークとも読める。道具内部（見本の案内や候補日のボタン）は従来のライト寄りの色が残る。
- テスト: 初回 CI は `aboutClaims`（帯が `DashboardTool` 側へ移っていた）と `pageMetadataSeo`（canonical が文字列リテラルでなく import だった）で失敗。修正コミットのあと、typecheck / lint / test / build は通過。
- CI: 1回目の check は失敗。GitHub Actions run 45165156297（2026-11-23 20:25:58 開始 → 20:39:04 完了 JST）。https://github.com/ishibashm/portfolio/actions/runs/45165156297
  2回目の check は成功。GitHub Actions run 45167322994（2026-11-23 20:40:40 開始 → 20:56:07 完了 JST、ジョブ所要 15分27秒）。https://github.com/ishibashm/portfolio/actions/runs/45167322994
- 本番の設定・DB は変更していない。マージは本人の承認待ち。
