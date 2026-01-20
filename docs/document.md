予算1,000円以内（メモリ1GBのVPS）で安全に運用するための、「通常ビルド + サーバー側インストール」運用手順 をまとめました。

以前は「Standaloneモード」を推奨していましたが、Windows環境でのビルドとLinux環境での実行の間に互換性の問題（特に `node_modules` のパス解決）が多発したため、より確実な方法に変更しました。

この新しい手順では、サーバー側で `npm install` を行いますが、1GBメモリでも `npm install --omit=dev`（開発用パッケージ除外）を使えば問題なく動作します。

手順全体像

【ローカル】 設定変更（通常モードに戻す）

【ローカル】 ビルド

【転送】 ビルド成果物 (.next) と設定ファイルをサーバーへ送信

【サーバー】 依存関係インストール & アプリ起動

Step 1: 【ローカル】設定変更

`next.config.ts` (または .js) から `output: 'standalone'` を削除またはコメントアウトします。

code
Typescript:next.config.ts
download
content_copy
expand_less
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", // ★削除またはコメントアウト
  // ...その他の設定
};

export default nextConfig;

Step 2: 【ローカル】ビルド & ファイル準備

VSCodeのターミナルで実行します。

code
Powershell
download
content_copy
expand_less
# ビルド実行
npm run build

# デプロイ用の一時フォルダを作成して必要なファイルをまとめる
New-Item -ItemType Directory -Force -Path deploy_temp
Copy-Item -Recurse .next deploy_temp\
Copy-Item -Recurse public deploy_temp\
Copy-Item -Recurse prisma deploy_temp\
Copy-Item package.json deploy_temp\
Copy-Item package-lock.json deploy_temp\

# 圧縮 (deploy.zip を作成)
Compress-Archive -Path deploy_temp\* -DestinationPath deploy.zip -Force

# 一時フォルダ削除
Remove-Item -Recurse -Force deploy_temp

Step 3: 【転送】サーバーへ送信

作成した `deploy.zip` をサーバーにアップロードします。

code
Powershell
download
content_copy
expand_less
# サーバー上のホームディレクトリにアップロード
gcloud compute scp deploy.zip wordpress-1-vm:~/ --zone us-central1-f

Step 4: 【サーバー】起動準備 & 開始

ここからはSSHでサーバーに入って操作します。

Node.js と PM2 のインストール（初回のみ）

code
Bash
download
content_copy
expand_less
# Node.js (v20系) のインストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (永続化ツール) のインストール
sudo npm install -g pm2

アプリの展開と起動

code
Bash
download
content_copy
expand_less
# 既存のアプリ停止
pm2 delete portfolio || true

# 解凍
rm -rf my-app
mkdir -p my-app
unzip -o deploy.zip -d my-app
cd my-app

# 依存関係のインストール (ここが重要！)
# --omit=dev をつけることで、本番に必要なパッケージだけインストールし、メモリと時間を節約します
npm install --omit=dev

# Prismaクライアント生成
npx prisma generate --schema=./prisma/schema.prisma

# 起動
pm2 start npm --name "portfolio" -- start

# サーバー再起動時も自動起動するように設定
pm2 save
pm2 startup

これで http://IPアドレス:3000 で動きます。

まとめ

これで、環境依存のトラブルが少ない、安定したデプロイが可能になります。
GitHub Actionsを使用している場合も、この「通常ビルド + サーバー側インストール」の流れで自動化されています。