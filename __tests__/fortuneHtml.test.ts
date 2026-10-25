import { describe, expect, it, vi, afterEach } from "vitest";
import {
  sanitizeFortuneHtml,
  buildFortuneSrcdoc,
  FORTUNE_CSP,
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
  it("retains inline animation but strips metadata, embedding and external attributes", () => {
    const clean = sanitizeFortuneHtml(
      '<meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://evil.test"><link rel="stylesheet" href="https://evil.test"><iframe srcdoc="evil"></iframe><object>evil</object><embed src="x"><script src="https://evil.test">animate()</script><style>p{color:red}</style><p id="fact" style="color:red">safe</p><a href="javascript:alert(1)">link</a><img src="//evil.test" srcset="https://evil.test 2x"><svg><script>evil</script></svg>',
    );
    expect(clean).toContain("<script>animate()</script>");
    expect(clean).toContain("<style>p{color:red}</style>");
    expect(clean).not.toMatch(
      /<(meta|base|link|iframe|object|embed|svg)|src=|srcset=|href=|srcdoc=/,
    );
    expect(sanitizeFortuneHtml("x".repeat(24001))).toBe("");
  });
  it("puts the authoritative CSP first in the document head", () => {
    const srcdoc = buildFortuneSrcdoc(
      '<html><head><meta http-equiv="refresh" content="0;url=https://evil.test"><style>p{color:red}</style></head><body><p>計算結果</p></body></html>',
    );
    const doc = new DOMParser().parseFromString(srcdoc, "text/html");
    expect(doc.head.firstElementChild?.getAttribute("http-equiv")).toBe(
      "Content-Security-Policy",
    );
    expect(doc.head.firstElementChild?.getAttribute("content")).toBe(
      FORTUNE_CSP,
    );
    expect(doc.querySelectorAll("meta")).toHaveLength(1);
    expect(srcdoc).toContain("ResizeObserver");
    expect(srcdoc).toContain("ai-fortune-height");
  });
  it("validates static text while allowing CSS and JS animation", () => {
    const animation =
      "<style>p{animation:fade 1s} @keyframes fade{from{opacity:0}to{opacity:1}}</style><script>document.body.animate([{opacity:0},{opacity:1}], 500)</script>";
    expect(
      decorateFortuneHtml(
        animation + "<p>{{fact:0}}</p><p>{{fact:1}}</p>",
        facts,
      ),
    ).toContain(animation);
    expect(
      decorateFortuneHtml(
        animation + "<p>南西</p><p>{{fact:0}}</p><p>{{fact:1}}</p>",
        facts,
      ),
    ).toBeNull();
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
      expect(await service("a", profile, now)).toMatchObject({
        srcdoc: null,
        fallbackHtml: fallbackFortuneHtml(fortuneFacts(profile, "2026-10-26")),
      });
    },
  );
  it("builds sandbox content from validated AI and retains independent MCP facts", async () => {
    vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
    const generate = vi.fn(
      async (values) =>
        "<style>p{color:red}</style><script>document.body.animate([{opacity:0},{opacity:1}],500)</script>" +
        values.map((_: unknown, i: number) => `<p>{{fact:${i}}}</p>`).join(""),
    );
    const result = await createFortuneReportService(generate)(
      "a",
      profile,
      now,
    );
    expect(result?.srcdoc).toContain("Content-Security-Policy");
    expect(result?.srcdoc).toContain("<script>document.body.animate");
    expect(result?.facts).toEqual(fortuneFacts(profile, "2026-10-26"));
    expect(result?.fallbackHtml).toBe(fallbackFortuneHtml(result!.facts));
  });
  it("single-flights concurrent calls and caches validation failures per profile/day/user", async () => {
    vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
    const generate = vi.fn().mockResolvedValue("<p>南西 2099-01-01</p>");
    const service = createFortuneReportService(generate);
    const results = await Promise.all([
      service("a", profile, now),
      service("a", profile, now),
    ]);
    expect(results[0]).toBe(results[1]);
    expect(results[0]?.srcdoc).toBeNull();
    expect(results[0]?.fallbackHtml).not.toContain("2099-01-01");
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
