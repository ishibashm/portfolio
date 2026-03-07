#!/bin/bash
set -e

echo '=== デプロイ開始 (スクリプト実行) ==='

# ディスク容量チェック
echo 'Disk Usage Before Cleanup:'
df -h

# OOMキラー対策: スワップ領域の追加 (GCP無料枠VM等のメモリ不足によるクラッシュ防止)
if [ ! -f /swapfile ]; then
    echo "Creating 1GB swap file..."
    sudo fallocate -l 1G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024 || true
    sudo chmod 600 /swapfile || true
    sudo mkswap /swapfile || true
    sudo swapon /swapfile || true
fi

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

# NEXTAUTH_SECRETの確保 (NextAuth削除したので本来不要だが、念のため残すか、あるいは削除しても良い。今回はシンプルに削除)

# 依存関係のインストール
echo 'Installing system dependencies for Chromium/Puppeteer...'
sudo apt-get update > /dev/null
sudo apt-get install -yq ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils

echo 'Installing application dependencies...'
rm -rf node_modules
npm install --omit=dev --legacy-peer-deps

# アプリ起動
echo 'Starting app...'
# npm経由だとメモリを余分に消費しクラッシュ検知が遅れる可能性があるため、nextバイナリを直接叩く方式に変更
PORT=3000 HOSTNAME=0.0.0.0 pm2 start node_modules/.bin/next --name "portfolio" --update-env -- start
pm2 save

echo 'Waiting for application to start...'
# Next.jsの起動完了まで最大30秒間(3秒ごとに10回)リトライして待機する
HEALTH_OK=false
for i in {1..10}; do
  if curl -s -f http://127.0.0.1:3000/ > /dev/null; then
    echo "Health check passed at attempt $i!"
    HEALTH_OK=true
    break
  fi
  echo "Waiting for Next.js to be ready... ($i/10)"
  sleep 3
done

if [ "$HEALTH_OK" = false ]; then
  echo "Health check failed after 30 seconds! Dumping logs..."
  pm2 logs portfolio --lines 100 --nostream
  exit 1
fi

echo '=== デプロイ完了 ==='
