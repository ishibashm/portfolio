// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { metadata } from "@/app/annai/page";
import {
  GUIDE_AI_PAUSED_TEXT,
  summarizeWithGuideAi,
} from "@/lib/guide/guideAi";
import {
  GUIDE_TOPICS,
  parseGuideQuery,
  type GuideQueryStep3,
} from "@/lib/guide/guideForm";
import { loadGuideAnswer } from "@/lib/guide/guidePage";
import { planGuide, runGuide } from "@/lib/guide/guideRun";
import { buildGuideSummary } from "@/lib/guide/guideSummary";
import {
  GUIDE_TOOLS,
  assertGuideTool,
  connectGuideClient,
  type GuideCaller,
} from "@/lib/guide/guideTools";
import {
  collectEvidence,
  extractClaims,
  verifySentences,
} from "@/lib/guide/guideVerify";

describe("guideTools", () => {
  it("GUIDE_TOOLS に賃貸の道具・記憶の道具が含まれず、7つの許可道具だけを持つ", () => {
    expect(GUIDE_TOOLS).toEqual([
      "get_honmei_star",
      "judge_directions",
      "find_auspicious_days",
      "search_municipality",
      "area_directions",
      "search_articles",
      "get_today_directions",
    ]);
    const list = GUIDE_TOOLS as readonly string[];
    expect(list).not.toContain("search_rentals");
    expect(list).not.toContain("get_rental");
    expect(list).not.toContain("rental_market_stats");
    expect(list).not.toContain("propose_save");
    expect(list).not.toContain("save_memory");
    expect(list).not.toContain("get_memories");
    expect(list).not.toContain("remember_consultation");
  });

  it("assertGuideTool は未許可の道具名で例外を投げる", () => {
    for (const toolName of GUIDE_TOOLS) {
      expect(() => assertGuideTool(toolName)).not.toThrow();
    }
    for (const forbidden of [
      "search_rentals",
      "get_rental",
      "rental_market_stats",
      "propose_save",
      "get_profile",
      "unknown_tool",
      "",
    ]) {
      expect(() => assertGuideTool(forbidden)).toThrow();
    }
  });

  it("connectGuideClient で内部MCPサーバーへ接続し、未許可の道具は拒否する", async () => {
    const client = await connectGuideClient();
    try {
      const honmei = await client.call("get_honmei_star", {
        birthYear: 1990,
        bornBeforeSetsubun: false,
      });
      expect(honmei).toMatchObject({ birthYear: 1990, honmeiStar: 1 });
      await expect(client.call("search_rentals", {})).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});

describe("parseGuideQuery", () => {
  const now = new Date("2026-11-14T09:00:00+09:00");

  it("種類未選択や未知の kind は step 1 に戻す", () => {
    expect(parseGuideQuery(undefined, now)).toEqual({ step: 1 });
    expect(parseGuideQuery({}, now)).toEqual({ step: 1 });
    expect(parseGuideQuery({ kind: "unknown" }, now)).toEqual({ step: 1 });
    expect(parseGuideQuery({ kind: "chat" }, now)).toEqual({ step: 1 });
  });

  it("不正な年・日付・長すぎる市区町村・禁止文字を弾いて step 2 に戻す", () => {
    // honmei: 1899年、未来の年、非整数、不正な s
    expect(
      parseGuideQuery({ kind: "honmei", y: "1899", s: "after" }, now).step,
    ).toBe(2);
    expect(
      parseGuideQuery({ kind: "honmei", y: "2027", s: "after" }, now).step,
    ).toBe(2);
    expect(
      parseGuideQuery({ kind: "honmei", y: "1990.5", s: "after" }, now).step,
    ).toBe(2);
    expect(
      parseGuideQuery({ kind: "honmei", y: "1990", s: "invalid" }, now).step,
    ).toBe(2);

    // move: 実在しない日付、範囲外の日付、短すぎる/長すぎる市区町村、禁止文字
    expect(
      parseGuideQuery({ kind: "move", b: "2026-02-30", m: "東京都新宿区" }, now)
        .step,
    ).toBe(2);
    expect(
      parseGuideQuery({ kind: "move", b: "1899-12-31", m: "東京都新宿区" }, now)
        .step,
    ).toBe(2);
    expect(
      parseGuideQuery({ kind: "move", b: "1990-05-15", m: "あ" }, now).step,
    ).toBe(2);
    expect(
      parseGuideQuery(
        { kind: "move", b: "1990-05-15", m: "あ".repeat(41) },
        now,
      ).step,
    ).toBe(2);
    expect(
      parseGuideQuery(
        { kind: "move", b: "1990-05-15", m: "新宿区<script>" },
        now,
      ).step,
    ).toBe(2);
    expect(
      parseGuideQuery({ kind: "move", b: "1990-05-15", m: "新宿区\u0000" }, now)
        .step,
    ).toBe(2);

    // read: 未知の話題
    expect(
      parseGuideQuery({ kind: "read", t: "invalid_topic" }, now).step,
    ).toBe(2);
  });

  it("正しいパラメータが揃えば step 3 を返す", () => {
    expect(
      parseGuideQuery({ kind: "honmei", y: "1990", s: "before" }, now),
    ).toEqual({
      step: 3,
      kind: "honmei",
      y: 1990,
      s: "before",
    });

    expect(
      parseGuideQuery(
        {
          kind: "move",
          b: "1990-05-15",
          m: " 長崎県長崎市 ",
          c: "42201",
          p: "90",
        },
        now,
      ),
    ).toEqual({
      step: 3,
      kind: "move",
      b: "1990-05-15",
      m: "長崎県長崎市",
      c: "42201",
      p: 90,
    });

    expect(parseGuideQuery({ kind: "read", t: "rokuyo" }, now)).toEqual({
      step: 3,
      kind: "read",
      t: "rokuyo",
    });
  });
});

describe("guideVerify", () => {
  const sampleOutputs = [
    {
      birthYear: 1990,
      honmeiStar: 1,
      date: "2026-11-20",
      directions: [
        { direction: "E", label: "東", tier: "S", status: "OPTIMAL" },
      ],
      articles: [
        {
          title: "本命星の調べ方",
          url: "https://cloud-palette.com/blog/honmei-guide",
        },
      ],
    },
  ];

  it("collectEvidence は数値・文字列・YYYY-MM-DD と M月D日 の両方を集める", () => {
    const evidence = collectEvidence(sampleOutputs);
    expect(evidence.has("1990")).toBe(true);
    expect(evidence.has("1")).toBe(true);
    expect(evidence.has("2026-11-20")).toBe(true);
    expect(evidence.has("11月20日")).toBe(true);
    expect(evidence.has("東")).toBe(true);
    expect(evidence.has("S")).toBe(true);
    expect(evidence.has("OPTIMAL")).toBe(true);
    expect(evidence.has("本命星の調べ方")).toBe(true);
    expect(evidence.has("https://cloud-palette.com/blog/honmei-guide")).toBe(
      true,
    );
  });

  it("verifySentences は道具の結果に無い数値・方位・URL・未登録の自由文を捨て、裏づけのある文だけ残す", () => {
    const evidence = collectEvidence(sampleOutputs);
    const sentences = [
      "1990年の本命星は1です。",
      "11月20日の東は段階S（OPTIMAL）です。",
      "参考記事として「本命星の調べ方」（https://cloud-palette.com/blog/honmei-guide）が確認できます。",
      "1990年の本命星は9です。", // 結果に無い数値 9
      "南西が吉方位です。", // 結果に無い方位 南西
      "詳しくは https://example.com/fake をご覧ください。", // 結果に無い外部URL
      "きっと素晴らしい引越しになります。", // 主張0個かつ allowlist 外
      "吉凶は九星気学の考え方による参考情報です。", // allowlist 内の定型文
    ];

    const result = verifySentences(sentences, evidence);
    expect(result.kept).toEqual([
      "1990年の本命星は1です。",
      "11月20日の東は段階S（OPTIMAL）です。",
      "参考記事として「本命星の調べ方」（https://cloud-palette.com/blog/honmei-guide）が確認できます。",
      "吉凶は九星気学の考え方による参考情報です。",
    ]);
    expect(result.dropped).toEqual([
      "1990年の本命星は9です。",
      "南西が吉方位です。",
      "詳しくは https://example.com/fake をご覧ください。",
      "きっと素晴らしい引越しになります。",
    ]);
    expect(result.matchedValues).toEqual(
      expect.arrayContaining([
        "1990",
        "1",
        "11月20日",
        "東",
        "S",
        "OPTIMAL",
        "本命星の調べ方",
        "https://cloud-palette.com/blog/honmei-guide",
      ]),
    );
  });

  it("extractClaims は日付・方位・段階・URL・引用語を抽出する", () => {
    const claims = extractClaims(
      "2026-11-20（11月20日）は北東が段階A（OPTIMAL_REGULAR）で、「東京都新宿区」（https://cloud-palette.com/houi/area/13104）の候補が2件あります。",
    );
    expect(claims).toEqual(
      expect.arrayContaining([
        "https://cloud-palette.com/houi/area/13104",
        "東京都新宿区",
        "2026-11-20",
        "11月20日",
        "OPTIMAL_REGULAR",
        "A",
        "北東",
        "2",
      ]),
    );
  });
});

describe("runGuide", () => {
  const now = new Date("2026-11-14T09:00:00+09:00");

  it("honmei: get_honmei_star → search_articles の順に呼び trace と facts を残す", async () => {
    const call = vi.fn<GuideCaller>(async (name) => {
      if (name === "get_honmei_star") {
        return { birthYear: 1990, honmeiStar: 1 };
      }
      if (name === "search_articles") {
        return {
          articles: [
            {
              title: "本命星の早見表",
              url: "https://cloud-palette.com/blog/honmei",
            },
            {
              title: "外部の怪しい記事",
              url: "https://evil.example.com/phish",
            },
          ],
        };
      }
      throw new Error(`unexpected tool: ${name}`);
    });

    const query: GuideQueryStep3 = {
      step: 3,
      kind: "honmei",
      y: 1990,
      s: "after",
    };
    const res = await runGuide(query, call, { now });

    expect(call.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ["get_honmei_star", { birthYear: 1990, bornBeforeSetsubun: false }],
      ["search_articles", { query: "本命星", limit: 3 }],
    ]);
    expect(res.trace).toHaveLength(2);
    expect(res.trace.every((t) => t.ok)).toBe(true);
    expect(res.facts.honmeiStar).toBe(1);
    // 外部URLは除外されること
    expect(res.facts.articles).toEqual([
      {
        title: "本命星の早見表",
        url: "https://cloud-palette.com/blog/honmei",
      },
    ]);
  });

  it("move: 候補が複数のときは候補一覧を返して後続の道具を呼ばずに止まる", async () => {
    const call = vi.fn<GuideCaller>(async (name) => {
      if (name === "search_municipality") {
        return {
          results: [
            { code: "13104", name: "東京都新宿区", lon: 139.7 },
            { code: "14104", name: "神奈川県横浜市中区", lon: 139.64 },
          ],
        };
      }
      throw new Error("should not be called");
    });

    const query: GuideQueryStep3 = {
      step: 3,
      kind: "move",
      b: "1990-05-15",
      m: "中",
      p: 30,
    };
    const res = await runGuide(query, call, { now });

    expect(call).toHaveBeenCalledTimes(1);
    expect(res.needsMunicipalitySelection).toBe(true);
    expect(res.facts.municipalityCandidates).toHaveLength(2);
    expect(res.trace).toHaveLength(1);
    expect(res.trace[0].tool).toBe("search_municipality");
  });

  it("move: 1件に決まれば4つの道具を順番に呼ぶ（c指定時も結果内のコードだけ使う）", async () => {
    const call = vi.fn<GuideCaller>(async (name) => {
      if (name === "search_municipality") {
        return {
          results: [
            { code: "42201", name: "長崎県長崎市", lon: 129.87 },
            { code: "42202", name: "長崎県佐世保市", lon: 129.72 },
          ],
        };
      }
      if (name === "judge_directions") {
        return {
          date: "2026-11-14",
          honmeiStar: 1,
          directions: [
            { direction: "E", label: "東", tier: "S", status: "OPTIMAL" },
          ],
        };
      }
      if (name === "find_auspicious_days") {
        return {
          directions: [
            {
              direction: "E",
              label: "東",
              bestDays: [{ date: "2026-11-20", tier: "S", status: "OPTIMAL" }],
            },
          ],
        };
      }
      if (name === "area_directions") {
        return {
          origin: { code: "42201", name: "長崎県長崎市", lon: 129.87 },
          directions: [
            {
              direction: "E",
              label: "東",
              nearest: [{ code: "42204", name: "長崎県諫早市" }],
            },
          ],
        };
      }
      throw new Error(`unexpected: ${name}`);
    });

    const query: GuideQueryStep3 = {
      step: 3,
      kind: "move",
      b: "1990-05-15",
      m: "長崎",
      c: "42201",
      p: 90,
    };
    const res = await runGuide(query, call, { now });

    expect(res.needsMunicipalitySelection).toBe(false);
    expect(res.trace.map((t) => t.tool)).toEqual([
      "search_municipality",
      "judge_directions",
      "find_auspicious_days",
      "area_directions",
    ]);
    expect(res.trace.every((t) => t.ok)).toBe(true);
    expect(call.mock.calls[1]).toEqual([
      "judge_directions",
      { birthDate: "1990-05-15", lon: 129.87, date: "2026-11-14" },
      expect.any(AbortSignal),
      expect.any(Number),
    ]);
    expect(call.mock.calls[2]).toEqual([
      "find_auspicious_days",
      {
        birthDate: "1990-05-15",
        lon: 129.87,
        from: "2026-11-14",
        days: 90,
        maxDaysPerDirection: 3,
      },
      expect.any(AbortSignal),
      expect.any(Number),
    ]);
    expect(call.mock.calls[3]).toEqual([
      "area_directions",
      { code: "42201", perDirection: 2 },
      expect.any(AbortSignal),
      expect.any(Number),
    ]);
    expect(res.facts.origin?.name).toBe("長崎県長崎市");
    expect(res.facts.directions).toEqual([
      { direction: "E", label: "東", tier: "S", status: "OPTIMAL" },
    ]);
    expect(res.facts.auspiciousDays).toEqual([
      {
        direction: "E",
        label: "東",
        date: "2026-11-20",
        tier: "S",
        status: "OPTIMAL",
      },
    ]);
    expect(res.facts.towns).toEqual([
      {
        code: "42204",
        name: "長崎県諫早市",
        direction: "E",
        directionLabel: "東",
      },
    ]);
  });

  it("read: 話題の検索語で search_articles を呼ぶ", async () => {
    const call = vi.fn<GuideCaller>(async () => ({
      articles: [
        {
          title: "六曜と引越しの関係",
          url: "/blog/rokuyo-move",
        },
      ],
    }));

    const query: GuideQueryStep3 = { step: 3, kind: "read", t: "rokuyo" };
    const res = await runGuide(query, call, { now });

    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toBe("search_articles");
    expect(call.mock.calls[0][1]).toEqual({
      query: GUIDE_TOPICS.rokuyo.query,
      limit: 5,
    });
    expect(res.trace[0]).toMatchObject({
      id: 1,
      tool: "search_articles",
      ok: true,
    });
    expect(res.facts.articles).toEqual([
      { title: "六曜と引越しの関係", url: "/blog/rokuyo-move" },
    ]);
  });

  it("時間切れの道具は ok:false として trace に残り、例外を外へ投げない", async () => {
    const call = vi.fn<GuideCaller>(
      () => new Promise(() => {}), // 永久に解決しない
    );

    const query: GuideQueryStep3 = { step: 3, kind: "read", t: "honmei" };
    const res = await runGuide(query, call, { now, callMs: 15, totalMs: 50 });

    expect(res.trace).toHaveLength(1);
    expect(res.trace[0].ok).toBe(false);
    expect(res.trace[0].summary).toContain("失敗");
  });

  it("定型文の要約はすべて verifySentences を通過する", async () => {
    const call = vi.fn<GuideCaller>(async (name) => {
      if (name === "get_honmei_star") {
        return {
          birthYear: 1990,
          candidates: { beforeSetsubun: 2, afterSetsubun: 1 },
        };
      }
      return {
        date: "2026-11-14",
        stars: [
          {
            star: 1,
            name: "一白水星",
            today: {
              lucky: ["東"],
              unlucky: ["北（五黄殺）"],
              neutral: ["南"],
            },
          },
        ],
      };
    });

    const query: GuideQueryStep3 = {
      step: 3,
      kind: "today",
      y: 1990,
      s: "unknown",
    };
    const res = await runGuide(query, call, { now });
    const evidence = collectEvidence(res.outputs, query);
    const summary = buildGuideSummary(res.facts, evidence);

    expect(res.facts.usedAfterSetsubunCandidate).toBe(true);
    expect(summary.dropped).toEqual([]);
    expect(summary.sentences.length).toBeGreaterThanOrEqual(3);
  });
});

describe("loadGuideAnswer（停止スイッチ・上限・AI停止）", () => {
  const query: GuideQueryStep3 = {
    step: 3,
    kind: "honmei",
    y: 1990,
    s: "after",
  };

  it("MCP_PUBLIC_ENABLED=false のときは道具も checkMcpPublicLimit も呼ばず stopped を返す", async () => {
    const checkLimit = vi.fn();
    const connect = vi.fn();

    const answer = await loadGuideAnswer({
      query,
      headers: new Headers(),
      deps: {
        env: { MCP_PUBLIC_ENABLED: "false", PAID_APIS_DISABLED: "true" },
        checkMcpPublicLimit: checkLimit,
        connect,
      },
    });

    expect(answer.status).toBe("stopped");
    expect(answer.message).toContain("停止中");
    expect(checkLimit).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("checkMcpPublicLimit が上限超過を返したときは道具を呼ばず rate_limited を返す", async () => {
    const connect = vi.fn();
    const checkLimit = vi.fn(async () => ({
      denied: new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
      headers: new Headers({ "Retry-After": "42" }),
    }));

    const answer = await loadGuideAnswer({
      query,
      headers: new Headers(),
      deps: {
        env: { MCP_PUBLIC_ENABLED: "true", PAID_APIS_DISABLED: "true" },
        checkMcpPublicLimit: checkLimit,
        connect,
      },
    });

    expect(answer.status).toBe("rate_limited");
    expect(answer.retryAfterSeconds).toBe(42);
    expect(answer.message).toContain("42秒");
    expect(checkLimit).toHaveBeenCalledTimes(1);
    // parsedBody に計画された道具の JSON-RPC 配列が渡されていること
    expect((checkLimit.mock.calls[0] as unknown[])[2]).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_honmei_star" },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search_articles" },
      },
    ]);
    expect(connect).not.toHaveBeenCalled();
  });

  it("paidApisDisabled のとき AI を一切呼ばず status が paused になる", async () => {
    const createModel = vi.fn();
    const generateTextFn = vi.fn();
    const canUseAgentFn = vi.fn();

    const aiResult = await summarizeWithGuideAi(
      {
        outputs: [{ birthYear: 1990, honmeiStar: 1 }],
        evidence: new Set(["1990", "1"]),
        headers: new Headers(),
      },
      {
        env: { PAID_APIS_DISABLED: "true", GUIDE_AI_ENABLED: "true" },
        createModel,
        generateTextFn:
          generateTextFn as unknown as typeof import("ai").generateText,
        canUseAgentFn:
          canUseAgentFn as unknown as typeof import("@/lib/agentEntitlement").canUseAgent,
      },
    );

    expect(aiResult.status).toBe("paused");
    expect(aiResult.note).toBe(GUIDE_AI_PAUSED_TEXT);
    expect(createModel).not.toHaveBeenCalled();
    expect(generateTextFn).not.toHaveBeenCalled();
    expect(canUseAgentFn).not.toHaveBeenCalled();
  });
});

describe("/annai metadata", () => {
  it("入口も答えも検索に載せない（/ask と同じ）", () => {
    expect(metadata.alternates?.canonical).toBe("/annai");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("planGuide は種類ごとに固定の道具列を返す", () => {
    const now = new Date("2026-11-14T09:00:00+09:00");
    expect(
      planGuide({ step: 3, kind: "honmei", y: 1990, s: "after" }, now).map(
        (p) => p.tool,
      ),
    ).toEqual(["get_honmei_star", "search_articles"]);
    expect(
      planGuide({ step: 3, kind: "today", y: 1990, s: "unknown" }, now).map(
        (p) => p.tool,
      ),
    ).toEqual(["get_honmei_star", "get_today_directions"]);
    expect(
      planGuide(
        { step: 3, kind: "move", b: "1990-05-15", m: "新宿区", p: 30 },
        now,
      ).map((p) => p.tool),
    ).toEqual([
      "search_municipality",
      "judge_directions",
      "find_auspicious_days",
      "area_directions",
    ]);
    expect(
      planGuide({ step: 3, kind: "read", t: "honmei" }, now).map((p) => p.tool),
    ).toEqual(["search_articles"]);
  });
});
