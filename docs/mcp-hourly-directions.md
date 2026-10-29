# 公開MCP：時盤と自治体の読み検索

`/api/mcp` の `judge_hourly_directions` は、日付必須、場所と本命星は任意です。

```json
{
  "name": "judge_hourly_directions",
  "arguments": { "date": "2026-10-24", "birthDate": "1990-04-15" }
}
```

- `location: { lat, lon }` を省略すると名古屋（35.1815, 136.9064）。自治体検索で得た座標も指定できます。
- `honmeiStar: 1`〜`9` または `birthDate: "YYYY-MM-DD"`。両方指定はエラー。出生の日付は既存刻ツールと同じJST9時で解釈します。
- 対象日・出生は1900〜2099年、緯度20〜46・経度122〜154。
- `slots` は12件。各刻の `start` / `end` はJSTオフセット付き、`hourStar` は中宮星、`directions` は八方位の配置星・`status`・`reason`。
- `status` は `favorable`（吉）/ `neutral`（平、個人未指定時は未判定）/ `unfavorable`（凶）。五黄殺（`NOISE_GOU`）・暗剣殺（`NOISE_ANKEN`）は全員に凶。本命星指定時は既存エンジンの本命殺・本命的殺・相性も適用します。
- 色の根拠は `src/utils/kigaku.ts` の既存 `KYUSEI.color`。`luckyColor` は時盤中宮の九星色で、個人別の吉色や凶殺を打ち消す色ではありません。

刻の区切りと時の九星は `getDailySolarSchedule`、盤と方位判定は `generateBoard` / `calculateVectorCollision` を再利用しています。`judge_time_slots` と同じ正午の真太陽時補正による、前日夜から当日夜までの12刻です。当日夜の残りは翌日の表に含まれます。時盤単独で、年・月・日盤、時破、空亡は合成しません。日の方位には `judge_directions`、空亡を含む刻の可否には `judge_time_slots` を使ってください。

## 読み・ローマ字検索

```json
{
  "name": "search_municipality",
  "arguments": { "query": "Nagoya", "limit": 50 }
}
```

`Nagoya` / `nagoya` / `なごや` / `ナゴヤ` は「名古屋」と同じ17件（名古屋市の16区と北名古屋市）です。既定上限10、最大50、掲載件数順は従来どおりです。`Tokyo` / `Toukyou` / `Tōkyō`、`Fukushima` / `Hukusima`、スペースやハイフンの違いも吸収します。部分一致なので短い読みは複数自治体に一致します。

読みは日本郵便の[UTF-8版郵便番号データ](https://www.post.japanpost.jp/service/search/zipcode/download/utf-zip.html)（2026年9月30日更新）と[ローマ字版](https://www.post.japanpost.jp/service/search/zipcode/download/roman-zip.html)（2025年6月18日更新）から抽出しました。町域・郵便番号は保存せず、都道府県・自治体の表記と読みだけを `src/data/municipalityReadings.json` に同梱しています。政令市は出典どおり区単位です。取得日・配布URL・SHA256はJSON内に記録しています。ローマ字版は更新間隔が異なるため、データ更新時は検索対象のカバレッジテストも確認してください。

再生成（Python標準ライブラリのみ）:

```bash
python3 scripts/build_municipality_readings.py /tmp/utf_ken_all.zip /tmp/KEN_ALL_ROME.zip
```

実行時に外部APIは呼びません。`PAID_APIS_DISABLED` の制御は維持します。新ツールと読み検索は公開入口だけに登録し、personal APIのツール・検索挙動は変更しません。
