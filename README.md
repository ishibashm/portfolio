# Cloud Palette

引越しの方位とタイミングを決めるサイト（[cloud-palette.com](https://cloud-palette.com)）。

九星気学の方位盤と暦を計算し、賃貸物件の実データと突き合わせて、
「どの方位へ・いつ・どこに住むか」を一つの画面で検討できるようにする。

**仕様の正は [`docs/site-spec.md`](docs/site-spec.md)。**
この README と食い違ったら site-spec を優先すること。
作業の決め事は [`CLAUDE.md`](CLAUDE.md) にある。

---

## 何を答えるサイトか

```
どの方位へ動くか   九星気学の方位盤（年盤・月盤・日盤）で吉凶を出す
いつ動くか         六曜・天赦日・一粒万倍日・土用・天中殺を突き合わせる
どこに住むか       賃貸物件の実データを方位と相場の両方で絞る
```

この 3 つに関わらないものは置かない。中核ページの定義は
`src/lib/siteStructure.ts` の `CORE_ROUTES` が唯一の定義元で、
ナビ・robots・サイトマップはすべてここを参照する。

| URL                     | 役割                                                 |
| ----------------------- | ---------------------------------------------------- |
| `/`                     | ホーム。方位盤とヒートマップ、生年月日・現在地の設定 |
| `/relocation/arbitrage` | 物件を方位で探す                                     |
| `/relocation/timing`    | 引越し時期を分析する                                 |
| `/relocation/market`    | 家賃相場を分析する                                   |
| `/relocation/simulator` | 引越し先を試算する                                   |
| `/relocation/wealth`    | 移住先の地域を比べる                                 |
| `/houi`                 | 本命星と吉方位を調べる（年 × 星 × 月の静的記事つき） |
| `/calendar`             | 引越しの日取りを選ぶ                                 |
| `/guide`                | 使い方と九星気学の説明                               |
| `/blog`                 | 読みもの（歴史・考え方・データの見方）               |

管理画面（`/admin`）は `ADMIN_EMAIL` に一致する利用者だけが開ける。
閲覧の集計（日別・時間帯別・ブログの効果検証）と記事エディタがある。

## 判定の決め事

- **判定器は 1 つ。**方位の吉凶は `src/utils/ephemerisEngine.ts` の
  `calculateVectorCollision` だけが決める
- **方位角を八方位に落とす実装も 1 つ。**`src/utils/directionGeo.ts` の
  `directionFromBearing`。新しく書かない
- **判定は必ず真北で行う。**磁北は「方位磁針で測るとずれる」注意としてのみ
  使う。偏角は出発地ごとに `utils/geomagnetism` から引き、取得できないときは
  0（補正なし）
- 天中殺は解釈が流派で割れるため、扱いを 5 通り（厳格〜使わない）から選べる
- 西洋占星術の要素は判定に混ぜない（表示は参考情報のみ）

## 技術構成

- Next.js（App Router）+ React + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL（認証は Supabase Auth）
- Leaflet / React-Leaflet（地図）、Recharts（チャート）
- Cloud Run へ `deploy.yml` でデプロイ（master への push で動く。
  **マージした時点で利用者に見えている**）

## データ

| データ         | 入れ方                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| 賃貸物件       | `.github/workflows/scrape-*.yml` が毎晩巡回 → `rental_properties`                        |
| エリア集計     | `scripts/build_area_dataset.ts` などが JSON を作り直してコミット                         |
| 郵便番号の座標 | `Import postal codes`（日本郵便）+ `Fill postal coords (ISJ)`（国土交通省 位置参照情報） |
| 成約価格       | `Import property transactions` Action（国交省 不動産情報ライブラリ）                     |

スキーマの変え方（追加 SQL・索引・作り直し）は site-spec の 5.3 節を見ること。
`prisma db push` はスキーマに無い表・索引を消すので、SQL で当てたものは
`prisma/schema.prisma` にも必ず書く。

## 開発環境

```bash
cp .env.local.example .env.local   # これが無いと dev が本番 DB を向く
npm ci --legacy-peer-deps          # 素の npm ci は ERESOLVE で落ちる
npm run dev:db:up                  # ローカル Postgres（docker）
npm run dev:db:push
npm run dev
```

`.env.local` を作らずに `npm run dev` すると**本番の user_configs などに
書き込みが飛ぶ**。実際に事故が起きているので必ずコピーすること。

## 検証コマンド

PR を出す前に全部通す。1 つでも落ちたら出さない。

```bash
npm ci --legacy-peer-deps
npx prisma generate    # これが無いと tsc が @prisma/client を解決できない
npx tsc --noEmit
npm test
npm run lint           # error 0 / warning あり が正常。総数を増やさない
```

`scripts/` は `tsc --noEmit` の対象外。スクリプトの型を触ったら、
そのファイルだけを含む一時 tsconfig で別に通す（CLAUDE.md 4 節）。

## ドキュメント

| ファイル                                                     | 中身                                             |
| ------------------------------------------------------------ | ------------------------------------------------ |
| [`docs/site-spec.md`](docs/site-spec.md)                     | 仕様の正。ページ・判定・暦・データ・品質の見張り |
| [`CLAUDE.md`](CLAUDE.md)                                     | 作業の決め事。検証・PR の出し方・触るときの注意  |
| [`docs/improvement-backlog.md`](docs/improvement-backlog.md) | 改善の積み残しと判断待ち                         |
| [`docs/gcp-billing-costs.md`](docs/gcp-billing-costs.md)     | 管理画面の GCP 請求実額の設定                    |
