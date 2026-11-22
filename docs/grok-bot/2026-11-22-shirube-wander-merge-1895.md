# しるべ歩き回り案内役のマージと本番確認（2026-11-22）

- 承認: 本人「マージまでいいよ」（このブランチ feat/shirube-wander のみ）
- PR: https://github.com/ishibashm/portfolio/pull/1895 （squash マージ）
- マージコミット: a71c41c935aedf5cf25bf5385349586f3f0b65e0（2026-11-22 13:51 JST）
- 事前: origin/master をブランチへマージ（force push なし）。build・しるべのテスト OK。
- CI: 1 回目は型チェックで失敗（テストの state 変数の型が `phase: "walking"` に固定されていた）→ `WanderState` で型付けして再実行、合格（14 分 40 秒）。lint 警告数は master と同じ 65 件（+0）。
- マージ前に deploy.yml の実行中・待ちが無いことを確認。
- デプロイ: Deploy to GCP Cloud Run run 44986870970、成功。2026-11-22 13:51 開始 → 13:56 完了（JST）。後から古いデプロイが終わって上書きしていないことを確認（最新は本コミットの実行）。
- 本番確認（Playwright / Chrome、PC 1280px・スマホ 390px、/・/houi/today・ブログ記事）:
  - しるべは右下の定位置に表示、足踏み（stepping）中。右端とのすき間 PC 4px・スマホ約 2px、下端 0px。/houi/today では案内（pointing）も出た。
  - しるべ関連のコンソールエラーなし。出ていたのは未ログインの /api/profile-presets・/api/user-config の 401 のみ（しるべとは無関係・以前から）。
  - スクリーンショット: 作業マシンの /workspace/shirube-walk/prod-desktop.png・prod-mobile.png
- 本番の設定・DB は変更していない。
- 残り: ブログ記事の幅の広い表がスマホで横にはみ出す（別件）。
