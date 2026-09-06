import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { generateObject, recordApiCall, rentalFindFirst } = vi.hoisted(() => ({
  generateObject: vi.fn(),
  recordApiCall: vi.fn(),
  rentalFindFirst: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({ google: (model: string) => model }));
vi.mock("ai", () => ({
  generateObject,
  tool: (definition: unknown) => definition,
}));
vi.mock("@/lib/apiUsage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/apiUsage")>()),
  recordApiCall,
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    rental_properties: {
      findFirst: rentalFindFirst,
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { POST as webhookPost } from "@/app/api/rentals/webhook/route";
import { POST as parseQueryPost } from "@/app/api/rentals/parse-query/route";

describe("従量 API ルートの使用量計測", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    recordApiCall.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /*
    webhook は鍵が要る。以前のこのテストは鍵を入れずに 200 を期待して
    いて、**鍵が無ければ素通り**という穴をそのまま固定していた。鍵を
    入れて通し、無いとき・違うときは通らないことを別に見る。
  */
  const WEBHOOK_KEY = "webhook-secret";
  const webhookRequest = (headers: Record<string, string>) =>
    new Request("https://cloud-palette.com/api/rentals/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ body: "物件情報" }),
    });

  it("rentals/webhook は鍵が無いと 503 で、Gemini を呼ばない", async () => {
    vi.stubEnv("API_SECRET_KEY", "");
    const response = await webhookPost(webhookRequest({}));
    expect(response.status).toBe(503);
    expect(generateObject).not.toHaveBeenCalled();
    expect(recordApiCall).not.toHaveBeenCalled();
  });

  it("rentals/webhook は鍵が違うと 401 で、Gemini を呼ばない", async () => {
    vi.stubEnv("API_SECRET_KEY", WEBHOOK_KEY);
    const response = await webhookPost(
      webhookRequest({ authorization: "Bearer wrong" }),
    );
    expect(response.status).toBe(401);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rentals/webhook は Gemini Flash の usage を記録する", async () => {
    vi.stubEnv("API_SECRET_KEY", WEBHOOK_KEY);
    generateObject.mockResolvedValue({
      object: { properties: [] },
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    const response = await webhookPost(
      webhookRequest({ authorization: `Bearer ${WEBHOOK_KEY}` }),
    );

    expect(response.status).toBe(200);
    expect(recordApiCall).toHaveBeenCalledWith({
      provider: "google",
      model: "gemini-2.5-flash",
      route: "/api/rentals/webhook",
      inputTokens: 120,
      outputTokens: 30,
    });
  });

  it("rentals/parse-query は Anthropic usage を記録する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          usage: { input_tokens: 360, output_tokens: 90 },
          content: [
            {
              type: "tool_use",
              input: { keywords: ["眺望"] },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest(
      "https://cloud-palette.com/api/rentals/parse-query",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://cloud-palette.com",
          host: "cloud-palette.com",
        },
        body: JSON.stringify({ query: "落ち着いて暮らせる住まい" }),
      },
    );

    const response = await parseQueryPost(request);

    expect(response.status).toBe(200);
    expect(recordApiCall).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      route: "/api/rentals/parse-query",
      inputTokens: 360,
      outputTokens: 90,
    });
  });
});
