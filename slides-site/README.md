# スライドビューアー (slides.cloud-palette.com)

プレゼンテーション用のパスワード保護されたスライドビューアーサイトです。

## 特徴

- パスワード保護（HTTP Basic Auth）
- 14枚のスライドを高解像度画像で表示
- キーボード操作、クリック、タップで進む
- 全画面表示機能
- 元のPPTXファイルのダウンロード
- 検索エンジンからの完全な除外（noindex, nofollow, robots.txt）
- 無料の Vercel tier で動作

## セットアップ手順

### 1. Vercel プロジェクトの作成

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. 「Add New...」→「Project」をクリック
3. このリポジトリ（cloud-palette）を選択
4. **重要**: 以下の設定を行う
   - **Root Directory**: `slides-site` を指定（Edit ボタンをクリックして設定）
   - **Framework Preset**: Next.js（自動検出されるはず）
   - **Build Command**: `npm run build`（デフォルトのまま）
   - **Output Directory**: `.next`（デフォルトのまま）
   - プロジェクト名は任意（例: `slides-viewer`）
5. 「Deploy」ボタンはまだ押さない

### 2. 環境変数の設定

デプロイする前に、Vercel の Project Settings で環境変数を設定します。

1. プロジェクト設定画面で「Environment Variables」タブを開く
2. 以下の環境変数を追加:
   - **Key**: `SLIDES_PASSWORD`
   - **Value**: 任意の強力なパスワード（8文字以上推奨）
   - **Environments**: Production, Preview, Development すべてにチェック
3. 「Save」をクリック

**注意**: パスワードは Git にコミットしないでください。環境変数のみで管理します。

### 3. デプロイの実行

1. 「Deploy」ボタンをクリック
2. デプロイが完了するまで待つ（通常 2〜3分）
3. デプロイが成功したら、Vercel が発行した URL（例: `slides-viewer.vercel.app`）が表示される

### 4. カスタムドメインの追加

1. Vercel のプロジェクト設定で「Domains」タブを開く
2. 「Add Domain」をクリック
3. ドメイン名を入力: `slides.cloud-palette.com`
4. 「Add」をクリック
5. Vercel が DNS レコードの設定方法を表示します:
   ```
   Type: CNAME
   Name: slides
   Value: cname.vercel-dns.com
   ```

### 5. Cloudflare での DNS 設定

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. `cloud-palette.com` ドメインを選択
3. 「DNS」→「Records」を開く
4. 「Add record」をクリック
5. 以下の設定でレコードを追加:
   - **Type**: CNAME
   - **Name**: `slides`
   - **Target**: `cname.vercel-dns.com`（Vercel が指定した値）
   - **Proxy status**: DNS only（灰色の雲マーク）←**重要**
   - **TTL**: Auto
6. 「Save」をクリック

**注意事項**:
- `cloud-palette.com`（apex）や `www` レコードは触らないでください
- Proxy status は必ず「DNS only」にしてください（オレンジの雲ではなく灰色の雲）
- DNS の伝播には最大 48時間かかることがありますが、通常は数分〜数時間で完了します

### 6. 動作確認

#### パスワード認証の確認

ターミナルで以下のコマンドを実行:

```bash
# パスワードなしでアクセス（401 エラーになるはず）
curl -I https://slides.cloud-palette.com

# 正しいパスワードでアクセス（200 OK になるはず）
curl -I -u ":YOUR_PASSWORD" https://slides.cloud-palette.com

# 画像も保護されているか確認（401 エラーになるはず）
curl -I https://slides.cloud-palette.com/slides/slide-01.png

# PPTXファイルも保護されているか確認（401 エラーになるはず）
curl -I https://slides.cloud-palette.com/presentation.pptx
```

`YOUR_PASSWORD` は実際に設定したパスワードに置き換えてください。

#### ブラウザでの確認

1. https://slides.cloud-palette.com にアクセス
2. パスワードを求められるので、設定したパスワードを入力
3. スライドが表示されることを確認
4. キーボードの矢印キー、クリック、タップで操作できることを確認
5. 全画面表示ボタンが動作することを確認
6. PPTXダウンロードボタンが動作することを確認

#### SEO 除外の確認

```bash
# X-Robots-Tag ヘッダーの確認（noindex, nofollow になるはず）
curl -I -u ":YOUR_PASSWORD" https://slides.cloud-palette.com | grep -i "x-robots-tag"

# robots.txt の確認（すべてのクローラーが Disallow / になるはず）
curl https://slides.cloud-palette.com/robots.txt
```

**期待される出力**:
```
X-Robots-Tag: noindex, nofollow
```

robots.txt:
```
User-agent: *
Disallow: /

User-agent: GPTBot
Disallow: /

...（他のAIクローラーも Disallow）
```

### 7. トラブルシューティング

#### パスワードが機能しない

1. Vercel の Environment Variables で `SLIDES_PASSWORD` が正しく設定されているか確認
2. 設定を変更した場合は、プロジェクトを再デプロイ（Deployments タブで「Redeploy」）

#### ドメインにアクセスできない

1. DNS が正しく設定されているか確認:
   ```bash
   dig slides.cloud-palette.com
   ```
   CNAME レコードが `cname.vercel-dns.com` を指しているはず

2. Cloudflare の Proxy status が「DNS only」になっているか確認

3. DNS の伝播を待つ（最大 48時間、通常は数分〜数時間）

#### スライドが表示されない

1. ブラウザの開発者ツール（F12）でエラーを確認
2. Vercel のデプロイログを確認
3. 画像ファイルが正しくコミット・プッシュされているか確認

## プレゼンテーション後の削除手順

プレゼンテーションが終わったら、以下の手順でサイトを削除できます。

### 1. Vercel プロジェクトの削除

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. slides-viewer プロジェクトを選択
3. 「Settings」タブを開く
4. 一番下までスクロールして「Delete Project」を見つける
5. プロジェクト名を入力して削除を確認

### 2. Cloudflare DNS レコードの削除

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. `cloud-palette.com` ドメインを選択
3. 「DNS」→「Records」を開く
4. `slides` CNAME レコードの「...」メニューから「Delete」を選択

### 3. Git ブランチとファイルの削除（オプション）

リポジトリから完全に削除したい場合:

```bash
cd /path/to/cloud-palette
git checkout master
git branch -D cursor/slides-viewer-44e8  # ブランチを削除
git push origin :cursor/slides-viewer-44e8  # リモートブランチを削除

# または、master から slides-site ディレクトリを削除
git rm -r slides-site
git commit -m "Remove slides viewer"
git push origin master
```

## 技術仕様

- **フレームワーク**: Next.js 15 (App Router)
- **デプロイ**: Vercel
- **認証**: HTTP Basic Auth + Cookie (Edge Middleware)
- **画像**: 14枚の PNG (2001x1125px)
- **フォント**: BIZ UDPGothic
- **SEO**: 完全除外（noindex, nofollow, robots.txt）

## セキュリティ

- すべてのリソース（HTML、画像、PPTX）がパスワード保護されています
- パスワードは環境変数で管理され、Git にコミットされません
- 認証に成功すると Cookie が発行され、24時間有効です
- X-Robots-Tag ヘッダーと robots.txt で検索エンジンからの完全除外

## 費用

- Vercel の無料枠内で動作します（月間 100GB 転送、無制限デプロイ）
- プレゼンテーション用の一時的な使用であれば、追加費用は発生しません

## サポート

問題が発生した場合は、以下を確認してください:
- Vercel のデプロイログ
- ブラウザの開発者ツール（F12）
- DNS の伝播状況（`dig slides.cloud-palette.com`）
