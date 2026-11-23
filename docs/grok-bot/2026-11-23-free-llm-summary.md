# 無料LLMでAI要約を出せるか（2026-11-23）

- 依頼: 本人（2026-11-23）「AIの要約を、サーバーに無料のLLMを常駐させて作れないか。gemma4 とか」。
- 範囲: 調査と記録のみ。コード・本番設定・GitHub 変数は変更していない。
- 対象: ishibashm/portfolio（cloud-palette.com）。本番は Cloud Run `blog-471319/portfolio-app`（asia-northeast1）。予算は月数千円以内、サイトに有料AI（従量課金のAPI）は使わない。
- 調査時点: 2026-11-23 13:00–13:30（日本時間）。リポジトリは調査時点の `grok-bot/records` 上の記録と、クローン上の案内役実装（#1872 / #1877 反映済み）。

## 結論

**その場でのAI要約は実現できる。Cloud Run にモデルを常駐させる必要はない。**

いまの「AIの要約」は案内役（`/annai`）の3文要約で、道具の結果をその場で要約する仕組みがすでに入っている。失敗時は定型文に戻る。Cloudflare Workers AI の無料枠を使う専用経路（#1872）も実装済みで、デプロイ用の鍵も置いてある。ただし有効化の旗 `GUIDE_AI_ENABLED` は `false` のままなので、本番では定型文要約と「AIによる要約はいま無効です」という注記が出る。

おすすめは **(c) 既存の Cloudflare Workers AI 無料枠を有効にする** こと。費用は公式の無料枠内なら 0 円。上限を超えても、Workers Free のままなら課金されず、その日は定型文に戻る。コード変更は不要で、本人の確認のうえで `GUIDE_AI_ENABLED=true` にしてデプロイすれば足りる。

Cloud Run への常駐（CPU / GPU）は公式料金で月数十〜数百ドルになり、予算を超える。自宅 PC（PromDev）を本番の常駐サーバーにするのは、可用性・公開面の安全の点で勧めない。公式の Gemma 4 重みを PromDev で動かし、ブログなど固定文だけ前もって作る用途には使える。

## 1. いまの「AIの要約」

場所は案内役 **`/annai`**（「案内役に聞く」）。画面の「② AI要約の状態」と、その下の要約文。ブログ記事本文の自動要約機能ではない。

流れ（すべてサーバー側、その場での生成）:

1. 3段フォームの入力でサイト内の計算道具（MCP）を呼び、事実（本命星・方位・日取りなど）を集める。
2. **定型文要約**（`src/lib/guide/guideSummary.ts` の `buildGuideSummary`）を、道具の数値・日付・名前を埋め込んで作る。照合（`verifySentences`）済み。AIが止まっていても、ここは動く。
3. 並行して **AI要約**（`src/lib/guide/guideAi.ts` の `summarizeWithGuideAi`）を試みる。成功し、照合を通った文があるときだけ、定型文の代わりにそれを出す。

AI経路は2系統:

| 経路                  | 条件                                                                                  | いまの本番                                                        |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cloudflare Workers AI | `GUIDE_AI_PROVIDER=workers-ai` かつ `GUIDE_AI_ENABLED=true`、アカウントとトークンあり | 提供者は `workers-ai`。旗は **`false`**。定型文＋「いま無効です」 |
| Gemini（従来）        | 上の提供者でないとき。`PAID_APIS_DISABLED` が true / 未設定なら呼ばない               | 有料API停止の方針どおり、この経路は使わない                       |

Workers AI 経路の仕様（`src/lib/guide/workersAi.ts`、#1872）:

- 主モデル `@cf/zai-org/glm-4.7-flash`。失敗時だけ `@cf/google/gemma-4-26b-a4b-it` を1回。
- 全体 15 秒、`max_completion_tokens` 256、温度 0.2。1日の上限は未設定時 300 回（DB の案内役専用行。DB 不可時はインスタンスごとに 150）。IP ごと容量 3、20 秒に 1 回復。
- 生年月日はプロンプトから除去。プロンプト・応答本文・トークンはログに出さない。
- 応答は道具の結果と機械照合し、通った文（3文以内）だけ表示。通らなければ定型文へ。
- `PAID_APIS_DISABLED` とは独立。`/ask` の会話AIとは別。

デプロイは `.github/workflows/deploy.yml` が GitHub の変数と秘密の値を Cloud Run へ渡す。変更を本番に出すには、本人確認のあと変数を更新し、デプロイが必要。この記録では値の中身（トークンやアカウントID）は書かない。

## 2. gemma4 の公式の状況

「gemma4」は Google の開かれたモデル **Gemma 4** を指す。公式に存在する。

- 2026-03-31: E2B / E4B / 31B / 26B A4B を公開。
- 2026-06-03: **Gemma 4 12B Unified** を公開。本人が PromDev で動かしている 12B は、この系統に相当する。
- ライセンス: Gemma 4 は **Apache 2.0**（Gemma シリーズで初めて OSI 承認ライセンス）。重みを自分の機械で動かして商用サイトに使うことは、ライセンス上は可能。再配布時はライセンス表記などが必要。
- 公式ブログ（12B）は「16GB の VRAM または統合メモリでノートPC向け」と書いてある。PromDev の GPU メモリは 12GB なので、公式の目安より少ない。量子化すれば動く可能性は高いが、公式の推奨構成そのものではない（ここは推測）。
- 公開サイトでは、公式の命令調整済み重み（例: `google/gemma-4-12B-it`）だけを使う。改造版や検閲を外した派生は使わない。

根拠: [Gemma の公開履歴](https://ai.google.dev/gemma/docs/releases/)、[Gemma 4 発表](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)、[12B 発表](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12b/)、[Apache 2.0 の説明](https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html)、[ライセンス本文](https://ai.google.dev/gemma/docs/gemma_4_license)。

## 3. 選択肢の比較

月額は、特に断らない限り公式ページの Default USD。30 日 = 2,592,000 秒。本番リージョンは asia-northeast1 で、公式は「料金はリージョンによる」と書く。以下の常駐試算は公開表の Default（CPU $0.000018 / vCPU-秒、メモリ $0.000002 / GiB-秒、L4 GPU 非ゾーン冗長 $0.0001867 / 秒）を使った。円換算とリージョン差は [料金計算ツール](https://cloud.google.com/products/calculator) で確認する。既存の portfolio-app が無料枠（月 240,000 vCPU-秒、450,000 GiB-秒）をすでに使う想定なので、常駐分に無料枠は当てていない。

### (a) Cloud Run にモデルを常駐させる

**向かない。予算超過。**

- **GPU 常駐（公式の L4 最小構成: 4 vCPU + 16 GiB + L4、ゾーン冗長オフ、min instances = 1）**  
  GPU 2,592,000 × 0.0001867 ≒ **$483.9**。CPU 4 × 2,592,000 × 0.000018 ≒ **$186.6**。メモリ 16 × 2,592,000 × 0.000002 ≒ **$82.9**。合計 約 **$753 / 月**。ゾーン冗長オンなら GPU 単価 $0.0002909 でさらに上がる。  
  根拠: [Cloud Run 料金](https://cloud.google.com/run/pricing)、[GPU の要件](https://cloud.google.com/run/docs/configuring/services/gpu)（L4 は最小 4 CPU / 16 GiB、インスタンス課金必須、停止中も min instances は満額）。
- **CPU 常駐**  
  12B を CPU だけで安定して出すのは現実的でない（応答が遅く、メモリも大きい。ここは推測）。仮に 1 vCPU + 8 GiB を常時 1 台にしても、約 $46.7 + $41.5 ≒ **$88 / 月** で、月数千円を超える。小さなモデルでも常駐は高い。
- **GPU をリクエスト時だけ（scale to zero）**  
  公式は GPU インスタンスの起動を約 5 秒とする。そのあとモデル読み込みが入り、初回はさらに遅れる（読み込み時間は推測）。使った秒だけ課金されるが、待ち時間と実装の手間が大きく、交通量次第で月額も読みにくい。案内役はすでに 15 秒制限がある。
- 品質: 公式 Gemma 4 を載せれば日本語要約は期待できる。速度・保守（イメージ肥大、起動、監視）が重い。
- 同じ Cloud Run サービスにモデルを同居させると、いまの無料枠運用を圧迫する。別サービスにしても常駐費は同じ。

### (b) ビルド時・定期実行で前もって作り、保存する

**固定ページには向く。案内役のその場の質問には、それだけでは足りない。**

- `/annai` は出発地・日付・本命星などで内容が変わる。組み合わせをすべて事前生成するのは不可能。入力のハッシュでキャッシュするのは、あとから足せる。
- ブログや星ごとの定型解説など、変わらない文は PromDev 上の公式 Gemma 4 12B で作り、リポジトリ（`docs/` や content）や Supabase に保存できる。費用は電気代以外 0 円（自宅の既存 GPU）。GitHub Actions の通常ランナーに GPU は無く、12B の生成先としては向かない。
- 品質: 12B は公式も「26B に近い」と書いており、短い日本語要約には足りる見込み。公開前に照合（既存の `verifySentences`）と目視を残す。
- 欠点: PromDev が止まっていると更新できない。手順と検品の手間が残る。案内役の「いまこの条件で」には、定型文か (c) が必要。
- 自宅を本番の API として Tailscale 経由で常時公開するのは勧めない（PC の起動・回線・公開面の安全。利用者の入力が自宅へ流れる）。

### (c) 無料枠のあるサービス（推奨: 既存の Workers AI）

**案内役にはこれが最適。経路は実装済み。**

#### Cloudflare Workers AI（無料枠）

- 公式: 1 日 10,000 Neurons まで無料（毎日 00:00 UTC にリセット）。Workers Free では上限を超えるとエラーになり、課金されない。Workers Paid に上げると、超過分は **$0.011 / 1,000 Neurons**。  
  根拠: [Workers AI 料金](https://developers.cloudflare.com/workers-ai/platform/pricing/)。
- サイトが使う2モデルは、2026-07-28 の公式変更ログで **Workers Free のまま使える** と明記されている（有料必須なのは GLM-5 系や一部の大規模モデル）。  
  根拠: [AI 変更ログ](https://developers.cloudflare.com/changelog/product-group/ai/4/)。
- 公式の Neurons 単価:
  - `@cf/zai-org/glm-4.7-flash`: 入力 5,500 / 百万トークン、出力 36,400 / 百万トークン
  - `@cf/google/gemma-4-26b-a4b-it`: 入力 9,091 / 百万トークン、出力 27,273 / 百万トークン
- **1 日に何回入るか（推測。実測ではない）**  
  短い要約を入力 4,000 トークン・出力 256 トークンと置くと、主モデルは約 31 Neurons / 回。10,000 ÷ 31 ≒ 約 320 回。既定の上限 300 回に近い。プロンプトが長いと（上限 12,000 文字）回数は減る。主モデルが失敗して予備まで使うと、その回は約2倍になる。有効化後はダッシュボードで Neurons を見て、足りなければ `GUIDE_AI_DAILY_MAX_CALLS` を下げる。
- 品質: 主モデルは多言語向け。予備は Gemma 4 26B。どちらも短い日本語は実用レベルと見てよい（実測は有効化後）。既存の照合があるので、はみ出した数字は出さない。
- 速度: ネットワーク経由の1回呼び出し。制限は 15 秒。サーバーレスなので常駐費は無い。
- 保守: モデル名の変更や無料対象の見直しは Cloudflare 側の告知を追う。コードと上限の監視だけで足りる。
- データ: 両モデルの公式ページに「Zero data retention」とある。  
  根拠: [glm-4.7-flash](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)、[gemma-4-26b-a4b-it](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)。
- 欠点: 無料枠は共有リソースで、混雑や一時的な失敗があり得る（その日は定型文へ）。Neurons の実消費は推測どおりとは限らない。

#### Google AI Studio / Gemini API の Gemma 4

**本番の公開経路としては勧めない。**

- 公式料金: Gemma 4 は無料枠が「Free of charge」、有料枠は「Not available」。無料枠は「Used to improve our products: Yes」。  
  根拠: [Gemini Developer API pricing](https://aistudio.google.com/docs/pricing)。
- 追加利用規約（2026-03-23 施行）: 無料サービス（未課金クォータ）に送った内容と応答を、Google が製品改善に使う。人のレビューもあり得る。「機密・機微・個人情報を unpaid に送らない」。EEA・スイス・英国の利用者向けに API クライアントを出すときは **有料サービスだけ** を使う、と明記。Gemma 4 に有料枠が無いため、この条件を Gemma 4 API では満たせない。  
  根拠: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)。
- 方針とも合わない（サイトに有料AIを置かない。`PAID_APIS_DISABLED` で Gemini 経路は止めたまま）。

### (d) 利用者のブラウザ内（WebLLM / Chrome 内蔵 AI）

**主経路にはしない。補助にも、いまは優先度が低い。**

- Chrome の Prompt API（Gemini Nano）: Chrome 148+ の対応デスクトップのみ。公式は **Android / iOS の Chrome、および非 Chromebook Plus の ChromeOS では未対応**。Safari も対象外。ストレージ約 22GB など要件が重い。  
  根拠: [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)。
- WebLLM: 公式 FAQ は WebGPU 対応として Chrome/Edge 113+ と **Safari 18+（macOS / iOS）** を挙げる。初回に 1.5〜4.5GB 程度のモデルダウンロード。SharedArrayBuffer 用の COOP/COEP ヘッダーが必要で、サイト全体の埋め込みや外部スクリプトに影響し得る。スマホ（とくに通信制限）には向かない。  
  根拠: [WebLLM FAQ](https://webllm.io/docs/faq/)。
- 費用は 0 円、データは端末内に留まる利点はある。品質と速度は端末差が大きく、案内役のサーバー照合と組み合わせる実装も増える。本人がよく使う iPhone Safari を主対象にするサイトでは、頼りにできない。

## 4. おすすめと、実装の手順（概要）

**既存の Workers AI 無料枠を有効にする。コードは変えず、旗だけを本人確認のあとで立てる。**

1. 本人が「いいよ」と言う。
2. GitHub のリポジトリ変数 `GUIDE_AI_ENABLED` を `true` にする（提供者はすでに `workers-ai`。鍵もデプロイ設定にある）。必要なら初日は `GUIDE_AI_DAILY_MAX_CALLS` を 100 前後に下げ、Neurons を見てから 300 に戻す。
3. 次回の本番デプロイ（または確認済みの再デプロイ）で Cloud Run に渡す。**この記録の時点では実施していない。**
4. 本番の `/annai` で1件試し、「AIによる要約を使用しています」と出ること、照合済みの3文であること、生年月日がプロンプトに入らないこと（コード上は除去済み）を見る。
5. Cloudflare の Workers AI ダッシュボードで、その日の Neurons を数日見る。10,000 に近づいたら上限を下げる。Workers Paid には上げない（超過を課金にしない）。
6. 品質が不足するときだけ、予備の Gemma 4 を主にする案や、プロンプト短縮を検討する（別PR、本人確認）。

その後の任意:

- 同じ条件の繰り返し用に、要約の短いキャッシュ（Supabase など）を足す。
- ブログや星の解説など固定文は、PromDev 上の公式 Gemma 4 12B で下書きし、照合と目視のあとリポジトリへ入れる。自宅を公開APIにはしない。

## 5. 根拠URL（再掲）

- 実装: [PR #1872](https://github.com/ishibashm/portfolio/pull/1872)、[PR #1877](https://github.com/ishibashm/portfolio/pull/1877)
- [Cloudflare Workers AI 料金](https://developers.cloudflare.com/workers-ai/platform/pricing/)、[Limits](https://developers.cloudflare.com/workers-ai/platform/limits/)、[AI 変更ログ（Free 対象モデル）](https://developers.cloudflare.com/changelog/product-group/ai/4/)、[glm-4.7-flash](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)、[gemma-4-26b-a4b-it](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
- [Cloud Run 料金](https://cloud.google.com/run/pricing)、[Cloud Run GPU](https://cloud.google.com/run/docs/configuring/services/gpu)
- [Gemini Developer API pricing](https://aistudio.google.com/docs/pricing)、[Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
- [Gemma 公開履歴](https://ai.google.dev/gemma/docs/releases/)、[Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)、[Gemma 4 12B](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12b/)、[Apache 2.0 の説明](https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html)、[ライセンス本文](https://ai.google.dev/gemma/docs/gemma_4_license)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)、[WebLLM FAQ](https://webllm.io/docs/faq/)
