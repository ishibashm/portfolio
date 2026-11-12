// @vitest-environment node
import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";
import { buildTodayDirections } from "@/lib/todayDirections";
import { getMonthDirections } from "@/lib/kigakuContent";
it("公開MCPの今日・年月の吉方位がサイトの計算と一致する", async () => {
  const server = createMcpServer();
  const client = new Client({ name: "houi-parity", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["get_today_directions", "get_month_directions"]),
    );
    const today = await client.callTool({
      name: "get_today_directions",
      arguments: { date: "2026-11-04" },
    });
    expect(today.isError).not.toBe(true);
    expect(today.structuredContent).toEqual(
      JSON.parse(
        JSON.stringify(
          buildTodayDirections(new Date("2026-11-04T12:00:00+09:00")),
        ),
      ),
    );
    for (const star of [1, 5, 9]) {
      const month = await client.callTool({
        name: "get_month_directions",
        arguments: { year: 2026, month: 11, star },
      });
      expect(month.isError).not.toBe(true);
      expect(month.structuredContent).toEqual(
        JSON.parse(JSON.stringify(getMonthDirections(2026, 11, star))),
      );
    }
    const bad = await client.callTool({
      name: "get_month_directions",
      arguments: { year: 2026, month: 13, star: 1 },
    });
    expect(bad.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});
