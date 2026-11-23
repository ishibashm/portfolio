# ホームの天気地図のデザイン（衛星下地とダークモード）（2026-11-23）

- 依頼: 本人「天気の地図をデザインをより凝りたい、衛星でもいいか、適切に」。データは無料で商用利用できるものだけ。Open-Meteo は使わない。月数千円以内（なるべく 0 円）。緑と赤は判定だけ。ブランドは紺と金。ダークモード対応。
- 対象: ホーム「今日の全国の天気」地図（`NationalWeatherMap`）。サーバー描画の SVG（10 都市の札）。Leaflet の物件地図とは別。以前の「地図の作り直し 第1段階」（`docs/design-proposal-2026-11`、Gemini 4 Neon、方位で街を探す地図の淡色下地など）は読んだが、今回の対象ではないので触っていない。
- 実装: box 上の Codex CLI（`codex exec -s workspace-write`、モデル gpt-6.2-sol）。専用クローン `/workspace/cp-weather-map`。ブランチ `feat/home-weather-map-design`。コミット `107a8aaf`（13:21 JST）、追記 `e185d1de`（点の輝きを opacity だけに修正、13:38 JST）。
- PR: https://github.com/ishibashm/portfolio/pull/1907 （未マージ。本人の確認待ち）

## 選んだデータ源と規約

候補を規約ページで確認した。

- **採用: 地理院タイル「世界衛星モザイク画像」（ID `modis`、ズーム 2〜8）**を再投影・色調整して静的 WebP にした（本土・南西諸島の 2 枚、合計約 95KB）。ランタイムではタイルを取らない（外部送信なし、費用 0 円）。
  - タイル: https://cyberjapandata.gsi.go.jp/xyz/modis/{z}/{x}/{y}.png
  - 一覧: https://maps.gsi.go.jp/development/ichiran.html#modis
  - 規約: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html （公共データ利用規約 第1.0版。出典の記載のみで利用可。商用可。加工した旨を記載）
  - 追加の出所（一覧の備考どおり、Year は提供開始の 2015）: Images on 世界衛星モザイク画像 obtained from site https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes Distributed Active Archive Center (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota, (2015). Source of image data product: MODIS (NASA).
- 予報は従来どおり気象庁（府県天気予報・アメダス）。規約: https://www.jma.go.jp/jma/kishou/info/coment.html
- 輪郭は従来どおり Natural Earth（パブリックドメイン）
- **使わなかったもの**
  - 気象庁の雨雲レーダー／ひまわり: 自動巡回による定期収集は原則ご遠慮。レーダー配色は赤・緑を含み、判定色の方針と合わない
  - 地理院「全国最新写真（シームレス）」: ズーム 14〜18 のみで全国俯瞰には向かない
  - NASA GIBS のライブタイル: 商用・出典の条件は満たせるが、今回は地理院モザイクの静的焼き込みにした

出典は地図の下に、加工した旨・規約リンク・追加出所を表示した。再生成手順は `scripts/build_weather_map_satellite.py` と `public/weather/README.md`。

## 変えた内容

- 淡い緑の塗りつぶしをやめ、衛星写真＋紺の海（`#152238`）＋金の輪郭・都市の点（紺の芯＋金の輪）
- 札の位置・大きさ・文字サイズは変更なし。ライトの札色（晴・くもり・雨・雪・避けたい方位）もそのまま
- ダークモードは CSS で札の塗りと文字を切り替え（コントラスト 4.5:1）。衛星は反転せず、明るさ・コントラストだけ調整
- 地図の直下に色の凡例。説明文は短くした
- 都市の点にごく弱い輝き（`prefers-reduced-motion: reduce` では動かない）
- Open-Meteo は使っていない。`"use client"` も付けていない

## 確認

- テスト: `npx vitest run __tests__/nationalWeather.test.tsx __tests__/todayWeather.test.tsx __tests__/homeOriginWeather.test.tsx` が 30 件成功。eslint / prettier（pre-commit）通過
- スクリーンショット（作業マシン `/workspace/weather-map/`）:
  - 前（本番）: `before-desktop-light.png` / `before-desktop-dark.png` / `before-mobile-light.png` / `before-mobile-dark.png`
  - 後（ローカル http://localhost:3010 ）: `after-desktop-light.png` / `after-desktop-dark.png` / `after-mobile-light.png` / `after-mobile-dark.png`
- 本番の設定・DB は変更していない。マージしていない。

## CI

- 最初の check（run 45111462540、13:22:26 開始 → 13:30:23 完了 JST）は失敗。`__tests__/motionAccents.test.tsx` が、keyframes で動かす性質を `transform` と `opacity` だけに限っており、都市の点の輝きが `stroke-opacity` を使っていたため。`e185d1de` で `opacity` に直した。
- 再実行の check は成功。GitHub Actions run 45113072697（2026-11-23 13:38:31 開始 → 13:48:06 完了 JST、所要 9分32秒）。 https://github.com/ishibashm/portfolio/actions/runs/45113072697
