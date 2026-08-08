# Cloud Run を東京（asia-northeast1）へ移す

## なぜ移すのか

DB を Supabase から Oracle Cloud（東京）へ移した結果、アプリと DB が
太平洋を挟んで向かい合う形になった。

| | 場所 | |
|---|---|---|
| Cloud Run | us-central1（アイオワ） | |
| PostgreSQL | ap-tokyo-1（東京） | ← 移行で変わった |

Cloud Run から DB への 1 往復がおよそ 120〜150 ms かかる。
`/relocation/arbitrage` のようにクエリを何本も投げるページでは、
この往復がそのまま積み上がる。**移行前には無かった遅さで、
移行によって新しく生まれた問題である。**

アプリを東京へ移せば、アプリと DB が同じ都市に入り、往復は 1 ms 前後になる。
日本からの利用者にとっては、そもそもの配信距離も縮む。

## 前提の確認

Cloud Run のドメインマッピングは**対応リージョンが限られる**（10 リージョンのみ）。
asia-northeast1 は対応している。移設先として問題ない。

現在の `cloud-palette.com` は Cloud Run のドメインマッピングで繋がっている
（`www` が `ghs.googlehosted.com` を向いている）。Cloudflare のプロキシ経由ではない。

**ドメインマッピングはリージョン単位のリソース**である。サービスを移しても
自動では追従しないので、旧リージョンで消して新リージョンで作り直す。
DNS レコード自体は `ghs.googlehosted.com` のままでよく、**変更は要らない**。

## 手順

### ① リージョン変数を変える

GitHub → Settings → Secrets and variables → Actions → Variables

| 変数 | 値 |
|---|---|
| `GCP_REGION` | `asia-northeast1` |

`deploy.yml` は `vars.GCP_REGION` を見て、Artifact Registry の場所・
イメージのタグ・デプロイ先をすべて切り替える。無ければ Artifact Registry の
リポジトリも自動で作る。

### ② デプロイする

Actions → Deploy to GCP Cloud Run → Run workflow

このデプロイでは**東京に新しいサービスが立つだけ**で、`cloud-palette.com` は
まだアイオワの旧サービスを指したまま。つまり**この時点では無停止**であり、
新旧が並んで動いている。

ジョブのサマリーに新しい URL が出る。

```
デプロイ先: asia-northeast1
サービス URL: https://portfolio-app-xxxxxxxxxxxx.asia-northeast1.run.app
```

### ③ 新しい URL で動作を確かめる

ドメインを付け替える前に、新しい URL を直接開いて確認する。ここで問題が
見つかっても、`cloud-palette.com` は旧サービスで動き続けているので影響はない。

- `/relocation/arbitrage` — 物件が出るか。**表示が速くなっているか**
- `/relocation/wealth` — 自治体の一覧が出るか
- `/houi/area` — エリア相場が出るか

### ④ ドメインを付け替える

**ここだけ短い停止がある。** 旧リージョンのマッピングを消してから
新リージョンで作り直すまでの間、`cloud-palette.com` は繋がらない。
さらに新しいマッピングには Google 管理の証明書が発行され直すため、
HTTPS が通るまで数分〜30 分程度かかることがある。

利用の少ない時間帯に行うこと。

#### まずアカウントを確かめる

プロジェクトを作ったアカウントと、gcloud が認証しているアカウントが
違っていると `Permission 'run.domainmappings.list' denied` で止まる。

```
gcloud auth list
```

`*` の付いた行が現在のアカウント。違っていたら切り替える。

```
gcloud config set account <プロジェクトの所有者のアカウント>
```

読み取りだけのコマンドで通ったことを確認してから先へ進む。

```
gcloud run services list --project=blog-471319 --region=asia-northeast1
```

#### 付け替える

**コマンドはすべて 1 行で書いてある。** 行を折らないこと。継続文字は
bash が `\`、PowerShell が `` ` `` で互換性がなく、折った瞬間に環境依存になる。

```
gcloud beta run domain-mappings list --project=blog-471319 --region=us-central1
gcloud beta run domain-mappings delete --domain=cloud-palette.com --project=blog-471319 --region=us-central1 --quiet
gcloud beta run domain-mappings delete --domain=www.cloud-palette.com --project=blog-471319 --region=us-central1 --quiet
gcloud beta run domain-mappings create --service=portfolio-app --domain=cloud-palette.com --project=blog-471319 --region=asia-northeast1
gcloud beta run domain-mappings create --service=portfolio-app --domain=www.cloud-palette.com --project=blog-471319 --region=asia-northeast1
```

DNS は変えない。`create` が表示するレコードが現在の設定と同じであることだけ
確認する（同じはずである。同じでなければ、その通りに直す）。

証明書が出るまでの状態は次で見られる。

```
gcloud beta run domain-mappings describe --domain=cloud-palette.com --project=blog-471319 --region=asia-northeast1
```

### ⑤ 旧サービスを片付ける

**すぐには消さない。** 1 週間ほど東京で問題が出ないことを見てからにする。
切り戻しは `GCP_REGION` を `us-central1` に戻して再デプロイし、
ドメインマッピングを戻すだけで済む。

```
gcloud run services delete portfolio-app --project=blog-471319 --region=us-central1 --quiet
gcloud artifacts repositories delete portfolio-repo --project=blog-471319 --location=us-central1 --quiet
```

## 変えなくてよいもの

| | 理由 |
|---|---|
| DNS レコード | `ghs.googlehosted.com` のままでよい |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_BASE_URL` | `cloud-palette.com` のままで、URL は変わらない |
| Oracle 側のファイアウォール | 5432 は全開放なので、送信元が変わっても影響しない |
| `DATABASE_URL_OVERRIDE` | 接続先は同じ |

## 切り戻し

`GCP_REGION` を `us-central1` に戻して再デプロイし、④ の手順を逆向きに実行する。
旧サービスを消していなければ、デプロイすら不要でドメインマッピングを戻すだけでよい。
