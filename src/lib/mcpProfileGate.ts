/**
 * 保存済みプロフィール用 MCP（/api/mcp/profile と保護リソースのメタデータ）の公開スイッチ。
 * 本番で DDL 適用・鍵設定・OAuth サービス配備・実接続試験が済むまでは未設定のままにし、
 * 入口を 404 で閉じて WWW-Authenticate やメタデータでも存在を広告しない。
 * 明示的に "1" のときだけ開く（"true" などの曖昧な値では開かない）。
 */
export function profileMcpEnabled(): boolean {
  return process.env.MCP_PROFILE_ENABLED === "1";
}

export function profileMcpNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
