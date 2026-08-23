# 削除・変更の安全確認チェックリスト（#548 / #546 / #556）

利用者の判断は **B・削除・削除**。この文書は「本当に安全か」を確かめる手順で、
そのまま別のエージェントに渡せる形にしてある。

**コマンドはリポジトリのルート（`/home/user/portfolio` 相当）で実行する。**
`→` の行は 2026-08-23 時点の実測値。**違う結果が出たら、その時点で止めて報告する。**

## 0. 共通の前提

```bash
git fetch origin master && git checkout -B <作業ブランチ> origin/master
npm ci --legacy-peer-deps
npx prisma generate
```

- 1 PR = 1 件（#548 / #546 / #556 を混ぜない）
- **触る前に `npx prettier --check <file>` で元の準拠状態を記録する。**
  元から非準拠なら、ファイル全体を整形しない（CLAUDE.md 1 節）
- 受け入れ基準は 4 節にまとめてある

---

## 1. #548 — 年盤を時刻単位に揃える（B）

### ⚠️ 最初に確かめること — **本命星が変わる**

これは「立春の日の数時間だけ年盤がずれる」話**ではない。**
`getClassicalYearStar` は `getHonmeiStar(生年月日).classical` の実装そのもので、
**立春の日に生まれた人の本命星が変わる。**本命星はサイト全体の判定の起点で、
保存済みプロフィールにも入っている。

実測（現在の実装）:

```
2000-02-04 12:00 JST  黄経=314.59（節入り前）  本命星=9  ← B にすると 1 になる
1990-02-04 01:00 JST  黄経=314.57（節入り前）  本命星=1  ← B にすると 2 になる
1985-02-04 01:00 JST  黄経=314.78（節入り前）  本命星=6  ← B にすると 7 になる
```

**この影響を利用者が承知しているかを先に確かめる。**承知のうえなら進める。

確認コマンド（一時テストを作って消す）:

```bash
cat > __tests__/__probe_honmei.test.ts <<'EOF'
import { describe, it } from "vitest";
import { getHonmeiStar, AstroEngine } from "@/utils/ephemerisEngine";
describe("probe", () => {
  it("立春の日の本命星", () => {
    for (const y of [1957, 1985, 1990, 2000, 2021]) {
      for (const h of ["01:00", "12:00", "23:00"]) {
        const dt = new Date(`${y}-02-04T${h}:00+09:00`);
        const lon = AstroEngine.getSolarLongitude(dt);
        console.log(`${y}-02-04 ${h} 黄経=${lon.toFixed(2)} 節入り後=${lon >= 315 && lon < 345} 本命星=${getHonmeiStar(dt).classical}`);
      }
    }
  });
});
EOF
npx vitest run __tests__/__probe_honmei.test.ts
rm -f __tests__/__probe_honmei.test.ts   # 必ず消す
```

### 変える対象

```bash
grep -n "export function getClassicalYearStar" -A 6 src/utils/ephemerisEngine.ts
```

```
→ 245: solarInJst(date) → lunar.getYearNineStar()
     lunar-javascript は **立春の日の 0 時**で切り替える（日単位）
```

月盤（`getClassicalMonthStar`）は `solarTermMonthAnchor` を通していて、
**太陽黄経 315 度を越えた瞬間**で切り替わる。**年盤を月盤と同じ基準に寄せる。**

### 波及する呼び出し元

```bash
grep -rn "getClassicalYearStar\|getHonmeiStar" src/ scripts/ --include=*.ts --include=*.tsx \
  | grep -v "ephemerisEngine.ts:"
```

```
→ 20 件超。api/rentals/arbitrage・api/municipalities-wealth・SolarTimeClock・
  ScorecardPanel・HomePortal・DestinationMapPanel・ConsultPanel・TenChiJinEvaluation
```

**呼び出し側は直さない。**実装を 1 か所変えれば全部が揃う。逆に言えば
**1 か所の変更が全画面に効く**ので、テストで固定してから出す。

### 必ず踏む手順（CLAUDE.md 3 節）

1. `__tests__/kyuseiSolarTermBoundary.test.ts` に**現状が既に固定してある**
   （#548 で入れた）。この 2 本が落ちるのが「何を変えたか」の証拠になる:
   - `2026-02-04 の 2 時は、年盤が新年・月盤が前の節月`
   - `同じ日の 12 時には月盤も切り替わっている`
2. 旧実装を `legacyClassicalYearStar` としてテストに写し、
   **立春の日以外では新旧が一致する**ことを広い範囲（1950〜2050 年の各年
   1 月 1 日・6 月 1 日・12 月 1 日など）で固定する
3. **立春の日だけ新旧が食い違う**ことを固定する
4. 新実装に戻す前後で `npm test` を回し、**旧実装に戻すと 3 が落ちる**ことを確認する

### 受け入れ基準

- [ ] 本命星が変わることを利用者が承知している
- [ ] 年盤と月盤の切り替わり時刻が一致する（2020〜2030 年で `ずれ=0 分`）
- [ ] 立春の日以外で新旧が一致することを固定した
- [ ] 旧実装に戻すとテストが落ちることを確認した
- [ ] 4 節の共通基準を満たす

---

## 2. #546 — `/api/telemetry`（POST）を消す

### 消す対象と、**消してはいけない隣**

```bash
find src/app/api/telemetry -type f | sort
```

```
→ src/app/api/telemetry/history/route.ts   ← **残す**（TelemetryChart が使う）
→ src/app/api/telemetry/route.ts           ← 消す
```

**`src/app/api/telemetry/` をディレクトリごと消してはいけない。**
`history/` が中にある。消すのは `route.ts` 1 ファイルだけ。

### 参照が無いことの確認

```bash
grep -rn 'api/telemetry"' src/ scripts/ __tests__/ .github/ | grep -v node_modules
```

```
→ 0 件
```

```bash
grep -rn "api/telemetry" src/ scripts/ __tests__/ .github/ docs/ | grep -v node_modules
```

```
→ 3 件。すべて **/api/telemetry/history**（別 route）:
   src/components/TelemetryChart.tsx:25
   src/app/api/cron/telemetry/route.ts:19（コメント）
   __tests__/telemetryNoMock.test.ts:8（コメント）
```

### `TelemetryLog` が別経路で書かれていることの確認

```bash
grep -rn "telemetryLog" src/ scripts/ --include=*.ts --include=*.tsx
```

```
→ src/app/api/telemetry/route.ts:11        コメントの中だけ（実行されない）
→ src/app/api/telemetry/history/route.ts   findMany（読む）
→ src/app/api/cron/telemetry/route.ts:51   create（**実際に書いている**）
```

**書き込みは cron が持っている。**消す route は何も保存していないので、
データの流れは変わらない。

### 外部からの呼び出しについて

リポジトリの中に呼び出しは無いが、**外部のクライアント（Apps Script、
手元のスクリプト、ブラウザ拡張など）が叩いていないことはコードからは
証明できない。**次のどちらかで確かめる。

- Cloud Run のアクセスログで `POST /api/telemetry` の直近 30 日の件数を見る
- 消したあと 1〜2 週間、404 の発生を監視する

**0 件を確認できないなら、消す前に利用者へ報告する。**

### 受け入れ基準

- [ ] 消したのは `src/app/api/telemetry/route.ts` の 1 ファイルだけ
- [ ] `src/app/api/telemetry/history/route.ts` が残っている
- [ ] `/relocation/timing` などの画面でテレメトリのグラフが今までどおり出る
- [ ] 外部からの POST が無いことを確かめた（または利用者に報告した）
- [ ] 4 節の共通基準を満たす

---

## 3. #556 — `/api/v1` を呼ぶ死んだ画面を消す

### 消す対象（利用者が承認した範囲）

```
src/components/layout/DynamicCanvas.tsx          350 行
src/components/layout/ChatConsole.tsx            304 行   ← 追加で判明
src/components/widgets/DataAnalyzerWidget.tsx    478 行
src/components/widgets/MarkdownViewerWidget.tsx  288 行
src/components/widgets/MediaScraperWidget.tsx    384 行
src/components/widgets/OmniPipelineWidget.tsx    585 行
src/components/widgets/XTrendsWidget.tsx         112 行
src/components/widgets/YouTubeChat.tsx           207 行
src/components/widgets/YouTubeExtractor.tsx      255 行
src/hooks/useAgentStream.ts                      129 行
src/lib/analyzerResult.ts                         41 行
```

**`ChatConsole.tsx` は #556 の報告に入っていなかった。**
`useAgentStream` の唯一の参照元がこれで、`ChatConsole` 自体はどこからも
参照されていない（`useAgentStream` は `/api/v1/workspaces/.../chat/stream`
を呼ぶ）。同じ系統なので一緒に消す。**利用者に一言入れること。**

### 参照が無いことの確認

```bash
# 静的 import
grep -rn "DynamicCanvas\|ChatConsole" src/ __tests__/ --include=*.ts --include=*.tsx \
  | grep -vE "layout/(DynamicCanvas|ChatConsole)\.tsx"
```

```
→ 0 件
```

```bash
# 動的 import（next/dynamic・import()・require）。**字面で探すと取りこぼす**
grep -rn "next/dynamic" src/ --include=*.tsx | grep -iE "canvas|widget|console"
grep -rniE 'import\(\s*["\'"'"'].*(DynamicCanvas|ChatConsole|Widget)' src/ --include=*.tsx
grep -rn "require(" src/ --include=*.ts --include=*.tsx | grep -iE "widget|canvas|console"
```

```
→ 3 つとも 0 件
```

```bash
# 各 widget の参照元
for f in DataAnalyzerWidget MarkdownViewerWidget MediaScraperWidget OmniPipelineWidget \
         XTrendsWidget YouTubeChat YouTubeExtractor analyzerResult useAgentStream; do
  printf "%-22s ← " "$f"
  grep -rl "\b$f\b" src/ __tests__/ scripts/ --include=*.ts --include=*.tsx 2>/dev/null \
    | grep -v "/$f\." | tr '\n' ' '; echo
done
```

```
→ すべて DynamicCanvas / ChatConsole / 消す対象どうし / 下記のテスト 1 本のみ
```

### ⚠️ 巻き添えになるテストが 1 本ある

```bash
grep -rln "OmniPipelineWidget\|DataAnalyzerWidget" __tests__/
```

```
→ __tests__/omniPipelineMissingFields.test.tsx
```

このテストは「`keywords` / `posts` が無い応答で描画が落ちない」ことを
固定している。**対象を消すので、このテストも一緒に消える。**

CLAUDE.md 4 節は「テストを消す・skip する」を禁じているが、これは
**試す対象そのものが無くなる**場合。次を守る。

- [ ] 削除の PR 本文に「このテストは対象と一緒に消える」と明記する
- [ ] テストが固定していた**不具合の型**（応答の任意欄を確かめずに `.map()`
      する）が**他の生きているコードに無い**ことを確かめる:

```bash
grep -rnE "\.(keywords|posts)\.(map|filter|forEach)\(" src/ --include=*.tsx --include=*.ts
```

実測（2026-08-23）。**消す対象の 3 件以外は、名前が同じだけの別物。**
1 件ずつ見て、`/api/v1/analyzer/process` の応答を扱っていないことを確かめる。

```
消す対象:
  OmniPipelineWidget.tsx:451   analysisResult.keywords.map    ← 対象
  DataAnalyzerWidget.tsx:306   result.keywords.map            ← 対象
  DataAnalyzerWidget.tsx:393   result.posts.filter            ← 対象
別物（残す。確認済み）:
  admin/metrics/page.tsx:1479  s.blog.posts.map        ブログ記事の一覧
  blog/page.tsx:225            group.posts.map         ブログ記事の一覧
  api/rentals/parse-query:249  input.keywords.map      三項で有無を確かめてから
```

**この grep は名前で当てるので誤検出する。**「0 件であること」ではなく
「**残った件が別物であることを 1 件ずつ確かめた**」が合格条件。

### 誤検出の罠 — 「参照が無い」の走査を書くときの注意

参照の走査を自分で書く場合、次を外すと**誤検出する。**実際にやった。

| 罠                               | どうなるか                                                  |
| -------------------------------- | ----------------------------------------------------------- |
| `src/app/` 配下を除外しない      | Next の規約で拾われる route/page を「死んでいる」と誤判定   |
| `src/middleware.ts` を除外しない | 同上（規約の入口）                                          |
| `scripts/` を走査に入れない      | `localAgentEngine` などを誤判定（scripts から使われている） |
| `__tests__/` を走査に入れない    | テストからしか使われていないものを誤判定                    |
| `index.ts` の解決をしない        | ディレクトリ import を取りこぼす                            |

**文字列で組み立てる動的 import は、どの走査でも追えない。**
最後は `npx next build --webpack` が通ることと、実際に画面を見ることで確かめる。

### 同じ走査で出たが、**今回の範囲外**

参照が 1 件も無いファイルは他にもある。**利用者が承認したのは
`/api/v1` の系統だけ**なので、これらは消さずに報告する。

```
460 行  src/types/database.types.ts   （Supabase の生成物。生成し直しの対象かもしれない）
234 行  src/components/VolumetricBioMap.tsx
166 行  src/components/WeddingDateSelector.tsx
131 行  src/components/layout/Sidebar.tsx
129 行  src/components/TacticalActionCommand.tsx
 98 行  src/config/theme.ts
 86 行  src/lib/offline-db.ts
 59 行  src/components/widgets/MediaGallery.tsx
 53 行  src/lib/ephemerisClient.ts
 32 行  src/utils/auditHelper.ts
 30 行  src/lib/tavilyClient.ts
 19 行  src/utils/anonymizer.ts
```

### 受け入れ基準

- [ ] `grep -rn "api/v1" src/` が **0 件**になった
- [ ] `ChatConsole` を含めることを利用者に伝えた
- [ ] 巻き添えのテスト 1 本を PR 本文に明記した
- [ ] 同じ型の不具合が生きているコードに無いことを確かめた
- [ ] 範囲外の 12 ファイルは**消していない**
- [ ] 4 節の共通基準を満たす

---

## 4. 共通の受け入れ基準（3 件とも）

```bash
npx tsc --noEmit                 # エラー 0
npm test                         # 全部 pass（#556 は omniPipeline の 1 本ぶん減る）
npm run lint 2>&1 | tail -2      # **PR の前後で総数が増えていないこと**
npx next build --webpack         # 画面を触るので必須
```

- [ ] `npm ci` が書き換えた `yarn.lock` をコミットに含めていない
      （`git checkout -- yarn.lock`）
- [ ] 触ったファイルの prettier の準拠状態が**変更前と同じ**
- [ ] 一時 tsconfig（`tsconfig.scripts.tmp.json`）をコミットしていない
- [ ] コミットメッセージに「なぜそうしたか」「元がどう間違っていたか」を書いた
- [ ] PR 本文に**触らなかったもの・直せなかったもの**を理由つきで書いた
- [ ] **モデル名をコミット・PR・コード注釈に書いていない**

## 5. マージの条件（CLAUDE.md 6 節）

- [ ] 自分が出した PR である
- [ ] CI の結論が `success`（`in_progress` のままマージしない）
- [ ] 「戻せないもの」（本番 DB の破壊的変更・個人情報・課金）を含んでいない
- [ ] 上の検証コマンドを全部通してある

**#548 はマージした時点で利用者の答えが変わる。**その場で報告すること。
