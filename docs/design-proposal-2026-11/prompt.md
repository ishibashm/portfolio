あなたはWebデザイナー兼フロントエンド設計者です。日本語のサイト cloud-palette.com（引越し先を「方位（九星気学の吉凶）」と「家賃相場（e-Stat等の公的統計）」で比較して決めるサイト。Next.js 16 / React 19 / Tailwind CSS v4 / react-leaflet 5 / 地理院タイル）のデザイン刷新案を作ってください。**提案だけ**です。リポジトリのコードは一切変更しないでください（読むのはOK）。出力ファイルは /workspace/design-proposal/gemini-out/ と /workspace/design-proposal/mockups/ にだけ書いてください。

## 見てほしい材料
- 本番のスクリーンショット: /workspace/design-proposal/screenshots/ （*-pc.png = 1280幅, *-mobile.png = 390幅。arbitrage-map-*-map.png が方位地図。top-*.png がトップ。houi-*.png が方位ページ）。画像を実際に開いて見てください。
- コードの抜粋: /workspace/design-proposal/context/
  - globals.css（現行トークン。Warm Glass テーマ、rose-600 がアクセント）
  - dark-mode-globals.diff（並行開発中のダークモード branch feat/dark-mode のトークン。:root.dark で切替、ライト/ダーク/自動）
  - MagneticMapInner-sectors.tsx（地図上の8方位の扇形 Polygon + Tooltip の描画）
  - baseMapLayers.ts（地理院タイル std/pale/photo/relief/hillshade）
  - tierDisplay.ts（判定の段階色 TIER_FILL: 吉=緑の濃淡、平=灰、凶=橙→赤。色覚多様性でΔE≥8、通常ΔE≥15 の隣接段チェックをテストで強制）
  - directionLabels.ts（方位の札）
- リポジトリ全体: /workspace/dp-repo （必要なら src/components/TacticalMagneticMap.tsx, src/components/ArbitrageMapInner.tsx, src/components/home/, src/components/guide/ なども参照可）

## 依頼
(a) 地図のリデザイン — 現状は地理院の標準地図の上に半透明の扇形を重ねただけで情報量が多くごちゃつき、簡素で美しくない。
  - 見た目の豊かさ・地図スタイル（下地の選び方、淡色化・彩度調整・CSSフィルタ・ベクタタイル化の可否）
  - 8方位の扇形と札（ラベル）の描き方、中心点、方位線、選択時の強調
  - 凡例（モバイルで邪魔にならない形）
  - モバイルの操作性（全画面、ボトムシート、ピンチ、誤スクロール対策）
  - ダーク時の地図
  - 使えるライブラリ・タイルソース候補（**無料かつ商用利用可**のものだけ。ライセンス条件と出典表記を明記。例: 地理院ベクトルタイル、OpenFreeMap、MapLibre GL JS、Protomaps のセルフホストPMTiles 等。キーや課金が要るもの・Open-Meteo は不可）
(b) サイト全体のリデザイン
  - タイポグラフィ（和文・欧文の書体名、サイズスケール、行間。Webフォントの重さにも配慮。現状は Geist + 端末の和文、見出しの一部に Shippori Mincho）
  - カラートークン（ライト/ダーク両方の hex 値。下の制約厳守）
  - レイアウト（PCの左サイドバー＋カード、モバイルのハンバーガー）、余白スケール、角丸、影
  - 主要コンポーネント（ボタン、チップ、カード、都市切替のピル、判定バッジ、地図パネル、ヘッダー）
  - 段階的な移行計画（フェーズごとの作業内容と目安工数）

## 必ず守る制約
1. カラーパレットの役割はちょうど4つ（例: 地色/文字/主アクセント/副アクセント のように4役に整理し、各役にライト・ダークのhex）。**緑と赤は「判定（吉凶）」専用**で、ブランド色・装飾・ボタン・リンクに使ってはいけない（現行のrose-600アクセントがこれに抵触しないかも評価して）。判定色は既存 TIER_FILL のΔE検査を満たすこと。
2. 案内役キャラクター「しるべ」（紺の羽織・金の縁取り・朱の房飾り・金の羅盤を持つ若い易者のイラスト。画面右下を歩き回る）は残す。デザインはしるべと調和させる。
3. サイトの文言に「Cloud Paletteでは」とは絶対に書かない（モックの文言も）。
4. 予算は月数千円まで。サイト上で有料AIは使わない。
5. データ・タイルは無料かつ商用利用可のみ。Open-Meteo は使用禁止。
6. ダークモードを feat/dark-mode で並行実装中（:root.dark のCSS変数方式、ライト/ダーク/自動）。提案はこの方式に乗る形で（CSS変数名の対応表を付けて）。
7. 吉凶を断定する表現は避ける（「参考情報」の扱い）。

## 出力
1. /workspace/design-proposal/gemini-out/proposal.md — 日本語で。構成: 現状診断 → (a)地図案 → (b)全体案（トークン表: hex・フォント名・px/rem・余白・角丸・影）→ ダーク対応表 → フェーズ別計画（工数目安）→ リスク。具体的な値を必ず書くこと。
2. /workspace/design-proposal/mockups/ に静的HTMLモック（外部CDNは無料・商用可のものだけ。Leaflet+地理院タイルは可）:
   - map-mockup.html（方位地図の新デザイン。ライト/ダーク切替ボタン付き、PC/スマホ両対応）
   - site-mockup.html（トップページ相当の新デザイン。ライト/ダーク切替付き。しるべは /workspace/dp-repo/public/guide/shirube-pointing-240.webp を相対でなく file パスか data で参照してよい。もしくはプレースホルダ）
3. 最後に、提案の要点を短く標準出力にも書いてください。
