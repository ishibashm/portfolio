# 賃貸掲載をMCPから検索する

既存の cloud-palette 公開MCPに `search_rentals`、`get_rental`、
`rental_market_stats` を登録しています。実装は `src/lib/mcpRentals.ts`、
登録先は `src/lib/mcpServer.ts` です。

## 接続

Streamable HTTP対応クライアントに次のURLを登録してください。

```text
https://cloud-palette.com/api/mcp
```

ローカルでは `npm run dev` を起動し、`http://localhost:3000/api/mcp`
を指定します。DB接続は既存のサーバー設定を利用し、クライアントへDB接続文字列を渡しません。

公開MCPの既存仕様に合わせ、認証トークンは不要です。個人用の
`/api/mcp/personal` とは別です。公開入口には回数制限はなく、DBに書き込む
レート制限も追加していません。検索は最大20件・20ページ、SQLは4秒、
トランザクションは5秒に制限します。

通常のMCP初期化後に `tools/list`、`tools/call` を利用します。
HTTPはPOSTのみで、`Content-Type: application/json` と
`Accept: application/json, text/event-stream` を指定します。
セッションIDは不要で、GET・DELETEは405になります。

## ツールと引数

`search_rentals` はすべての引数を省略できます。

| 引数                     | 内容・既定値                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| `prefecture`             | 都道府県名（東京都）または2桁コード（13）                               |
| `municipality`           | 市区町村（港区）。都道府県名は含めない                                  |
| `maxRent`                | 家賃上限、円、整数0〜5,000,000                                          |
| `includeManagementFee`   | 既定true。上限を管理費込みで判定。管理費不明は0として計算               |
| `layout`                 | 間取りの完全一致（1LDKなど）                                            |
| `minSizeSqm`             | 最小面積、㎡、1〜500                                                    |
| `maxWalkMinutes`         | 駅徒歩の上限、整数0〜60分                                               |
| `maxBuildingAge`         | 築年数の上限、整数0〜100年                                              |
| `sort`                   | `rent`（既定、管理費込みの安い順）または `recent`（最終確認の新しい順） |
| `page`                   | 1〜20、既定1                                                            |
| `limit`                  | 1〜20、既定10                                                           |
| `originLat`, `originLon` | 任意、必ず両方指定。緯度20〜46、経度122〜154                            |

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_rentals",
    "arguments": {
      "prefecture": "東京都",
      "municipality": "港区",
      "maxRent": 150000,
      "layout": "1LDK",
      "minSizeSqm": 30,
      "maxWalkMinutes": 10,
      "maxBuildingAge": 20,
      "sort": "rent",
      "limit": 10,
      "page": 1
    }
  }
}
```

`results` にID、URL、住所、物件名、家賃、管理費、合計家賃、間取り、面積、
徒歩分、築年数、最終確認日時と日本時間の日付を返します。駅名はDBにないため
`stationName: null` です。`hasMore` がtrueなら次の `page` を指定します
（最大20ページ）。起点と物件座標があれば方位・距離も返します。
方位は真北の伝統区分で、吉凶は既存の `judge_directions` で判定してください。

`get_rental` は検索結果のUUIDを `id` に指定します。
`originLat` と `originLon` も指定できます。

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_rental",
    "arguments": { "id": "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" }
  }
}
```

実際には検索結果のIDに置き換えます。`available: true` の場合は `listing`
に詳細（階、エリア、新築フラグを含む）を返します。古い掲載は `reason: "stale"`、
存在しないIDは `reason: "missing"` で、どちらも本文を返しません。

`rental_market_stats` は任意の `prefecture`（名称または2桁コード）、
`layout`（完全一致）で絞り込みます。

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "rental_market_stats",
    "arguments": { "prefecture": "13", "layout": "1LDK" }
  }
}
```

`live` に都道府県別・間取り別・都道府県と間取り別の件数、管理費込み家賃の
中央値、㎡単価の中央値（円単位に丸める）を返します。家賃・正の面積がある掲載が対象です。
`snapshot` は過去の静的集計で、現在の相場ではありません。

## 鮮度と読み取り専用の保証

`listingFreshness.ts` の判定と共通の30日窓を使い、最終確認から30日以上の掲載と
掲載期限切れを除外します。取込が3日以上止まっていても30日未満の掲載は対象です。
空の検索結果にも `freshness` を添え、取得のためのスクレイピングは起動しません。

DBトランザクションは `transaction_read_only=on` とし、値を束縛したSELECTのみを
実行します。取込メール、スクレイパー名、名寄せキー、個人のお気に入り・地点・
相談メモは公開しません。DB障害は接続文字列を含まない固定メッセージで返します。

## 検証

```sh
npm test -- __tests__/mcpRentals.test.ts __tests__/listingFreshness.test.ts __tests__/mcpServer.test.ts
npx tsc --noEmit --incremental false
```

テストはDBをモックし、実DBへの接続やスクレイピングを行いません。
