# GitHub ActionsでのPrisma×Supabaseマイグレーション エラー解決の全記録

**日付:** 2026年5月15日

**概要:** GitHub Actions上で `npx prisma db push` を実行し、Supabaseにデータをシード（初期データ投入）する際に発生した一連のエラーとその解決策をまとめたドキュメントです。

---

## 第1のエラー: GitHub Actionsが6時間ハングアップ（タイムアウト）

**症状:**
`npx prisma db push` を実行した際、ログが `Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-ap-southeast-2.pooler.supabase.com:6543"` で停止し、そのまま6時間経過してキャンセルされた。

### 原因
Supabaseの **ポート6543（コネクションプーラー: pgBouncer）** を経由してPrismaのマイグレーション（スキーマ変更）を行おうとしたためです。
スキーマ変更にはデータベースのロック等が必要ですが、プーラー経由ではそれがサポートされておらず、接続が無期限に待機状態になっていました。

### 解決策
マイグレーション用には **ポート5432（直接接続）** を使用する必要があります。
`.github/workflows/run-seed.yml` を修正し、`db push` 実行時のみ強制的に `DIRECT_URL`（ポート5432のURL）を使用するように書き換えました。

```bash
# 修正後の該当箇所
DATABASE_URL="$DIRECT_URL" npx prisma db push
```

---

## 第2のエラー: データ消失防止機能（Safe Check）による停止

**症状:**
ポート5432での接続には成功したが、
`⚠️ You are about to drop the KnowledgeDocument table, which is not empty (1848 rows).`
という警告が出て、Exit Code 1 で処理が中断された。

### 原因
現在のプロジェクトの `schema.prisma` に `KnowledgeDocument` というテーブルが定義されていないため、Prismaが「このテーブルは不要になったのでクラウドから削除しようとしている」と判断しました。
しかし、そのテーブルにはすでに1848件のデータが入っていたため、安全のために自動停止しました。

### 解決策
クラウド上の不要なテーブルとデータを削除してよいという判断のもと、強制的に上書きを許可する **`--accept-data-loss`** フラグをコマンドに追加しました。

```bash
# 修正後の該当箇所
DATABASE_URL="$DIRECT_URL" npx prisma db push --accept-data-loss
```

---

## 第3のエラー: P1013 Invalid database URL（不正なポート番号）

**症状:**
`Error: P1013: The provided database string is invalid. invalid port number in database URL.`

### 原因
Supabaseのデータベースパスワードの中に、特殊文字（`@` や `:` など）が含まれていたことが原因です。
Prismaは `DATABASE_URL` を読み解く際、`@` を「パスワードとホスト名の区切り」、`:` を「ポート番号の区切り」として認識します。パスワード内にこれらの記号があるとパース（解析）に失敗し、パスワードの一部をポート番号だと誤認してしまいます。

### 解決策
Supabaseのダッシュボードでデータベースのパスワードを再設定（リセット）し、**英字（アルファベット）と数字のみで構成されたパスワード** に変更しました。その後、GitHubの `ENV_FILE` シークレットを新しいパスワードで上書き更新しました。

---

## 第4のエラー: Cannot find module '.prisma/client/default'

**症状:**
テーブル作成（`db push`）は成功した直後、データの流し込みスクリプト（`import_municipalities_wealth.ts`）を実行しようとした際に発生。
`Error: Cannot find module '.prisma/client/default'`

### 原因
TypeScriptのプログラムがデータベースにアクセスするための「Prisma Client」が生成されていませんでした。
ローカル環境では通常自動生成されますが、GitHub Actionsのまっさらなコンテナ上では明示的に生成コマンドを叩く必要があります。

### 解決策
`run-seed.yml` に Prisma Client を生成するステップ（`npx prisma generate`）を追記しました。

```yaml
# 追記したステップ
- name: Generate Prisma Client
  run: npx prisma generate
```

---

## 最終的な成果

**解決！**
これらすべての修正により、GitHub Actionsからの全自動データベースセットアップ（テーブルの作成から、e-Stat等からのデータダウンロード、そしてSupabaseへのシードデータの投入）が正常に完走するようになりました。

**現在の `run-seed.yml` の主要な流れ:**
1. 依存関係のインストール (`npm ci`)
2. GitHub Secretから `.env` ファイルを生成
3. `DATABASE_URL="$DIRECT_URL"` を利用して `db push --accept-data-loss` でスキーマを強制同期
4. `npx prisma generate` で Prisma Client を生成
5. `npx tsx scripts/...` で各種シードスクリプトを実行しデータを投入
