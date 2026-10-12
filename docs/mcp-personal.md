# MCP個人連携と刻の契約

2026-10-11 オーナー承認済み。実装中の仕様であり、個人用入口は未提供。
公開開始には接続から解除までの結合検証が必要。途中のコミットでは入口を無効にする。

## 入口と認可

公開 `/api/mcp` はDBを読まない既存6ツールと、今後追加する明示入力専用
`judge_time_slots`。個人用 `/api/mcp/personal` は既存6ツールに
`list_profiles`, `get_profile`, `judge_profile_directions`, `judge_time_slots`
を加える。公開側はプロフィール指定を拒否する。

正式方式はMCP仕様のOAuth 2.1。既存サイトログインで本人を確認し、接続ごとに
プロフィールを選択する。新規プロフィールを自動共有しない。PATは初版に含めない。
ChatGPT・Claude・Cursorを対象に結合確認し、将来の一般公開に備える。
サイトのCookieやSupabaseログイントークンをMCP資格情報として流用しない。

保護対象は `https://cloud-palette.com/api/mcp/personal`、scopeは
`read:profiles` のみ。PKCE S256、厳密なredirect照合、単回コード、resourceへの
結び付けを必須とする。登録方式・認可サーバーは公式資料で適合性を確認して選定する。
アクセストークン10分、更新トークン30日。更新時のrotationと再使用検知を行う。
全要求でissuer/audience/期限/scope/subjectとgrantの失効を検査する。
未認証・無効は401、scope不足は403、DB障害は閉じて503相当。開発バイパス不可。
認可・解除のブラウザー操作には本人認証とCSRF保護を設ける。

## プロフィール

本人の `user_configs.user_id` だけで読み、保存JSONは許可した項目に射影する。
旧NULL所有者行の連携はサイトで行う。別IDの非NULL行を再所有しない。
selectorは `{ id }` と `{ name }` の一方だけ。名前は完全一致、同名は
`AMBIGUOUS_PROFILE` と許可済み候補だけを返す。IDを知っていても許可外は拒否する。
最大100件。空一覧とDB障害を区別する。

`list_profiles` はID・名前・active（不明はnull）・計算準備状態・不足項目、
cloud保存元、更新日時だけを返す。`get_profile` も通常は入力値を返さない。
`includeCalculationInputs=true` を明示したときだけ生年月日と出発地の緯度経度を
返せる。出生地・地名・メール・生体値・鍵・保存JSON全体は返さない。
設定の出所は明示指定→プロフィール→アカウント→既存の既定の順に示す。
他プロフィールや画面のサンプル生年月日・東京駅で補完しない。
未知設定・不正日時・片方だけの座標・非古典設定は初版では明示エラーにする。

## 刻と日の方位

`judge_time_slots` の明示入力はbirthDate、lat（20〜46）、lon（122〜154）が必須。
この範囲は国内領域の厳密な判定ではない。dateは実在するYYYY-MM-DD、
省略時は要求開始時のJST今日。暦の対応範囲は1900〜2099年とし端年も検証する。
個人用ではprofile指定とbirthDate/lat/lonの混在を拒否する。
settingsは `useClassicalBoard` と `voidZodiacOverride` のみ。
overrideは空文字か重複しない十二支2文字。空文字は出生から計算する。
`includeBoard` は既定false。未対応キーは黙って無視しない。

画面の `getDailySolarSchedule`、`getHonmeiStar`、`getPersonalVoidZodiac`、
`isVoidTimeHour`、`evaluateTimePhase`、`getKyuseiBoard` を再利用する。
日付だけの出生は画面の `parseJapanDateTime` と同じJST 9時、時差なし日時はJST。
日判定は既存MCPの解釈（日付だけは正午）を維持し、統一しない。
出生の本命星へ太陽時の二重補正をしない。

12刻のstatusは空亡を最優先に `void`（天中殺）、`favorable`（動いてよい）、
`neutral`（ふつう）。五行が好相性でも空亡ならすすめない。
刻の九星と任意の盤配置を返すが、**刻ごとの方位吉凶は計算しない**。
日の方位は別ツール `judge_profile_directions`（既存 `judge_directions` と同じ判定）
で取得する。時刻表の空亡優先へ日の天中殺モードを持ち込まない。

境界は出発地経度と対象日正午の均時差による真太陽時。
ミリ秒を保ったRFC3339の+09:00日時、区間は `[start,end)`。
前日夜〜当日夜のcoverageを返すので、JSTの0〜24時全体ではない。
隣接日の隙間・重なりを修正しない。盤の配列順はSE/S/SW/E/CENTER/W/NE/N/NW。
緯度は入力検証に使うが現在の刻計算には使わない。
応答に出生日時・座標を復唱しないが、境界から経度を推測できる可能性はある。
calculationModel、出生解釈、設定の出所、coverage、注意事項を返す。
テキストJSONとstructuredContentは同じ射影から生成しoutputSchemaを設ける。

## 情報の扱い・制限・解除

同意前に、名前・計算結果・明示要求した入力値が接続先AIへ送られ、会話側に
残り得ることを説明する。計算のために外部LLMやジオコーダーを呼ばない。
個人レスポンスは `Cache-Control: private, no-store`。共有計算キャッシュに置かない。
ログには出生値、座標、地名、プロフィール名/ID、引数/結果本文、Cookie、
Authorization、認可コード、更新トークンを残さない。
監査はランダムrequestId・時刻・内部userId/grantIdまたはtokenId・固定ツール名・
結果コード・処理時間のみで30日保持。発行・同意・更新・失効も対象。
インフラログは公開前に実設定を確認し、どこにも残らないとは約束しない。

個人用制限は本人単位60要求/分（burst 10）、刻計算20回/分・同時2件、
本文32KiB、1要求1日12刻、タイムアウト5秒。共有ストアで原子的に制限しTTL削除。
超過は429とRetry-After。障害時に公開計算へ降格しない。
`/profile/connections` で接続名・許可プロフィール・権限・期限・利用履歴と解除を扱う。
解除・対象削減・アカウントや登録内容の削除は次の読取りから反映する。
通常ログアウトは接続解除ではない。解除しても既にAIへ渡った情報は回収できない。

端末だけの設定は再現できない。元の端末でログインしクラウド保存を確認するよう案内。
空一覧だけで端末内に存在すると断定せず、削除済みデータの強制再同期をしない。
