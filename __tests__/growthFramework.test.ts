import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectRepo } from "@/lib/growth/collect";
import { draftNarrative } from "@/lib/growth/llm";
import { runGrowthPipeline } from "@/lib/growth/pipeline";
import { reportToMarkdown } from "@/lib/growth/report";
import {
  assertOwnSiteUrl,
  GrowthSafetyError,
  redactText,
} from "@/lib/growth/safety";
import type { GrowthConfig } from "@/lib/growth/types";

const config = JSON.parse(
  readFileSync("growth.config.json", "utf8"),
) as GrowthConfig;

describe("成長フレームワーク", () => {
  it("自サイト以外と http を拒む", () => {
    expect(() =>
      assertOwnSiteUrl(config.siteUrl, "https://example.com/llms.txt"),
    ).toThrow(GrowthSafetyError);
    expect(() =>
      assertOwnSiteUrl(config.siteUrl, "http://cloud-palette.com/"),
    ).toThrow(GrowthSafetyError);
    expect(() =>
      assertOwnSiteUrl(config.siteUrl, "https://cloud-palette.com/llms.txt"),
    ).not.toThrow();
  });

  it("識別子をレポート用の文字列から落とす", () => {
    const raw =
      "google.com, pub-1234567890123456, DIRECT a8mat=ABC+DEF user@example.com";
    const cleaned = redactText(raw);
    expect(cleaned).not.toMatch(/pub-\d{16}/);
    expect(cleaned).not.toContain("a8mat=ABC");
    expect(cleaned).not.toContain("user@example.com");
  });

  it("実リポジトリを読み、マージも自動適用もしない", async () => {
    const report = await runGrowthPipeline({
      root: process.cwd(),
      config,
      now: "2026-11-18T00:00:00.000Z",
      live: false,
      previousFindings: [
        {
          id: "retired.example",
          role: "auditor",
          severity: "low",
          title: "前回だけ",
          detail: "差分の確認",
          evidence: [],
        },
      ],
    });
    expect(report.merge).toBe(false);
    expect(report.deploy).toBe(false);
    expect(report.proposals.every((row) => row.applied === false)).toBe(true);
    expect(report.backlog.every((row) => row.safeToAutoApply === false)).toBe(
      true,
    );
    expect(report.diff.removed).toContain("retired.example");
    expect(
      report.findings.some((row) => row.id === "monetization.adsense-review"),
    ).toBe(true);
    expect(
      report.findings.find((row) => row.id === "monetization.adsense-review")
        ?.severity,
    ).toBe("blocker");
    expect(report.facts.mcpToolNames).toContain("get_honmei_star");
    expect(report.facts.mcpToolNames).toContain("search_articles");
    expect(report.facts.ads.consentUi).toBe(true);
    expect(report.facts.trust.privacyLinksContact).toBe(true);
    expect(report.facts.affiliate.includesDmm).toBe(false);
    expect(
      report.facts.canonicalGaps.find((gap) =>
        gap.file.endsWith("relocation/history/page.tsx"),
      ),
    ).toBeUndefined();
    const blob = JSON.stringify(report);
    expect(blob).not.toMatch(/pub-\d{16}/);
    expect(blob).not.toContain("a8mat=");
    const markdown = reportToMarkdown(report);
    expect(markdown).toContain("マージ: しない");
    expect(markdown).toContain("AdSense 審査は未通過");
    const scores = report.backlog.map((row) => row.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("モデルの鍵は応答に残さない", async () => {
    process.env.OPENAI_API_KEY = "sk-test-secret-value";
    try {
      const result = await draftNarrative(
        { ...config, provider: "openai" },
        "要約して。マージは提案しない。",
        {
          fetchImpl: async (url, init) => {
            expect(String(url)).toBe(
              "https://api.openai.com/v1/chat/completions",
            );
            expect(init?.headers?.authorization).toBe(
              "Bearer sk-test-secret-value",
            );
            return {
              ok: true,
              status: 200,
              text: async () =>
                JSON.stringify({
                  choices: [{ message: { content: "審査はまだである。" } }],
                }),
            };
          },
        },
      );
      expect(result.text).toContain("審査はまだ");
      expect(JSON.stringify(result)).not.toContain("sk-test-secret-value");
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("鍵が無いモデルは呼ばない", async () => {
    delete process.env.XAI_API_KEY;
    let called = false;
    const result = await draftNarrative(
      { ...config, provider: "xai" },
      "要約",
      {
        fetchImpl: async () => {
          called = true;
          return { ok: true, status: 200, text: async () => "" };
        },
      },
    );
    expect(called).toBe(false);
    expect(result.text).toBeNull();
  });

  it("初回ランの成果物はマージせず、識別子を残していない", () => {
    const raw = readFileSync("docs/growth/runs/2026-11-18/report.json", "utf8");
    const saved = JSON.parse(raw) as {
      merge: boolean;
      deploy: boolean;
      live: { attempted: boolean };
    };
    expect(saved.merge).toBe(false);
    expect(saved.deploy).toBe(false);
    expect(saved.live.attempted).toBe(true);
    expect(raw).not.toMatch(/pub-\d{16}/);
    expect(raw).not.toContain("a8mat=");
  });

  it("定期実行のワークフローは止まっている", () => {
    const yml = readFileSync(".github/workflows/growth-framework.yml", "utf8");
    expect(yml).not.toMatch(/^\s*- cron:/m);
    expect(yml).toContain("GROWTH_FRAMEWORK_ENABLED");
    expect(yml).not.toContain("git push");
    expect(yml).not.toContain("deploy");
    const cli = readFileSync("scripts/growth-framework.ts", "utf8");
    expect(cli).toContain("--merge");
    expect(cli).toContain("process.exit(2)");
  });
});

describe("収集の索引", () => {
  it("記事一覧の canonical は import 先を見て穴にしない", () => {
    const facts = collectRepo(process.cwd());
    expect(
      facts.canonicalGaps.some((gap) => gap.file === "src/app/blog/page.tsx"),
    ).toBe(false);
    expect(facts.blogCount).toBeGreaterThan(50);
    expect(facts.areaEditorialCount).toBeGreaterThan(300);
  });
});
