# ブログ記事のスマホ横はみ出し修正のマージと本番確認（2026-11-22）

- 承認: 本人「マージして」（2026-11-22 17:30 JST、PR #1896 のみ）
- PR: https://github.com/ishibashm/portfolio/pull/1896 （squash マージ）
- マージコミット: 2218cf88348d84ce254896e8b4297403c211f71f（2026-11-22 17:31 JST）
- 原因: 本文中の長い `code` が折り返されず、記事の列（スマホは grid-cols-1 = minmax(auto,1fr)）を押し広げていた。表は元から横スクロールの器に入っていた。
- 変更: 本文の器に min-w-0 と overflow-wrap:anywhere、表・コードの塊は器の中で横スクロール、画像 max-w-full、記事の列を minmax(0,1fr)＋article に min-w-0。
- マージ前に deploy.yml の実行中・待ちが無いことを確認。CI 合格（15 分 27 秒）。
- デプロイ: Deploy to GCP Cloud Run run 45003214116、成功。17:31 開始 → 17:37 完了（JST）。これより後に古いデプロイが走って上書きしていないことを確認。
- 本番確認（Playwright / Chrome）:
  - 390px: /blog/does-bad-direction-last-60-years・/blog/how-we-analyze-the-rental-market とも scrollWidth 390（修正前は 544 / 541）。しるべは右下に表示（右端との隙間 2〜3px、画面内）。
  - 390px で公開中の全 58 記事を確認し、はみ出し 0 件。
  - PC 1280px: 横はみ出しなし、本文幅 644px（変化なし）。
  - スクリーンショット（作業マシン）: /workspace/blog-table/prod-mobile-does-bad.png・prod-mobile-rental.png・prod-mobile-code.png・prod-desktop-does-bad-dir.png・prod-desktop-how-we-analy.png
- 本番の設定・DB は変更していない。
