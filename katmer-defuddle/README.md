# Katmer-Defuddle & Knowledge Base エコシステム

このプロジェクトは「Web情報の抽出・X（旧Twitter）連携・ローカルナレッジベース構築」を統合した AI 活用ダッシュボードです。

## プロジェクト構成

- **`knowledge-base/`**: メインのダッシュボードとナレッジベース（Next.js アプリケーション）
  - Markdown のWeb抽出、AI による自動タグ付け
  - X（Twitter）の投稿検索・保存を行う AI チャット
- **`katmer-code/`**: Obsidian 用の Claude プラグイン
- **`x-tools/xmcp/`**: X (Twitter) API を叩くための MCP (Model Context Protocol) サーバー

---

## 🚀 起動手順 (How to Start)

このシステムを完全に動作させるには、ローカルLLM（Ollama）、バックエンドの **X API MCP サーバー**、およびフロントエンドの **Next.js アプリ** の3つを起動する必要があります。

### 簡単な起動方法 (一括起動バッチ)

Windows 環境の場合、プロジェクトルートにある `start-katmer.bat`（または `katmer-defuddle/start_all.bat`）をダブルクリックするか、ターミナルで実行するだけで、**3つのサーバーが自動的にすべて立ち上がります。**

```bash
.\start-katmer.bat
```

これを実行すると、以下の3つのウィンドウが起動します：

1. **Ollama Server** (`http://localhost:11434`)
2. **X API MCP Server** (`http://127.0.0.1:8000/mcp`)
3. **Katmer Knowledge Base** (`http://localhost:3000`)

起動後、ブラウザで **http://localhost:3000** にアクセスするとダッシュボードが表示されます。

---

### 手動での起動方法

もしバッチファイルを使わずに手動で起動したい場合は、以下の手順を踏んでください。

**1. Ollama の起動**

```bash
ollama serve
```

**2. X API MCP サーバーの起動 (Python)**

```bash
cd katmer-defuddle/x-tools/xmcp
.\venv\Scripts\activate
python server.py
```

**3. Katmer Base の起動 (Next.js)**

```bash
cd katmer-defuddle/knowledge-base
npm run dev
```

---

## 主な機能

- **Knowledge Base**: 保存された記事やメモの一覧管理。
- **New Document**: Markdown メモの新規作成と自動AIタグ付け。
- **Web Extractor**: URL を入力して、Webページをクリーンな Markdown に変換し、直接データベースへ保存。
- **X Integration Chat**: AIと会話しながら、「@vercel の最新投稿を取得して保存して」と指示することで、自動でXから投稿を取り込み、ナレッジベースに保存します。
