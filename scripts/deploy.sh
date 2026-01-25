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
echo "--- OpenSSL Version ---" >> my-app/public/os-info.txt
openssl version >> my-app/public/os-info.txt
touch my-app/public/debug.txt
chmod 666 my-app/public/debug.txt


# 権限修正 (重要)
chmod -R 755 my-app

cd my-app

# NEXTAUTH_SECRETの確保
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
npm install --omit=dev --legacy-peer-deps

# Prisma生成
npx prisma generate --schema=./prisma/schema.prisma

# データベースマイグレーションの適用 (Postgres/Supabase用)
# 本番環境では db push ではなく migrate deploy を使用する
echo 'Applying migrations...'
npx prisma migrate deploy --schema=./prisma/schema.prisma

# データシーディング
echo 'Seeding database...'
npx prisma db seed

# アプリ起動
echo 'Starting app...'
# 環境変数は .env から読み込まれるため、インラインでの指定は不要
# --update-env で .env の変更を反映させる
HOSTNAME=0.0.0.0 PORT=3000 pm2 start npm --name "portfolio" --update-env -- start
pm2 save

echo 'Waiting for application to start...'
sleep 10

# ヘルスチェックとログ収集
if curl -f http://127.0.0.1:3000/api/health; then
  echo "Health check passed!"
else
  echo "Health check failed! Dumping logs..."
  pm2 logs portfolio --lines 100 --nostream
  exit 1
fi

echo '=== デプロイ完了 ==='
