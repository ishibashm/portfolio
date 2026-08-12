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
- `catch (e: any)` は、中身が `toUserMessage(e)` だけなら注釈を外すだけで通る
  （`toUserMessage` の引数は元から `unknown`）。`error.message` を直接読む型は
  挙動が変わるので別途方針を決める

### React の props

**未使用に見えても props を消さない。**呼び出し側とずれる。
interface の受け口は残し、分割代入からだけ外す（`BioMagneticDashboard` が見本）。

### 同じことを 2 か所に書かない

`docs/site-spec.md` の方針。実装を寄せるときは、**寄せ先が既にあるか先に探す**。
`lib/geoDirection.ts` は「集約するために作られたモジュール」が二重に存在していた例。

---

## 4. 今やっていること — lint 警告の削減

`npm run lint` の警告を減らしている。**645 → 578**（#129・#131〜#133・#142）。

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
343  @typescript-eslint/no-explicit-any
171  @typescript-eslint/no-unused-vars
 25  react-hooks/exhaustive-deps      ← 依存配列は再レンダリングのタイミングを変える。対象外
 16  renders / render                 ← react-hooks の別メッセージ
 10  @typescript-eslint/ban-ts-comment
  8  @typescript-eslint/no-require-imports
  5  その他
```

ファイル別の上位（`unused` / `any` / その他）：

| 件数 | ファイル | 内訳 |
|---|---|---|
| 67 | `src/components/SolarTimeClock.tsx` | 25 / 37 / 5 |
| 32 | `src/app/relocation/arbitrage/page.tsx` | 19 / 12 / 1 |
| 20 | `src/app/relocation/simulator/page.tsx` | 8 / 8 / 4 |
| 20 | `src/components/widgets/MarkdownViewerWidget.tsx` | 1 / 19 / 0 |
| 16 | `src/components/FengShuiRelocation/App.jsx` | 7 / 0 / 9 |
| 16 | `src/components/widgets/OmniPipelineWidget.tsx` | 6 / 10 / 0 |
| 16 | `src/utils/ephemerisEngine.ts` | 3 / 13 / 0 |
| 15 | `scripts/eheya_extractor.ts` | 0 / 15 / 0 |
| 14 | `scripts/site_guardian_daemon.ts` | 2 / 12 / 0 |
| 13 | `scripts/nifty_extractor.ts` | 4 / 8 / 1 |

### 次にやるとよいもの

**`src/app/relocation/arbitrage/page.tsx`（32 件）** が手数の面で一番効く。
19 件が未使用で、うち多くは import と、使われなくなったハンドラ・派生値。

```
未使用の import   MapPin / Download / Settings / MetaphysicalConfigBar /
                  MetaphysicalConfig / DEFAULT_RADIUS_KM
未使用のハンドラ  renderFactorBadges / renderCardSkeletons /
                  handleSettingsSubmit / applyPreset / handleClassicalToggle /
                  handleUseCurrentLocation
未使用の派生値    setDataLimit / localTargetDate / totalPages / currentTableData
catch (e)         123 / 1111 / 1693 行（e を読んでいないので catch {} にできる）
```

**ハンドラ 6 つは「消す」前に一度確認すること。**UI から外れた名残なのか、
繋ぎ忘れなのかで扱いが変わる。繋ぎ忘れなら消すのは誤り。

`SolarTimeClock.tsx`（67 件・5,000 行超）は**現行機能の中核**なので、事故ったときの
影響が大きい。小さいファイルで手順が固まってから最後に回すのが安全。

### 手を付けずに残してあるもの（理由つき）

- **`catch (error: any)` のうち `error.message` を直接読むもの** — リポジトリ全体に多数。
  `error instanceof Error ? error.message : String(error)` に寄せると Error 以外が
  投げられたときのレスポンス本文が変わる。方針を決めて一括でやるほうがよい
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
