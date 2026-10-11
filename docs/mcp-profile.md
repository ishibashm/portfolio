# Cloud Palette MCP と ChatGPT 用 OAuth

この変更はソースコードとローカル検証用です。公開先へのデプロイ、DB migration の実行、
鍵の生成・設定、ChatGPT への登録、実ユーザーの接続許可はまだ行っていません。

## 入口と権限

- `/api/mcp` は引き続き匿名の計算専用です。DB・個人プロフィールは読みません。
- `/api/mcp/profile` は別の保護された MCP 入口です。`list_profiles` と
  `get_profile_daily` を提供し、保存済みプロフィールの読み取りに限定します。
- すべての POST の bearer は Cloud Palette の OAuth サービスで introspection し、
  `active`、発行者、クライアント ID、正確な audience
  `https://cloud-palette.com/api/mcp/profile`、`profiles:read` scope、期限、
  Supabase の UUID 主体を検査します。Cookie、開発用疑似ログイン、メール、
  リクエスト本文の user ID は本人確認に使いません。検証不能な場合は DB に進みません。
- DB の照合は認証済み UUID と `user_configs.user_id` の完全一致だけです。
  メールだけの旧行は返さず、行の移行や付け替えはしません。`presets` 列だけ読み、
  生年月日・座標・健康値・旧 API 鍵は応答に含めません。
- 401 は `WWW-Authenticate` から
  `/.well-known/oauth-protected-resource/api/mcp/profile` を案内します。
  metadata は OAuth サービスの issuer と `profiles:read` を示します。
  すべての非公開応答を no-store にします。
- HTTP は POST のみです。GET / DELETE は 405。Origin がある場合は
  `https://cloud-palette.com` の完全一致だけを許可し、development のみ localhost を
  許可します。通常の MCP クライアントが Origin を送らない場合は受け付けます。

## 認可サービス

既存の Next.js standalone コンテナは変えず、`oauth-service/` を Node 24 の独立した
サービスとして用意しました。`oidc-provider` を認可サーバーに使い、保存状態は Prisma の
新しい OAuth 専用テーブルに置きます。Supabase Auth の Google ログインを認可ドメイン上で
確認し、`auth.getUser()` が確認した主体に対して、保存済みプロフィールの
読み取りについて明示的な許可画面を表示します。認可ドメインはアプリ本体と別 Cookie のため、
アプリ本体でログイン済みでも Google ログインをもう一度求める場合があります。
開発用 Cookie の認証バイパスは使いません。

- 事前登録した ChatGPT クライアント 1 件だけ。登録時の正確な redirect URI は
  ChatGPT 管理画面で表示された HTTPS URL を環境設定で固定します。許可するホストは
  `chatgpt.com` または `chat.openai.com` に限定します。動的クライアント登録は公開しません。
- Authorization Code + PKCE S256 を必須にし、MCP リソースの `resource` 指定を
  必須にします。別 audience・別リダイレクト先・未許可の scope は拒否します。
  ChatGPT が OIDC discovery を見て `openid` を付ける場合には受け付けます。
  ID token はアカウント UUID のみを主体として渡し、メール・氏名・住所は出しません。
  許可画面にも識別子の共有を明記します。`email` / `profile` scope は広告しません。
- 公開クライアントに渡す短命な opaque access token は 5 分、authorization code は
  1 分、grant と refresh token は最大 30 日です。refresh token は毎回ローテーションし、
  永続化した認可コード・refresh token の再使用を原子的に拒否します。
- `/connections` に本人の有効な接続を表示し、本人が CSRF 保護付きで解除できます。
  grant の失効で access token の introspection と refresh は無効になります。
  有効期限切れの grant は接続一覧に出しません。
- 保管するトークン ID と検索用参照 ID は SHA-256 にして索引化し、
  raw ID を含む OAuth payload と接続行の grant ID は AES-256-GCM で暗号化します。
  暗号文はレコードまたは利用者 ID に結び付け、別行への付け替えを拒否します。
  OAuth テーブルへの DB ロール権限を最小化してください。
  トークン、個人情報、内部例外を通常の HTTP 応答・ログへ出しません。
- `oauth-service/cleanup.mjs` は期限切れ状態を削除する保守コードです。既定は件数確認だけ。
  削除は `MCP_OAUTH_CLEANUP_ENABLED=true` と `--apply` の両方が必要です。
  定期実行の設定・実行はまだしていません。

## 事前に確認が必要な本番セットアップ

以下のコードと DDL は同梱していますが、実行・登録・鍵設定には作業時の承認が必要です。

1. `prisma/sql/20261011_add_mcp_oauth.sql` を実 DB と照合し、既存の
   `db-apply-sql` の dry-run で確認後、別途承認を得て適用する。同じ DDL を
   `prisma/migrations/20261011102500_mcp_oauth/migration.sql` にも置いていますが、
   **どちらか一方の経路だけ**を選びます。新しい `McpOauthRecord` /
   `McpOauthConnection` 表以外の既存表は変更しません。両表は RLS を有効にし、
   ブラウザー側の DB ロールからの直接アクセスを禁止します。OAuth サービスに使う
   DB ロールの必要な表へのアクセスを実環境で検証してください。
2. `oauth-service/Dockerfile` を検証・ビルドし、認可ドメインを持つ別の Cloud Run
   サービスとして配置する。既存 Next コンテナはそのままです。認可ドメインの HTTPS と
   Supabase Auth redirect allowlist に `https://<認可ドメイン>/supabase/callback` を設定する。
3. ChatGPT 管理画面で正確な OAuth redirect URI を確認し、サービスに固定する。
   ChatGPT 側には固定 client ID、認可サーバー情報と `/api/mcp/profile` を登録する。
   この事前登録方式では DCR / CIMD は使用しません。
4. サービスに `MCP_OAUTH_ISSUER`（HTTPS オリジン）、`MCP_OAUTH_RESOURCE`
   （上記の固定プロフィール入口）、`MCP_OAUTH_CLIENT_ID`、
   `MCP_OAUTH_CLIENT_REDIRECT_URI`、`MCP_OAUTH_COOKIE_SECRETS`（JSON 文字列配列）、
   `MCP_OAUTH_JWKS`（署名可能な private JWK を含む JSON）、
   `MCP_OAUTH_STORAGE_KEYS`（32 バイト鍵の base64 文字列の JSON 配列）、
   `MCP_OAUTH_INTROSPECTION_SECRET`、`DATABASE_URL`、
   `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` を安全に設定する。
   Next 側には同じ issuer、client ID、introspection secret を設定する。
   本番鍵はこの作業の時点で承認後に発行する。Cookie、JWK、保存データ暗号鍵の
   旧鍵を残す段階的なローテーションに対応する。保存データは新しい鍵で作成し、
   古い鍵は全レコードの期限・削除を確認してから外す。
   introspection secret の変更は両サービスで協調して行う。
5. 期限切れ OAuth 状態の cleanup を安全な頻度でスケジュールし、dry-run を確認してから
   実行する。実運用では認可・更新・解除・異なる audience・別ユーザー・障害復旧を
   実 URL とテストアカウントで確認する。今のテストは本番接続の証明ではありません。

Next 側のリソース URI は誤ってプレビュー環境から本番プロフィールを公開しないよう
本番 URL に固定しています。プレビューで OAuth 接続を検証するには、別の audience、
別の認可サービスと DB 環境について設計・承認してからコードを調整します。

## 道具の判定条件

- 匿名 `/api/mcp` の `judge_hours` は生年月日・経度・任意の日付を受け取り、Web の
  `getDailySolarSchedule` / `evaluateTimePhase` / `isVoidTimeHour` と同じ
  十二支の時間帯を返します。従来の六つの公開ツールも残ります。
  `judge_hours` と保存済み `get_profile_daily` には、各刻の推奨状態・理由と
  `recommendedWindows` を含みます。これは約 2 時間の十二支の刻であり、
  24 個の独立した毎時スコアではありません。時間の推奨は方位の日判定とは別です。
- `list_profiles` は本人がクラウド保存したプロフィールの ID・名前・使用中の旗だけを
  返します。名前は完全一致の任意フィルターです。生年月日が未入力の控えも一覧に残し、
  判定時だけ必要な値を保存するよう案内します。
- `get_profile_daily` は `profileId` または `profileName` の一方を指定します。
  名前が重複したらエラーにするため、一覧から一意の ID を指定します。
  保存済み生年月日と出発地経度を内部で使い、方位と吉時間をまとめて返します。
  日付を省略したら日本時間の今日を使い、同じ日付を両計算に使います。
- 判定は古典九星、総合方位判定、既定の天中殺モードです。保存済みの分析日や別モード、
  天中殺の手動上書きは適用しません。指定した日本時間の暦日に重なる前後日の刻も返すため、
  12 件を超えます。元の境界を保ち、日時には日付と `+09:00` を付け、終了時刻は含みません。
  各刻の `start/end` は元の境界、`onDateStart/onDateEnd` と
  `recommendedWindows` は指定した日本標準時の暦日に切り詰めた境界です。
  正午補正は近似なので境界に数秒程度の隙間・重なりが生じる場合があります。
- 匿名の `find_auspicious_days` は実行環境の夏時間に左右されず、指定した
  日本時間の開始日から一定の日数後まで走査します。

参考: [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)、
[OpenAI OAuth](https://developers.openai.com/plugins/build/auth)、
[oidc-provider](https://github.com/panva/node-oidc-provider)、
[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
