# デプロイ・更新手順書

このドキュメントは、ポートフォリオサイト (`my-portfolio`) の更新手順をまとめたものです。
現在、**GitHub Actionsによる自動デプロイ** が設定されているため、基本的にはコードをGitHubにプッシュするだけで更新されます。
万が一自動デプロイが失敗した場合や、手動で更新する必要がある場合は、以下の手順を参照してください。

## 1. 自動デプロイ (推奨)

最も簡単で確実な方法です。

```bash
# 変更をコミット
git add .
git commit -m "更新内容のメッセージ"

# GitHubにプッシュ (これで自動デプロイが始まります)
git push origin master
```

プッシュ後、GitHubのリポジトリの「Actions」タブで進捗を確認できます。

---

## 2. 手動デプロイ手順 (緊急時用)

自動デプロイが使えない場合のバックアップ手順です。
現在、**Standaloneモードではなく、通常ビルド + サーバー側インストール方式** を採用しています。

### 2-1. ローカルでの作業 (VSCode)

```powershell
# 1. ビルド (最新のコードをコンパイル)
npm run build

# 2. デプロイ用の一時フォルダを作成
New-Item -ItemType Directory -Force -Path deploy_temp
Copy-Item -Recurse .next deploy_temp\
Copy-Item -Recurse public deploy_temp\
Copy-Item -Recurse prisma deploy_temp\
Copy-Item package.json deploy_temp\
Copy-Item package-lock.json deploy_temp\

# 3. 圧縮 (deploy.zip を作成)
# Node.js依存関係 (node_modules) は含めません（サーバーでインストールするため）
Compress-Archive -Path deploy_temp\* -DestinationPath deploy.zip -Force

# 4. 後片付け
Remove-Item -Recurse -Force deploy_temp

# 5. サーバーへ転送
# (インスタンス名: wordpress-1-vm, ゾーン: us-central1-f)
gcloud compute scp deploy.zip wordpress-1-vm:~/ --zone us-central1-f
```

### 2-2. サーバーでの作業 (GCP)

```bash
# 1. ログイン
gcloud compute ssh wordpress-1-vm --zone us-central1-f

# 2. 以下、サーバー内でのコマンド
# 既存のアプリを停止
pm2 delete portfolio || true

# 解凍 (my-appフォルダに展開)
rm -rf my-app
mkdir -p my-app
unzip -o deploy.zip -d my-app
rm deploy.zip

cd my-app

# 3. 依存関係のインストール
# 本番環境用に devDependencies を除外してインストール
npm install --omit=dev

# 4. Prismaクライアントの生成
npx prisma generate --schema=./prisma/schema.prisma

# 5. アプリ起動
# npm start コマンドを使用
pm2 start npm --name "portfolio" -- start

# 設定保存
pm2 save
```

---

## トラブルシューティング

### 502 Bad Gateway / サイトが表示されない
サーバー側で `pm2 logs` を実行してエラーを確認してください。
`MODULE_NOT_FOUND` などのエラーが出る場合は、`npm install` が正しく完了していない可能性があります。サーバー上で再度 `npm install` を実行してみてください。

### データベースエラー
`Prisma Client not initialized` などのエラーが出る場合は、サーバー上で `npx prisma generate` を実行してクライアントを再生成してください。
