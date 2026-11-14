import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";

/**
 * 案内役（/annai）から呼び出しを許可する公開MCPの道具一覧。
 * 賃貸検索・掲載詳細・家賃統計および個人の記憶系の道具は含めない。
 */
export const GUIDE_TOOLS = [
  "get_honmei_star",
  "judge_directions",
  "find_auspicious_days",
  "search_municipality",
  "area_directions",
  "search_articles",
  "get_today_directions",
] as const;

export type GuideToolName = (typeof GUIDE_TOOLS)[number];

/** 案内役で許可された道具名か検査し、未許可なら例外を投げる。 */
export function assertGuideTool(name: string): asserts name is GuideToolName {
  if (!(GUIDE_TOOLS as readonly string[]).includes(name)) {
    throw new Error(`許可されていない道具です: ${name}`);
  }
}

export type GuideCaller = (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs?: number,
) => Promise<unknown>;

export type GuideClientConnection = {
  call: GuideCaller;
  close: () => Promise<void>;
};

/**
 * createMcpServer() と InMemoryTransport でプロセス内接続を作る。
 * リクエストごとに接続し、完了時に close() で解放する。
 */
export async function connectGuideClient(): Promise<GuideClientConnection> {
  const server = createMcpServer();
  const client = new Client({
    name: "cloud-palette-guide",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const close = async () => {
    await Promise.allSettled([client.close(), server.close()]);
  };
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const call: GuideCaller = async (
      name,
      args,
      signal = new AbortController().signal,
      timeoutMs = 8000,
    ) => {
      assertGuideTool(name);
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { signal, timeout: timeoutMs },
      );
      if (result.isError) {
        throw new Error("道具が入力を処理できませんでした。");
      }
      return result.structuredContent;
    };
    return { call, close };
  } catch (error) {
    await close();
    throw error;
  }
}
