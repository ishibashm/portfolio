import { beforeEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { apiUsage: { create } } }));

import {
  estimateYen,
  MODEL_PRICES,
  tokensFromAnthropicUsage,
  tokensFromAiSdkUsage,
  recordApiCall,
  totalEstimateYen,
  type ModelPrice,
  type UsageRow,
} from "@/lib/apiUsage";

/**
 * 外部 API の従量課金。固定費（operatingCosts）と対になる。
 *
 * 気にしているのは 2 つ。
 *
 * 1. **記録が本筋を止めないこと。**費用を数えたいだけなのに、数え損ねて
 *    機能が落ちるのでは本末転倒
 * 2. **推定額を実際より安く出さないこと。**トークンを数えられなかった
 *    呼び出しがあると、そのぶん小さく出る。経費は小さく出るのが一番まずい
 */

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  provider: "google",
  model: "gemini-2.5-flash",
  route: "/api/rentals/webhook",
  calls: 10,
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  untrackedCalls: 0,
  ...over,
});

const priced: ModelPrice[] = [
  {
    provider: "google",
    model: "gemini-2.5-flash",
    inputYenPerMTok: 30,
    outputYenPerMTok: 120,
    note: "",
  },
];

beforeEach(() => vi.clearAllMocks());

describe("呼び出しの記録", () => {
  it("DB が落ちていても投げない（本筋を止めない）", async () => {
    create.mockRejectedValue(new Error("connection refused"));

    await expect(
      recordApiCall({ provider: "google", model: "m", route: "/r" }),
    ).resolves.toBeUndefined();
  });

  it("トークンを渡さなければ null で残す（0 で埋めない）", async () => {
    create.mockResolvedValue({});

    await recordApiCall({ provider: "google", model: "m", route: "/r" });

    const data = create.mock.calls[0][0].data;
    // 0 は「使わなかった」、null は「数えられなかった」。別物として残す。
    expect(data.input_tokens).toBeNull();
    expect(data.output_tokens).toBeNull();
    expect(data.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("渡したトークンはそのまま残す", async () => {
    create.mockResolvedValue({});

    await recordApiCall({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      route: "/api/rentals/parse-query",
      inputTokens: 1200,
      outputTokens: 300,
    });

    const data = create.mock.calls[0][0].data;
    expect(data.input_tokens).toBe(1200);
    expect(data.output_tokens).toBe(300);
    expect(data.route).toBe("/api/rentals/parse-query");
  });
});

describe("提供元の usage 応答", () => {
  it("AI SDK のトークン数を記録用の形にする", () => {
    expect(
      tokensFromAiSdkUsage({ inputTokens: 1200, outputTokens: 300 }),
    ).toEqual({ inputTokens: 1200, outputTokens: 300 });
  });

  it("Anthropic の snake_case を記録用の形にする", () => {
    expect(
      tokensFromAnthropicUsage({ input_tokens: 700, output_tokens: 90 }),
    ).toEqual({ inputTokens: 700, outputTokens: 90 });
  });

  it("usage が無いときは 0 で埋めない", () => {
    expect(tokensFromAiSdkUsage(undefined)).toEqual({});
    expect(tokensFromAnthropicUsage(null)).toEqual({});
  });
});

describe("推定額", () => {
  it("単価が入っていれば出る", () => {
    // 入力 100万tok × 30円 + 出力 50万tok × 120円 = 30 + 60 = 90
    expect(estimateYen(row(), priced)).toBe(90);
  });

  it("採用した公式単価と為替で推定する", () => {
    // 入力 100万tok × 47.802円 + 出力 50万tok × 398.35円
    expect(estimateYen(row())).toBeCloseTo(246.977, 6);
  });

  it("知らないモデルなら出さない", () => {
    expect(estimateYen(row({ model: "unknown" }), priced)).toBeNull();
  });

  it("トークンを数えられなかった呼び出しがあれば出さない", () => {
    // 数えられた分だけで計算すると、実際より安く出る。
    expect(estimateYen(row({ untrackedCalls: 1 }), priced)).toBeNull();
  });

  it("合計は 1 つでも出せなければ出さない", () => {
    const rows = [row(), row({ model: "unknown" })];
    expect(totalEstimateYen(rows, priced)).toBeNull();
  });

  it("行が無ければ 0（未設定ではない）", () => {
    expect(totalEstimateYen([], priced)).toBe(0);
  });

  it("全部出せれば足し合わせる", () => {
    expect(totalEstimateYen([row(), row()], priced)).toBe(180);
  });

  it("本番で使う全モデルに確認済み単価がある", () => {
    expect(MODEL_PRICES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "gemini-2.5-flash",
          inputYenPerMTok: 47.802,
          outputYenPerMTok: 398.35,
        }),
        expect.objectContaining({
          model: "gemini-2.5-pro",
          inputYenPerMTok: 199.175,
          outputYenPerMTok: 1593.4,
        }),
        expect.objectContaining({
          model: "claude-haiku-4-5",
          inputYenPerMTok: 159.34,
          outputYenPerMTok: 796.7,
        }),
      ]),
    );
  });
});
