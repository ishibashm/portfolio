# 2026-11-09 本番DBをSupabaseへ戻した作業記録（Cloud Palette ボット）

秘密の値（パスワード・接続文字列の資格情報）はここに書かない。

## 原因
- 本番（Cloud Run portfolio-app）は実行時の DATABASE_URL を GCP Secret Manager `database-url` から読む。
  `ENV_FILE` と `DATABASE_URL_OVERRIDE` はビルド時の .env にしか効かない（scripts/convert_env.py が secret_manager_map.json のキーを env.json から除く）。
- `database-url` が旧接続先のままで、DB 呼び出しが毎回10秒で失敗し、/blog が約12秒・一部APIが500だった。

## 実施したこと（すべて本人承認済み）
1. Supabase「Blog」(ref ymqiqscelqqkozqwoiko, ap-southeast-2) の DB パスワードをダッシュボードで再設定。
2. Secret `DATABASE_URL_OVERRIDE` と Secret Manager `database-url`（v5）を Session pooler の URL に更新。
   - ホスト: aws-1-ap-southeast-2.pooler.supabase.com:5432、ユーザー postgres.<ref>
   - このアプリの pg 8.20 では `sslmode=require&uselibpqcompat=true` が必要（無いと証明書検証で失敗）。
   - `direct-url` はブラウザのGCPアカウントに追加権限がなく未更新（アプリのコードは未使用）。
3. 再デプロイ（run 42587171403）。/blog 約0.4〜2秒、APIも1秒以内に回復。
4. BlogPost に Markdown 記事78本を INSERT のみで投入（ON CONFLICT (slug) DO NOTHING）。
   残っていた別アカウントの「[Cosmic Report]」1件は本人の指示で削除。
5. 足りなかった24テーブルと不足列を prisma/sql の追加系SQLで作成。新テーブルはRLS有効・server_onlyポリシー。
   - 飛ばしたSQL: reset_property_transactions / delete_nextauth_account_rows / remove_personal_blog_posts（破壊的）、
     blogpost_authorid_nullable（既にnullable）、mcp_get_kanshi_audit_upgrade / memory_audit_upgrade（DROP CONSTRAINT、不要）、
     add_rental_dedupe_keys の全件UPDATE（本人の承認待ち）。
6. postal_codes: 日本郵便 utf_ken_all.zip を国土地理院で座標付けしながら投入中（11/9 22:45 JST に一括投入を予約）。

## 未解決
- practitioners は利用者の登録データで、元データがリポジトリにない（旧サーバーのバックアップがあれば復元可能）。
- 旧サーバーで8月以降に作られたデータ（お気に入り・閲覧ログ等）は未復旧。
- ENV_FILE / MIGRATION_* Secret は古いパスワードのまま。DB系ワークフローを使う前に更新が必要。
- Secret Manager を自動更新するには deploy.yml の変更が必要（gh に workflow スコープが必要）。
