# AI Asset Builder Hub & Meta-Metaphysical Hub

本リポジトリは、個人の**生体リズム（バイオメトリクス）**、**環境マクロ（市場センチメント・ニュース）**、そして**天体物理学・占星術的タイミング**を高度に統合し、決定論的な意思決定エンジンと、金融・不動産などの「資産形成（Asset Formation）」分析ツールを組み合わせた、次世代型のコックピット・プラットフォームです。

単なるポートフォリオサイトを超え、クオンツ研究パイプライン、Webスクレイピング、AIによるUIジェネレータ、ナレッジマネジメント（Second Brain）が一体となった、セキュアで自律的なAI統合ワークスペースハブとして機能します。

---

## 🌌 主要機能モジュール

### 1. 🧠 Oracle Engine & NBA 意思決定エンジン (`src/app/metaphysical`)
自身の内部状態と外部のマクロ環境、宇宙のリズムを同期させ、**「次に行うべき最善の行動 (Next Best Action = NBA)」**を動的に算出する意思決定エンジンです。
- **生体データ同期 (Biometrics)**: Oura Ring API を経由して、日々の Readiness（コンディション）や Recovery Index（回復指標）をリアルタイムに取得。心身の負荷（ANS Load）を算出。
- **環境マクロ収集 (Macro Environment)**: Tavily Search API を用いて世界市場のセンチメント、地政学リスク、マクロ経済トレンドを自律調査し、環境リスク値を動的に評価。
- **天体物理・暦法エンジン (Cosmic Rhythms)**: Swiss Ephemeris (`sweph-wasm`) および AstroEngine をバックエンドに持ち、太陽黄経や火星・土星などの惑星軌道位置を物理計算。さらに旧暦・月相・六曜の判定も統合。
- **NBAアルゴリズム**: これら多次元のベクトルを、決定論的な強化学習風ルールエンジンに入力し、現在の状況における「推奨行動」「確信度 (Confidence)」をリアルタイム出力します。

### 2. 🗺️ Relocation & Wealth Matrix (吉方位・地域所得マトリクス) (`src/app/relocation/wealth`)
天体位置・気学モデルと、日本国内の市区町村の所得統計・地価データを掛け合わせ、**「移住・拠点設立に最も適した地域」**を探索するシミュレーションダッシュボードです。
- **富の地理的マッピング**: 国土交通省（MLIT）の不動産情報ライブラリおよび独自集計データから、全国の自治体ごとの「1人あたり平均所得」「納税義務者数」「基準地価」をデータベース化。
- **磁気偏角補正 (Magnetic Declination)**: `geomagnetism` パッケージを用いて、地球上の緯度経度における磁偏角（東京付近で約 -8.2度）を算出し、通常の「真北基準」だけでなく「磁北基準」による高精度な方位判定を実行。
- **コスパ指数 (Cospa Index)**: 平均所得を地価で除した「稼ぎやすく地価が安い地域」を算出し、かつ基準地からの距離制限フィルターを適用。
- **ビジュアル・マッピング**: Leaflet / React-Leaflet を用いて、マップ上に「大吉 (OPTIMAL)」「吉 (SAFE)」「凶 (NOISE)」の方位角ラインと、所得規模に応じたヒートマップ円を動的描画。CSVやJSON形式での一括エクスポートもサポート。

### 3. 🏠 不動産アービトラージ・スキャナー (`src/app/relocation/arbitrage`)
110万件を超える不動産情報、または Playwright やメールスクレイピング経由で収集された最新の賃貸物件データベースから、**「方位の運気」と「市場価格の歪み（割安さ）」**を同時に満たす物件を走査します。
- **利回り偏差値 (Yield Score)**: 周辺エリアの平均平米単価から物件の想定家賃の乖離度を計算し、市場平均に対して利回りが高い（割安な）物件を偏差値化。
- **気学フィルターの適用**: 利用者の生年月日と移動ターゲット日をもとに、年盤・月盤・日盤それぞれの吉方位ベクトルとのコリジョン（衝突）を判定し、物件ごとに「OPTIMAL / SAFE / NOISE」のステータスを自動付与。

### 4. 🎨 AI Visualizer Studio & Component Gallery (`src/app/visualizer`)
AIを活用して、ダッシュボードウィジェットやX（Twitter）風の各種デザインカードを直感的に生成・カスタマイズし、公開・共有できるクリエイティブスタジオです。
- **Monaco Editor 連携**: 入力データ（JSON形式）を Monaco Editor 上で自由に編集。
- **AI Refinement (対話型洗練)**: チャット形式で「もっとサイバーパンク風にして」「フォントをOutfitに変更して」と入力することで、Tailwind CSS を適用した美しいHTMLコンポーネントコードをAIがリアルタイムに再生成。
- **マルチメディア波形解析**: MP3ファイルのドラッグ＆ドロップ、または YouTube 共有リンクの入力に対応。Web Audio API を用いてオーディオバッファの周波数・波形を Canvas 上にリアルタイム視覚化。
- **AI楽曲構成判定**: アップロードされた音源のテンポ（BPM）やキーを解析し、AIによって楽曲の構成（イントロ、Aメロ、サビ、アウトロ等）のタイムラインを自動抽出し、構造化。
- **共有とギャラリー**: 生成したコンポーネントを Prisma (PostgreSQL/Supabase) に保存し、`html2canvas` によるPNG画像エクスポート、および一意の公開共有リンクをワンクリックで発行。

### 5. 📚 ITIL Second Brain / ナレッジマネジメント (`src/app/knowledge`)
日々のリサーチで得られたWeb上の膨大な情報資産を、クリーンな形でナレッジ化し、蓄積するローカル知識ベース（ITIL準拠）です。
- **Defuddle 抽出エンジン**: 指定された外部URLから、広告やナビゲーションノイズを完全に除去し、主要本文のみを完全な Markdown ドキュメントとしてクリーン抽出。
- **ITIL チケット管理形式**: 抽出した記事は「KB000001」のような一意のナレッジIDが自動採番され、ステータス（Draft/Published）、優先度（High/Medium/Low）、カテゴリ、タグ等で構造化され、データベースに永続化されます。
- **データ連携**: 後述のX（Twitter）データエンジンやスクレイピングファイルも、ワンクリックでこのセカンドブレインにインデックス登録が可能です。

### 6. 📊 AI Quant Researcher (クオンツ研究パイプライン)
株式市場のデータとオルタナティブデータ（SNSトレンド、YouTube等）を融合し、アルファ（投資仮説・ルール）を生成するリサーチモジュールです。
- **J-Quants API V2 連携**: 取引所公式の API を用いて個別銘柄の四半期財務情報および株価四本値を取得。
- **Gemini Hypothesis Generator**: 抽出した時系列・財務データを Google Gemini (Vercel AI SDK経由) に流し込み、勝率の高いトレードアルゴリズムの自動発掘や個別レポート（`reports/report_*.md`）を自動生成。
- **X (Twitter) Scraper & Viewer (`src/app/research`)**: 任意の検索URLから特定のアカウントやキーワードの投稿群を Playwright を用いて自動取得。画像・動画・外部リンクなどの添付メディアも含めて `./x_downloads` へ構造化 Markdown として自動保存し、ギャラリー表示や全文検索が可能な専用ビューワー (`src/app/x-viewer`) を完備。
- **Yakumoin Scraper**: 暦法に基づく毎日の吉凶方位の更新状態を Playwright で自動収集・アーカイブ化。

---

## 🛠️ 技術スタック & アーキテクチャ

本システムは **pnpm Monorepo** 構成を採用し、フロントエンド・バックエンドの厳密な型安全性を確保しています。

- **コアフレームワーク**: Next.js 16 (App Router), React 19, TypeScript
- **スタイリング & アニメーション**: Tailwind CSS v4, Framer Motion, Lucide React
- **データベース & ORM**: Supabase (PostgreSQL), Prisma Client
- **データスクレイピング & パース**: Playwright, JSDOM, Defuddle (Node)
- **物理・占星・地理計算**:
  - `sweph-wasm` (Swiss Ephemeris WebAssemblyポート)
  - `astronomy-engine` (精密天体位置計算)
  - `geomagnetism` (地球磁気偏角補正モデル)
  - `lunar-javascript` (旧暦・六曜等の太陰太陽暦変換)
- **AI統合**: Vercel AI SDK (`ai`), `@ai-sdk/google` (Gemini 2.5/3.5シリーズ)
- **エディタ・可視化**: Recharts (チャート描画), Monaco Editor (JSON・コード編集), Cytoscape.js (ネットワーク構造可視化), Leaflet (地図マッピング)

---

## 🤖 AIエージェント・ハーネス (自律開発環境)

本プロジェクトには、AIエージェント（Antigravity や Claude など）が自律的かつ健全にプロジェクトを編集・拡張するための環境（エージェント・ハーネス）が整備されています。

- **`CLAUDE.md` (ルール層)**: AIエージェントが遵守すべき技術的制約、コーディング規約、アーキテクチャの基本設計ルールを記述。
- **`MEMORY.md` (コンテキスト/記憶層)**: セッションを跨いで引き継ぐべき「現在の開発状況」「次に行うべき実装項目」「既知の課題」を随時アップデートして管理。
- **自律型エージェントスキル (`.roo/skills/`)**: 
  - `plan.md` : 実装前に影響範囲を洗い出し、計画を合意するための手順。
  - `review.md` : 実装後に型チェック (`npx tsc --noEmit`) や Lint で品質を自己保証する手順。
  - `quant-research.md` : 金融やマクロ経済の調査を実行する際の手順。
- **自己診断ツール**: エージェント制御の整合性をテストするため、`npm run review-harness` コマンドでハーネス検証ツールを実行可能。

---

## 🚀 開発環境のセットアップ

### 1. 依存関係のインストール
プロジェクトのルートディレクトリで以下のコマンドを実行します。

```bash
# 依存パッケージのインストール
pnpm install

# Playwright ブラウザのインストール
npx playwright install
```

### 2. 環境変数の設定
プロジェクトルートに `.env` ファイルを作成し、`.env.example` を参考に必要なキーを入力します。

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Gemini API Key (Next.js SDK / AI SDK用)
GEMINI_API_KEY="AIzaSy..."

# 外部サービスAPI連携（必要に応じて）
JQUANTS_API_KEY="..."
OURA_ACCESS_TOKEN="..."
TAVILY_API_KEY="..."
TWITTER_BEARER_TOKEN="..."
```

### 3. データベーススキーマの同期
Prismaを使用して、Supabase等のPostgreSQLインスタンスにテーブル定義を反映します。

```bash
# データベースへ定義のプッシュ
npx prisma db push

# Prisma Clientの再生成
npx prisma generate
```

### 4. 開発サーバーの起動
ローカル開発サーバーを起動します。

```bash
pnpm run dev
```
起動後、ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスすると、Oracleコックピットダッシュボードが表示されます。

---

## 📊 スクリプトの実行方法

本プロジェクトには、データ収集や計算処理を行うための便利なコマンドが用意されています。

- **クオンツ株式リサーチ**:
  J-Quants から財務データを取得し、AIによるレポートを生成します。
  ```bash
  npm run research
  ```
- **吉方位所得データの計算とエクスポート**:
  `local_tactical_config.json` に設定された基準地・生年月日情報をもとに、全国自治体の所得情報と方位運気スコアを一括計算し、`docs/` 以下にJSONおよびCSV（Excel対応）で保存します。
  ```bash
  npm run export-calculated-wealth
  ```
- **エージェント・ハーネスの診断**:
  AIエージェントの制御ルールが正しく維持されているかを診断・検証します。
  ```bash
  npm run review-harness
  ```
