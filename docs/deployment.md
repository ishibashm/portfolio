# デプロイ・更新手順書

このドキュメントは、ポートフォリオサイト (`my-portfolio`) の更新手順をまとめたものです。
コードを修正した後、本番環境 (GCP) に反映させる際に使用してください。

## 1. ローカルでの作業 (VSCode)

コードの修正が終わったら、以下の手順でデプロイ用のファイル (`deploy.zip`) を作成します。
VSCodeのターミナル (PowerShell) で実行してください。

```powershell
# 1. ビルド (最新のコードをコンパイル)
npm run build

# 2. 静的ファイルの準備 (Standaloneフォルダに必要なファイルをコピー)
xcopy public .next\standalone\public /E /I /Y
xcopy .next\static .next\standalone\.next\static /E /I /Y

# 3. 圧縮 (deploy.zip を作成)
# ※ 以前の zip がある場合は上書きされます
Compress-Archive -Path .next/standalone -DestinationPath deploy.zip -Force

# 4. サーバーへ転送
# (インスタンス名: wordpress-1-vm, ゾーン: us-central1-f)
gcloud compute scp deploy.zip wordpress-1-vm:. --zone us-central1-f
```

---

## 2. サーバーでの作業 (GCP)

ファイルを転送したら、サーバーにログインして反映させます。

### 2-1. ログイン
```powershell
gcloud compute ssh wordpress-1-vm --zone us-central1-f
```

### 2-2. 解凍と反映
サーバーに入ったら、以下のコマンドを実行します。

```bash
# 1. 解凍 (上書きモード)
unzip -o deploy.zip

# 2. ファイルをアプリのフォルダ (my-app) に移動
# (standalone フォルダの中身を my-app に上書き移動)
cp -r standalone/* my-app/

# 3. 不要になったフォルダを削除
rm -rf standalone

# 4. 環境変数の設定 (初回のみ、または変更時)
# GitHub IDなどが追加されたので、.envを編集してください
nano ~/my-app/.env
# (ローカルの.envの内容をコピーし、NEXTAUTH_URLを本番用に変更して貼り付け)

# 5. アプリを再起動
pm2 restart portfolio
```

これで更新完了です！ブラウザで確認してください。

---

## トラブルシューティング

### データベース (Prisma) のエラーが出るとき
「画面遷移するとエラーになる」「Prisma Client not initialized」などのエラーが出た場合は、サーバーで以下を実行してください。

```bash
cd ~/my-app
npx prisma generate --schema=./prisma/schema.prisma
pm2 restart portfolio
```

### 新しいライブラリを追加した場合
`npm install ...` で新しいパッケージを追加した場合は、サーバー側でもインストールが必要です。

```bash
cd ~/my-app
npm install
pm2 restart portfolio
```
