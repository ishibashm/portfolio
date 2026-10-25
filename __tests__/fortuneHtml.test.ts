import { describe, expect, it, vi, afterEach } from "vitest";
import {
  sanitizeFortuneHtml,
  decorateFortuneHtml,
  fallbackFortuneHtml,
} from "@/lib/fortuneHtml";
import { fortuneHtmlEnabled, googleAgentApiKey } from "@/lib/mcpAgentConfig";
import {
  createFortuneReportService,
  fortuneFacts,
  fortuneProfileSchema,
} from "@/lib/fortuneReport";

const facts = [
  { label: "対象日", value: "2026-10-26" },
  { label: "北東", value: "A / 吉" },
];
const profile = { birthDate: "1990-05-15", lat: 35.68, lon: 139.76 };
const now = new Date("2026-10-26T10:00:00+09:00");
afterEach(() => vi.unstubAllEnvs());

describe("fortune HTML trust boundary", () => {
  it("drops executable content, foreign namespaces, external URLs and non-allowlisted attributes/classes", () => {
    const clean = sanitizeFortuneHtml(
      '<section class="fortune-card fixed fortune-evil" id="x" style="color:red" onclick="alert(1)"><script>alert(1)</script><style>p{display:none}</style><iframe src="https://evil.test"></iframe><img src=x onerror=alert(1)><a href="https://evil.test">link</a><svg><text>evil</text></svg><p class="fortune-fact" onmouseover="x">safe &amp; sound</p></section>',
    );
    expect(clean).toBe(
      '<section class="fortune-card"><p class="fortune-fact">safe &amp; sound</p></section>',
    );
    expect(sanitizeFortuneHtml("x".repeat(24001))).toBe("");
  });
  it("handles malformed markup and entity-encoded text safely", () => {
    const clean = sanitizeFortuneHtml(
      '<p><strong>hello</p><math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
    );
    expect(clean).not.toMatch(/<(script|img|style|math)|onerror/);
    expect(
      sanitizeFortuneHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"),
    ).toContain("&lt;script&gt;");
  });
  it("injects each complete label/value pair from JSON after decoration", () => {
    const html = decorateFortuneHtml(
      '<section class="fortune-card"><h2>今日の運勢</h2><p>{{fact:1}}</p><p>{{fact:0}}</p></section>',
      facts,
    );
    expect(html).toContain("<strong>北東</strong>：A / 吉");
    expect(html).toContain("<strong>対象日</strong>：2026-10-26");
  });
  it.each([
    "<p>2026-10-27</p>",
    "<p>南西</p>",
    "<p>十二時</p>",
    "<p>99</p>",
    "<p>&#x5357;</p>",
    "<p><span>20</span><span>27</span></p>",
    "<p>{{fact:0}}</p>",
    "<p>{{fact:0}}</p><p>{{fact:0}}</p>",
    "<p>{{fact:999}}</p>",
    "<p>北 {{fact:0}}</p>",
  ])("rejects invented, missing, duplicated or relabeled facts: %s", (bad) => {
    expect(decorateFortuneHtml(bad, facts)).toBeNull();
  });
  it("escapes MCP strings in both fallback and AI decoration", () => {
    const hostile = [
      { label: "<img src=x>", value: "<script>alert(1)</script>" },
    ];
    for (const html of [
      fallbackFortuneHtml(hostile),
      decorateFortuneHtml("<p>{{fact:0}}</p>", hostile),
    ]) {
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>");
    }
  });
});

describe("flag, cache, limits and fallback", () => {
  it("is off by default and accepts only explicit true", () => {
    expect(fortuneHtmlEnabled({})).toBe(false);
    expect(fortuneHtmlEnabled({ AI_FORTUNE_HTML_ENABLED: "1" })).toBe(false);
    expect(fortuneHtmlEnabled({ AI_FORTUNE_HTML_ENABLED: "true" })).toBe(true);
    expect(
      googleAgentApiKey({
        GOOGLE_GENERATIVE_AI_API_KEY: " ",
        GEMINI_API_KEY: "test",
      }),
    ).toBe("test");
  });
  it("does not calculate or generate when disabled", async () => {
    vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "false");
    const generate = vi.fn();
    expect(
      await createFortuneReportService(generate)("a", profile, now),
    ).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects missing and invalid registered profile data", () => {
    expect(fortuneProfileSchema.safeParse({}).success).toBe(false);
    expect(
      fortuneProfileSchema.safeParse({ ...profile, birthDate: "1990-02-30" })
        .success,
    ).toBe(false);
    expect(
      fortuneProfileSchema.safeParse({ ...profile, lon: null }).success,
    ).toBe(false);
  });
  it.each([new Error("no key"), new Error("429"), new Error("timeout")])(
    "uses the exact same tool facts on generation failure (%s)",
    async (error) => {
      vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
      const generate = vi.fn().mockRejectedValue(error);
      const service = createFortuneReportService(generate);
      expect(await service("a", profile, now)).toBe(
        fallbackFortuneHtml(fortuneFacts(profile, "2026-10-26")),
      );
    },
  );
  it("single-flights concurrent calls and caches validation failures per profile/day/user", async () => {
    vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
    const generate = vi.fn().mockResolvedValue("<p>南西 2099-01-01</p>");
    const service = createFortuneReportService(generate);
    const results = await Promise.all([
      service("a", profile, now),
      service("a", profile, now),
    ]);
    expect(results[0]).toBe(results[1]);
    expect(results[0]).not.toContain("2099-01-01");
    expect(generate).toHaveBeenCalledTimes(1);
    await service("b", profile, now);
    await service("a", { ...profile, birthDate: "1991-05-15" }, now);
    await service("a", { ...profile, birthDate: "1992-05-15" }, now);
    expect(generate).toHaveBeenCalledTimes(3);
    await service("a", profile, new Date("2026-10-26T15:00:00Z"));
    expect(generate).toHaveBeenCalledTimes(4);
  });
  it("caps global generations across users", async () => {
    vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
    const generate = vi.fn().mockResolvedValue("");
    const service = createFortuneReportService(generate);
    for (let i = 0; i < 22; i++) await service(String(i), profile, now);
    expect(generate).toHaveBeenCalledTimes(20);
  });
});
