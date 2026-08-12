# このリポジトリで作業するときの決め事

Cloud Palette（`cloud-palette.com`）— 引越しの方位とタイミングを決めるサイト。

仕様は `docs/site-spec.md` が正。**このファイルと食い違ったら site-spec を優先**し、
気付いた時点でどちらかを直す。

---

## 1. 検証コマンド

**PR を出す前に必ず全部通す。** 1 つでも落ちたら出さない。

```bash
npm ci --legacy-peer-deps   # 素の npm ci は ERESOLVE で落ちる
npx prisma generate         # これが無いと tsc が @prisma/client を解決できない
npx tsc --noEmit
npm test
npm run lint
```

`npm ci` が `yarn.lock` の一部を win32 → linux バイナリに書き換えることがある。
**環境差の副産物なのでコミットに含めない**（`git checkout -- yarn.lock`）。

### lint の見方

`npm run lint` は **error 0 / warning あり**が正常。警告の総数を減らす作業を
続けているので、**PR の前後で総数が増えていないこと**を必ず確認する。

```bash
npm run lint 2>&1 | tail -2
```

自分が足したコード（テストを含む）で警告を増やしてしまう事故が実際に起きている。
未使用の引数、不要になった `useMemo` の依存などに注意。

**総数は環境をまたいで比べない。**同じコミットでも実行する場所で違う。
実測でクラウド側 423 / ローカル 434 と 11 件ずれていた。原因の一部は
手元にだけある使い捨てスクリプトで、`eslint.config.mjs` の
`globalIgnores` を `.gitignore` に合わせて消した（10 件ぶん）。
残りの差は特定できていない。**必ず同じ環境で PR の前後を比べること。**

### prettier

リポジトリには**元から prettier 非準拠のファイルが複数ある**。CI は prettier を
見ていない。`prettier --write` をファイル全体に掛けると**無関係な整形が大量に
混ざる**ので、次の手順を守る。

1. 触る前に `npx prettier --check <file>` で元の状態を記録する
2. 元から非準拠なら、自分が足した部分だけ手で整える（ファイル全体を整形しない）
3. 元から準拠していたファイルだけ `prettier --write` してよい

---

## 2. PR の出し方

**1 PR = 1〜3 ファイル。まとめて出さない。**レビューできなくなる。

- ブランチを切って作業する。master に直接コミットしない
- squash マージなので、**stacked PR は前段のマージ後に rebase してから**出し直す
  （しないと前段の差分が二重に見える。実際に起きた）
- PR 本文には「何を」「なぜ」「確認したこと」を書く。数字は実際に実行した結果を貼る
- **触らなかったもの・直せなかったものも書く。**理由つきで残すほうが親切

### コミットメッセージ

日本語。「何を変えたか」より**「なぜそうしたか」「元がどう間違っていたか」**を書く。
既存のコミットログ（`git log`）が見本になる。

---

## 3. 触るときに気をつけること

### 判定ロジック

九星気学の判定が入っている。**しきい値・条件式・数値には触らない。**
変える必要があると思ったら、まず相談する。

判定の見え方が変わる変更（方位の割り当て、段階の境目など）は、

1. 変更前の実装をテストファイルに写す
2. 変更後と同じ答えになることを、広い入力範囲で固定する
3. **旧挙動を戻すとテストが落ちることを確認する**（空回りするテストを避ける）

この手順を踏むこと。過去の PR（#138〜#143）が見本。

### 方位の計算

**「方位角を八方位に落とす」実装は `src/utils/directionGeo.ts` の
`directionFromBearing` ただ 1 つ。**新しく書かない。

同じ処理が最大 7 か所に散っていたのを #135・#136・#140・#141・#142 で集約した。
探すときは**関数名ではなく実装のパターン**で引く（名前がバラバラだったため
名前で探して 2 回取りこぼした）。

```bash
grep -rn "b >= 345 || b < 15" src/     # 伝統区分のコピーが増えていないか
grep -rn "22.5) % 360) / 45" src/      # 45度等分のコピーが増えていないか
```

**判定は必ず真北で行う。**磁北は「方位磁針で測るとずれる」注意としてのみ使う
（`DECLINATION_WARNING`、`magneticDirection`）。理由は `/houi` の記事が全国向けの
静的ページで偏角を持てないため。判定を磁北にすると記事と全ツールが恒久的に食い違う。

偏角は出発地ごとに `utils/geomagnetism` から引く。**取得できないときは 0（補正なし）**。
以前は東京の -8.2 度で埋めており、沖縄や北海道の利用者に東京の偏角を当てていた。

### 型

- `any` を消すときは**実際の型に置き換える**。`unknown` にしてキャストで逃げない
- **新しく似た型を作らない。**既存の定義を使う
  （`utils/ephemerisEngine` の `Direction` / `StarFrequency` / `ActionIntent`、
  `utils/directionStatus` の `LayerMode`、`lib/userSettings` の `Settings` など）
- `catch (e: any)` は `src/lib/errorMessage.ts` の取り出しを使えば外せる。
  用途で使い分ける（4 節の表を見ること）。**キャストで押し通さない**

### React の props

**未使用に見えても props を消さない。**呼び出し側とずれる。
interface の受け口は残し、分割代入からだけ外す（`BioMagneticDashboard` が見本）。

### 同じことを 2 か所に書かない

`docs/site-spec.md` の方針。実装を寄せるときは、**寄せ先が既にあるか先に探す**。
`lib/geoDirection.ts` は「集約するために作られたモジュール」が二重に存在していた例。

---

## 4. 今やっていること — lint 警告の削減

`npm run lint` の警告を減らしている。**645 → 377**（ローカル実測。上の注意を読むこと）。

**挙動は変えない。**見た目も計算結果も変えない作業。

### やってよいこと

- 未使用の import / 変数 / 引数を消す
- `any` を実際の型に置き換える
- `@ts-ignore` を `@ts-expect-error` にする
- `catch (e) {}` で `e` を読んでいないものを `catch {}` にする（省略可能 catch 束縛）

### やってはいけないこと

- 挙動を変える
- 数値・しきい値・条件式に触る
- ファイルやコンポーネントを丸ごと消す（未使用に見えても別途判断）
- `any` を `unknown` で埋めてキャストで逃げる（それなら手を付けないほうがよい）
- テストを消す・skip する
- 減らせないファイルを無理に触る（飛ばして報告する）

### 現状の内訳（`npm run lint` 実行時点）

```
239  @typescript-eslint/no-explicit-any
 86  @typescript-eslint/no-unused-vars
 21  react-hooks/exhaustive-deps        ← 依存配列は再レンダリングのタイミングを変える。対象外
 10  @typescript-eslint/ban-ts-comment
  8  @typescript-eslint/no-require-imports
  8  react-hooks/set-state-in-effect ほか（同上で対象外）
```

`catch (e: any)` は **0 件**（#215 で最後の 4 件が片付いた）。

ファイル別の上位（`unused` / `any` / その他）：

| 件数 | ファイル | 内訳 |
|---|---|---|
| 39 | `src/components/SolarTimeClock.tsx` | 2 / 32 / 5 |
| 20 | `src/app/relocation/simulator/page.tsx` | 8 / 8 / 4 |
| 16 | `src/utils/ephemerisEngine.ts` | 3 / 13 / 0 |
| 12 | `src/app/relocation/arbitrage/page.tsx` | 0 / 11 / 1 |
| 12 | `src/components/ArbitrageMapInner.tsx` | 3 / 5 / 4 |
| 12 | `src/utils/nbaEngine.ts` | 0 / 12 / 0 |
| 10 | `src/components/nba/NBADashboard.tsx` | 0 / 7 / 3 |
| 10 | `src/utils/baziEngine.ts` | 1 / 9 / 0 |
|  8 | `src/utils/arbitrageAstro.ts` | 0 / 7 / 1 |
|  7 | `src/components/MagneticMapInner.tsx` | 2 / 3 / 2 |
|  7 | `src/components/widgets/OmniPipelineWidget.tsx` | 0 / 7 / 0 |

### catch は片付いた。その過程で分かったこと

`catch (e: any)` は 65 件あって、**残りは `SolarTimeClock.tsx` の 4 件だけ**。
注釈を外すと `e` は `unknown` になって `.message` や `.code` が読めなくなるので、
`src/lib/errorMessage.ts` に取り出しを 3 つ置いた。**キャストは使っていない。**

| 関数 | 何を返すか | どこで使うか |
|---|---|---|
| `toUserMessage(err, 既定?)` | 画面用に**加工した**文言。英語→日本語の案内 | 赤帯など、利用者が読むところ |
| `toLogMessage(err)` | **加工しない**生の 1 行 | ログ。原因を追う人が読む |
| `toResponseMessage(err, 既定)` | Error の message か、無ければ既定 | API の応答本文 |
| `errorCode(err)` | **文字列の** `code`（`ENOENT` / `P2037`） | 種類で分岐するところ |
| `errorStatus(err)` | **数値の** `code`（401 / 403） | 同上（SDK が数値で返す場合） |

`errorCode` と `errorStatus` は**互いに素**。文字列版は数値を、数値版は文字列を返さない。
`=== "ENOENT"` に数値が、`=== 401` に文字列の "401" が紛れ込むと、どの分岐にも入らない
まま静かに落ちるため。

**「catch を見たら一律に置換」ではない。**実際には 6 通りに分かれた。

| 形 | どうするか | 例 |
|---|---|---|
| 応答にもログにも入れない | 注釈を外すだけ | `music/analyze`・`relocation-timing` |
| ログだけ | `toLogMessage` | `site_guardian_daemon`・widget 各種 |
| 応答に入れる（開発者向け） | 英語の既定を足す | `omni/*`・`timeline` |
| 応答に入れる（**画面に届く**） | **日本語**の既定 | `api/nba`（`NBADashboard` が赤帯に出す） |
| 応答が文言でなく**コード** | コードを返す | `relocation/auspicious-days` |
| 再試行や種類の判定に使う | `errorCode` / `errorStatus` | `nifty_extractor`（P2037）・`api/twitter`（401/403） |

**置き換える前に「その応答の error を誰が読むか」を必ず確かめること。**
`api/nba` は画面に届くので、英語の既定だと `toUserMessage` に汎用の文言へ丸められて
何の失敗か伝わらなくなる。機械的に流していたら取りこぼしていた。

### 次にやるとよいもの

**`src/components/SolarTimeClock.tsx`（39 件）** が残りの山。8,000 行あって
現行機能の中核。未使用（#213）と `catch`（#215）は済んでいるので、残りは
**`any` 32 件**。`solarData` / `NBAData` など応答系は型を切る前にモデル化が要るが、
**`api/nba` の応答は #212 でモデル化済み**なので、そこから引ける分がある。

このファイルを触るときは `docs/improvement-backlog.md` の 5 節を先に読むこと。
**字面での一括置換で 2 回事故った**（同じ字面の使っている変数を消した／
`const [a, setA]` の警告 2 件で同じ行を二重に消した）。eslint の**行番号**を使い、
同じ行を指す警告は畳んでから消す。消したら必ず `npx tsc --noEmit` を通す。

残る `no-unused-vars` 2 件（`setMapProperties` / `setPressureDrop`）は
**消さないこと。**機能が初期値のまま止まっているしるしで、扱いは相談してから決める。

`utils/ephemerisEngine.ts`（16 件）と `utils/nbaEngine.ts`（12 件）は**判定の中核**。
型を触るだけでも、しきい値や条件式に手が滑ると影響が大きい。テストが厚いので
`npm test` は効くが、慎重に。

`scripts/` は `tsconfig.json` の `exclude` に入っていて **`npx tsc --noEmit` の
対象外**。スクリプトの型を触ったら、そのファイルだけを含む一時 tsconfig を
作って別に通すこと（#149 が見本。`scripts/eheya_extractor.ts` の型の嘘、#157 の
`Horizontal` / `Prisma.DbNull` はどれもこれで見つかった）。

```jsonc
// tsconfig.scripts.tmp.json（コミットしない）
{ "extends": "./tsconfig.json", "include": ["scripts/<file>.ts"], "exclude": [] }
```

スクレイパーの `any` は、ほとんどが「外部 JSON に型が無い」ことから来ている。
**ページ全体を型にしない。**その取り込みが実際に読む枝だけを写し、素の JSON を
型として読む箇所を 1 か所に閉じ込める（#149 の `Building` / `RoomEntry`、
#151 の `NiftyBukken`）。

### 手を付けずに残してあるもの（理由つき）

- **API / エンジンの応答を抱えている `any`** — `NBAData` の中身、`forecastData`、
  `metadata`、`nbaEvaluations` など。型を切るには応答側のモデル化が先
- **recharts の `Tooltip content={({...}: any)}`** — `TooltipContentProps` を当てると
  `payload[].value` が `ValueType` になり、`.toFixed()` に cast か `Number()` が要る。
  cast は禁止、`Number()` は挙動が変わる
- **`react-hooks/exhaustive-deps`** — 依存配列は再レンダリングのタイミングを変える

### 既知の問題（別途）

- `directionFromBearing(NaN, "physical")` が `undefined` を返す。戻り値の型は
  `CompassDirection` を名乗っているので**型の嘘**。直すなら呼び出し側の入力検証とセット
  （`__tests__/directionGeo.test.ts` に現状の挙動として固定してある）
- `SolarTimeTable` の `nbaData` prop は**呼び出し側が一度も渡していない**。
  全参照が `?.` 経由なので常に "N/A"。実質デッド
- `api/rentals/arbitrage/route.ts` の `vectorData` が未使用。消すと九星気学の計算
  チェーン約 35 行に連鎖する。280 行のコメントは「盤の表示に使う」と書いてあるが実態と違う

---

## 5. 参考になる過去の PR

| PR | 何をしたか |
|---|---|
| #131〜#133 | lint 削減の進め方（1 PR = 1〜3 ファイル、残したものを理由つきで報告） |
| #134 | 地図の扇形。描画と判定の基準がずれていた発見 |
| #137 | 実装と食い違った案内文の修正。コードは既に正しかった例 |
| #138 | 判定の基準を変える PR の書き方（旧挙動で落ちるテスト） |
| #141・#142 | 集約の取りこぼしと、その訂正の出し方 |
| #147 | 俯瞰の県塗りが無言で別の意味の色に落ちるのを直した（提案書 A） |
| #149 | 外部 JSON の `any` の外し方（読む枝だけ型にする。`scripts/` の型検証も） |
| #153 | `catch` の方針決め。`toUserMessage` と `toLogMessage` の役割が逆であること |
| #157 | `scripts/` を型に通して見つけた実害（太陽位置が既定値のままだった） |
| #159・#198 | `errorCode`（文字列）と `errorStatus`（数値）を互いに素にした理由 |
| #165・#168・#169 | ダークの配色。`dark:` が地色抜きで発火していた件 |
| #175・#200 | 応答の `error` を誰が読むかで既定の言語が変わる（コード / 日本語 / 英語） |
| #177〜#179 | 表示が遅い件。使わないタブの重い依存を遅延、外部 API をサーバ経由に |
