// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { POST as postAnnaiGo } from "@/app/annai/go/route";
import { generateMetadata } from "@/app/annai/page";
import KenshoPage, { metadata as kenshoMetadata } from "@/app/kensho/page";
import McpGuidePage, { metadata as mcpMetadata } from "@/app/mcp/page";
import { KENSHO_PLANNED_THEMES, KENSHO_PRINCIPLES } from "@/lib/kenshoPlan";
import { loadMcpToolCatalog } from "@/lib/mcpToolCatalog";
import {
  GUIDE_AI_PAUSED_TEXT,
  summarizeWithGuideAi,
} from "@/lib/guide/guideAi";
import {
  ANNAI_MOVE_COOKIE,
  encodeMoveCookie,
  GUIDE_TOPICS,
  parseGuideQuery,
  parseMoveCookie,
  readCookieFromHeader,
  type GuideQueryStep3,
} from "@/lib/guide/guideForm";
import { buildGuideFollowUps, loadGuideAnswer } from "@/lib/guide/guidePage";
import { emptyGuideFacts, planGuide, runGuide } from "@/lib/guide/guideRun";
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

    // move: クエリに b/m を入れても無視し step 2 に戻す。壊れた cookie も step 2 に戻す
    expect(
      parseGuideQuery(
        {
          kind: "move",
          view: "answer",
          b: "1990-05-15",
          m: "東京都新宿区",
        },
        now,
      ),
    ).toEqual({
      step: 2,
      kind: "move",
      p: 30,
    });
    expect(
      parseMoveCookie(
        Buffer.from(
          JSON.stringify({ b: "2026-02-30", m: "東京都新宿区", p: 30 }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(
      parseMoveCookie(
        Buffer.from(
          JSON.stringify({ b: "1899-12-31", m: "東京都新宿区", p: 30 }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(
      parseMoveCookie(
        Buffer.from(
          JSON.stringify({ b: "1990-05-15", m: "あ", p: 30 }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(
      parseMoveCookie(
        Buffer.from(
          JSON.stringify({ b: "1990-05-15", m: "あ".repeat(41), p: 30 }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(
      parseMoveCookie(
        Buffer.from(
          JSON.stringify({ b: "1990-05-15", m: "新宿区<script>", p: 30 }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(
      parseMoveCookie(
        Buffer.from(
          JSON.stringify({ b: "1990-05-15", m: "新宿区\u0000", p: 30 }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
    expect(parseMoveCookie("not-valid-base64-json!!!")).toBeUndefined();

    // read: 未知の話題
    expect(
      parseGuideQuery({ kind: "read", t: "invalid_topic" }, now).step,
    ).toBe(2);
  });

  it("kind=move はクエリの b を無視し、view=answer かつ有効な cookie があるときだけ step 3 を返す", () => {
    expect(
      parseGuideQuery({ kind: "honmei", y: "1990", s: "before" }, now),
    ).toEqual({
      step: 3,
      kind: "honmei",
      y: 1990,
      s: "before",
    });

    const moveCookie = encodeMoveCookie({
      b: "1990-05-15",
      m: "長崎県長崎市",
      c: "42201",
      p: 90,
    });

    // view=answer が無ければ cookie があっても step 2（初期値入り）
    expect(parseGuideQuery({ kind: "move" }, now, moveCookie)).toEqual({
      step: 2,
      kind: "move",
      b: "1990-05-15",
      m: "長崎県長崎市",
      c: "42201",
      p: 90,
    });

    // error=1 のときは step 2 に error: true が付く
    expect(
      parseGuideQuery({ kind: "move", error: "1" }, now, moveCookie),
    ).toEqual({
      step: 2,
      kind: "move",
      b: "1990-05-15",
      m: "長崎県長崎市",
      c: "42201",
      p: 90,
      error: true,
    });

    // クエリに別の b が入っていても無視し、cookie の値を使う
    expect(
      parseGuideQuery(
        {
          kind: "move",
          view: "answer",
          b: "1980-01-01",
          m: "東京都千代田区",
        },
        now,
        moveCookie,
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

describe("POST /annai/go と buildGuideFollowUps（生年月日を URL に載せない）", () => {
  it("正しい入力で 303・Location が /annai?kind=move&view=answer・Set-Cookie に HttpOnly と Path=/annai があり Location に生年月日が入らない", async () => {
    const body = new URLSearchParams({
      b: "1990-05-15",
      m: "東京都新宿区",
      c: "13104",
      p: "90",
    });
    const req = new Request("https://cloud-palette.com/annai/go", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const res = await postAnnaiGo(req);
    expect(res.status).toBe(303);
    const location = res.headers.get("Location");
    expect(location).toBe("/annai?kind=move&view=answer");
    expect(location).not.toContain("1990-05-15");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${ANNAI_MOVE_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/annai");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=1800");

    const rawVal = readCookieFromHeader(setCookie, ANNAI_MOVE_COOKIE);
    expect(parseMoveCookie(rawVal)).toEqual({
      b: "1990-05-15",
      m: "東京都新宿区",
      c: "13104",
      p: 90,
    });
  });

  it("不正入力や4KB超過のときは 303 で /annai?kind=move&error=1 へリダイレクトする", async () => {
    const badReq = new Request("https://cloud-palette.com/annai/go", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        b: "2026-02-30",
        m: "東京都新宿区",
      }).toString(),
    });
    const badRes = await postAnnaiGo(badReq);
    expect(badRes.status).toBe(303);
    expect(badRes.headers.get("Location")).toBe("/annai?kind=move&error=1");
    expect(badRes.headers.get("Cache-Control")).toBe("no-store");
    expect(badRes.headers.get("Set-Cookie")).toBeNull();

    // 4KB超過
    const hugeReq = new Request("https://cloud-palette.com/annai/go", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `b=1990-05-15&m=${"あ".repeat(2000)}`,
    });
    const hugeRes = await postAnnaiGo(hugeReq);
    expect(hugeRes.status).toBe(303);
    expect(hugeRes.headers.get("Location")).toBe("/annai?kind=move&error=1");
  });

  it("action=clear で cookie を削除して 303 で /annai へリダイレクトする", async () => {
    const req = new Request("https://cloud-palette.com/annai/go", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "clear" }).toString(),
    });
    const res = await postAnnaiGo(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/annai");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${ANNAI_MOVE_COOKIE}=;`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/annai");
    expect(setCookie).toContain("HttpOnly");
  });

  it("フォームに b が無い・空のときは既存 cookie の b を使う", async () => {
    const existing = encodeMoveCookie({
      b: "1988-11-23",
      m: "東京都新宿区",
      c: "13104",
      p: 30,
    });
    const req = new Request("https://cloud-palette.com/annai/go", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${ANNAI_MOVE_COOKIE}=${existing}`,
      },
      body: new URLSearchParams({
        m: "神奈川県横浜市中区",
        c: "14104",
        p: "90",
      }).toString(),
    });

    const res = await postAnnaiGo(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/annai?kind=move&view=answer");
    const rawVal = readCookieFromHeader(
      res.headers.get("Set-Cookie"),
      ANNAI_MOVE_COOKIE,
    );
    expect(parseMoveCookie(rawVal)).toEqual({
      b: "1988-11-23",
      m: "神奈川県横浜市中区",
      c: "14104",
      p: 90,
    });
  });

  it("buildGuideFollowUps の戻り値の href にも post にも生年月日が入らない", () => {
    const facts = emptyGuideFacts();
    facts.origin = { code: "13104", name: "東京都新宿区", lon: 139.7 };
    facts.towns = [
      {
        code: "13103",
        name: "東京都港区",
        direction: "S",
        directionLabel: "南",
      },
    ];
    const followUps = buildGuideFollowUps(
      {
        step: 3,
        kind: "move",
        b: "1990-05-15",
        m: "東京都新宿区",
        c: "13104",
        p: 30,
      },
      facts,
    );

    expect(followUps.length).toBeGreaterThanOrEqual(3);
    for (const item of followUps) {
      if ("href" in item) {
        expect(item.href).not.toContain("1990-05-15");
        expect(item.href).not.toContain("b=");
      } else {
        expect(item.post).not.toHaveProperty("b");
        expect(JSON.stringify(item.post)).not.toContain("1990-05-15");
      }
    }
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
  it("searchParams が空の入口は robots を指定せず（既定の index）、パラメータ付きは noindex,nofollow にする", async () => {
    const entryMeta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(entryMeta.alternates?.canonical).toBe("/annai");
    expect(entryMeta.robots).toBeUndefined();

    const step2Meta = await generateMetadata({
      searchParams: Promise.resolve({ kind: "move" }),
    });
    expect(step2Meta.alternates?.canonical).toBe("/annai");
    expect(step2Meta.robots).toEqual({ index: false, follow: false });

    const answerMeta = await generateMetadata({
      searchParams: Promise.resolve({ kind: "move", view: "answer" }),
    });
    expect(answerMeta.robots).toEqual({ index: false, follow: false });
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

describe("/kensho と /mcp のページ検証", () => {
  it("/kensho は結論や数値の結果を出しておらず、13テーマすべてが計画中である", () => {
    expect(kenshoMetadata.title).toBe(
      "たしかめる｜占いや言い伝えを公的データで検証する",
    );
    expect(kenshoMetadata.alternates?.canonical).toBe("/kensho");
    expect(kenshoMetadata.robots).toBeUndefined();

    expect(KENSHO_PRINCIPLES.length).toBe(6);
    expect(KENSHO_PLANNED_THEMES).toHaveLength(13);
    for (const theme of KENSHO_PLANNED_THEMES) {
      expect(theme.status).toBe("計画中");
    }

    const html = renderToStaticMarkup(KenshoPage());
    expect(html).toContain("計画中");
    expect(html).toContain("丙午");
    expect(html).toContain("六曜");
    expect(html).toContain("厄年");
    expect(html).toContain("九星気学");
    expect(html).toContain("奇門遁甲");
    expect(html).toContain("姓名判断");
    expect(html).toContain("手相");
    expect(html).toContain('href="/annai"');
    expect(html).toContain('href="/mcp"');
    // 架空の統計結果（p値の実測値や有意差の結論など）が含まれないこと
    expect(html).not.toMatch(/p\s*[<>=]\s*0\.\d+/i);
  });

  it("/mcp は createMcpServer() から listTools() で公開17道具の一覧を生成し、上限とセキュリティ方針を表示する", async () => {
    expect(mcpMetadata.title).toBe(
      "MCPで使う｜AIアシスタントから方位と暦の計算を呼ぶ",
    );
    expect(mcpMetadata.alternates?.canonical).toBe("/mcp");
    expect(mcpMetadata.robots).toBeUndefined();

    const catalog = await loadMcpToolCatalog();
    expect(catalog.fromFallback).toBe(false);
    expect(catalog.tools).toHaveLength(17);
    expect(catalog.tools.map((t) => t.name)).toContain("get_honmei_star");
    expect(catalog.tools.map((t) => t.name)).toContain("judge_directions");

    const element = await McpGuidePage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("https://cloud-palette.com/api/mcp");
    expect(html).toContain('href="/annai"');
    expect(html).toContain("256KB");
    expect(html).toContain("占いの計算結果は参考情報です");
    expect(html).toContain("/.well-known/security.txt");
    expect(html).toContain("/contact");
  });
});
