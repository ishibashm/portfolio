# しるべの拡大・ドラッグ・操作メニューのマージと本番確認（2026-11-22）

- 依頼: 本人「歩いているしるべ小さいかな」。続けてドラッグ移動と、クリック／タップで小さなメニューを開くことも同じ作業に含めた。
- 承認: 本人「マージしていいよ」（22:34 JST）。ドラッグとメニューも同じ承認の範囲。#1897 のデプロイ完了後にマージする条件つき。
- PR: https://github.com/ishibashm/portfolio/pull/1898 （squash マージ。実装は box 上の Codex CLI）
  - 表示サイズを 1.4 倍に（実測した現行値からの採用）。PC（640px 以上）は高さ 120px → 168px（幅 58.36px → 81.70px）、スマホは 60px → 84px（幅 29.17px → 40.84px）。定位置の右余白は PC 4px / スマホ 2px のまま。前向きの歩行・その場足踏み・吹き出しの置き方・ページ描画の大きなしるべが見えている間は隠す、は維持。
  - マウスとタッチの Pointer Events でドラッグ。しきい値 6px 未満はクリック。ドラッグ中は徘徊と自動案内を停止。ヒット領域だけ `touch-action: none`。カーソルは grab / grabbing。ドロップ先は画面内に収め、ボタン等を避ける。ドロップは仮の立ち位置で、既存の帰宅間隔（10〜20 秒）のあと右端の定位置へ戻る。
  - クリック／タップでメニュー。項目: 今日の方位（`/houi/today`）、方位で街を探す（`/relocation/arbitrage`、表示名は `coreRouteLabel` から引く）、ブログ（`/blog`）、しるべに案内してもらう（`/annai`）、ひとこと案内、定位置に戻る。有料 AI（`/ask`）は停止中のため非掲載。開いている間は徘徊停止。外側クリックと Escape で閉じる。ARIA（`menu` / `menuitem` / `aria-haspopup` / `aria-expanded`）とキーボード操作あり。
  - CI 初回（d3941df7）は `coreRouteLabelSingleSource` が失敗（「方位で街を探す」の字面写しが増えた）。4c46db6a で公式名を `coreRouteLabel` から引くよう直し、再実行は合格。
- マージ前: #1897 のデプロイ完了（run 45029937094、23:00 JST）を確認。master は 805e4ac9。feat/shirube-size をその上へリベース済み。deploy.yml の実行中・待ちは無し。最終 CI 合格（run 45031773590、23:14 開始 → 23:32 完了 JST）。
- マージコミット: 894060c9db43cb7759b100a80fa95c28d82b3e7e（2026-11-22 23:33 JST）
- デプロイ: Deploy to GCP Cloud Run run 45033454233、成功。23:33 開始 → 23:39 完了（JST）。これより後に古いデプロイは走っていない。
- 本番確認（Playwright / Chrome、https://cloud-palette.com/houi）:
  - PC 1280×800: `--shirube-h` 168px、箱 81.70×174px、右余白 4px。メニュー 6 項目（/ask なし）が画面内に収まる。aria-expanded が true。
  - 390×844: `--shirube-h` 84px、箱 40.84×90px、右余白 3.38px（定位置 2px＋左向き足踏みのにじり寄り。上限 2px 以内）。メニューは画面内。ヘッダーのボタンは覆っていない。
  - 401 は未ログイン時の `/api/user-config` 等で、今回の変更とは無関係（以前からある）。
- スクリーンショット（作業マシン）: /workspace/shirube-size/（before-_.png、after-_.png、compare-*.png、prod-desktop.png、prod-desktop-actor.png、prod-desktop-menu.png、prod-mobile.png、prod-mobile-actor.png、prod-mobile-menu.png）
- 本番の設定・DB は変更していない。
