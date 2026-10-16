import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  answerBlockSchema,
  parseAnswerBlocks,
  sitePathSchema,
} from "@/lib/answerBlocks";
import { blocksFromTool, selectBlocks } from "@/lib/answerBlockBuilder";
import { AnswerBlocks } from "@/components/home/AnswerBlocks";
import { AgentAnswer } from "@/components/home/AgentAnswer";
import nextConfig from "../next.config";
import { metadata } from "@/app/ask/page";
const output = {
  results: [
    {
      code: "13101",
      name: "千代田区",
      pref: "東京都",
      rentPerSqm: 3210.75,
      prefectureRank: 2,
    },
    { code: "13102", name: "新宿区", rentPerSqm: null },
  ],
};
describe("safe answer blocks", () => {
  it("copies exact tool numbers, omits missing values and builds local links", () => {
    const blocks = blocksFromTool("search_municipality", output);
    expect(blocks[0]).toEqual({
      type: "towns",
      towns: [
        { ...output.results[0], url: "/houi/area/13101" },
        { code: "13102", name: "新宿区", url: "/houi/area/13102" },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: "rentTable",
      towns: [{ rentPerSqm: 3210.75 }],
    });
    expect(blocks.every((b) => answerBlockSchema.safeParse(b).success)).toBe(
      true,
    );
  });
  it("converts all supported result shapes", () => {
    expect(
      blocksFromTool("area_directions", {
        directions: [{ nearest: output.results }],
      }),
    ).toHaveLength(2);
    expect(
      blocksFromTool("prefecture_summary", {
        pref: "東京都",
        byDirection: [{ municipalities: output.results }],
      }),
    ).toHaveLength(2);
    expect(
      blocksFromTool("judge_directions", {
        date: "2026-11-01",
        directions: [
          { direction: "N", label: "北", status: "SAFE", tier: "C" },
        ],
      }),
    ).toHaveLength(1);
    expect(
      blocksFromTool("find_auspicious_days", {
        directions: [
          { direction: "E", label: "東", bestDays: [{ date: "2026-11-01" }] },
        ],
      }),
    ).toEqual([
      {
        type: "days",
        days: [{ date: "2026-11-01", direction: "E", label: "東" }],
      },
    ]);
    for (const tool of ["search_articles", "get_article"]) {
      const a = { title: "記事", description: "説明", slug: "moving" };
      expect(
        blocksFromTool(
          tool,
          tool === "get_article" ? { ...a, found: true } : { articles: [a] },
        ),
      ).toEqual([
        {
          type: "articles",
          articles: [
            { title: "記事", description: "説明", url: "/blog/moving" },
          ],
        },
      ]);
    }
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "https://cloud-palette.com.evil/x",
  ])("rejects URL %s", (url) =>
    expect(sitePathSchema.safeParse(url).success).toBe(false),
  );
  it("validates types, bounds, dates and hostile plain text independently", () => {
    for (const text of [
      "<script>alert(1)</script>",
      "onerror=alert(1)",
      "x".repeat(401),
    ])
      expect(
        answerBlockSchema.safeParse({ type: "callout", text }).success,
      ).toBe(false);
    expect(
      parseAnswerBlocks([
        { type: "callout", text: "参考情報です" },
        { type: "evil" },
      ]),
    ).toHaveLength(1);
    expect(
      answerBlockSchema.safeParse({
        type: "days",
        days: [{ date: "2026-02-30", direction: "N", label: "北" }],
      }).success,
    ).toBe(false);
    expect(
      answerBlockSchema.safeParse({
        type: "callout",
        text: "補足",
        html: "<b>x</b>",
      }).success,
    ).toBe(false);
  });
  it("rejects unknown ids and model-injected numbers", () => {
    const sources = new Map([
      ["real", { tool: "search_municipality", output }],
    ]);
    expect(() =>
      selectBlocks({ blocks: [{ type: "towns", ids: ["unknown"] }] }, sources),
    ).toThrow("未知");
    expect(() =>
      selectBlocks(
        { blocks: [{ type: "towns", ids: ["real"], rentPerSqm: 1 }] },
        sources,
      ),
    ).toThrow();
    expect(
      selectBlocks({ blocks: [{ type: "towns", ids: ["real"] }] }, sources),
    ).toEqual([blocksFromTool("search_municipality", output)[0]]);
  });
  it("renders cards, calendar, compass, table and safe markdown without HTML", () => {
    const blocks = [
      ...blocksFromTool("search_municipality", output),
      ...blocksFromTool("judge_directions", {
        directions: [
          { direction: "N", label: "北", status: "SAFE", tier: "C" },
        ],
      }),
      ...blocksFromTool("find_auspicious_days", {
        directions: [
          { direction: "E", label: "東", bestDays: [{ date: "2026-11-01" }] },
        ],
      }),
      ...blocksFromTool("get_article", {
        found: true,
        slug: "moving",
        title: "記事",
        description: "説明",
      }),
      { type: "callout", text: "参考情報です" },
      { type: "text", text: "**安全**" },
      { type: "callout", text: "<script>bad</script>" },
    ];
    const { container } = render(<AnswerBlocks blocks={blocks} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("2026-11-01")).toBeInTheDocument();
    expect(screen.getByLabelText("八方位")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "記事" })).toHaveAttribute(
      "href",
      "/blog/moving",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("strong")).not.toBeNull();
  });
  it("never makes external or script Markdown links into anchors", () => {
    const { container } = render(
      <AgentAnswer
        text={
          "<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert) [outside](https://evil.example/x) [ok](/blog/moving) onerror=alert(1)"
        }
      />,
    );
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelectorAll("script,img,[onerror]")).toHaveLength(0);
  });
  it("redirects the old route and keeps canonical and noindex", async () => {
    expect(await nextConfig.redirects!()).toContainEqual({
      source: "/houi/mcp-explorer",
      destination: "/ask",
      permanent: true,
    });
    expect(metadata.alternates).toEqual({ canonical: "/ask" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(JSON.stringify(metadata)).not.toContain("MCP");
  });
});
