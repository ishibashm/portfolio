# 2026-11-15 #1851 マージと agent_usage_daily の RLS 有効化

確認時刻: 2026-11-15 16:55 JST。本人確認（「はい」）のうえで実施。秘密の値は書いていない。

## #1851 のマージとデプロイ

- squash merge SHA: `1f49a019cc024f24c85a0557e503adff31e4db7a`
- マージ時刻: 2026-11-15 16:49:40 JST
- deploy.yml run `43691673521`: success（開始 16:49:43 JST、完了 16:55:11 JST）
- 直近の成功デプロイはこの SHA

## 本番確認（HTTPS の生 HTML）

- `/` 200。「しるべに案内してもらう」あり、`/annai` と `/mcp` へのリンクあり。「エージェントに案内してもらう」はなし。
- `/ask` 200。AI 停止の案内と `/annai` へのリンクあり。
- `/privacy` 200。外部の生成AIへ送っていないこと、再開時は事前にこのページで知らせる旨に更新済み。
- `/annai` 200。
- `POST /api/mcp` の `tools/list` は 200。道具は 18 個。

## public.agent_usage_daily の RLS（Blog, ref ymqiqscelqqkozqwoiko）

マイグレーション名: `enable_rls_agent_usage_daily`。実施した SQL は次のみ。行の削除・更新はしていない。

`ALTER TABLE public.agent_usage_daily ENABLE ROW LEVEL SECURITY;`

### 変更前

- 表は存在。RLS 無効（forced でもない）。行数 0。ポリシーなし。
- 所有者は `postgres`（`BYPASSRLS` あり）。GRANT は `postgres` のみ。`anon` / `authenticated` / `service_role` に表権限はなかった。
- get_advisors（security）には、この表の「RLS 無効」指摘は出ていなかった。

### コード経路

読み書きは `src/lib/agentEntitlement.ts` の `DbUsageLedger` のみ。`src/lib/prisma.ts` 経由で `DATABASE_URL` の直接接続（`pg` Pool）。anon キーや authenticated ロールは使っていない。supabase-js の `createClient()` は他機能用で、この表には触れていない。

接続ロールは表の所有者 `postgres`（`BYPASSRLS` あり）と判断したため、ポリシーなしで RLS を有効化した。アプリの動きは変わらない。

### 変更後

- RLS 有効。forced ではない。行数 0 のまま。ポリシーはまだなし（有効化のみ承認されていたため、ポリシーは足していない）。
- get_advisors（security）: 「RLS 無効」の指摘はこの表には出ない。INFO の「RLS Enabled No Policy」に `public.agent_usage_daily` が追加され、件数は 34 から 35 になった。他の本番表と同じ状態。ポリシーを足す場合は別途確認が必要。
- サイトと公開 MCP（18 道具）は動作を確認済み。
