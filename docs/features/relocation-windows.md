# 引越しできる期間の一覧

年盤・月盤の方位と強さ、天中殺の扱いが同じ連続日を一つの期間にまとめる。
日ごとの表を長く並べず、引越し候補の期間と方位を比較するための機能。
`src/lib/relocationWindows.ts` の `findRelocationWindows` を公開MCPと画面で共有する。
DB・外部API・AIは使わない。

入力は必須の `birthDate`（YYYY-MM-DD）と出発地の `lon`（122〜154）。
任意の `birthTime` は HH:MM（JST）、`from` は YYYY-MM-DD（既定は今日JST）、
`days` は30〜730の整数（既定600）。実在しない日付や不正な時刻は拒否する。
`tenchusatsuMode`（weaken / strict、既定weaken）、`involuntaryMove`、
`directionFilterMode` も既存の判定設定を受け取る。

公開MCPの道具名は `find_relocation_windows`。上記入力をJSONオブジェクトで渡す。
成功時の `structuredContent` とテキストJSONは同じ内容で、
`{ from, to, days, windows, tripleDays, tripleDaysTotal, summary }` を返す。
`windows[]` は `{ from, to, days, directions: [{ direction, label, tier }],
allDirectionsBad, bestTier, tenchusatsu }`。
`tenchusatsu` は `inPeriod`, `scopes`, `blocks`, `attenuation`, `note` を含む。
`tripleDays[]` は `{ date, directions }` で最大200日を返し、総日数は
`tripleDaysTotal`。`summary` は `totalDays`, `windowsCount`,
`allDirectionsBadDays`, `tenchusatsuDays`, `bestWindows`（Sの期間を日数順、最大10件）。
失敗はMCPのエラー応答、関数では `{ ok: false, error }`。

画面は `/houi/relocation-calendar`。Server ComponentのGETフォームとHTML表だけで
動き、クライアントJavaScriptを追加しない。画面入力は生年月日・出生時刻・経度・開始日・日数。
天中殺などの追加設定はMCP／関数から指定できる。

判定は `purpose="relocation"` として既存の `calculateMcpDirectionsDay` を使う。
年盤＋月盤で S＝両盤吉、B＝片方吉、C＝平、D＝軽い凶（土用を含む）。
X＝五大凶殺は使える方位から除外する。2盤とも吉ならSなのでAは現れない。
全方位凶はX以外の方位が一つもないこと。年・月の天中殺を `scopes` に表示し、
既定weakenでは禁止せず、`blocks=false` と `TENCHUSATSU_WEAK_NOTE` を返す。
strictでは該当期間の `blocks=true`。既存方針どおり、やむを得ない移動
（`involuntaryMove=true`）はstrictでも禁止しない。絞り込み設定も既存方針に従う。
時刻単位の天中殺は使わない。六曜等は目安であり、方位の段階を変えない。
「3盤そろう日」は同じ方位でrelocationのSかつ `isTripleAuspicious` が成立する日。

キャッシュはプロセス内LRU最大50件・6時間。返却値は複製し、利用側の変更を
キャッシュに戻さない。公開MCPの既存レート制限がそのまま適用される。
個人入力をDB等へ永続保存せず、アプリのログにも出さない。ただし入力は計算用の
メモリキャッシュのキーに最大6時間残る。GET入力はURLに含まれるため共有に注意する。
結果のフォーム・メタデータへ個人入力を埋め戻さず、query付きページはすべて
noindex / nofollow。ブラウザ履歴やインフラのURLログの扱いは別途運用で確認する。

検証は `relocationWindows.test.ts`（入力、730日、連続期間、日別判定、既定値、設定）、
`relocationWindowsGolden.test.ts`（固定600日、既知期間、20日照合、strict/weaken）、
`relocationWindowsCache.test.ts`（6時間・50件・LRU・複製）、
`relocationCalendarPage.test.tsx`（サーバー描画、queryのnoindex、個人入力の非表示）、
`mcpServer.test.ts` / `mcpPersonalServer.test.ts`（公開登録と個人用道具一覧の分離）。
siteStructure・sitemap・道具一覧を参照するテストも合わせて実行する。

`__tests__/fixtures/relocationWindows.golden.json` は架空の入力
`birthDate="1979-11-17", lon=135.5, from="2026-11-14", days=600,
tenchusatsuMode="weaken"` の固定結果。本命星は数値3（三碧木星）、
天中殺は午・未（甲申旬）。実際の検証実行と同じ本命星・天中殺になる架空の日付を
選んだもので、実在の人物の生年月日・時刻・住所・経度はコミットしない。
fixtureは回帰の基準であり、テストを通すために作り直さない。

CIは `.github/workflows/ci.yml`。すべてのpull_requestとmasterへのpushで
型検査、lint、npm test、next buildを行う。lint-warning gateはpull_requestで
警告数の増加を検査する。workflowの変更は不要。
CDは `deploy.yml` のmasterへのpushでCloud Run `asia-northeast1` の
`portfolio-app` に反映する。`docs/**` と `__tests__/**` だけの変更は
paths-ignoreでデプロイされない。マージは所有者の明示OKが必要で、PRは一度に一つ、squashする。

引き継ぎでは計算を `src/lib/relocationWindows.ts`、登録を `src/lib/mcpServer.ts`、
画面を `src/app/houi/relocation-calendar/page.tsx`、関連テストと本書で変更する。
公開導線を変えた場合は `siteStructure.ts`、MCPの案内・道具一覧、sitemap設定も確認する。
判定そのものを変える場合だけ `mcpDirections.ts` と既存の判定方針を見直す。

fixtureを更新すべき仕様変更が合意された場合は、一時的な一回限りのtsxスクリプトで
上記の架空入力を `findRelocationWindows` に渡す。`npx tsx <スクリプトのパス>` で実行し、
各windowを `{ from, to, directions: Object.fromEntries(directions.map(d =>
[d.label, d.tier])), allDirectionsBad, tenchusatsuScopes: tenchusatsu.scopes }` に変換する。
`input`, `note`, `windows`, `tripleDaysTotal`, `allDirectionsBadDays`
（`summary.allDirectionsBadDays`）をJSONへ出し、差分をレビューする。
スクリプトにも架空入力だけを使い、今回のfixtureは変更しない。

本番MCPとの照合が別途承認された場合は、同じ架空入力と選んだ日付を
`judge_directions` に `purpose="relocation"` で渡し、Xを除いたlabel→tierとscopesを比較する。
呼び出しは必ず逐次実行する。並列呼び出しは既存レート制限で403になるため、
拒否されたら間隔を空け、連打しない。このローカル検証では本番を呼ばない。
