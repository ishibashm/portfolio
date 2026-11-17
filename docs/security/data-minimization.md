# Personal-data minimization proposal — 2026-10-31

This is a proposal, not authorization to delete data or change retention. No production records were inspected. Inventory comes from `prisma/schema.prisma` and application code.

| Data                                                                   | Storage and current readers                                                                                                                                                                                       | Proposed reduction                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Birth date/time, birthplace, residence coordinates, companion profiles | `user_configs` columns and `presets` JSON; `src/lib/userConfig.ts`, `src/app/api/profile-presets/route.ts`: verified owner; personal MCP additionally requires a grant and allowed profile IDs (`mcpProfiles.ts`) | Keep anonymous calculations on device. Offer explicit per-profile cloud opt-in; retain date-only input if time is unknown; never infer a birth time/place or persist display defaults. Store exact coordinates only when the calculation needs them; offer coarse locations for discovery. |
| Conversations, consultation notes, third-party names                   | `user_configs.ask_data`, browser storage (`src/lib/askData.ts`); owner APIs and explicitly selected model context                                                                                                 | Separate “use for this calculation” from “save”; default to session storage for unsaved conversations, with a clear persistence choice. Propose 90-day inactivity expiry with advance notice and export. Do not silently change existing saves.                                            |
| Health-like baselines                                                  | `user_configs.baseline_hrv_*`, `baseline_gsr_*`; owner settings API                                                                                                                                               | Confirm active product need; stop accepting new values and offer deletion if unused. No inferred health conclusions or analytics export.                                                                                                                                                   |
| Places, journeys, property candidates, email connections               | `user_spots`, `RelocationHistory`, `RelocationSimulation`, `listing_candidates`, `listing_email_*`; owner APIs (legacy history is admin-only), encrypted Gmail token state                                        | Keep provider message bodies transient; retain only chosen candidates. Review journey retention, third-party notes and disconnected token removal.                                                                                                                                         |
| Birth-derived results, reminders, private memory                       | `saved_analyses`, `favorite_days`, `reminders`, `notification_consents`, encrypted `MemoryEntry`                                                                                                                  | Treat derived results as personal data too. Keep only user-requested saves; expire operational reminder state after an agreed period, retaining consent proof only as required.                                                                                                            |
| Contact details and inquiries                                          | `contact_messages`; server/admin DB access; POST returns only success                                                                                                                                             | Propose resolution + 90 days, with a documented exception for disputes. Remove user-agent collection unless there is a specific operational need. No contact text in logs.                                                                                                                 |
| Credentials and protocol state                                         | legacy `Account`/`Session`, encrypted Gmail/MCP state, `encrypted_gemini_key`                                                                                                                                     | Confirm whether legacy auth rows and stored user API keys remain necessary; remove only after owner review. Revoke expired grants and purge expired state. Encryption keys must remain outside DB backups.                                                                                 |
| Analytics and security identifiers                                     | `page_views`, `api_usage`, MCP audit/rate/lease and voice tables                                                                                                                                                  | Daily IP+UA hashes are pseudonymous, not anonymous; an unsalted hash can be guessed. Prefer aggregate counts and short raw retention. Evaluate keyed, rotating identifiers separately without exposing or inventing credentials in this branch.                                            |

Browser persistence is also personal-data storage: `src/lib/userSettings.ts`, `src/lib/accountData.ts`, `src/lib/profileConfig.ts`, and screen-specific storage keys retain copies. Same-origin scripts and anyone using the same browser profile can read them. Audit the full “delete my data” flow, including local-only spots/favorites explicitly excluded by `accountData.ts`, server legacy journeys, provider revocation, backups and exports. Existing deletion tests cover important subsets, not every historical copy.

RLS is defense in depth, not protection from a trusted DB owner or service role. The new SQL denies browser database roles entirely because the application uses server APIs. Operators and backups still have access. Verify owner-scoped queries on every new API; never accept a client-supplied owner ID as authority.

Public MCP calculations accept explicit user inputs and do not need site login. Those inputs must not enter logs. Personal MCP enforces token scope, grant ownership and profile allowlists; preserve its privacy guards. External AI/voice processing needs an accurate disclosure of which selected inputs leave the site, with default-deny paid features preserved.

Implementation order for the owner: approve a retention schedule and consent UX; identify legacy data with aggregate-only queries; implement export/deletion and expiration jobs with dry runs; test two-account isolation; then authorize deletion. Backups and downstream provider retention need separate handling. Historical public Git copies cannot be recalled by deleting current files; the existing `personalDataLeak.test.ts` documents that limitation without reproducing personal values here.

## 2026-11-17 実施分

この変更はソースとモックによる検証のみ。実 DB への接続、DDL の適用、既存データの削除は行っていない。

1. **生年月日・時刻・出生地・現住地・同行者の控え**: 既定は既存の localStorage にだけ保存する。`user_configs.personal_cloud_opt_in`（BOOLEAN NOT NULL DEFAULT false）を追加し、user-config の POST/PUT/PATCH は保存済み同意または同じ要求の明示的な true がある場合だけ個人情報を受ける。同じ要求の false を優先し、オフにしても既存値は消さない。無視した欄は `ignored_personal_fields` に返す。profile-presets POST は同意なしなら 403 / `PERSONAL_CLOUD_OPT_IN_REQUIRED`。所有者の GET と個人 MCP の読み方は維持する。時刻は従来の birth_date 内に保持され、独立した birth_time 列や新しい保存経路は作っていない。presets の書き込みは専用 API のまま。
2. **HRV/GSR**: PersonalProfileConfig は props の宣言のみで入力 UI はない。SolarTimeClock の 38 / 6.5 / 4.5 / 1.5 の初期値、既存値の読み込み、calculateBioMetrics の計算は維持し、4つの baseline\__ 列への新規入力とクライアント送信を止めた。raw hrv/gsr は元から API の許可リスト外で metaphysical_config にも保存されていなかったが、送信も外した。列と既存値は残す。控え JSON の baselineHrv_ / baselineGsr\* も新規送信・受付を止め、同じ id の控えに既存値がある場合だけ従来値を保持する。読み込みと端末の計算は変えない。
3. **問い合わせ**: 新規 user_agent の記録を止め、列は残した。nullable の `contact_messages.resolved_at`（TIMESTAMPTZ）を追加。handled を更新する管理 API/UI/スクリプトはリポジトリ内に見つからなかった。今後処理済みにする経路を作る際は true と同時に解決日時、false と同時に NULL を書く必要がある。解決から90日経過（境界を含む）かつ handled=true の行だけが清掃候補。解決日不明の処理済み行は件数のみ報告し、推測で消さない。
4. **会話**: 新規会話は sessionStorage のみ。既存 ask 画面のチェックで保存を選ぶと localStorage とログイン中の ask_data へ保存する。既存 localStorage・旧形式・サーバー保存は同意済みとして引き続き読み、明示的なオフは尊重する。オフは既存の写しの削除ではなく、その後の永続書き込みの停止。保存先の選択は画面のワークスペース（会話・相談メモ・人物全体）に適用される。「結果を保存する」からのログイン引継ぎも明示的な保存として扱う。API の POST は `persist:true` 必須（なければ400 / `ASK_DATA_PERSIST_REQUIRED`）。nullable の `user_configs.ask_data_last_used_at`（TIMESTAMPTZ）を追加し、所有者による ask-data GET（書き出しを含む）/POST で更新する。従来の設定更新日時は進めない。最終利用から90日、14日前から notice、期限時刻以後は expired。GET は読込直前の期限情報を返すので、久しぶりに開いたときの案内を表示できる。最終利用日不明の既存行は自動清掃せず、所有者が読むとその時点から計時する。notice の場合だけ既存画面に期限と `/api/ask-data?format=export` のリンクを表示する。書き出しは同じ所有者認証、JSON attachment、no-store。ブラウザの保存済み写しはサーバー清掃では消えない。

SQL は **`prisma/sql/20261117_data_minimization.sql` 1本のみ（未適用）**。すべて ADD COLUMN IF NOT EXISTS の追加変更で、削除・バックフィルはない。schema.prisma と対応している。デプロイ時は所有者が先に SQL を確認・適用する必要がある。

書き込みの検索では user-config、profile-presets、ask-data と、userConfig.ts の旧所有者行の user_id 紐付けだけが見つかった。account/data の処理はこれらのクライアント経路を使い、relocation（wealth/simulator）と設定バーの直接 POST にも共通フィルタを入れた。SolarTimeClock の保存は userSettings、同行者は profilePresetSync で同意を確認してから送る。明示的なリクエスト入力で行う計算と MCP の既存保存の読み込みは変えていない。

保持期限処理は **未スケジュール・既定無効**。次は所有者が適用後の対象環境で手動実行するための手順であり、この作業では実行していない。

```sh
# 既定は候補件数・日時不明件数の確認だけ
node scripts/retention/contact-retention.mjs
node scripts/retention/ask-data-retention.mjs
# 実削除/NULL化には環境変数と --apply の両方が必要
CONTACT_RETENTION_ENABLED=true node scripts/retention/contact-retention.mjs --apply
ASK_DATA_RETENTION_ENABLED=true node scripts/retention/ask-data-retention.mjs --apply
```

関数 `runContactRetention` / `runAskDataRetention` も dryRun=true が既定。環境変数だけ、または dryRun:false だけでは消さない。ask の清掃は日時がある期限切れ行の ask_data だけを SQL NULL にし、他のプロフィール列・日時不明行を触らない。問い合わせの紛争時の例外・対象除外ルールは未実装のため、運用判断前に清掃を有効にしない。

所有者の判断として残るもの:

- 既存の出生情報・控えを保持するか、個別削除するか、利用者へ確認するか。既存 baseline\_\* の削除・必要性も同様。
- 清掃の有効化と頻度、解決日時の記録経路、紛争等の保持例外、日時不明行の扱い。
- 期限前のメール等の通知経路は未実装（コードに TODO）。現状はアプリ内の notice だけであり、通知を見ないまま期限を迎えることがある。清掃の有効化前に決める。
- 日本語の同意文言と保存範囲の最終確認。新しいクライアントコンポーネント・スクリプト・追加バンドルの入口は作らず、既存 ProfileForm と McpExplorer にチェックと文言を足した。既存クライアント JS はその分だけ増えるという方針上の折り合い。
- ブラウザの永続保存・バックアップ・外部サービスの保持は、このサーバー清掃と別に扱う。

検証記録（2026-11-17）: 関連 Vitest は65ファイル・576件成功。保持期限処理は Prisma をモックし、CLI の読み込みだけもダミー接続先で確認（清掃関数は未実行）。npm run lint はエラー0・警告67件で、作業前の67件から増加なし。警告ゲートのスクリプトは別 worktree を作るため、この作業の禁止事項に従い実行せず、同一環境の変更前後の ESLint JSON を全ファイル・規則別に比較して増加なしを確認した。

指定の通常ビルドは、この環境で Next の TypeScript 子プロセスの出力を取得できず停止した。同一プロセスで設定読込・webpack を実行すると Google Fonts の DNS 解決で停止したため、`/tmp` の検証専用プリロードで TypeScript API / webpack 同一プロセス実行を選び、Next の検証用フォント応答を使ったオフラインビルドを実施し、827ページ生成まで成功した。リポジトリの next.config や依存・フォント設定は変更していない。これは通常環境でのビルド成功やフォント配信の検証を意味しない。通常環境での再実行は残る。ビルドで生成された型の検査に合わせ、ask-data GET の Request と既存 /houi/today の props を必須引数に揃えた（直接呼ぶテストは空の props を渡す）。暦の判定・数値・描画内容は変えていない。
