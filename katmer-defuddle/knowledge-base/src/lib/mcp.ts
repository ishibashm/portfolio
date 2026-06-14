import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource as EventSourceNode } from "eventsource";

if (!globalThis.EventSource) {
  (globalThis as any).EventSource = EventSourceNode;
}

const X_MCP_URL = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000/sse";
const BRAVE_MCP_URL =
  process.env.BRAVE_MCP_SERVER_URL || "http://127.0.0.1:8001/sse";

const globalForMcp = globalThis as unknown as {
  mcpClients: Map<string, Promise<Client>>;
};

if (!globalForMcp.mcpClients) {
  globalForMcp.mcpClients = new Map();
}

export async function getMcpClient(
  serverUrl: string = X_MCP_URL,
): Promise<Client> {
  if (globalForMcp.mcpClients.has(serverUrl)) {
    return globalForMcp.mcpClients.get(serverUrl)!;
  }

  const connectClient = async () => {
    const transport = new SSEClientTransport(new URL(serverUrl));
    const client = new Client(
      {
        name: "katmer-base-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await client.connect(transport);

      transport.onclose = () => {
        console.log(
          `MCP transport closed for ${serverUrl}. Resetting client cache.`,
        );
        globalForMcp.mcpClients.delete(serverUrl);
      };

      transport.onerror = (error) => {
        console.error(`MCP transport error for ${serverUrl}:`, error);
        globalForMcp.mcpClients.delete(serverUrl);
      };

      return client;
    } catch (error) {
      console.error(`Failed to connect to MCP server at ${serverUrl}:`, error);
      globalForMcp.mcpClients.delete(serverUrl);
      throw error;
    }
  };

  const promise = connectClient();
  globalForMcp.mcpClients.set(serverUrl, promise);

  return promise;
}
