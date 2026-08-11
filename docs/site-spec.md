# Cloud Palette 仕様書

`cloud-palette.com` — 引越しの方位とタイミングを決めるサイト。

このファイルは「今どうなっているか」を書く。変更したらここも直す。
判断の経緯はコード中のコメントに書いてあるので、ここでは繰り返さない。

最終更新: 2026-08-11

---

## 1. このサイトが答える問い

```
どの方位へ動くか   九星気学の方位盤（年盤・月盤・日盤）で吉凶を出す
いつ動くか         六曜・天赦日・一粒万倍日・土用・天中殺を突き合わせる
どこに住むか       賃貸物件の実データを方位と相場の両方で絞る
```

この 3 つに関わらないものは置かない。かつては真太陽時・株価・技術トレンド・
X 閲覧・研究レポートが同居しており、17 ページ／47 API のうちナビから辿れるのは
8 件だった。中核と非中核の定義は `src/lib/siteStructure.ts` に 1 か所だけ置く。

---

## 2. ページ

### 中核（検索に出す・ナビに載せる・広告を出す）

`src/lib/siteStructure.ts` の `CORE_ROUTES` が唯一の定義元。ナビ
（`GlobalSidebar`）・`robots.ts`・サイトマップがすべてここを参照する。

| URL | 役割 | 生成 |
|---|---|---|
| `/` | ホーム。盤とヒートマップ | クライアント |
| `/relocation/arbitrage` | 物件を方位で探す | クライアント |
| `/relocation/timing` | 引越し時期を分析する | クライアント |
| `/relocation/market` | 家賃相場を分析する | クライアント |
| `/relocation/simulator` | 引越し先を試算する | クライアント |
| `/relocation/wealth` | 移住先の地域を比べる | クライアント |
| `/houi` | 本命星と吉方位を調べる | ISR（60 秒） |
| `/calendar` | 引越しの日取りを選ぶ | 静的 |

### 記事（操作せずに読める。検索の入口）

| URL | 枚数 | 内容 |
|---|---|---|
| `/houi/{年}/{星}` | 年 × 9 星 | その年の吉方位・五黄殺・暗剣殺・歳破・本命殺 |
| `/houi/{年}/{星}/{月}` | 年 × 9 星 × 12 | 月盤の同内容 |
| `/houi/area` `/houi/area/{コード}` | 市区町村ぶん | その街の相場と、そこから見た方位 |
| `/calendar/{年-月}` | 18（今月から 17 か月先） | その月の「引越しに向く日」 |
| `/guide` `/guide/{slug}` | ガイド | 使い方と九星気学の説明 |

どれも `generateStaticParams` で静的生成し、`dynamicParams = false` で
範囲外は 404。`generateMetadata` で title・description・canonical をページ固有にする。

### 補助

`/about` `/contact` `/privacy` `/terms` `/login`

`/privacy` と `/contact` は AdSense の審査で見られるので消さない。

### 非中核

`/relocation/history` のみ。過去の移動から太極を出すページで、引越しの判断には
効くが導線からは外してある。`ADMIN_EMAIL` に一致する利用者だけが開ける。

---

## 3. 方位の吉凶をどう決めるか

**ここがサイトの中心。ページによって違う判定・違う言葉を使わないこと。**

### 3.1 判定の本体

`src/utils/ephemerisEngine.ts` の `calculateVectorCollision` が唯一の判定器。
年盤・月盤・日盤と天中殺・月の交点・実行意図から、方位ごとの状態を返す。

```
yearLayer / monthLayer / dayLayer   盤ごとの状態
finalVectors                        3 つを合成した最終判定
```

合成には 2 系統ある。`actionIntent === "MIGRATION"` のときは年 → 月 → 日の順で
絶対格の凶を採り、日盤は `WARNING` に格下げする。それ以外（`DEFAULT` など）は
年月日を対等に合成する。**どちらが使われるかはページごとの `actionIntent` で
変わるので、新しい呼び出しを足すときは必ず明示すること。**

### 3.2 状態コードと日本語

日本語表記は `src/lib/directionLabels.ts` が唯一の対応表。

| コード | 表記 | 意味 |
|---|---|---|
| `OPTIMAL` | 大吉方位 | |
| `OPTIMAL_REGULAR` / `OPTIMAL_BOOST` | 吉方位 | |
| `SAFE` | **平穏** | **凶方位ではない。吉ではない** |
| `WARNING` | 注意（引越当日） | 長期は吉だが移動当日に干渉 |
| `NOISE_GOU` | 五黄殺 | |
| `NOISE_ANKEN` | 暗剣殺 | |
| `NOISE_HA` | 歳破 / 月破 / 日破 | **盤によって呼び名が変わる** |
| `NOISE_HONMEI` | 本命殺 | |
| `NOISE_TEKI` | 本命的殺 | |
| `NOISE_VOID` | 天中殺方位 | |
| `NOISE_GETSUMEI` / `NOISE_GETSUTEKI` | 月命殺 / 月命的殺 | |
| `NOISE_NODE` | 羅睺・計都軸 | |

`SAFE` を「吉」と書かないこと。判定の本体（`auspiciousDays.isAuspicious`）は
`OPTIMAL` 系だけを吉とする。以前は物件検索と資産マップだけ「吉方位」と出して
おり、同じ方位が記事では「平」になっていた。

`NOISE_HA` は盤で呼び名が変わる。`directionLabels.haLabelForLayer(layer)` を使う。

### 3.3 凶の重さ

`src/utils/noiseSeverity.ts` が唯一の定義元。

```
五大凶殺（移転で妥協しない）= 五黄殺・暗剣殺・破・本命殺・本命的殺
二次凶                      = 天中殺方位・月命殺・月命的殺・月交点
```

重い順は `NOISE_PRIORITY`。複数の凶が重なった方位を 1 語に畳むときは必ずこの順で
先勝ちにする。集合を自分のファイルに書き写さないこと（`isFatalNoise` を使う）。

### 3.4 段階と語彙

用途によって 2 つある。どちらも定義元は 1 つ。

| 使う場面 | 段階 | 定義元 |
|---|---|---|
| 日付の格付け | S / A / B / C / D / X（三盤吉〜五大凶殺） | `utils/tierDisplay.ts` + `auspiciousDays.gradeVerdict` |
| 方位の評価 | 大吉 / 吉 / 平穏 / 注意 / 凶 / 大凶 | `lib/verdictRating.ts` |
| 記事の色分け | good / neutral / bad | `lib/kigakuContent.ts` |

`verdictRating` は `isFatalNoise` から重さを引く。五大凶殺は必ず「大凶」、
二次凶は「凶」。以前はシミュレータと履歴が独自の表を持ち、本命殺を「凶」に、
天中殺方位を「大凶」に、と逆向きに重み付けしていた。

### 3.5 絞り込み

`filterCollisionByMode(collision, …, directionFilterMode, …)` を必ず通す。
`"composite"` は素通しなので、既定でも呼んで構わない。通し忘れると、
利用者が選んだ絞り込みだけが効かないページができる。

---

## 4. 暦

| 概念 | 実装 | 注意 |
|---|---|---|
| 節入り | `solarTermMonthAnchor` | 月盤は 1 日ではなく節入りで替わる。`lunar-javascript` の `getMonthNineStar()` は暦日で切り替わるため 1 日ずれる |
| 六曜 | `utils/lunar.getRokuyo` | `"大安 (Taian)"` の形で返る。記事に出すときはローマ字を落とす |
| 天赦日・一粒万倍日 | `utils/lunar.getLuckyDays` | |
| 土用 | 太陽黄経で判定（297–315 / 27–45 / 117–135 / 207–225） | 間日は障りなしとする |
| 天中殺 | `utils/tenchusatsuPolicy` | 方位ではなく期間の禁忌。`NOISE_VOID` はその方位版 |
| 日付 | `utils/japanDate.toJapanDateString` | サーバは UTC。`toISOString().slice(0,10)` は日本時間と 1 日ずれる |

---

## 5. データ

### 5.1 物件

```
収集   .github/workflows/scrape-rentals.yml（毎晩、県を分けて巡回）
        scrape-eheya.yml / scrape-shamaison.yml / scrape-rentals-new.yml
保存   rental_properties（Postgres）
整理   重複排除 → パージ → VACUUM
集計   scripts/build_area_dataset.ts → src/data/areaDirections.json
       scripts/build_market_stats.ts  → src/data/marketStats.json
```

エリアページは `areaDirections.json` を入力に静的生成する。訪問時に DB を
引かない。夜間ジョブが JSON を作り直してコミットし、`deploy.yml` が動く。

**住所から市区町村を切り出すのに `scripts/jis_city_codes.json` を使う。**
正規表現だと「四日市市」が「四日市」になるため、正式名称との前方一致で
最も長く一致したものを採る。辞書に無い市区町村はページにならない。
辞書は `scripts/build_jis_city_codes.ts` で作る（47 県 1,917 市区町村）。手で足さない。

### 5.2 DB の容量

Supabase Free の 500MB を超えて別の Postgres へ移した経緯がある
（`docs/db-migration/README.md`）。行数が増える仕組みを足すときは、
増え方の上限を先に決めること。既存の例:

```
MarketDailySummary   1 日 48 行に抑える
geocode_towns        町丁目単位で頭打ち
direction_comments   1 人 1 日 10 件、本文 800 字
```

### 5.3 スキーマの変え方

```
表や列を足すだけ   prisma/sql/*.sql を書き、Apply additive SQL を手動実行
                   （二度当てても同じ結果になる DDL だけ置くこと）
索引               Apply DB indexes（CONCURRENTLY で当てる）
全面的な作り直し   Setup Database Schema and Seed Data
                   （db push --accept-data-loss + 取り込み 3 本。重い）
```

`prisma db push` はスキーマに無い表・索引を消す。SQL で当てたものは
`prisma/schema.prisma` にも必ず書くこと。片方だけだと次の run-seed で消える。

---

## 6. 認証

Supabase Auth（Google ログイン）。NextAuth ではない。

```
セッション取得   lib/userConfig.getAuthUser() → { id, email } | null
管理者限定 API   lib/adminApi.denyUnlessAdmin()
ページの保護     middleware（utils/supabase/middleware.ts）
```

**middleware はページのパスしか見ない。**`isProtectedRoute` は
`/relocation/history` との前方一致なので、`/api/relocation/history` は
どれにも当たらない。**個人データを返す API は自分で認証すること。**
以前 history と export が匿名で 200 を返し、住所・生年月日・座標が読めていた。

中核ページは匿名で使える。以前 `/relocation` を丸ごと保護していたため、
主力ページがクローラーに 307 を返し、検索にも AdSense にも中身が見えていなかった。

---

## 7. 利用者の投稿

`direction_comments`。ログイン必須。

```
紐づけ   topic_key（lib/comments.ts の関数で作り、正規表現で検証する）
           houi:2026:3 / houi:2026:3:9 / calendar:2026-09 / area:23100
置き場   /houi/{年}/{星} と /calendar/{年-月}
上限     1 人 1 日 10 件、本文 10〜800 字、一覧 50 件
```

表示名はログイン情報から取る（打たせると他人を騙れる）。プロフィール名が
無ければメールアドレスの手前だけを使い、アドレス自体は出さない。
一覧の応答に `user_id` を含めない。

投稿が 0 件のときは見出しごと出さない。600 ページ以上に空の欄が並ぶと
未完成のサイトに見える。

---

## 8. 広告

```
ID        NEXT_PUBLIC_ADSENSE_ID（GitHub の Variables。secret ではない）
スロット   NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE / _LIST
枠         <AdBanner unit="article|list" /> を本文の直後に 1 つ
ads.txt   ID があるときだけ配信。無ければ 404（架空の ID を出さない）
```

ID かスロットが欠けていれば `AdBanner` は**何も描かない**。空の枠を出さない。

詳しい手順は `docs/adsense-setup.md`。

---

## 9. 品質の見張り

```
CI（.github/workflows/ci.yml）  PR ごとに tsc / lint / vitest
デプロイ                        master への push で Cloud Run へ
```

CI では `next build` を回さない。ビルドは `.env`（DB 接続文字列を含む）を
前提にしており、PR の実行に渡すと公開リポジトリで秘密情報を晒す。

`npm ci` は `--legacy-peer-deps` が要る（`defuddle` が `jsdom@^24` を要求する）。
Node は Dockerfile と同じ 20 に固定する。

lint の警告は落とさない（現在 678 件）。止まるのは error だけ。
以前、lint が赤いまま直らず CI ごと削除された経緯がある。

---

## 10. 触るときに気をつけること

- **同じことを 2 か所に書かない。**このサイトの不具合の多くがこれで起きている。
  凶の集合・方位の日本語・非中核ルート・6 段階の畳み方は、どれも過去に
  写しが増えて食い違った
- **`SAFE` は吉ではない**
- **`toISOString()` で日付を切らない。**サーバは UTC
- **Leaflet はマーカーを緯度順に並べ替える。**DOM の順番は作った順ではない
- **日本語は `min-content` が 1 文字。**flexbox の `min-width:auto` では守れず、
  兄弟に `shrink-0` があると 1 文字ずつ折り返す
- **`next/font` は CJK の全サブセットを preload する。**`preload: false` にする
- **推測で断定しない。**実測してから報告する
