import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  answerBlockSchema,
  limitTownCards,
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
    ).toEqual([
      {
        type: "callout",
        text: "街の位置を確認しました。生年月日と出発地がそろうと、方位判定に合う街を表示できます。",
      },
    ]); // 未判定の方位を吉方位として表示しない
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

it("groups only auspicious directions, caps 6/18, and links remaining counts", () => {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map(
    (direction, i) => ({
      direction,
      label: direction,
      count: 30,
      nearest: Array.from({ length: 8 }, (_, j) => ({
        code: String(23000 + i * 100 + j),
        name: `愛知県名古屋市中区${j}`,
        rentPerSqm: null,
      })),
      status:
        i < 4
          ? ["OPTIMAL", "OPTIMAL_REGULAR", "OPTIMAL_BOOST", "吉"][i]
          : "SAFE",
    }),
  );
  const sources = new Map([
    ["judge", { tool: "judge_directions", output: { directions } }],
  ]);
  const blocks = blocksFromTool(
    "area_directions",
    { origin: { code: "23106" }, directions },
    sources,
  );
  expect(blocks).toHaveLength(4);
  expect(
    blocks.flatMap((b) => (b.type === "towns" ? b.towns : [])),
  ).toHaveLength(18);
  expect(blocks.map((b) => (b.type === "towns" ? b.towns.length : -1))).toEqual(
    [6, 6, 6, 0],
  );
  expect(blocks.map((b) => (b.type === "towns" ? b.remaining : -1))).toEqual([
    24, 24, 24, 30,
  ]);
  const { container } = render(
    <AnswerBlocks blocks={[...blocks, ...blocks]} />,
  );
  expect(container.querySelectorAll("article")).toHaveLength(18);
  expect(container.textContent).not.toContain("家賃");
  expect(container.querySelector("article a")?.textContent).toBe(
    "名古屋市中区0",
  );
  expect(
    container.querySelector("article")?.textContent?.match(/愛知県/g),
  ).toHaveLength(1);
  expect(container.querySelectorAll('a[href="/houi/area/23106"]')).toHaveLength(
    4,
  );
  expect(
    blocksFromTool("search_municipality", { results: directions[0].nearest }),
  ).toHaveLength(1);
});

it("shares card limits across multiple tool results and keeps hidden counts", () => {
  const town = { code: "23106", name: "名古屋市中区", url: "/houi/area/23106" };
  const blocks = limitTownCards(
    parseAnswerBlocks(
      ["N", "N", "E", "W", "S"].map((direction) => ({
        type: "towns",
        direction,
        towns: Array.from({ length: 6 }, () => town),
        remaining: 24,
        moreUrl: "/houi/area/23106",
      })),
    ),
  );
  expect(blocks.map((b) => (b.type === "towns" ? b.towns.length : -1))).toEqual(
    [6, 0, 6, 6, 0],
  );
  expect(blocks.map((b) => (b.type === "towns" ? b.remaining : -1))).toEqual([
    24, 30, 24, 24, 30,
  ]);
});
