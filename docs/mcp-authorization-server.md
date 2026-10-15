# MCP個人用の認可サーバー選定

調査: 2026-10-11。DESIGN.md PR 7。**実接続・本番設定・契約は未実施。個人用入口は未提供。**

## 決定

`oidc-provider` **9.12.2を固定**して採用する。MITのセルフホストライブラリなので、実装・ローカル検証に新しい外部アカウントや有料契約は不要。プロトコル処理は同ライブラリに任せ、Supabaseは従来どおりサイトの本人確認だけに使う。

既存Supabase OAuth Serverは今回採用しない。公式の[OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)が独自scope未対応と明記しており、承認済みの `read:profiles` を標準scopeに置き換えることはしない。将来対応しても再評価を別変更とする。

## 適合性と実装契約

[公式機能一覧](https://github.com/panva/node-oidc-provider/tree/v9.12.2)にPKCE・resource indicators・discovery・DCR・introspection・revocationがある。[設定API](https://github.com/panva/node-oidc-provider/blob/v9.12.2/docs/README.md)を以下の構成に絞る。対応機能の存在は、このサイトでの結合検証完了を意味しない。

| 要件                        | 採用する方法 / 後続の検証                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| コード＋PKCE                | codeのみ、全clientでPKCE必須。配布コードのPKCEはS256のみ。PR 13で欠如・不一致・コード再使用を検査                                                                                      |
| resource / audience / scope | `resourceIndicators.getResourceServerInfo`で正規MCP URIのみ許可し、audienceを同じURI、scopeを `read:profiles` に固定。異なるresourceを拒否                                             |
| 期限・更新                  | access 600秒、refreshは接続時から最大30日。常にrotationし、再使用時はgrant全体を失効。更新のたびに30日延長しない                                                                       |
| 本人確認・同意              | `interactionDetails` / `interactionFinished` をサイトの検証済みSupabaseログインと接続。subjectはUUID。CSRFとinteraction cookie照合後にプロフィールを選択。Supabase tokenはAIへ渡さない |
| 即時解除                    | providerのgrant/token状態とアプリの許可ID集合を分離。全MCP要求でアプリgrantを再確認。アプリ側を先に失効し、provider側失効失敗中も読取不可                                              |
| discovery                   | ASはOIDC discovery、MCP側はRFC 9728 metadataと401 challenge。広告URLは実配置後に一致検証                                                                                               |
| client登録                  | 最初は事前登録。DCRは濫用制限後。CIMDは実験機能で、SSRF・DNS・redirect・容量・時間制限の検証後にのみ有効化。未実装を広告しない                                                         |

[refresh実装](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/actions/grants/refresh_token.js)は消費済みtokenの再使用で関連grantを失効する。並行交換の安全性には、こちらの永続adapterの原子的consumeも必要。単なるメモリMapやupsertだけでは本番条件を満たさない。

[MCP認可仕様](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)に合わせ、resourceへの束縛とscopeをRS側でも検査する。Cookie、開発ログイン、無効Bearerから公開ツールへの降格は使わない。

## 配置・状態の責任分担

配布物の `lib/index.js` は**Node 22 LTS以降**を要求する。現在のDockerfile・CI・作業環境はNode 20なので、そのまま本番起動してはいけない。PR 8は未接続の最小構成と依存導入までとし、Node 22でローカル検証する。サイト全体のruntime更新は混ぜない。ASを同一originの `/oauth` 配下へNode HTTP handlerとして配置する構想とし、Next App RouterのWeb Requestへ無理に変換しない。配置確定・対応runtime・TLS/proxy/cookie・鍵管理は公開前のゲート。

- providerが所有するもの: code、token、session、interaction、protocol grant、client。永続adapterを用意し、トークンを独自実装しない。
- アプリが所有するもの: provider grant IDとの参照、Supabase user ID、許可プロフィールID集合、期限・失効、最小監査、共有レート制限。PR 9で追加専用DDLを用意する。
- token / code / cookie / birth / coordinates / profile名を監査や生例外ログへ保存しない。providerのデバッグ出力・エラーイベントも検査対象。
- 開発用自動鍵・メモリadapter・devInteractionsで本番稼働させない。[公式security policy](https://github.com/panva/node-oidc-provider/blob/v9.12.2/SECURITY.md)も保存adapterと鍵管理を利用側の責任としている。

## 未完了の検証・オーナー側の作業

実装の選定自体に追加判断は不要。外部契約は作らない。公開には対応runtimeでのAS配置、実署名鍵とcookie鍵の管理、既存ログインの設定確認、共有DB適用、ログ設定確認が必要だが、今回は禁止されているので実行しない。PR 20のChatGPT・Claude・Cursorでの実接続には各クライアントを使える環境も必要。

PR 12〜13で架空ユーザー・一時鍵を使ったローカルflow、PR 20で実クライアントflowを検証する。事前登録で通ってもCIMD/DCRの公開適合を完了扱いにしない。これらが揃うまで個人用入口を有効にしない。
