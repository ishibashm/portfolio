# トップページの地図下の空きを直す（2026-11-24）

- 依頼: 本人「地図の下の空間があいている」（2026-11-24 6:31 JST、PC幅ダークのスクショ）。左が衛星の日本地図と都市カード・凡例、右が日盤・全員共通の避けたい方位・「今日の恋愛の目安」（#1908、九星カードが縦に9枚）。右列が長いせいで、左の地図の下が大きく空いていた。マージはしない。
- PR: https://github.com/ishibashm/portfolio/pull/1911 （未マージ。実装は box 上の Codex CLI `codex exec -s workspace-write`、モデルは利用可能だった `gpt-6-luna`。ブランチ `fix/home-map-gap`。作業ディレクトリ `/workspace/home-gap/portfolio`。基点は master `9bf4e561`）
  - 9c56f44b 広い画面で地図の下が空かないよう、今日の恋愛の目安を全幅に移す
- 原因: `TodayOverview` はセクションを `@container` にし、内容幅 1100px 以上で地図の右に 24rem の列を置く。その右列に「今日の恋愛の目安」と本命星別の天気表を入れていた。恋愛カードの 3×3 は `@min-[52rem]`（832px）で、24rem（約 384〜432px）の右列では発火せず、9枚が縦に並ぶ。CSS grid の stretch で左列の箱は右列と同じ高さになるが、地図本体はそれより低く、下が大きく空く。左サイドバーありでは、2列になるのはビューポートおよそ 1512px 以上（1440px では内容幅約 1054px でまだ1列）。
- 直し方: 日盤と「全員に共通の避けたい方位」だけを地図の右に残し、「今日の恋愛の目安」と本命星別の天気表を 2 列グリッドの下へ全幅で移した。1100px で2列にする判断（iPad mini 横で地図が潰れるのを避ける）は維持。カードの中身と巻頭バナーは変えていない。
- ローカル確認（`http://127.0.0.1:3095`、ライト／ダーク）:
  - 1600px / 1920px（2列）: 地図と日盤が横並びで高さが近く、恋愛の目安は下の全幅で 3×3。地図の下の大きな空きは解消（残りは凡例の約 50px）。
  - 1440px / 1280px: 従来どおり1列。恋愛の目安は 3×3。
  - 820px / 390px: 縦積みのまま。820px では恋愛幅が 52rem 未満のため1列。崩れなし。
- スクリーンショット（作業マシン `/workspace/home-gap/`）:
  - 直す前（本番 master）: `before-1440-dark.png` / `before-1440-light.png` / `before-1280-*.png` / `before-820-*.png` / `before-390-*.png`。2列の再現: `before-1600-dark.png` / `before-1600-light.png` / `before-1920-*.png` / `before-1512-dark.png`
  - 直したあと（ローカル）: `after-1440-dark.png` / `after-1440-light.png` / `after-1280-*.png` / `after-820-*.png` / `after-390-*.png` / `after-1600-*.png` / `after-1920-*.png`
  - 計測: `before-meta.json` / `after-meta.json`
- テスト: `nationalWeather` / `todayLoveOutlook` の 19 件が通過。恋愛見出しが日盤の `aside` の外にある回帰チェックを `__tests__/nationalWeather.test.tsx` に追加。prettier は `npm run format:staged` で変更なし。
- CI: check が成功。GitHub Actions run 45272805953（2026-11-24 6:45 開始 → 7:02 完了 JST、所要 17分4秒）。 https://github.com/ishibashm/portfolio/actions/runs/45272805953
- 変更ファイル: `src/components/home/TodayOverview.tsx`、`__tests__/nationalWeather.test.tsx` のみ。未マージの #1909 / #1910 のファイルは触っていない。
- 本番の設定・DB は変更していない。マージは本人の承認待ち。
