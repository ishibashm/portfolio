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
      <McpConnectionsPanel />
    </main>
  );
}
