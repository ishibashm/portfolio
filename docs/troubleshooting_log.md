# 🚀 トラブルシューティングログ: Next.js デプロイと環境変数関連 (2026-03-07)

このドキュメントは、Next.jsアプリ（ポートフォリオ/ダッシュボード）のGCP移行およびデプロイ時に発生した一連のエラーと、その解決策の履歴をまとめたものです。

## 1. ビルドエラー: Supabase URLが見つからない (SSG/Prerender時のエラー)

- **症状:** GitHub Actions またはローカルでの `npm run build` 時、`/rentals` ページのビルド（Static Generation）がコケてしまう。
- **原因:** `/rentals` ページで `@supabase/ssr` の `createBrowserClient` を初期化する際、Next.jsのビルド時（SSRの事前レンダリング）に実行されてしまう。ビルドサーバー上には `.env.local` などの環境変数が存在しなかったため、必須の `NEXT_PUBLIC_SUPABASE_URL` が取得できずエラーとなっていた。
- **解決策:** `/rentals` ページの先頭で `export const dynamic = 'force-dynamic'` を宣言し、静的生成（SSG）をスキップさせて動的レンダリング（SSR）に強制。これにより、ビルド時には実行されず、実行時（ユーザーアクセス時）の環境変数を用いてクライアントが初期化されるように修正した。

## 2. ランタイムエラー: `Failed to find Server Action "pop"`

- **症状:** デプロイ成功後、本番環境のアプリ（`/defuddle` など）でボタンを押したりアクションを実行すると、`Error: Failed to find Server Action "pop". This request might be from an older or newer deployment.` というエラーでサーバーがダウン、または機能が失敗する。
- **原因:** Next.js 14 の Server Actions は、ビルドごとに新しいランダムな暗号化キーを生成する機能がある。GitHub Actions のビルド環境と、VMサーバー（PM2）の実行環境との間でキャッシュやキーの不一致が発生したため。
- **解決策:** GitHub Actions のビルドワークフロー (`deploy.yml`) の中で、ビルド実行前に `openssl rand -base64 32` コマンドを使用して永続的な `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` を `.env` ファイルに書き込み、キーを固定化させた。

## 3. インストールエラー: NPM Peer Dependency の競合 (ERESOLVE)

- **症状:** 本番サーバーで依存関係を再インストール (`npm install`) しようとした際、`defuddle` と `jsdom` パッケージ間でバージョン競合の `ERESOLVE` エラーが発生し、デプロイが中断。
- **原因:** `scripts/deploy.sh` 内の `npm install` オプションから一時的に `--legacy-peer-deps` を外したところ、潜在していた Peer Dependency のバージョン齟齬が顕在化した。
- **解決策:** 再び `--legacy-peer-deps` オプションを `scripts/deploy.sh` に付与し、強制的にインストールを続行させるように修正。

## 4. ランタイムエラー (Middleware): Supabase URL and Key are required

- **症状:** PM2での起動時に `Error: Your project's URL and Key are required to create a Supabase client!` が発生し続け、サーバーが立ち上がらない。
- **原因:**
  1. 初期調査では、`deploy.yml` で暗号化キーを `.env` に追記 (`>>`) する際、前行からの改行が存在せず、パーサーが破壊されていると推測（改行を補填して対策済み）。
  2. **【根本原因】** `deploy.yml` は `echo "${{ secrets.ENV_FILE }}" > .env` によって本番用の環境変数ファイルを生成しているが、**「GitHubリポジトリのSecretsに `ENV_FILE` が登録されていなかった」**。結果として生成された `.env` が（暗号化キーを除いて）完全に空っぽとなっており、ミドルウェア実行時に必要な `NEXT_PUBLIC_SUPABASE_URL` 等が欠落していた。
- **解決策:**
  - GitHub リポジトリの（Settings > Secrets and variables > Actions）に `ENV_FILE` シークレットを新規作成し、ローカルで利用している `.env` の内容をすべて貼り付けるようユーザーに案内。
  - クライアント側（`src/utils/supabase/client.ts`）に一時的に入れていたダミーのフォールバック値を削除し、環境変数未定義時には正しく（早期に）エラーで落ちるようにフェイルファストな設計に戻した。
