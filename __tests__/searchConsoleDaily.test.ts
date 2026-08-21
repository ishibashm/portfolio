import { describe, expect, it } from "vitest";

import { fetchDailyBreakdown } from "@/lib/searchConsole";

/**
 * 日 × 検索語 × 頁の取り込み。
 *
 * ここで確かめたいのは 3 つ。
 *
 *   1. dimensions を date / query / page の順で投げていること
 *      （keys の並びがこの順に依存しているので、片方だけ変えると
 *        query と page が入れ替わって静かに壊れる）
 *   2. 上限に当たったことを truncated で返すこと
 *      （黙って一部だけ保存すると「その日はこれしか無かった」と読める）
 *   3. keys が欠けた行を落とすこと（鍵を作れないため）
 */

function fakeFetch(body: unknown, ok = true) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok,
      status: ok ? 200 : 403,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const row = (
  date: string,
  query: string,
  page: string,
  clicks = 1,
  impressions = 10,
) => ({
  keys: [date, query, page],
  clicks,
  impressions,
  ctr: 0.1,
  position: 5,
});

describe("fetchDailyBreakdown", () => {
  it("dimensions を date / query / page の順で投げる", async () => {
    const { impl, calls } = fakeFetch({ rows: [] });
    await fetchDailyBreakdown(
      "tok",
      { startDate: "2026-08-01", endDate: "2026-08-07" },
      impl,
    );

    expect(calls).toHaveLength(1);
    const sent = JSON.parse(String(calls[0].init.body));
    // 並びが変わると keys の読み取りが静かにずれる。順序ごと固定する。
    expect(sent.dimensions).toEqual(["date", "query", "page"]);
    expect(sent.startDate).toBe("2026-08-01");
    expect(sent.endDate).toBe("2026-08-07");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer tok",
    });
  });

  it("keys をそのまま date / query / page に写す", async () => {
    const { impl } = fakeFetch({
      rows: [
        row("2026-08-01", "方位 引越し", "https://cloud-palette.com/houi"),
      ],
    });
    const { rows, truncated } = await fetchDailyBreakdown(
      "tok",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      impl,
    );

    expect(truncated).toBe(false);
    expect(rows).toEqual([
      {
        date: "2026-08-01",
        query: "方位 引越し",
        page: "https://cloud-palette.com/houi",
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 5,
      },
    ]);
  });

  it("rowLimit と同数なら truncated を立てる", async () => {
    // 上限で切られたかどうかは行数でしか分からない。同数なら疑う。
    const { impl } = fakeFetch({
      rows: [row("2026-08-01", "a", "p1"), row("2026-08-01", "b", "p2")],
    });
    const { rows, truncated } = await fetchDailyBreakdown(
      "tok",
      { startDate: "2026-08-01", endDate: "2026-08-01", rowLimit: 2 },
      impl,
    );

    expect(rows).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it("rowLimit 未満なら truncated は立てない", async () => {
    const { impl } = fakeFetch({ rows: [row("2026-08-01", "a", "p1")] });
    const { truncated } = await fetchDailyBreakdown(
      "tok",
      { startDate: "2026-08-01", endDate: "2026-08-01", rowLimit: 2 },
      impl,
    );

    expect(truncated).toBe(false);
  });

  it("keys が欠けた行は落とす", async () => {
    // date / query / page のどれかが無いと鍵を作れない。空文字で
    // 埋めると別々の行が同じ鍵に潰れるので、行ごと落とす。
    const { impl } = fakeFetch({
      rows: [
        { keys: ["2026-08-01", "a"], clicks: 1, impressions: 2 },
        { keys: [], clicks: 1, impressions: 2 },
        row("2026-08-01", "b", "p2"),
      ],
    });
    const { rows } = await fetchDailyBreakdown(
      "tok",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      impl,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].query).toBe("b");
  });

  it("rows が無い応答でも落ちない", async () => {
    const { impl } = fakeFetch({});
    const { rows, truncated } = await fetchDailyBreakdown(
      "tok",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      impl,
    );

    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("失敗したら投げる（黙って空を返さない）", async () => {
    const { impl } = fakeFetch({ error: "forbidden" }, false);
    await expect(
      fetchDailyBreakdown(
        "tok",
        { startDate: "2026-08-01", endDate: "2026-08-01" },
        impl,
      ),
    ).rejects.toThrow("searchAnalytics 403");
  });
});
