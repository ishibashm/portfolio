# 2026-11-16 #1857 空気（PM2.5・Open-Meteo）の掲載をやめる

確認時刻: 2026-11-16 06:57 JST。本人指示（「止めて、空気の掲載はやめとこう」）のうえで実施。秘密の値は書いていない。#1853・#1854・#1855 はマージしていない。

## #1857 のマージとデプロイ

- PR: https://github.com/ishibashm/portfolio/pull/1857
- ブランチ: `codex/remove-air-section`（作業は `/workspace/pf-today-weather`）
- squash merge SHA: `4513e7ea768ae918c36c3dc3dc6bd958a257310c`
- マージ時刻: 2026-11-16 06:49:26 JST
- CI（ci.yml run `43764620543`）: success（開始 06:36:27 JST、完了 06:48:40 JST）
- マージ前に進行中・待機中の deploy.yml はなかった（直近の成功は #1852、`d24f1533`）
- deploy.yml run `43765807738`: success（開始 06:49:31 JST、完了 06:55:04 JST）
  - https://github.com/ishibashm/portfolio/actions/runs/43765807738

## 変えたファイルの要点

空気の取得処理を残さず削除した（フラグだけ無効にはしていない）。天気（気象庁）と生まれ年による今日の方位はそのまま。

- 削除: `src/lib/todayWeather/air.ts`
- `src/components/houi/TodayWeatherPanel.tsx`: 空気の欄・アイコン参照・出典を削除。見出しを「今日の天気」に変更。外部取得は気象庁だけ
- `src/app/houi/today/page.tsx`: 空気の受け渡しを削除
- `src/lib/todayWeather/prefectures.ts`: 空気専用だった緯度・経度を表から外す
- `src/lib/todayWeather/birthYear.ts`: コメントだけ更新
- `__tests__/todayWeather.test.tsx`: 空気のテストを外し、HTML に空気・open-meteo が出ないことを確認
- `public/today/icon-air-*` は参照だけ外し、ファイルは残した（新しい画像は作っていない）
- docs/site-spec.md とプライバシー／出典のページには、空気や Open-Meteo の記述はなかった
- 地表気圧（`surfacePressure`）の Open-Meteo 利用はこの変更の対象外

ローカルでも `tsc --noEmit`、lint、テスト（6715 件成功）、`next build --webpack` を通した。

## 本番確認（HTTPS の生 HTML、06:57 JST）

- `/houi/today` 200。見出しは「今日の天気」。都道府県は未選択。「都道府県を選ぶと、今日の天気が出ます。」あり。「今日の方位」の案内あり。空気の欄・icon-air・open-meteo・PM2.5 なし。
- `/houi/today?pref=23&birthYear=1990` 200。天気（愛知県・西部）あり（今日：晴れ 夜 くもり、名古屋 最高気温、出典：気象庁）。今日の方位（1990年生まれ・一白水星）あり。空気の欄・icon-air・open-meteo・PM2.5 なし。「いま取得できません」は出ない。

## #1859 地上気圧を気象庁の現地気圧に切り替え、Open-Meteo をサイトから外す

確認時刻: 2026-11-16 08:06 JST。本人指示（「外して」「商用利用可で無料が他にあるならそこから」「空気も」）のうえで実施。秘密の値は書いていない。#1853・#1854・#1855 はマージしていない。

### マージとデプロイ

- PR: https://github.com/ishibashm/portfolio/pull/1859
- ブランチ: `codex/replace-surface-pressure`（作業は `/workspace/pf-today-weather`）
- 作業開始時の base: `d308592308531bbd7847a1e4603f5ecd8c0819ac`（#1858 まで入った master。#1857 のあとに FAQ 記事が乗っている）
- 作業コミット（squash 前）: `2adaa277d000677663900fc56ca58aef7d3bb495`
- squash merge SHA: `aee49fbee2c7d5f458022a12e273f1ed7fe5df80`
- マージ時刻: 2026-11-16 07:58:44 JST
- CI（ci.yml run `43771035501`）: success（完了 07:55:50 JST）
  - https://github.com/ishibashm/portfolio/actions/runs/43771035501
- マージ直前に進行中・待機中の deploy.yml はなかった（直近の成功は #1857、`4513e7ea`、完了 06:55:04 JST）
- deploy.yml run `43772244064`: success（開始 07:58:47 JST、完了 08:04:29 JST）
  - https://github.com/ishibashm/portfolio/actions/runs/43772244064

### Open-Meteo の残りの使い道と扱い

#1857 のあと、サイトから Open-Meteo を呼んでいたのは地表気圧（`surfacePressure` → `/api/surface-pressure`）だけだった。気象病モデル（気圧の 3 時間変化）と、SolarTimeClock / BioMagneticDashboard / HomePortal「環境」カードの表示に使っているので、削除せず置き換えた。

置き換え先は気象庁ホームページの地上気象観測（現地気圧）。通常のアメダスは気圧を測らないため、気圧のある観測点 154 か所の表をコードに置き、最寄りの点の最新値と 3 時間前を取る。取得は 3 秒で打ち切り、失敗時は null（0 とは出さない）。海面更生値ではなく現地気圧。都道府県庁所在地から最寄りの気圧点までの距離は、45 都府県で同一地点、滋賀（大津→京都）約 16.6 km、埼玉（さいたま→東京）約 25.1 km。

### 規約と出典

- 気象庁の利用規約: https://www.jma.go.jp/jma/kishou/info/coment.html（公共データ利用規約第 1.0 版。商用利用可。出典表示が必要。加工した場合はその旨を書く）
- 公共データ利用規約第 1.0 版の本文: https://www.digital.go.jp/resources/open_data/public_data_license_v1.0
- 出典のリンク先（人が見る地図）: https://www.jma.go.jp/bosai/map.html#contents=amedas

画面上の出典表示:

- BioMagneticDashboard（気圧ブロックの下）: 「出典：気象庁の地上気象観測（現地気圧）をもとに、最寄りの観測点の3時間変化を算出」（上記アメダス地図へリンク、別タブ、`noopener noreferrer`）
- HomePortal「環境」カード（気圧があるとき）: 「気圧の出典：気象庁の地上気象観測（現地気圧）をもとに算出」（同じリンク）

API キーも有料サービスも使っていない。

### 空気（PM2.5）は戻さなかった

候補の環境省そらまめ君（大気汚染物質広域監視システム）の公式 API（https://soramame.env.go.jp/soramame/api/data_search 、キー不要）を見た。マニュアル https://soramame.env.go.jp/data/apiManual/2.html では、著作権は環境省・地方公共団体・国立環境研究所にあり、国設局以外の測定局データは各自治体と国立環境研究所への確認が必要。国設局は https://www.env.go.jp/mail.html の公共データ利用規約第 1.0 版で商用利用できるが、局数が少なく 47 都道府県を安定してカバーできない。キー不要で商用利用の条件がはっきりし、都道府県ごとに安定して値が取れるほかの無料情報源も見つからなかったので、空気の欄は戻していない。`public/today/icon-air-*` はそのまま残してある。

### 変えたファイルの要点

- 追加: `src/utils/jmaPressureStations.ts`（気圧のある観測点 154 か所。実行時に観測点一覧は取らない）
- 書き換え: `src/utils/surfacePressure.ts`（Open-Meteo をやめ、気象庁の latest_time と地点ファイル 2 本を 3 秒タイムアウト・900 秒 revalidate で取得）
- `src/app/api/surface-pressure/route.ts`: コメントを気象庁向けに更新（緯度・経度を 0.05 度に丸める動きはそのまま）
- `src/components/BioMagneticDashboard.tsx` / `src/components/home/HomePortal.tsx`: 上記の出典を追加
- `__tests__/surfacePressure.test.ts`: 気象庁のフィクスチャに合わせて更新。ソースに `api.open-meteo.com` が残っていないことも確認

ローカルでも `tsc --noEmit`、lint、テスト（6717 件成功、5 件スキップ）、`next build --webpack` を通した。

### 本番確認（HTTPS、08:06 JST ごろ）

- `/houi/today` 200。見出しは「今日の天気」。天気と方位の案内あり。空気の欄・PM2.5・open-meteo なし。
- `/houi/today?pref=23&birthYear=1990` 200。天気（愛知県・西部）あり（今日：晴れ 夜 くもり、名古屋 最高 20℃、出典：気象庁）。今日の方位（1990 年生まれ・一白水星）あり。空気の欄・PM2.5・open-meteo なし。「いま取得できません」は出ない。
- `/relocation/dashboard` 200。初期 HTML と読み込み対象の JS（16 本）に open-meteo なし。気圧はクライアント取得のため、初期 HTML には気圧の数値も出典もない。
- `/api/surface-pressure?lat=35.69&lon=139.75` 200。`current` 1009.8、`threeHoursAgo` 1006.3、`drop` 3.5、`timestamp` 2026-11-15T22:50:00.000Z（2026-11-16 07:50 JST）。JSON に open-meteo なし。
