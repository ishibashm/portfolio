import type { Metadata } from "next";
import Link from "next/link";
import {
  MCP_PUBLIC_FALLBACK_LIMIT,
  MCP_PUBLIC_FALLBACK_WINDOW_MS,
  MCP_PUBLIC_GLOBAL_BURST,
  MCP_PUBLIC_GLOBAL_HOURLY_LIMIT,
  MCP_PUBLIC_IP_BURST,
  MCP_PUBLIC_IP_HOURLY_LIMIT,
  MCP_PUBLIC_MAX_TOOL_BUCKETS,
  MCP_PUBLIC_SESSION_BURST,
  MCP_PUBLIC_SESSION_HOURLY_LIMIT,
  MCP_PUBLIC_TOOL_BURST,
  MCP_PUBLIC_TOOL_HOURLY_LIMIT,
} from "@/lib/mcpPublicLimit";
import { loadMcpToolCatalog } from "@/lib/mcpToolCatalog";
import { pageOpenGraph } from "@/lib/siteUrl";

/*
  ルーティング確認メモ:
  next.config.ts および src/middleware.ts を確認し、/mcp を別の場所へ転送・リライトする設定や
  アクセスを遮断する設定が存在しないことを検証済み（設定変更なし）。
*/

export const revalidate = 86400;

const PAGE_TITLE = "MCPで使う｜AIアシスタントから方位と暦の計算を呼ぶ";
const PAGE_DESCRIPTION =
  "cloud-palette.com の公開MCP（https://cloud-palette.com/api/mcp）の案内ページです。方位・暦・市区町村・記事の計算を、Claude・ChatGPT・Cursor・xAI API などから認証なし・読み取り専用で呼び出せます。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/mcp" },
  openGraph: pageOpenGraph("/mcp", PAGE_TITLE, PAGE_DESCRIPTION),
};

const MCP_ENDPOINT_URL = "https://cloud-palette.com/api/mcp";

/** src/app/api/mcp/route.ts の readBoundedJson(request, 256 * 1024) に基づくリクエスト本文上限。 */
const MCP_REQUEST_BODY_LIMIT_KB = 256;
const MCP_REQUEST_BODY_LIMIT_BYTES = 256 * 1024;

const CURSOR_MCP_JSON_EXAMPLE = JSON.stringify(
  {
    mcpServers: {
      "cloud-palette": {
        url: MCP_ENDPOINT_URL,
      },
    },
  },
  null,
  2,
);

const XAI_API_EXAMPLE = JSON.stringify(
  {
    model: "（使う Grok のモデル名）",
    tools: [
      {
        type: "mcp",
        server_label: "cloud-palette",
        server_url: MCP_ENDPOINT_URL,
      },
    ],
  },
  null,
  2,
);

const CURL_LIST_TOOLS_EXAMPLE = `curl -X POST ${MCP_ENDPOINT_URL} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;

/** 3桁区切り。toLocaleString はサーバーのロケールに左右されるので使わない。 */
function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default async function McpGuidePage() {
  const catalog = await loadMcpToolCatalog();
  const fallbackWindowMinutes = Math.round(
    MCP_PUBLIC_FALLBACK_WINDOW_MS / 60_000,
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <article className="mx-auto max-w-[1700px] px-5 py-12 space-y-10">
        <nav aria-label="パンくず" className="text-sm text-slate-600">
          <Link href="/" className="hover:underline">
            ホーム
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">MCPで使う</span>
        </nav>

        {/* 冒頭 */}
        <header className="space-y-4">
          <h1 className="text-2xl font-bold font-serif sm:text-3xl">
            MCPで使う｜AIアシスタントから方位と暦の計算を呼ぶ
          </h1>
          <p className="text-sm leading-relaxed text-slate-700 max-w-4xl">
            このサイトの方位・暦・市区町村・記事の計算を、お手元のAIアシスタントやエディタからMCP（Model
            Context
            Protocol）の道具として直接呼び出せます。認証なし・読み取り専用で公開しています。
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <div className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm">
              <span className="text-xs font-bold text-slate-500 mr-2">
                公開MCP URL
              </span>
              <code className="font-mono font-semibold text-slate-900">
                {MCP_ENDPOINT_URL}
              </code>
            </div>
            <Link
              href="/annai"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              フォームで試す（案内役 /annai）
            </Link>
          </div>
        </header>

        {/* 道具の一覧 */}
        <section
          aria-labelledby="mcp-tools-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <div>
            <h2
              id="mcp-tools-heading"
              className="text-lg font-bold font-serif text-slate-900"
            >
              公開している道具の一覧（{catalog.tools.length}個）
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              MCPサーバー（<code>createMcpServer()</code>）に内部接続して{" "}
              <code>listTools()</code> で取得した一覧です。すべて読み取り専用（
              <code>readOnlyHint: true</code>）で動作します。
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-slate-700">
                  <th scope="col" className="py-2.5 pr-4">
                    道具名（name）
                  </th>
                  <th scope="col" className="py-2.5 pr-4">
                    表示名（title）
                  </th>
                  <th scope="col" className="py-2.5">
                    説明（description）
                  </th>
                </tr>
              </thead>
              <tbody>
                {catalog.tools.map((tool) => (
                  <tr
                    key={tool.name}
                    className="border-b border-slate-200 align-top"
                  >
                    <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {tool.name}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-800 whitespace-nowrap">
                      {tool.title || "-"}
                    </td>
                    <td className="py-2.5 text-slate-700 leading-relaxed">
                      {tool.description || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* つなぎ方 */}
        <section
          aria-labelledby="mcp-connect-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-6"
        >
          <div>
            <h2
              id="mcp-connect-heading"
              className="text-lg font-bold font-serif text-slate-900"
            >
              つなぎ方
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Streamable
              HTTP（POST、ステートレス、認証なし）で接続できます。手順の画面名やメニュー配置は各社の更新で変わることがあるため、最新の公式案内もあわせてお確かめください。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h3 className="text-base font-bold text-slate-900">Claude</h3>
              <p className="text-sm leading-relaxed text-slate-700">
                設定のコネクタ画面で「カスタムコネクタを追加」を選び、URL に{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  {MCP_ENDPOINT_URL}
                </code>{" "}
                を入力します（Anthropic
                のクラウドから接続されます）。認証設定は不要です。
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h3 className="text-base font-bold text-slate-900">ChatGPT</h3>
              <p className="text-sm leading-relaxed text-slate-700">
                開発者モードのカスタムMCPサーバー（コネクタ）追加画面で、URL に{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  {MCP_ENDPOINT_URL}
                </code>{" "}
                を入れ、認証なしを選択して登録します。
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                Cursor などのエディタ
              </h3>
              <p className="text-sm leading-relaxed text-slate-700">
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  mcp.json
                </code>{" "}
                に次の設定を追加します。
              </p>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 font-mono">
                <code>{CURSOR_MCP_JSON_EXAMPLE}</code>
              </pre>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                xAI API（Grok）
              </h3>
              <p className="text-sm leading-relaxed text-slate-700">
                Remote MCP Tools の指定で{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  server_url
                </code>{" "}
                に{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  {MCP_ENDPOINT_URL}
                </code>{" "}
                を渡します。
              </p>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 font-mono">
                <code>{XAI_API_EXAMPLE}</code>
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-base font-bold text-slate-900">
              curl で直接確かめる例（tools/list）
            </h3>
            <p className="text-sm text-slate-700">
              <code>Content-Type: application/json</code> と{" "}
              <code>Accept: application/json, text/event-stream</code> を付けて
              POST します。
            </p>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 font-mono">
              <code>{CURL_LIST_TOOLS_EXAMPLE}</code>
            </pre>
          </div>
        </section>

        {/* 回数の上限 */}
        <section
          aria-labelledby="mcp-limits-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <div>
            <h2
              id="mcp-limits-heading"
              className="text-lg font-bold font-serif text-slate-900"
            >
              回数の上限とリクエスト制限
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              公開エンドポイントを安定して運用するため、複数のバケットで呼び出し回数の上限を設けています。
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-slate-700">
                  <th scope="col" className="py-2 pr-4">
                    区分
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    1時間あたり上限
                  </th>
                  <th scope="col" className="py-2">
                    一度に続けて使える回数（バースト）
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4 font-semibold">
                    接続元IPごと（MCP_PUBLIC_IP_HOURLY_LIMIT / BURST）
                  </td>
                  <td className="py-2 pr-4">
                    {formatCount(MCP_PUBLIC_IP_HOURLY_LIMIT)} 回 / 時
                  </td>
                  <td className="py-2">
                    {formatCount(MCP_PUBLIC_IP_BURST)} 回まで続けて
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4 font-semibold">
                    サイト全体（MCP_PUBLIC_GLOBAL_HOURLY_LIMIT / BURST）
                  </td>
                  <td className="py-2 pr-4">
                    {formatCount(MCP_PUBLIC_GLOBAL_HOURLY_LIMIT)} 回 / 時
                  </td>
                  <td className="py-2">
                    {formatCount(MCP_PUBLIC_GLOBAL_BURST)} 回まで続けて
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4 font-semibold">
                    MCPセッションごと（MCP_PUBLIC_SESSION_HOURLY_LIMIT / BURST）
                  </td>
                  <td className="py-2 pr-4">
                    {formatCount(MCP_PUBLIC_SESSION_HOURLY_LIMIT)} 回 / 時
                  </td>
                  <td className="py-2">
                    {formatCount(MCP_PUBLIC_SESSION_BURST)} 回まで続けて
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4 font-semibold">
                    道具名ごと（MCP_PUBLIC_TOOL_HOURLY_LIMIT / BURST）
                  </td>
                  <td className="py-2 pr-4">
                    {formatCount(MCP_PUBLIC_TOOL_HOURLY_LIMIT)} 回 / 時
                  </td>
                  <td className="py-2">
                    {formatCount(MCP_PUBLIC_TOOL_BURST)} 回まで続けて
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-slate-700">
            <li>
              1回のリクエスト（JSON-RPCバッチを含む）で同時に数える道具名の種類は最大{" "}
              <strong>{MCP_PUBLIC_MAX_TOOL_BUCKETS}個</strong>（
              <code>MCP_PUBLIC_MAX_TOOL_BUCKETS</code>）までです。
            </li>
            <li>
              上限を超えるとステータス <strong>429</strong> と{" "}
              <code>Retry-After</code> ヘッダを返します。通常の応答および 429
              応答には <code>RateLimit-Limit</code>・
              <code>RateLimit-Remaining</code>・<code>RateLimit-Reset</code>{" "}
              ヘッダが付きます。
            </li>
            <li>
              データベースで回数を数えられないときは、プロセス内メモリで接続元IPごとに
              <strong>
                {fallbackWindowMinutes}分あたり{MCP_PUBLIC_FALLBACK_LIMIT}回
              </strong>
              （<code>MCP_PUBLIC_FALLBACK_WINDOW_MS</code> ={" "}
              {MCP_PUBLIC_FALLBACK_WINDOW_MS}ms /{" "}
              <code>MCP_PUBLIC_FALLBACK_LIMIT</code> ={" "}
              {MCP_PUBLIC_FALLBACK_LIMIT}
              ）に絞ります。あわせて瞬間的な集中を防ぐプロセス内トークンバケット（IPごと容量60・毎秒1回復、全体で容量1200・毎秒20回復）も動いています。
            </li>
            <li>
              リクエスト本文（JSON）の上限は{" "}
              <strong>
                {MCP_REQUEST_BODY_LIMIT_KB}KB（
                {formatCount(MCP_REQUEST_BODY_LIMIT_BYTES)}バイト）
              </strong>{" "}
              です（<code>src/app/api/mcp/route.ts</code> の{" "}
              <code>readBoundedJson</code>）。これを超えると{" "}
              <code>413 Request too large</code> を返します。
            </li>
            <li>
              <strong>クラウド型AIサービスからの接続について:</strong> Claude や
              ChatGPT
              などは各社のサーバー（クラウド）から当サイトへ接続するため、送信元IPアドレスが共通になる場合があります。その場合、IPごとの枠（1時間あたり{" "}
              {formatCount(MCP_PUBLIC_IP_HOURLY_LIMIT)} 回、続けて{" "}
              {MCP_PUBLIC_IP_BURST}{" "}
              回まで）を多くの利用者で分け合うことがあります。
            </li>
          </ul>
        </section>

        {/* セキュリティの方針 */}
        <section
          aria-labelledby="mcp-security-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <h2
            id="mcp-security-heading"
            className="text-lg font-bold font-serif text-slate-900"
          >
            セキュリティとプライバシーの方針
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-slate-700">
            <li>
              <strong>読み取り専用:</strong>{" "}
              公開している道具はすべて読み取りだけ（書き込み・更新・削除なし）です。
            </li>
            <li>
              <strong>個人の記録は非公開:</strong>{" "}
              ログイン情報や個人の記録（お気に入り・メールアドレス・連絡先・相談履歴の保存など）を返す道具は公開MCPには含めていません。
            </li>
            <li>
              <strong>賃貸情報の範囲:</strong>{" "}
              賃貸の検索道具は公開されている物件情報（賃料・面積・市区町村など）だけを扱い、個人の連絡先は返しません。
            </li>
            <li>
              <strong>IPアドレスの保護:</strong>{" "}
              レート制限の集計では生のIPアドレスを保存せず、ハッシュにした値で数えています。
            </li>
            <li>
              <strong>停止スイッチ:</strong>{" "}
              異常時やメンテナンス時には環境変数の停止スイッチ（
              <code>MCP_PUBLIC_ENABLED</code>
              ）で公開MCPを即座に止められる構成にしています。
            </li>
            <li>
              <strong>プロンプト注入への対策:</strong>{" "}
              道具の結果をサイト内のAIに渡すときは、呼び出しごとに生成した乱数（16バイトの16進ノンス）の区切り（
              <code>BEGIN_UNTRUSTED_TOOL_DATA_...</code>
              ）で囲み、記事本文や検索結果の中に命令文が書かれていても単なるデータとして扱い従わないようにしています。
            </li>
            <li>
              <strong>サーバー側での外部URL取得なし:</strong>{" "}
              利用者から渡された任意の外部URLをサーバー側で取りに行く道具（SSRFの踏み台になるような取得道具）は公開していません。公開している
              {catalog.tools.length}
              個の道具はすべてサーバー内の暦・方位計算またはデータベース・記事データの読み取りで動作します。
            </li>
            <li>
              <strong>脆弱性の連絡先:</strong>{" "}
              セキュリティ上の問題を見つけられた場合は{" "}
              <a
                href="/.well-known/security.txt"
                className="font-semibold text-rose-700 underline"
              >
                /.well-known/security.txt
              </a>{" "}
              または{" "}
              <Link
                href="/contact"
                className="font-semibold text-rose-700 underline"
              >
                お問い合わせ（/contact）
              </Link>{" "}
              からご連絡ください。
            </li>
          </ul>
        </section>

        <p className="text-sm text-slate-600">占いの計算結果は参考情報です。</p>
      </article>
    </main>
  );
}
