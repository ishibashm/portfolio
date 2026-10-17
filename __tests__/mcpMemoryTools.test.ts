import { z } from "zod";
import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerMemoryTools } from "@/lib/mcpMemoryTools";
it.each([[], ["read:memory"], ["write:memory"]].map((scopes) => ({ scopes })))(
  "separates permissions %j",
  async ({ scopes }) => {
    const server = new McpServer({ name: "test", version: "1" });
    server.registerTool(
      "ping",
      { inputSchema: z.strictObject({}) },
      async () => ({ content: [] }),
    );
    const store = {
      run: vi.fn().mockResolvedValue({ id: "created", revision: 1 }),
    };
    registerMemoryTools(
      server,
      {
        userId: "owner",
        grantId: "grant",
        clientId: "client",
        allowedProfileIds: [],
      },
      store,
      scopes,
    );
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names.includes("list_memories")).toBe(
        scopes.includes("read:memory"),
      );
      expect(names.includes("create_memory")).toBe(
        scopes.includes("write:memory"),
      );
      if (scopes.includes("write:memory")) {
        await client.callTool({
          name: "create_memory",
          arguments: { title: "予定", text: "引越し", category: "move" },
        });
        expect(store.run).toHaveBeenCalledWith("owner", "create", {
          title: "予定",
          text: "引越し",
          category: "move",
        });
      }
    } finally {
      await client.close();
      await server.close();
    }
  },
);
it("lists summaries and returns a body only for an explicitly selected memory", async () => {
  const server = new McpServer({ name: "test", version: "1" });
  const id = "11111111-1111-4111-8111-111111111111";
  const store = {
    run: vi.fn().mockResolvedValue({
      memories: [
        {
          id,
          title: "予定",
          text: "SECRET",
          revision: 1,
          category: "move",
          updatedAt: "2026-10-17",
        },
      ],
    }),
  };
  registerMemoryTools(
    server,
    {
      userId: "owner",
      grantId: "grant",
      clientId: "client",
      allowedProfileIds: [],
    },
    store,
    ["read:memory"],
  );
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    expect(
      JSON.stringify(
        await client.callTool({ name: "list_memories", arguments: {} }),
      ),
    ).not.toContain("SECRET");
    expect(
      JSON.stringify(
        await client.callTool({ name: "get_memory", arguments: { id } }),
      ),
    ).toContain("SECRET");
  } finally {
    await client.close();
    await server.close();
  }
});
