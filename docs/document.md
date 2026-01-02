予算1,000円以内（メモリ1GBのVPS）で安全に運用するための、「ローカルビルド（Standaloneモード）運用手順」 をまとめました。

この手順なら、サーバーのメモリが少なくても落ちませんし、デプロイも高速です。

前提として、Xserver VPS や ConoHa VPS などの Ubuntu (22.04 または 24.04) を契約したと仮定して進めます。

手順全体像

【ローカル】 設定変更（Standaloneモード有効化 & Prisma対応）

【ローカル】 ビルド & ファイル整理

【転送】 必要なファイルだけをサーバーへ送信

【サーバー】 アプリ起動 & Webサーバー設定

Step 1: 【ローカル】設定変更

WindowsでビルドしてLinuxで動かすために、少し準備が必要です。

1. next.config.ts (または .js) の修正

output: 'standalone' を追加します。これで「必要なファイルだけまとめるモード」になります。

code
Typescript:next.config.ts
download
content_copy
expand_less
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // ★これを追加
  // ...その他の設定
};

export default nextConfig;
2. prisma/schema.prisma の修正

Windows上で、Linux用のデータベースエンジンも準備させる必要があります。これをしないとサーバーで「エンジンが見つからない」とエラーになります。

code
Prisma:prisma/schema.prisma
download
content_copy
expand_less
generator client {
  provider = "prisma-client-js"
  // ★以下を追加（Windows用と、Ubuntu用のバイナリを指定）
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

// ...以下略

※修正後、ターミナルで npx prisma generate を実行して反映させてください。

Step 2: 【ローカル】ビルド & ファイル整理

ここが一番のポイントです。Standaloneモードは、デフォルトだと画像などの静的ファイルをコピーしてくれないため、手動で合体させます。

ビルド実行
VSCodeのターミナルで実行します。

code
Powershell
download
content_copy
expand_less
npm run build

→ .next/standalone というフォルダが生成されます。

必要なファイルを合体（手動コピー）
エクスプローラーで以下の操作を行ってください。

publicフォルダのコピー:
プロジェクト直下の public フォルダをコピーし、
.next/standalone/public として貼り付けます。

staticフォルダのコピー:
プロジェクト直下の .next/static フォルダをコピーし、
.next/standalone/.next/static として貼り付けます。
(※ .next/standalone/.next フォルダが無い場合は作成してください)

完成形（フォルダ構成）:

code
Text
download
content_copy
expand_less
.next/
  └─ standalone/
       ├─ public/       ←(コピーしてきた)
       ├─ .next/
       │    └─ static/  ←(コピーしてきた)
       ├─ server.js     ←(自動生成された起動ファイル)
       └─ node_modules/

この standalone フォルダが、サーバーで動くアプリの本体になります。

Step 3: 【転送】サーバーへ送信

完成した standalone フォルダをサーバーにアップロードします。
VSCodeのターミナル（PowerShell）から scp コマンドを使います。

code
Powershell
download
content_copy
expand_less
# サーバー上のホームディレクトリに 'my-app' という名前でアップロードする例
scp -r .next/standalone user@123.45.67.89:~/my-app

user: サーバーのユーザー名（rootなど）

123.45.67.89: サーバーのIPアドレス

※鍵認証を使う場合は -i 鍵パス を追加してください。

Step 4: 【サーバー】起動準備 & 開始

ここからはSSHでサーバーに入って操作します。

Node.js と PM2 のインストール
サーバーには「実行環境」だけあればOKです。

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

アプリの起動
転送したフォルダに入って起動します。npm install は不要です！

code
Bash
download
content_copy
expand_less
cd ~/my-app

# 起動（ポート3000で動きます）
pm2 start server.js --name "portfolio"

# サーバー再起動時も自動起動するように設定
pm2 save
pm2 startup

これで http://IPアドレス:3000 で動きます。

Nginx (Webサーバー) の設定
外から http://ドメイン で見れるようにします。

code
Bash
download
content_copy
expand_less
sudo apt install -y nginx

設定ファイルを作成 (sudo nano /etc/nginx/sites-available/default) し、以下のように記述します。

code
Nginx
download
content_copy
expand_less
server {
    listen 80;
    server_name your-domain.com; # ★自分のドメインに変更

    location / {
        proxy_pass http://localhost:3000; # Node.jsへ転送
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

最後にNginxを再起動します。

code
Bash
download
content_copy
expand_less
sudo systemctl restart nginx
まとめ

これで、予算1,000円（メモリ1GB）のVPSでもサクサク動く環境が完成します。

今後の更新作業はこれだけになります：

ローカルでコード修正

npm run build

フォルダ合体作業

scp で上書きアップロード

サーバーで pm2 restart portfolio

まずは 「VPSの契約（OSはUbuntu）」 から始めてみてください！契約できたらIPアドレスを教えていただければ、具体的なコマンド入力をサポートします。