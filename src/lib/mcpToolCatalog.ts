import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, MCP_PUBLIC_TOOL_NAMES } from "@/lib/mcpServer";

/** /mcp の案内ページが出す道具の一覧。手で書いた一覧と食い違わないよう、サーバー本体から引く。 */
export type McpToolCatalogItem = {
  name: string;
  title: string;
  description: string;
};

/**
 * createMcpServer() に InMemoryTransport で内部接続して listTools() を呼び、
 * 公開されている道具の一覧を取得する。失敗時は MCP_PUBLIC_TOOL_NAMES の名前一覧へフォールバックする。
 */
export async function loadMcpToolCatalog(): Promise<{
  tools: McpToolCatalogItem[];
  fromFallback: boolean;
}> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "cloud-palette-mcp-page", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const listed = await client.listTools();
    if (!listed.tools || listed.tools.length === 0) {
      return {
        tools: MCP_PUBLIC_TOOL_NAMES.map((name) => ({
          name,
          title: "",
          description: "",
        })),
        fromFallback: true,
      };
    }
    return {
      tools: listed.tools.map((tool) => ({
        name: tool.name,
        title: tool.title ?? tool.annotations?.title ?? "",
        description: tool.description ?? "",
      })),
      fromFallback: false,
    };
  } catch {
    return {
      tools: MCP_PUBLIC_TOOL_NAMES.map((name) => ({
        name,
        title: "",
        description: "",
      })),
      fromFallback: true,
    };
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}
