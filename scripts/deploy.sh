#!/bin/bash
set -e

echo '=== デプロイ開始 (スクリプト実行) ==='

# ディスク容量チェック
echo 'Disk Usage Before Cleanup:'
df -h

# キャッシュ削除で容量確保
rm -rf ~/.npm
npm cache clean --force

# 既存のアプリを停止
pm2 delete portfolio || true

# データベースをバックアップ
if [ -f my-app/dev.db ]; then
  cp my-app/dev.db ./dev.db.bak
fi

# クリーンアップ
echo 'Cleaning up existing files...'
rm -rf my-app
# 解凍
unzip -o deploy.zip -d my-app
rm deploy.zip

# 診断用ファイル作成 (アプリ公開ディレクトリ配置)
mkdir -p my-app/public
echo "Deploy Date: $(date)" > my-app/public/deploy-status.txt
echo "User: $(whoami)" >> my-app/public/deploy-status.txt
cat /etc/os-release > my-app/public/os-info.txt
touch my-app/public/debug.txt
chmod 666 my-app/public/debug.txt


# 権限修正 (重要)
chmod -R 755 my-app


# データベース復元
if [ -f ./dev.db.bak ]; then
  mv ./dev.db.bak my-app/dev.db
fi

cd my-app

# DATABASE_URLを絶対パスに書き換え (SQLiteのパス問題回避)
# .envはdeploy.ymlで生成済みだが、念のため絶対パスで上書きする
if [ -f .env ]; then
  # 既存の定義があれば削除
  sed -i '/DATABASE_URL=/d' .env
  # 絶対パスで追記 (ここはリモート実行なので $PWD はサーバー上のパスになる)
  echo "" >> .env
  echo "DATABASE_URL=\"file:$PWD/dev.db\"" >> .env
fi

# NEXTAUTH_SECRETの確保 (重要: これがないとミドルウェアでクラッシュする)
if ! grep -q "NEXTAUTH_SECRET=" .env; then
  echo "NEXTAUTH_SECRET not found in .env, generating a random one..." >> /dev/stderr
  # ランダムな文字列を生成して追記
  RANDOM_SECRET=$(openssl rand -base64 32)
  echo "" >> .env
  echo "NEXTAUTH_SECRET=\"$RANDOM_SECRET\"" >> .env
fi

# 依存関係のインストール
echo 'Installing dependencies...'
rm -rf node_modules
npm install --omit=dev

# Prisma生成
npx prisma generate --schema=./prisma/schema.prisma

# データベース構造の適用
npx prisma db push --schema=./prisma/schema.prisma

# データシーディング
npx prisma db seed

# DBファイルの配置調整
if [ -f prisma/dev.db ]; then
  cp prisma/dev.db ./dev.db
fi

# DBファイルの権限を緩和 (重要)
if [ -f ./dev.db ]; then
  chmod 666 ./dev.db
else
  echo "Warning: dev.db not found at root, checking prisma/dev.db"
fi

# アプリ起動
echo 'Starting app...'
# 環境変数を明示的に渡して起動
DATABASE_URL="file:$PWD/dev.db" HOSTNAME=0.0.0.0 PORT=3000 pm2 start npm --name "portfolio" --update-env -- start
pm2 save

echo '=== デプロイ完了 ==='
