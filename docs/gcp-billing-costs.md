# 管理画面で GCP 請求実額を表示する

`/admin/metrics` は、Cloud Billing の Standard usage cost export を BigQuery
から読み、当月の `cost + credits` をサービス別に表示する。

Cloud Billing API は請求先アカウントやプロジェクトとの関連を管理する API で、
利用額そのものは返さない。実額には Cloud Billing Export が必要になる。

## 1. Billing Export を有効にする

GCP コンソールで次を行う。

1. **お支払い** → 対象の請求先アカウントを開く
2. **課金データのエクスポート** → **BigQuery Export** を開く
3. **Standard usage cost** を編集し、保存先のプロジェクトと dataset を選ぶ
4. 作成されたテーブル名を確認する

テーブル名は通常、次の形になる。

```text
project.dataset.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX
```

Export を有効にする前の利用額は自動では遡及投入されない。設定直後は行が届くまで
時間がかかるため、管理画面が 0 の場合は BigQuery 側のテーブルも確認する。

## 2. 読み取り用サービスアカウント

管理画面から読むサービスアカウントへ、最小限として次を付ける。

- クエリ実行プロジェクト: `roles/bigquery.jobUser`
- Billing Export dataset: `roles/bigquery.dataViewer`

Cloud Run の実行サービスアカウントへこの権限を付ける場合、鍵は不要で Application
Default Credentials が使われる。別のサービスアカウント鍵を使う場合は JSON 鍵を
Secret に保存する。鍵ファイルをリポジトリへ置かない。

## 3. 環境変数

本番では GitHub Secret `ENV_FILE` に次を追加し、再デプロイする。

```env
GCP_BILLING_EXPORT_TABLE=project.dataset.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX
GCP_BILLING_TARGET_PROJECT_ID=portfolio-project
GCP_BILLING_QUERY_PROJECT_ID=billing-query-project
GCP_BILLING_LOCATION=US
GCP_BILLING_TIMEOUT_MS=10000
GCP_BILLING_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

- `GCP_BILLING_TARGET_PROJECT_ID`: 管理画面に出す利用額の対象
- `GCP_BILLING_QUERY_PROJECT_ID`: BigQuery job を作るプロジェクト
- `GCP_BILLING_LOCATION`: dataset の location と一致させる
- `GCP_BILLING_TIMEOUT_MS`: クエリ上限。100〜30000ms、未設定時は 10000ms
- `GCP_BILLING_SERVICE_ACCOUNT_JSON`: Cloud Run 実行 SA を使うなら省略可

JSON の `private_key` に含まれる改行は `\n` のまま 1 行で保存する。画面は設定不足を
0 円とは扱わず「未設定」、権限や query の失敗を「取得失敗」と表示する。

## 4. 確認

1. BigQuery で export table に当月の対象 project 行があることを確認する
2. `/admin/metrics` を管理者で開く
3. **GCP 請求実額（当月）** が「取得済み」になることを確認する
4. サービス別金額の合計が GCP Billing report の同じ請求月・project と一致することを確認する

表示は当月の暫定実額であり、遅延計上や訂正により後から変わることがある。
