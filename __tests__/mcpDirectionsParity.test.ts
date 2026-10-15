// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";
const clients: Client[] = [];
const servers: ReturnType<typeof createMcpServer>[] = [];
async function connect() {
  const server = createMcpServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "parity", version: "0" });
  await client.connect(b);
  clients.push(client);
  servers.push(server);
  return client;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
describe("日判定の共通化前に公開MCPの全出力を固定", () => {
  it("birth formats / 9 years / leap day / year and spring boundaries / settings", async () => {
    const c = await connect();
    const hash = createHash("sha256");
    const births = Array.from({ length: 9 }, (_, i) => `${1980 + i}-05-15`);
    births.push(
      "1990-02-04T01:30",
      "1990-02-03T16:30Z",
      "1990-02-04T01:30+09:00",
    );
    let count = 0;
    for (const birthDate of births)
      for (const date of [
        "2024-02-29",
        "2026-01-01",
        "2026-02-04",
        "2026-12-31",
      ])
        for (const lon of [122, 136.91, 154]) {
          for (const mode of [
            "composite",
            "personal_kigaku",
            "personal_bazi",
            "environmental",
          ]) {
            const args = {
              birthDate,
              date,
              lon,
              directionFilterMode: mode,
              tenchusatsuMode: [
                "strict",
                "month_day",
                "day_only",
                "weaken",
                "off",
              ][count % 5],
              involuntaryMove: count % 2 === 0,
            };
            const r = await c.callTool({
              name: "judge_directions",
              arguments: args,
            });
            expect(r.isError).not.toBe(true);
            const payload = JSON.parse(
              (r.content as { text: string }[])[0].text,
            );
            expect(r.structuredContent).toEqual(payload);
            hash.update(JSON.stringify({ args, payload }));
            count++;
          }
        }
    expect(count).toBe(576);
    expect(hash.digest("hex")).toMatchInlineSnapshot(
      `"9637385582475a012fb09f1e862c8fdaa0c06f760cbbe9835c02390476d943f9"`,
    );
  }, 60000);
});
