import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_LOG_SLUG_PREFIX, isAgentLogSlug } from "@/lib/agentLog";

const ROOT = path.join(__dirname, "..");

describe("作業ログの slug", () => {
  it("agent- で始まる（二重ハイフンの実例も含む）", () => {
    expect(AGENT_LOG_SLUG_PREFIX).toBe("agent-");
    expect(
      isAgentLogSlug(
        "agent--cosmic-report-void-of-course-alignment-deep-calibration-sequence-1781282092303",
      ),
    ).toBe(true);
    expect(isAgentLogSlug("can-good-outweigh-a-bad-move")).toBe(false);
  });

  it("daemon は published: false で書き、slug は agent- で始まる", () => {
    const src = readFileSync(
      path.join(ROOT, "scripts/site_guardian_daemon.ts"),
      "utf8",
    );
    const at = src.indexOf('call.name === "write_blog_post"');
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 4000);
    expect(block).toContain("const slug = `agent-");
    expect(block).toMatch(/published:\s*false/);
    expect(block).not.toMatch(/published:\s*true/);
  });

  it("サイトマップは /blog/agent-* を除外する", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../next-sitemap.config.js");
    const exclude: string[] = config.exclude ?? [];
    const pattern = `/blog/${AGENT_LOG_SLUG_PREFIX}*`;
    expect(exclude).toContain(pattern);
    const covered = (route: string) =>
      exclude.some((item) => {
        const re = new RegExp(
          `^${item.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\s\\S]*")}$`,
        );
        return re.test(route);
      });
    expect(
      covered(
        "/blog/agent--cosmic-report-void-of-course-alignment-deep-calibration-sequence-1781282092303",
      ),
    ).toBe(true);
    expect(covered("/blog/can-good-outweigh-a-bad-move")).toBe(false);
  });
});
