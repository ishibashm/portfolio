import Link from "next/link";
import { notFound } from "next/navigation";
import { isPersonalMcpEnabled } from "@/lib/mcpRuntimeConfig";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  if (!isPersonalMcpEnabled()) notFound();
  const { McpConnectionsPanel } =
    await import("@/components/profile/McpConnectionsPanel");
  return (
    <main className="mx-auto max-w-3xl p-6">
      <nav className="flex gap-4">
        {process.env.MCP_CONSOLE_ENABLED === "true" && (
          <Link href="/profile/mcp">MCP実行・AI利用履歴</Link>
        )}
        {process.env.MCP_MEMORY_ENABLED === "true" && (
          <Link href="/profile/memory">個人の記憶</Link>
        )}
      </nav>
      <McpConnectionsPanel />
    </main>
  );
}
