# Task List

- `[x]` 診断基準（Phase Interference Diagnosis）のカラー・優先度表記の統一
  - `[x]` `SolarTimeClock.tsx` 内のテキスト表記（赤＞緑＞青）を （🟥＞🟪＞🟨＞🟩＞🟦(透明)）の順に修正。
  - `[x]` `SolarTimeClock.tsx` の tooltip 等で使用されている TYPE II NOISE（本命・的殺）の色を琥珀色から「紫色(purple)」へ変更。
- `[x]` マップUI（TacticalMagneticMap.tsx）の凡例追加・修正
  - `[x]` 緑(OPTIMAL)と黄色(WARNING/バグ)の解説を追加。
  - `[x]` 透明なゾーンについての解説を追加（青/SAFE、未干渉エリア）。
  - `[x]` 固有波長（自律神経・ハードウェアInit）の説明強化。
- `[x]` 目的地（Destination）入力UXの改善
  - `[x]` Action Intentの簡潔な注釈追加。
  - `[x]` GoogleマップURLや地名を貼り付けるだけでLat/Lonを抽出・検索する簡易入力枠の追加（SolarTimeClock.tsx）。
