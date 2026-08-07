# データベース移行の手順

Supabase Free の 500MB を超えたため、`rental_properties` を含むデータを別の
PostgreSQL へ移す。**認証は Supabase に残す**（無料枠で足りるため）。

作成: 2026-08-07

---

## 1. なぜ移すのか

2026-08-07 のスクレイパー実行時点の実測。

| 指標 | 値 |
|---|---|
| 総行数 | 1,122,958 |
| DBサイズ | **616 MB / 500 MB（123%）** |
| 座標あり | 377,766（33.6%） |
| 7日以内に確認 | 1,122,958（**全行**） |

超過が続くと Supabase はデータベースを**読み取り専用**に落とす。そうなると
スクレイパーの書き込みと利用者の設定保存が止まる。

**古い行の削除では解決しない。** 全行が7日以内に再確認されており、保持期間
ベースのパージで消える行がほぼ無い。増えているのは死んだ行ではなく実在庫。

---

## 2. 移行先に必須の条件

**本物の PostgreSQL であること。** 「Postgres互換」では動かない。

| 依存 | 使っている場所 |
|---|---|
| `percentile_cont(...) WITHIN GROUP` | `src/utils/arbitrageQuery.ts`（相場の中央値） |
| ウィンドウ関数 `count(*) OVER (PARTITION BY ...)` | 同上（掲載社数の集計） |
| `uuid_generate_v4()` … 拡張 `uuid-ossp` | `prisma/schema.prisma` |
| `gen_random_uuid()` … 拡張 `pgcrypto`（PG13+は組込） | 同上 |
| 配列型 `String[]` | `rental_properties.source_emails` ほか |
| `timestamptz` / `numeric` | 全体 |
| `substring(x from 1 for 3)` / `::text[]` | `scripts/purge_rental_properties.ts` |

> これにより **CockroachDB（`percentile_cont` 非対応）、PlanetScale（MySQL）、
> Turso・Cloudflare D1（SQLite）は使えない。**

そのほかの要件

- 容量 **2GB以上**（47都道府県まで広げるなら5GB以上が望ましい）
- 外部から SSL で接続できること（GitHub Actions と Cloud Run の両方から）
- PostgreSQL 13 以上

---

## 3. 移行先の候補

| 候補 | 費用 | 容量 | 備考 |
|---|---|---|---|
| **Oracle Cloud Always Free**（自前構築） | ¥0 | ARM 4コア / 24GB RAM / 200GB | 東京・大阪リージョンあり。性能・容量とも最良。**運用責任は自分持ち**。ARMインスタンスは在庫切れで作成に失敗することがある |
| **Aiven for PostgreSQL** Free plan | ¥0 | 5GB（1CPU / 1GB RAM） | マネージド。容量は足りるが**メモリ1GBで集計クエリが重い可能性** |
| Supabase Pro | 約3,700円/月 | 8GB | 移行作業が不要。いまの構成のまま |
| GCP e2-micro 無料枠 | ¥0 | 1GB RAM / 30GB | **米国リージョン限定**。Cloud Run が `us-central1` なので相性は悪くない |

判断の目安

- **手間を避けたい** → Supabase Pro
- **無料で確実に足りる容量が欲しい** → Oracle Cloud
- **無料かつ運用したくない** → Aiven（性能は要検証）

---

## 4. 移行対象と、残すもの

### 移すもの（Prisma 経由のデータすべて）

`DATABASE_URL` / `DIRECT_URL` が指す PostgreSQL の中身。`prisma/schema.prisma`
にある全テーブル。主要なものは `rental_properties`、`user_configs`、
`MunicipalityWealth`、`AgentTheme`、`AgentActivityLog`、`RelocationSimulation`。

### 残すもの（Supabase）

**認証だけ。** `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY`
はそのまま使い続ける。Supabase Auth の無料枠は月5万ユーザーで、現状に対して
十分な余裕がある。

> Supabase Auth はユーザー情報を Supabase 側の Postgres に持つ。データを
> 移しても認証は影響を受けない。

### 前提として済ませてあること

コード側で Supabase クライアントからテーブルを直接読み書きしていた箇所は、
**すべて Prisma に寄せてある**（2026-08-07 時点）。

- `src/app/api/rentals/webhook/route.ts` … Prisma へ移植済み
- `src/app/api/expert/route.ts` … 常に403を返す死んだルートだったため削除済み

現在 `supabase` を import しているのは認証を扱うファイルのみ。**`DATABASE_URL`
を差し替えるだけで移行できる状態**になっている。

---

## 5. 接続情報の置き場所

差し替えるのは次の2か所だけ。

| 使う場所 | 取得元 |
|---|---|
| スクレイパー4本（GitHub Actions） | **リポジトリ Secret `ENV_FILE`**。`.env` として書き出される |
| 本番サイト（Cloud Run） | 同じく **Secret `ENV_FILE`**。`deploy.yml` がビルド時に `.env` を作る |

つまり **`ENV_FILE` を1回更新すれば両方に反映される**（Cloud Run は再デプロイが必要）。

`ENV_FILE` に入っている DB 関連のキー

```
DATABASE_URL=postgresql://...   # アプリと Prisma が使う
DIRECT_URL=postgresql://...     # マイグレーションと一部スクリプトが使う
```

---

## 6. 手順

### 6-1. 事前確認

```bash
# 現在のサイズと行数（移行後の突き合わせに使う）
psql "$OLD_DATABASE_URL" -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
psql "$OLD_DATABASE_URL" -c "SELECT count(*) FROM rental_properties;"
psql "$OLD_DATABASE_URL" -c "\dt"
```

### 6-2. 移行先の準備

```bash
# 拡張を先に入れる。schema.prisma が uuid_generate_v4() を既定値に使う。
psql "$NEW_DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
psql "$NEW_DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
```

### 6-3. 書き込みを止める

移行中の書き込みは失われる。スクレイパーを止めてから dump する。

GitHub の Actions 画面で次の4本を **Disable workflow** にする。

- `scrape-rentals.yml`
- `scrape-rentals-new.yml`
- `scrape-eheya.yml`
- `scrape-shamaison.yml`

### 6-4. dump と restore

```bash
# 実行中のトランザクションと整合する状態で取る
pg_dump "$OLD_DIRECT_URL" \
  --format=custom --no-owner --no-acl \
  --file=portfolio.dump

# 目安: 616MB のDBで dump は数分、restore は10〜20分
pg_restore --dbname="$NEW_DATABASE_URL" \
  --no-owner --no-acl --jobs=4 \
  portfolio.dump
```

> `--no-owner --no-acl` を付けないと、Supabase 固有のロール（`supabase_admin` など）
> が移行先に存在せずエラーになる。

### 6-5. 突き合わせ

```bash
# 6-1 で控えた値と一致するか
psql "$NEW_DATABASE_URL" -c "SELECT count(*) FROM rental_properties;"
psql "$NEW_DATABASE_URL" -c "SELECT count(*) FROM user_configs;"

# 索引が作られているか（無いと物件検索が実用にならない）
psql "$NEW_DATABASE_URL" -c "\di rental_properties*"

# 統計情報を作る。これを忘れると初回のクエリが極端に遅い
psql "$NEW_DATABASE_URL" -c "ANALYZE;"
```

### 6-6. 接続先の切り替え

1. リポジトリ Secret `ENV_FILE` の `DATABASE_URL` と `DIRECT_URL` を新しい接続文字列に更新
2. `master` に空コミットを push するか、`deploy.yml` を手動実行して**再デプロイ**
3. サイトを開いて確認
   - `/relocation/arbitrage` … 物件が出るか（出発地を入れて検索）
   - `/relocation/wealth` … 市区町村の一覧が出るか
   - `/houi/area/23100` … エリア別ページが出るか
   - ログイン → 設定を保存 → 別ブラウザで復元されるか

### 6-7. スクレイパーを戻す

4本の workflow を Enable に戻し、`scrape-rentals-new.yml` を手動実行して
「Report freshness」に新しい接続先の数字が出ることを確認する。

### 6-8. 切り戻し

移行後に問題が出た場合、**Supabase 側のデータはそのまま残っている**。
`ENV_FILE` を元の接続文字列に戻して再デプロイすれば戻る。

> 切り戻しの猶予を残すため、**移行後1週間は Supabase のプロジェクトを削除しない**。
> ただし旧DBへの書き込みは止まっているので、その間の新着物件は旧DBに入らない。

---

## 7. 注意点

### VACUUM FULL 中はサイトが止まる

`scripts/purge_rental_properties.ts` は削除後に `VACUUM (FULL, ANALYZE)` を
実行する。これはテーブル全体を排他ロックするため、**実行中（数分）は物件検索が
応答しない**。日次のスクレイパーから毎日走る。

移行先で容量に余裕ができたら、`VACUUM FULL` をやめて通常の `VACUUM` に
変えることを検討する（領域はOSに返らないが、再利用はされる）。

### 接続数の上限

Cloud Run は `max-instances=2` / `concurrency=80`。Prisma は
`@prisma/adapter-pg` の `Pool` を使う。移行先の `max_connections` が小さい場合
（Aiven Free は 20 程度）、`?connection_limit=5` を接続文字列に付けて絞る。

### SSL

自前構築の場合、接続文字列に `?sslmode=require` を付ける。Let's Encrypt で
証明書を用意するなら `sslmode=verify-full` が望ましい。

### 移行後に消せるもの

移行が安定したら次を削除できる。

- `src/types/database.types.ts` … Supabase の型定義。**現時点で既に未使用**
- `scripts/migrate_storage.ts` が使う `SUPABASE_SERVICE_ROLE_KEY`

---

## 8. 容量を減らす選択肢（移行と併せて検討）

移行しても、増え続ければいずれ同じ問題になる。次の内訳は
`scripts/report_rental_freshness.ts` の「What is taking the space」で出る。

| 候補 | 効果 | 判断材料 |
|---|---|---|
| 座標が無い行を一定期間後に削除 | 大きい可能性。**66%が該当し、検索結果に出ない** | ジオコーディングが追いつかない原因の切り分けが先 |
| 書き込み時の名寄せ | 大きい可能性。4つの掲載元から同じ部屋が重複して入る | レポートの「Distinct rooms after dedupe」で倍率が分かる |
| 掲載期限切れの削除 | 既にパージ対象 | レポートの「Past listing expiry」 |
| `source_emails` 列の削除 | 小さい | メール取込の遺物。webhook のみが使う |
