// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("@/lib/mcpChain", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mcpChain")>();
  return {
    ...original,
    connectChainClient: vi
      .fn()
      .mockRejectedValue(new Error("秘密の内部情報\n at database:123")),
  };
});
import { POST } from "@/app/api/mcp-chain/route";
it("失敗した質問の本文・生年月日・内部エラーをログにも応答にも残さない", async () => {
  const logs = [
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
  ];
  const response = await POST(
    new Request("https://cloud-palette.com/api/mcp-chain", {
      method: "POST",
      headers: {
        Origin: "https://cloud-palette.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ birthDate: "1990-05-05", municipality: "長崎市" }),
    }),
  );
  const text = await response.text();
  expect(text).toContain("計算を続けられません");
  expect(text).not.toMatch(/秘密|database|stack|1990-05-05/);
  expect(JSON.stringify(logs.flatMap((s) => s.mock.calls))).not.toMatch(
    /秘密|database|長崎市|1990-05-05/,
  );
  vi.restoreAllMocks();
});
