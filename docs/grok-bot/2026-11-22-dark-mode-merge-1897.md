# ダークモード追加と紺・金の配色のマージと本番確認（2026-11-22）

- 依頼: 本人「ダークモードとか追加したいな」。配色は 21:48 JST に本人がしるべの紺・金（4役）に決定。凶寄り（D）のダーク時の文字は 22:31 に金から橙へ戻すと決定。
- 承認: 本人がマージを承認（22:33 JST、PR #1897 のみ）
- PR: https://github.com/ishibashm/portfolio/pull/1897 （squash マージ。Codex CLI で実装）
  - cd166b5b ダークモード本体（OS連動＋ヘッダーのボタンで ライト→ダーク→自動、localStorage `theme`、`<head>` の初期化スクリプトで一瞬違う色が出ない）
  - a70e0816 ブランド色を rose → しるべの紺・金に。4役（ライト / ダーク）: 地色 #FAF7F2 / #151722、文字 #171C2B / #F3EFE8、勝色 #1E3A6E / #8CB4FF、金 #8A6216 / #DFB968。判定以外の緑・赤（主色 #e11d48・#be123c、ハザード「なし」、検索範囲の円 #10b981、サイドバーのログイン・システム稼働中、エリアの赤い点、所得マップの赤）を置き換え。TIER_FILL は不変。
  - c56b9125 ダークの D（凶寄り）バッジとシミュレーターの「凶」を orange-400 に（カード #1E2130 上で 6.71:1、バッジ面合成で 5.23:1）。
- マージコミット: 805e4ac92ebdcd8751194a4b7d90f8b1a87100a2（2026-11-22 22:54 JST）
- マージ前に deploy.yml の実行中・待ちが無いことを確認。CI 合格（最終コミット 9 分 46 秒）。
- デプロイ: Deploy to GCP Cloud Run run 45029937094、成功。22:54 開始 → 23:00 完了（JST）。これより後に古いデプロイは走っていない。
- 本番確認（Playwright / Chrome、PC 1280px・390px × OS ライト/ダーク）: トップ・/houi・/blog/how-we-analyze-the-rental-market・/relocation/arbitrage すべて 200、横はみ出しなし、ページエラー 0、しるべは画面内に表示。OS ダークで html.dark・color-scheme dark・地色 #151722、ライトで #FAF7F2。ボタンは light → dark → system と循環し、localStorage に保存、再読み込み後もダーク維持。
- スクリーンショット（作業マシン）: /workspace/dark-mode/prod/（本番）、/workspace/dark-mode/before/（変更前）、/workspace/dark-mode/after/（ローカル）
- 残り: 記事の図版画像の中の赤系（画像そのもの）、地図の一部の操作面・ポップアップはダークでも明るい、管理・アカウント・磁気地図・カレンダー等の旧配色（docs/dark-mode.md に列挙）、wealth 実データ・arbitrage ポップアップ・simulator 結果はダークで未確認。
- 本番の設定・DB は変更していない。
