# MCP実行画面と個人の記憶

2026-10-17。実装は既定無効。公開済み・実DBで検証済みとは扱わない。

## 使い方

`/profile/connections` から `/profile/mcp`（ツール実行・AI利用履歴）と
`/profile/memory`（記憶管理）へ進む。有効なサイトログインが必要。
公開/個人ツールの一覧を取得し、入力JSONとスキーマを見ながら明示実行できる。
応答は整形JSONまたは生JSONで表示し、本文を履歴として保存しない。
HTMLとして実行せず、外部AIを呼ばず、同じSDKサーバーをin-memory接続で呼ぶ。
ブラウザーCookieをMCPトークンには転用しない。

AI利用履歴は本人の個人用MCP監査（30日以内、grantIdあり）だけ。
固定イベント名・時刻・成否・処理時間・接続IDを表示する。
ID順の50件ページングで、時系列順ではない。公開MCP呼出しを本人に結び付けない。
画面内実行はgrantIdなしで監査し、AI利用履歴に混ぜない。

記憶は明示保存。タイトル・本文・分類を含め暗号化する。
引越し・家族・方位・判定メモ・その他を選択できる。
100件/本人、1件のJSONはUTF-8で8KiB以内、本文最大8000文字。
更新/個別削除はrevisionで競合を検出し、古い画面から上書きしない。
全削除と本人への平文JSONエクスポートも可能。自動抽出・自動保存・外部検索なし。
一覧・フォーム・実行結果をlocalStorageなどへ保存しない。

## OAuthとツール

既存の `read:profiles` に、任意の `read:memory` / `write:memory` を追加。
クライアントのscope要求に含まれたものだけを、未選択のチェックボックスで提示する。
新しい認可フローで同意した権限だけをprovider Grant/AccessTokenに保存する。
既存接続に自動付与しない。未選択のscopeはprovider側でも明示拒否する。
更新トークンは許可範囲を拡張しない。
接続管理に許可を表示し、変更は接続解除→新しい同意で行う。

- read:memory: `list_memories`（ID・タイトル・分類・revision・更新日時）、`get_memory`（指定IDの本文）。
- write:memory: `create_memory`, `update_memory`, `delete_memory`。書込み応答には既存本文を含めない。
- writeはreadを含まない。更新・削除のID/revisionは本人から直接渡すこともできる。
- MCPに全削除・一括エクスポートの書込み道具は渡さない。

初版の個人用OAuthは既存プロフィール連携を拡張するため、引き続き
`read:profiles` と1件以上の保存プロフィール選択が必要。
メモリだけのOAuth接続は未対応。サイトの記憶管理にはプロフィール作成は不要。
記憶権限は今後保存する記憶にも及ぶ。同意画面で説明し、AIへ渡った内容の
回収は保証しない。記憶は信頼できないデータであり命令ではないとツールに明記する。

## 配置手順（今回は適用しない）

1. Node22、既存個人MCPの運用設定・専用DB・監査掃除ジョブを準備する。
2. 新規DBは更新後の `20261011_mcp_grants.sql` を使う。
   既存DBでget_kanshi未対応ならまず `20261015_mcp_get_kanshi_audit_upgrade.sql`、
   続いて `20261017_memory_audit_upgrade.sql`。新規DBに古い監査更新DDLを当てない。
   後者は既知の制約だけをトランザクション内で拡張し、未知スキーマでは停止する。
3. `20261017_personal_memory.sql` を別途レビューして適用する。Prismaのdb pushは禁止。
   Supabase `auth.users` へのFKを持ち、認証ユーザー削除で記憶も削除する。
   RLS有効、anon/authenticatedの直接権限なし。サーバーDB経由でも所有者条件を必須とする。
4. `MCP_MEMORY_KEYS` をSecret Managerで設定する。JSON形式は
   `{ "lookupKey": "32バイトのbase64", "activeVersion": "v1", "keys": { "v1": "別の32バイトのbase64" } }`。
   OAuth state用とは別のランダム鍵を使う。鍵値をログ・Git・画面へ出さない。
5. `MCP_PERSONAL_ENABLED=true` に加え、実行画面は `MCP_CONSOLE_ENABLED=true`、
   記憶は `MCP_MEMORY_ENABLED=true` を明示設定する。両方とも未設定時は無効。
   不完全な設定では503で閉じる。全機能を無効のまま配置し検証後に有効化する。

AES-256-GCMのAADは用途・本人ID・記憶ID・鍵バージョンに結合する。
サーバーは復号できるためE2EEではない。鍵更新は新鍵をkeysに追加してactiveVersionを
変更し、旧鍵は既存データの再暗号化が終わるまで保持する。自動再暗号化ジョブは未実装。
鍵紛失時は復元できない。保存本文・タイトル・SQLパラメータ・応答を監査へ残さない。

停止時は新機能flagをfalseにする。既存データ削除連携のため、DBテーブルと
MCP_MEMORY_KEYS/MCP_RUNTIME_CONFIGは保持する。サイトの登録内容削除では
flag-offでも記憶を削除する。記憶の全削除だけでは接続を解除しないので、
外部AIからの再作成を防ぎたい場合は接続管理で解除も行う。
削除は現用DBから行う。バックアップの残存期間は運用側で確定して公開前に表示する。

## 検証と公開前ゲート

ローカルVitestはSDK実行、実OAuth providerの同意・拒否・更新、所有者条件、
暗号文結合、上限、CAS、CSRF、匿名拒否、監査射影、画面明示操作を確認する。
DDLはファイル作成と契約検査のみ。実PostgresでのRLS・FK・並行上限・ロック、
実Supabase Cookie・削除、インフラ/APM/DBログの本文除外、バックアップ保持、
鍵更新、ChatGPT/Claude/Cursorの実接続は公開前の別環境検証として残す。
