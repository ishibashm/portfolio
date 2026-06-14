import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

globalThis.EventSource = EventSource;

async function test() {
  console.log("Connecting to Katmer Base MCP Server...");
  const transport = new SSEClientTransport(
    new URL("http://127.0.0.1:8002/sse"),
  );
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    console.log("Connected successfully!");

    console.log("\nCalling search_knowledge_base with query...");
    const result = await client.callTool({
      name: "search_knowledge_base",
      arguments: {
        query: "方位 最適なアクション 算出",
        limit: 3,
      },
    });

    console.log("\n=== Search Result ===");
    console.log(result.content[0].text);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}
test();
