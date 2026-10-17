import type { McpConsentView } from "@/lib/mcpConsent";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

export const MCP_CONSENT_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

/** Node AS interaction document. No scripts, trackers, external assets or hydration. */
export function renderMcpConsentPage(view: McpConsentView, ticket: string) {
  const profiles = view.profiles
    .map(
      (p, index) =>
        `<li><label for="profile-${index}"><input type="checkbox" id="profile-${index}" name="profileIds" value="${escapeHtml(p.id)}"> ${escapeHtml(p.name)} <small>（ID: ${escapeHtml(p.id)}）</small></label></li>`,
    )
    .join("\n");
  // No default selection, including when exactly one profile is available.
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>AIへの読み取り許可 — Cloud Palette</title></head>
<body><main><h1>AIへの読み取り許可</h1>
<p>接続先: <strong>${escapeHtml(view.clientName)}</strong></p>
<p>クライアントID: ${escapeHtml(view.clientId)}</p>
<p>戻り先: ${escapeHtml(view.redirectUri)}</p>
<p>権限 read:profiles: 選択したクラウド保存プロフィールの名前・設定・計算結果を、この接続先のAIへ送信します。AIが入力値の返却を明示的に要求すると、生年月日と出発地の座標も渡ります。AIの会話側に情報が残る場合があります。</p>
<p>この接続で選択したプロフィールだけを許可します。後で作ったプロフィールは自動で共有されません。端末内だけのプロフィールや未同期の設定は使えません。</p>
<p>接続の有効期間は最大30日です。接続管理から解除できます。通常のログアウトは接続解除ではありません。解除しても、既にAIに渡った情報は回収できません。</p>
<form method="post" action="/oauth/interaction/${escapeHtml(view.uid)}">
<input type="hidden" name="ticket" value="${escapeHtml(ticket)}">
<fieldset><legend>読み取りを許可するプロフィール（選択必須）</legend>
${profiles ? `<ul>${profiles}</ul>` : "<p>クラウドに保存されたプロフィールがありません。元の端末でログインとクラウド保存を確認してから、接続をやり直してください。</p>"}
</fieldset>
${
  view.memoryScopes?.length
    ? `<fieldset><legend>記憶への追加権限（任意・接続ごと）</legend>
<p>今後保存する記憶も対象です。読み取りで本文がAIへ渡り、会話に残り得ます。書き込みで作成・更新・削除が可能になります。書き込みは読み取りを含みません。</p>
${view.memoryScopes.map((scope) => `<label><input type="checkbox" name="memoryScopes" value="${escapeHtml(scope)}">${scope === "read:memory" ? "記憶を読む" : "記憶を作成・変更・削除する"}</label>`).join("\n")}</fieldset>`
    : ""
}
<button type="submit" name="decision" value="allow"${profiles ? "" : " disabled"}>選択したプロフィールを許可する</button>
<button type="submit" name="decision" value="deny">許可しない</button>
</form></main></body></html>`;
}
