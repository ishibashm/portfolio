# Phase 2: 本人の通知メールからURLを選ぶ

設計・骨格追加日: 2026-09-24。対象: ishibashm/portfolio。
[元設計 §8・§12](./listing-paste-ingest-design.md)を引き継ぐ。現状は貼付プレビュー、Gmail取得アダプター、PKCE付きOAuthと本人ラベル選択APIまで実装。§1〜8は初期段階の設計・検証記録、現在の実装は§9〜10を参照。定期ジョブは未追加。実Google接続とmigration適用は行っていない。

## 1. フローと責務

将来の実接続フロー:

1. 本人がGmailで物件通知専用ラベルを作り、送信元・件名等のフィルタでラベル付けする。過去メールへの一括適用は既定OFF。
2. アプリへのログインとは別に、読み取り専用のメールアクセスへ同意する。本人がラベルを選択し、サーバー時刻を開始時点として固定する。
3. サーバーが本人所有の接続だけを解決し、開始時点以降・指定ラベル・1回最大20通を取得する。ラベルはアプリ側の取得条件であり、OAuth権限をそのラベルだけに限定するものではない。
4. MIMEを上限付きで安全に解析し、HTTPS URLのみを抽出・正規化・重複除去する。本文を一時メモリから解放する。HTMLは描画せずhrefのみを読む。画像・添付・リンク先は取得しない。
5. 本人にURL文字列を提示し、1件を選んでもらう。選択もプレビューも永続保存しない。
6. 選んだURLを既存の「物件URL・住所・座標から調べる」入力へ渡す。「調べる」以後はPhase 1と同じ。住所入力／ピン指定 → 地図で位置確認 → 決定的な方位・盤計算 → 本人が候補履歴保存、の順序を保つ。

メールに住所らしい文字列があっても所在地の確定には使わない。自動ジオコード、複数URLの一括ListingCandidate保存、既存UserSpotへの自動保存を設けない。

今回のUIでは手順1〜3をテスト用貼付欄に置き換える。Gmail接続ボタンは常に無効・未接続。貼付内容をサイト内APIへ送ることを明示する。URL選択は外部リンクのクリックではなく、既存入力欄を更新する操作である。

## 2. 今回のAPI・解析契約

`POST /api/relocation/email-preview`

- 入力: `{ "source": "テスト用内容", "format": "text" | "html" | "mime" }`。未知キー・userId・接続IDを受け付けない。
- 出力: `{ "urls": ["https://…"], "truncated": false }`。メール件名、送信者、本文、元HTML、添付、住所、例外詳細は返さない。
- `candidateUser(req, true)`で同一オリジン・同一プロトコルとサーバー認証を検証する。API単体で匿名操作を拒否する。
- 既存`candidateBody`のストリーム読込上限16,384バイト、sourceのUTF-8上限12,000バイト。JSONエスケープ分も全体上限に含むので、内容によっては先に全体上限となる。
- 既存の共有DBカウンターで本人10回/分。保存するのは`email-preview:<本人ID>`・件数・期限だけ。Phase 1の流量テーブル導入が前提であり、DBに接続できなければ503となる。メール／候補レコードへの書込みはない。
- 成功も失敗も`Cache-Control: no-store`、`X-Robots-Tag: noindex, nofollow`。エラーは固定コード／固定文言。本文・URL・エラーオブジェクトをログ出力しない。
- 400: 不正JSON・サイズ・形式・未対応MIME、401: 未認証、403: オリジン不一致、429: レート上限（Retry-After: 60）、503: 認証基盤／DB等の障害。

解析は`listingEmailIngest.ts`に閉じ、Gmail・fetch・DB・AIへの依存を持たない。`classifyCandidateInput`経由でPhase 1の`normalizeCandidateUrl`を再利用し、認証情報入りURL、非HTTPS、IP／ローカル宛て、フラグメント、既知の機微クエリ等を拒否する。既知の追跡パラメータを除去し、正規化後のURL単位で重複排除する。

### 対応するMIMEの範囲

- `text/plain`、`text/html`、`multipart/mixed`・`alternative`・`related`の入れ子。ヘッダー折り返し、CRLF／LFを扱う。
- UTF-8／US-ASCII、7bit／8bit／base64／quoted-printable。旧来の日本語charset・未知の転送形式は拒否し、通常URLの手動入力へ戻す。汎用メールクライアント互換のパーサーを名乗らない。
- 最大40パート、入れ子深さ6、各ヘッダー部8,192文字、boundary70文字。上限超過・重複Contentヘッダー・不正な符号化・閉じていないmultipartは全体エラーとし、部分成功を返さない。
- attachment指定、name／filename付きのパート、画像、message/rfc822等の非対応メディアを読み飛ばす。添付APIを呼ばない。
- HTMLは固定版parse5の非実行ツリーで解析する。a／areaのhrefのみ。script・style・template・noscript、表示テキスト、コメント、img src、base、相対URLを候補化しない。DOM挿入、画像ロード、外部実体解決はない。
- テキストからHTTPS文字列を抽出し末尾の一般的な句読点を除く。表記の曖昧なURLは本人が通常URLを貼り直す。全形式を自動修復するものではない。
- 解除リンクの既知構文（unsubscribe／opt-out／配信停止）を除外。最大20 URLで打ち切り、超過は`truncated=true`で表示する。

未知の追跡URL・短縮URLを詳細ページと推測しない。自動展開／リダイレクト追跡／ネストした転送先URL抽出は行わない。機微情報の完全な検出器ではないため、本人が表示URLを確認し、不明なものは通常URLへ貼り直す。

## 3. データ分離とライフサイクル

| データ                 | 今回                          | 実接続時の設計                                           |
| ---------------------- | ----------------------------- | -------------------------------------------------------- |
| 生MIME・テキスト・HTML | リクエスト処理中のメモリのみ  | 1通ずつメモリ処理。キュー／ファイル／DB／APMに格納しない |
| 画像・添付             | 取得・保存なし                | 同じ。添付取得の権限経路を作らない                       |
| プレビューURL          | 画面メモリのみ                | 同じ。候補テーブルへ自動挿入しない                       |
| 接続情報               | 型だけ。DB列・migrationなし   | 候補とは別の本人所有テーブル                             |
| 確定した候補           | 本人による既存Phase 1保存のみ | 既存ListingCandidateの契約を維持                         |
| レート制限             | 本人ID・カウンター・期限      | 本文と分離した運用メタのみ                               |

`listingEmailConnection.ts`の接続メタ契約はID・本人ID・provider・labelId・startedAt・暗号化refresh token・鍵バージョン・同期cursorを持つ。メールアドレス・件名・本文は不要。実装時はサービス専用保管領域と所有者条件／RLSで分離し、認証済み本人に接続状態とラベル名等の最小表示だけを返す。暗号文・cursorもクライアントに返さない。

トークン暗号化の実装・鍵の作成は次段階。設計上は認証付き暗号と管理された鍵を用い、本人ID・接続IDを暗号の関連データに結び付ける。鍵はDB・ソースコードと別管理し、バージョンでローテーション可能にする。アクセストークンもログ・ブラウザ保存を避ける。今回、実トークン取得も秘密鍵追加も行わない。

UIは解析成功・選択・クリア・欄を閉じる・アンマウントで入力／結果を破棄する。失敗時は修正用にメモリ内だけ残し、本人が消去できる。クリア／閉じる際に通信を中断し、遅れて届く応答が結果を復活させない。localStorage／sessionStorage／URLクエリへコピーしない。JavaScriptの文字列を物理的にゼロ化する保証ではなく、参照を解放して保持しない設計である。

将来の切断はジョブ停止 → プロバイダー失効を試行 → ローカルトークン・cursor削除。失効先の障害時もローカルで接続を利用不能にし、本人にGoogle側でのアクセス取消方法を案内する。退会でも接続情報を削除する。確定済み候補は切断だけでは消さず、本人が削除を選べるようにする。

## 4. 将来のGmailアダプター境界

`ListingEmailReader`は本人IDと`ListingEmailReadWindow`を受け、メモリ上のraw MIMEと次cursorを返す契約。後続単位としてテスト注入専用の`FakeListingEmailReader`を追加した（§8）。本番アダプター・APIへのDI登録・実Gmail呼出箇所はない。

実装時の必須条件:

- 接続IDを本人ID付きで取得し、labelId／startedAtを保存済み設定と照合する。ブラウザから任意の検索式・開始日時・上限を直渡ししない。
- `maxMessages`を1〜20に検証し、1操作全体の上限とする。ページごとに上限をリセットしない。本文サイズ上限も取得前後で確認する。
- 指定ラベルと開始時点で検索し、取得した各メッセージのラベルとinternalDateも再確認する。メールのDateヘッダーを信頼しない。境界・タイムゾーン・後から付いたラベルをテストする。
- cursorは同じ接続・ラベル・開始時点に束縛する。有効期限切れでは開始時点を過去へ緩めず、同じ限定範囲から再開。初期版は本人操作の取得のみ。自動ポーリング／push購読は別の単位とする。
- 読込済みcursorの確定は解析成功後。本文や失敗メールを再試行キューに保存しない。再試行はID等の最小メタだけで回数制限し、本文に依存したログを作らない。
- 認可callbackにはstate・PKCE等の検証、認証ユーザーとの束縛、redirect URI固定を実装し、トークンをURL／フロントエンドへ露出しない。

## 5. 脅威モデル

| 脅威・境界                               | 対策                                                                                        | 検証／残件                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 不正URLからのSSRF・追跡・掲載取得        | ポータルへのfetch／HEAD／OGP／スクレイプ禁止。リンク・画像・favicon・短縮先も自動取得しない | 解析／APIテストでfetchゼロ。UIは内部preview APIの1回だけ              |
| メールHTMLのXSS・ビーコン                | parse5の非実行ツリー、hrefのみ、ReactでURLをテキスト表示                                    | script・img・comment・相対URL除外テスト                               |
| MIME爆弾・過大入力                       | 本文ストリーム／byte数／パート数／深さ／URL件数を制限、圧縮添付の展開なし                   | 不正MIME・上限テスト                                                  |
| 他人の接続・CSRF・匿名解析               | サーバー認証、同一オリジン、strict入力、本人レート                                          | 401／403／429テスト。実接続時は所有者照合テスト追加                   |
| 本文・PIIの漏えい                        | DB・ログ・キャッシュ・分析・AI・ストレージへ本文を書かない。固定エラーのみ                  | APIのDB引数・console・応答を検証。運用APM／プロキシ設定は公開前に確認 |
| 誤った住所・一括候補生成                 | URLのみ受渡し、本人の位置確認・明示保存を維持                                               | Phase 1連携テスト・既存回帰テスト                                     |
| 偽装メール・解除リンク・prompt injection | メール内容は信頼しない。既知解除構文を除外。命令として実行しない                            | 通常URLを本人が確認。未知構文は完全分類を保証しない                   |
| トークン／cursor漏えい・過大scope        | 候補と別管理、暗号化、非公開、切断・退会削除                                                | 今回は型のみ。実OAuth・暗号化・削除は次段階で検証                     |

方位・盤の計算にはJevを使わない。メール仕分けも今回Jev依存ゼロ。将来採用しても`LISTING_INGEST_JEV_ENABLED=false`を既定にし、別途本人同意を得た最小特徴のみを送る任意層とする。失敗／OFF時は決定的な抽出と本人確認へ戻り、メール全文・個人トークンURL・位置・生年月日を送信しない。

## 6. Restricted scopeと実Gmailに必要なユーザー／運用者作業

元設計および今回の依頼条件どおり、`gmail.readonly`をRestricted scopeとして扱う。metadataだけで本文中のURLを読めるとは扱わない。既存のGoogleログインをメール閲覧同意に流用しない。本書は最新の審査条件を確認した記録ではなく、公開前の再確認を必須とする設計である。

実接続へ進む前に行うこと:

1. 利用者: Gmail上で専用ラベルとフィルタを準備し、指定ラベル・開始時点・最大件数の意味を確認する。開発テストには自分の試験用メールを使う。
2. 運用者: Google Cloudプロジェクト・OAuthクライアント・対象ドメイン・redirect URI・テストユーザーを準備する。秘密情報はsecret manager等に保管し、リポジトリへコミットしない。
3. 運用者: Google公式のGmail scope分類、OAuth verification、該当するセキュリティ評価とデータ利用条件を確認し、必要な審査・評価を判断する。必要なプライバシー説明・削除／切断手順・同意画面を整備する。今回審査提出は行わない。
4. 運用者: インフラのリクエスト／レスポンス本文収集、APM、session replay、バックアップ／障害ダンプがメールを保持しないことを確認する。既存Phase 1流量テーブル・認証をステージングで準備し、今回の貼付経路も実ログで確認する。
5. 利用者: 実接続機能が別途実装・検証されてから、本人が読み取り専用アクセスに明示同意する。今回の無効ボタンから同意・トークン取得はできない。

## 7. 受け入れ条件と次の単位

今回の受け入れ条件:

- 4ポータルを含むHTTPS抽出・Phase 1正規化・重複除去ができる。解析・APIからポータル／Gmail／Jev通信が発生しない。
- HTML href以外、画像・添付、未対応MIMEを安全に扱い、全処理量に上限がある。
- 認証必須、同一オリジン、流量・本文上限、no-store、固定エラーが確認できる。本文はDB・ログ・応答に混入しない。
- URL選択が既存入力を更新し、住所確認を迂回せず、ジオコードや候補保存を起動しない。Phase 1回帰が通る。
- 関連ユニットテスト・型検査が成功する。実認証・実DB・実GmailのE2E完了と混同しない。

偽`ListingEmailReader`の取得範囲契約テストは§8で追加済み。次の単位は実認証＋ローカルDBの貼付プレビュー検証。その後に独立した実Gmail接続・暗号化ストア・切断実装を検討する。ポータルアクセスや掲載情報収集は追加しない。

検証結果は作業完了時に以下へ記録する。

### ローカル検証記録（2026-09-24）

- 関連21ファイル・216テスト成功。メール抽出・API・UI、Phase 1の候補CRUD／削除／位置確認、既存Spot／ジオコードへのURL不転送、方位・盤計算の回帰を含む。
- `npx tsc --noEmit`成功。変更したTypeScript／TSXのESLintはエラー・警告とも0。`git diff --check`成功。
- parse5 7.3.0を実行時依存に追加。既存lock内の同版を利用し、npm lockの依存区分を更新した。`npm ci --legacy-peer-deps --ignore-scripts`で復元、`prisma generate`で型生成を確認。DB変更はない。
- APIの認証・DBはモック、UIはjsdomによる検証。実ブラウザ＋Supabase＋PostgreSQL、インフラの本文非収集設定、本番build、実Gmail／OAuthは未検証。元設計§12の既存運用残件も引き継ぐ。

## 8. 偽Gmailアダプターの実装メモ（2026-09-24）

`src/lib/testing/fakeListingEmailReader.ts`の`FakeListingEmailReader`が既存の`ListingEmailReader`を実装する。テストはインターフェース型を介して取得・切断を呼ぶ。本番UI/APIには登録しない。DB・ファイル保存・Google／ポータル通信を行わず、入力は合成fixtureだけ。schema／migrationの追加・適用はない。本番接続ストアと暗号化処理の後続実装は§9〜10を参照。

### 取得範囲・所有者分離

- scopeは`https://www.googleapis.com/auth/gmail.readonly`の1件だけを許可する。未指定、短縮名、modify、追加scope、重複scopeはfixture生成時に拒否する。これは偽アダプターの契約検証であり、実トークンのgrantを検証したものではない。Restricted scopeの公開前確認は§6を引き継ぐ。
- 専用ラベルは接続メタに固定したuserラベル。systemラベルと不一致ラベルはfixture生成時に拒否する。ユーザーが専用ラベルへ振り分けたメールだけを対象とする設計であり、メール内容が本当に物件通知かは断定しない。
- 接続所有者を先に検証し、他人の接続と不存在はいずれも`NOT_FOUND`。cursorやメールを返さず、状態も変更しない。同一所有者の別接続にもcursorを持ち込めない。
- 読み取り要求のlabelId・startedAtは接続設定と一致必須。internalDateが開始時刻以上、かつ専用ラベルを持つものだけを抽出する。Dateヘッダーは使わない。開始時刻は絶対時刻で比較し、過去メールに後からラベルを付けても取得範囲を広げない。
- fixtureはコピーして保持し、呼出元の配列／オブジェクト変更で検証を迂回させない。`inspect`はテスト専用の所有者付きメタ確認機能で本文を返さない。APIへ公開しない。

### カーソル・ページング

- 1操作の上限は1〜20通。pageSize（既定5）は独立した1ページの大きさ。開始時点・専用ラベルで絞った結果をinternalDate→IDで安定順序にし、ページをまたいでも操作全体の上限を増やさない。
- cursorはランダムな不透明ID。メモリ内のcursorレコードに本人ID・接続ID・labelId・startedAt・全体上限・offset・有効期限を束縛する。本文やトークンをcursorへ埋め込まない。
- 既定有効期間5分。改ざん、期限切れ、別接続、上限変更、再使用を`INVALID_CURSOR`として拒否する。同じcursorの並行消費は1件だけ成功する（偽実装内の同期した状態遷移）。本番の複数プロセス間排他を保証するものではない。
- `cursor=null`は本人による新しい操作として先頭から再開する。前のcursorを無効にする。完了時のnextCursorはnull。nullを自動的に次ページ扱いすると再読になるので、呼出側は完了として停止する必要がある。
- 期限切れ時の自動フォールバックはない。明示再開しても元のラベル・開始時点・全体上限を維持する。期限切れメタは再開／切断で削除し、接続あたり保持するcursorは最大1つ。
- 各ページのMIMEを既存の上限付き解析器で検証してからcursorを更新する。失敗時は固定`INVALID_MESSAGE`とし、元cursorを変更しない。テストでは次ページの失敗後もcursorが残ることを確認する。偽実装は既知の小さな合成fixtureを保持するだけであり、本番取得時のストリーム上限・プロバイダー側ページングを再現するものではない。

### 切断と非保存

切断は所有者付きで接続レコード全体（偽トークン・鍵バージョン・同期cursor）とそのcursorレコードを削除し、合成MIMEへのアダプター内参照も解放する。他人の接続／不存在／繰り返し切断は同じ成功応答で、他人の状態を変えない。切断後の読取と旧cursor使用は拒否する。呼出元が保持するfixture・過去の返却値の物理ゼロ化は保証しない。

偽トークンは`SYNTHETIC_TOKEN_NOT_ENCRYPTION`というテスト値で、暗号化機能や実アクセストークンではない。実トークン取得・失効通信はない。メール本文はメモリ上の合成fixture以外に保持せず、DB・ログ・ファイルへ出力しない。自動ジオコード、ListingCandidate保存、方位・盤の変更もない。

### 残件と次の単位

実認証＋ローカルPostgreSQLで、既存貼付プレビューの401／本人レート／no-store／本文非ログを検証する単位を推奨する。この段階では実Gmail・scope検証・暗号化ストア等は未実装だった。後続コードは§9〜10を参照し、実サービスでの検証とは区別する。偽アダプターの成功をこれらの検証完了とは扱わない。

### この単位の検証結果

- 新規22テスト成功。既存回帰と合わせて22ファイル・238テスト成功。テストのreadonly配列への代入を修正後、新規22テストを再実行して成功を確認。
- `npx tsc --noEmit`: 成功、型エラー0件。
- 変更したTS 3ファイルのESLint: 成功、エラー0・警告0。`git diff --check`: 成功。
- 実OAuth・Google／ポータル通信、DBスキーマ変更・migration適用、本番UI/APIへのfake登録は行っていない。

## 9. GmailListingEmailReader実装（2026-09-24）

§1〜8は各段階の記録。本単位では`src/lib/gmail/reader.ts`の`GmailListingEmailReader`を追加し、同じ`ListingEmailReader`契約を実装した。Google API呼出しを行えるコードは追加したが、実アカウントによる接続・トークン取得・稼働確認は行っていない。UIの接続ボタンは引き続き未接続。OAuthコード交換と接続レコード作成APIは§10で実装済み。

### 機能フラグとルート

`LISTING_EMAIL_GMAIL_ENABLED`が文字列`true`のときだけ有効。それ以外／未設定はOFF。以下のGmailルート（ラベルAPIは§10）はOFF時、認証・DB・Google通信より先に503／`GMAIL_DISABLED`を返す。アダプター自身もread／disconnectと通信直前に同じフラグを検証する。

| ルート（`/api/relocation/email/gmail/`配下） | 挙動                                                                                                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST connect`                               | 本人認証・同一オリジン・5回/分。state・nonceのハッシュを本人1件のDB行に保存。PKCE S256を含む認可URLと暗号化HttpOnly cookieを返す                                                                                                  |
| `GET callback`                               | 本人認証、固定redirect URIのorigin、state・HttpOnly cookieのnonce・10分期限を照合。DELETE条件で原子的に一度だけ消費。認可コードをPKCE verifier付きで交換し、scope検証後に暗号化接続を保存。コードを含まないローカルURLへ303で戻す |
| `POST read`                                  | 本人認証・同一オリジン・10回/分。接続ID・ラベル・開始時刻・全体上限・不透明cursorを検証し、アダプター結果からURLだけを返す。raw MIMEをHTTP応答に含めない                                                                          |
| `POST disconnect`                            | 本人認証・同一オリジン・10回/分。本人の接続だけ失効・削除する                                                                                                                                                                     |

応答は成功／失敗ともno-store・noindex。callbackはcookieを消去し`Referrer-Policy: no-referrer`を付ける。cookieは`__Host-`接頭辞・Secure・HttpOnly・SameSite=Lax・Path=/。コールバックは外部サイトからのトップレベル遷移を想定し、Origin必須にはせず本人・state・ブラウザnonceでCSRFを防ぐ。認可コードやエラー文字列を応答・ログに写さない。

既存の手動貼付`/api/relocation/email-preview`はGoogleを呼ばない独立機能なので、このGmailフラグでは無効にしない。方位・盤、位置確認、候補保存の経路は変更していない。

### 読み取り・refresh・cursor

- 通信先は固定した`gmail.googleapis.com/gmail/v1/users/me/…`と`oauth2.googleapis.com/token`・`/revoke`のみ。メールURL・redirect先へ通信しない。HTTP redirectはerror、キャッシュはno-store。テストは注入したfetchモックを使う。
- readのたびにrefresh tokenでアクセストークンを更新し、応答のscopeが`gmail.readonly`の完全なURI1件のみであることを確認する。scope省略・追加scope・異なるscopeは拒否する。アクセストークンはメモリのみ。自動再試行はしない。
- refresh tokenが更新された場合は再暗号化する。後続のページ処理が失敗しても更新されたrefresh tokenは保存し、既存cursorは維持する。DB保存自体が失敗した場合の再同意は運用残件。
- 専用ラベルをlabels.getで照合し、type=userを必須とする。messages.listにlabelIds・開始時刻の検索条件を固定する。検索境界を少し広く取り、各メッセージのinternalDateとlabelIdsを厳密に再確認する。
- 1ページ最大5件。メタデータだけを先に取得し、範囲外・過大メールではrawを取らない。必要フィールドのみを要求する。raw応答でもinternalDate／labelIdsを再確認し、既存MIME解析成功後にcursorを進める。添付専用APIは呼ばず、raw内の添付は既存解析器が無視する。
- HTTP応答はストリーム読込中に64KiBで中止、MIME上限12,000 bytes。1通信最大3秒、ページ操作全体20秒の予算。予算内に終わらないページは失敗としてcursorを進めない。
- GmailのpageTokenと既読ID（最大20件）を暗号化状態に保持し、ブラウザには別のランダムUUIDだけ返す。cursorは本人・接続（暗号AAD）・ラベル・開始時点・全体上限に束縛し、5分で失効。nullは明示した新規取得。完了時null、期限切れや無効pageToken時に自動で先頭へ戻らない。
- 本番版の全体上限は**最大20件の取得試行**。除外・重複も予算を消費し、空ページも1件分消費する。これにより範囲外・空ページが続いても無制限にGmailを走査しない。取得結果は20件より少ない場合がある。並び順はGmailのページ順であり、fakeの日時昇順と同一とは限らない。

API仕様の確認先: [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)、[messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)。トークン更新と失効は[Google OAuth Web Serverガイド](https://developers.google.com/identity/protocols/oauth2/web-server)を参照した。

### 暗号化・DB・切断

`security.ts`はAES-256-GCM、ランダム12-byte IV、認証タグを使う。ownerId・connectionId・keyIdをAADに含め、別所有者／別接続への暗号文の差替えを拒否する。refresh token・scope・cursor（provider pageTokenを含む）をまとめて暗号化し、DBには`sealedState`として保存する。平文本文・HTML・画像・添付・URLプレビューを保存する列はない。テストキーはテスト中に作る合成値のみ。

`store.ts`は本人ID＋接続ID条件で行を`FOR UPDATE`ロックし、read／disconnectをトランザクションで直列化する。DBへの書込みは暗号文更新または本人行削除だけ。トランザクションは最大30秒、ロック待ちは最大5秒。本番運用時にはプール消費・DBロック待ちを計測する。実PostgreSQLでの同時実行テストは未実施。

disconnectはrefresh tokenのrevokeを試行し、その成功／失敗にかかわらず接続行（トークン・cursor）をローカル削除する。revoke失敗は削除コミット後に`GMAIL_REVOKE_FAILED_LOCAL_DELETED`を返す。この場合はGoogleアカウント側でもアクセス取消が必要。ローカル削除失敗は`GMAIL_DELETE_FAILED`として区別する。他人の接続／不存在／繰り返し切断は状態を変更せず同じ成功とする。

Prismaモデル`ListingEmailConnection`と`ListingEmailOAuthState`、migration `20260924000000_listing_email_connections`を追加した。接続メタとOAuth一時stateを候補から分離し、RLS有効化・PUBLIC/anon/authenticatedの直接アクセス剥奪、存在する場合のauth.users外部キー／ON DELETE CASCADEをSQLに含む。**migrationは適用していない。migrate deploy／db pushも実行していない。** 既存migrationのbaselineと実DB権限を確認してから運用者が適用する。auth.usersがない環境の所有者削除連動は別途必要。OAuth一時行は本人の次のconnectで置換され、期限切れで拒否するが、定期掃除ジョブは未追加。

### 必須envとRestricted scope

| env                                  | 用途／設定                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `LISTING_EMAIL_GMAIL_ENABLED`        | 既定OFF。明示`true`でのみ有効                                                                                |
| `LISTING_EMAIL_GOOGLE_CLIENT_ID`     | このメール接続専用のGoogle OAuth client ID                                                                   |
| `LISTING_EMAIL_GOOGLE_CLIENT_SECRET` | サーバー専用client secret。Secret Manager等に保管                                                            |
| `LISTING_EMAIL_GOOGLE_REDIRECT_URI`  | HTTPSの固定URL。pathは`/api/relocation/email/gmail/callback`、クエリ／fragmentなし。Google登録値と一致させる |
| `LISTING_EMAIL_ENCRYPTION_KEY`       | 暗号学的乱数32-byte鍵の標準base64（44文字）。コード／DB／ログへ置かない                                      |
| `LISTING_EMAIL_ENCRYPTION_KEY_ID`    | 鍵識別子（英数字・ハイフン・アンダースコア、1〜40文字）                                                      |

加えて既存のサーバー認証・`DATABASE_URL`が必要。`NEXT_PUBLIC_`変数へ秘密を置かない。現在の暗号化コードは1世代の鍵だけを読むため、鍵の単純差替えは既存接続を読めなくする。複数鍵による復号／再暗号化の移行手順を準備してからローテーションする。

`gmail.readonly`はRestricted scopeで、公開前にOAuth審査が必要になる。Restrictedデータをサーバーで扱う構成ではセキュリティ評価要件も確認する。scopeをラベル単位に狭めたと説明してはいけない。[Google公式scope分類・検証要件](https://developers.google.com/workspace/gmail/api/auth/scopes)を確認し、適用される例外・データ利用条件・評価範囲は運用者が判断する。今回、同意画面公開・審査提出・実トークン取得は行っていない。

### 未解決事項と次の単位

OAuth connect/callback、PKCE、取得scopeの検証後の接続作成、本人によるラベル選択APIは§10で実装済み。UIとの接続および実認証・実DB検証が次の単位。

先にローカルPostgreSQL＋合成トークン＋Google通信モックで、migrationの権限／削除連動、並行read・disconnect、実認証付きのOFFガードとstate消費を検証することを推奨する。本番build、実Google、インフラのcallbackクエリ／HTTP本文の非収集設定、バックアップ保持・鍵ローテーションは未検証。実Gmailの動作確認済みとして有効化しない。

### 本単位の検証結果

- Gmailアダプター・ルート・ストアの新規26テスト成功。fake／Phase 1／Spot／ジオコード不転送／方位・盤の回帰を含め、25ファイル・264テスト成功。
- `npx tsc --noEmit`成功（型エラー0）。変更したTypeScript 11ファイルのESLint成功（エラー0・警告0）。`prisma validate`、`git diff --check`成功。
- 全Gmailテストで実fetchを拒否するモックを設定し、アダプターには専用モック通信を注入。実Gmail API・OAuth・revoke通信は実行していない。DBテストはSQL呼出しのモックであり、実DBロック・RLS・CASCADEの動作確認ではない。

## 10. PKCE付き実OAuth・本人ラベル選択（2026-09-24）

### OAuthフロー

`createGmailHandlers(fetch)`が全ルートの通信依存を受け取り、`GmailAccountService`と既存readerへ渡す。実行時の組立て境界だけがglobal fetchを注入する。`transport.ts`に既存の固定Googleエンドポイント・リダイレクト禁止・応答64KiB上限・タイムアウト・固定エラー化を共通化した。テストでは注入fetchをモックし、global fetchも拒否モックにして実Google通信がないことを検証する。

1. `POST connect`: 本人認証・同一オリジン・レート制限後、32-byte乱数のstate・ブラウザnonce・PKCE verifierを生成する。認可URLは`https://accounts.google.com/o/oauth2/v2/auth`固定、redirect URIは既存env固定。scopeは完全なgmail.readonly URI1件だけ。`response_type=code`、`code_challenge_method=S256`、SHA-256 challenge、`access_type=offline`、`prompt=consent`を指定する。任意redirect・追加scopeを入力として受けない。
2. stateとnonceのハッシュは従来の本人単位DB行に10分期限で保存する。state・nonce・verifier・期限はAES-GCMで暗号化したHttpOnly cookieへ保存し、ownerIdと固定用途`oauth-pending`をAADにする。verifierを認可URL・レスポンスJSON・DBへ平文で出さない。ここでのnonceはブラウザ結合用であり、openid scope／ID tokenは要求しない。
3. `GET callback`: ログイン本人、固定origin、cookieの認証付き復号、state一致、期限を確認し、DBのstateHash＋browserHash＋本人条件のDELETEで一度だけ消費する。ユーザーを切り替えたcallback、偽造cookie、再使用、重複state、期限切れを拒否する。
4. codeが1件だけ存在し、プロバイダーerrorがない場合に限り、固定token endpointへPOSTする。固定client ID／secret／redirect URIにcodeとPKCE verifierを添える。scopeは欠落・短縮名・追加scope・空文字を拒否し、refresh tokenも必須。保存できないgrantは失効を試行し、固定エラーだけを返す。
5. scope検証後、既存のAES-GCM形式でrefresh token・scope・cursor=nullを暗号化して接続を作成する。access token・code・verifierは保存しない。`labelId=null`で開始し、メール取得は禁止する。成功時は`/relocation/arbitrage?emailConnection=<接続UUID>`へ303で戻す。アプリが生成するURL／レスポンス／ログに認可コードやトークンを出さず、cookieも消去する。

通常のOAuth codeフローではGoogleからの**入力callback URL**にcodeが届く。この受信クエリまで存在しないという意味ではない。アプリはcodeを別URLへ転記せず、成功時にクエリを除去する。失敗応答も固定コード・no-store・no-referrerで、受信codeを反射しない。公開前にproxy／アクセスログ／APMのcallbackクエリ・本文収集を無効化する必要がある。実インフラの収集設定は未検証。

### 本人によるラベル選択API

| エンドポイント                                               | 入力・出力と条件                                                                                                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/relocation/email/gmail/labels?connectionId=<UUID>` | 認証必須、本人10回/分。接続を本人条件＋行ロックで解決し、refresh後にlabels.listを呼ぶ。type=userだけを`{labels:[{id,name}]}`で返す。件数・system label・トークンは返さない                                           |
| `POST /api/relocation/email/gmail/select-label`              | `{connectionId,labelId}`だけを受ける。本人認証・同一オリジン・10回/分。labels.getでIDとtype=userを再検証し、labelIdとサーバー側の現在日時を保存。cursorを破棄し、`{selected:{connectionId,labelId,startedAt}}`を返す |

他人の接続はGoogle通信前に拒否する。ラベル名はDBへ保存しない。クライアント指定のstartedAtや追加キーを拒否し、過去に遡る入力を許さない。ラベルの再選択もその時点の現在日時で再開し、古いページcursorを無効にする。選択・refresh・read・disconnectは既存の本人付き行ロックを共有する。refresh tokenが更新された場合は一覧・選択処理の失敗時にも暗号化して保持する。

接続直後のstartedAtは接続作成時刻だが、labelId未選択の間はreaderが拒否する。本人による選択完了時にstartedAtを再設定する。自動ジオコード、ListingCandidateの一括保存、メール本文の永続保存、ポータルアクセスは追加していない。既存UIの接続ボタンはまだ無効で、上記APIを操作するUIは次の単位で接続する。

### スキーマ・機能フラグ

新migration `20260924010000_listing_email_label_selection`は接続のlabelIdをnullableにする変更だけ。既存migrationは変更せず、**両migrationとも未適用。migrate deploy／db pushは実行していない。** PKCEデータは暗号化cookieに置くのでOAuth一時state表への列追加はない。

`LISTING_EMAIL_GMAIL_ENABLED`は既定OFF。connect／callback／read／disconnect／labels／select-labelの6ルートすべてで、OFF時は認証・DB・通信前にdisabledとなる。必須envは§9の6項目から増やしていない。実Googleの認可画面を開いたり、本物のトークンを取得したりする作業は本単位で行わない。

### Testingモードでの個人利用と公開前の条件

個人の開発試験では、OAuth同意画面を**Testing**にし、オーナー本人をテストユーザーとして登録する運用を前提とする。この限定された試験段階では公開向けRestricted scope検証を完了せずに試せるが、一般公開の免除ではない。gmail.readonlyを含むTestingのrefresh tokenは**7日で失効**するため、失効後は本人が再同意する。再試行を無制限に続けず、既存の接続を切断して再接続する。

本番公開にはOAuth **verification＋security assessment**を前提に準備し、適用要件・例外・Google API Services User Data Policyを運用者が確認する。今回の実装完了は審査・評価の完了を意味しない。参照先は[Google OAuth Web Serverガイド](https://developers.google.com/identity/protocols/oauth2/web-server)、[Gmail scope分類](https://developers.google.com/workspace/gmail/api/auth/scopes)。この単位では実Googleネットワーク禁止のため、公式サイトへの追加アクセスも行っていない。公開前に最新条件を再確認する。

### 未解決事項と次の単位

次は実Googleを使わず、ラベル選択UIとAPIを接続し、ローカルPostgreSQL＋合成トークンでcallback stateの並行消費、行ロック・RLS・削除連動を検証する。実Google認可、DB migration適用、実認証E2E、本番build、鍵ローテーション、アクセスログ非収集設定は未検証。個人Testing用のGoogleプロジェクト設定・テストユーザー登録・実同意も未実施である。

### この単位の検証結果

- Gmail関連4ファイル・44テスト成功。既存fake／Phase 1／Spot／ジオコード／方位・盤の回帰を含む合計26ファイル・282テスト成功。最後のテスト型・SQL引数確認の修正後、該当2ファイル・14テストを再確認して成功。
- `npx tsc --noEmit`: 型エラー0。変更したTypeScript 10ファイルのESLint: エラー0・警告0。`prisma validate`、`git diff --check`成功。
- Google通信はすべてモック。OAuth状態照合・ストアはDB呼出しモックであり、実Google／実DBの動作確認ではない。migration適用・実同意・秘密設定の作成は行っていない。
