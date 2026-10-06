import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CandidateHistory, {
  detailValue,
  directionLabel,
  sortCandidates,
  type Candidate,
} from "@/components/relocation/CandidateHistory";

/**
 * 保存した候補（/relocation/candidates）の一覧（利用者の指摘、2026-09-30
 * 「履歴ページが履歴というにはよくわからない」「ページが陳腐」）。
 *
 * - 方位は判定の鍵（NE など）ではなく日本語の方位名で出す。以前は
 *   「NE（真北 45.0°）」と内部の鍵がそのまま出ていた
 * - 段階の札、件数と段階ごとの数、並べ替え（段階の良い順・近い順）
 * - 0 件のときは、何をすればここに並ぶかを 3 手で見せる
 * - タイトルとメモの書き換えは「編集」を押したときだけ開く
 */

function candidate(
  id: string,
  over: Partial<Candidate> & {
    tier?: string;
    km?: number;
    blocked?: boolean;
  } = {},
): Candidate {
  const { tier = "B", km = 12, blocked = false, ...rest } = over;
  return {
    id,
    url: null,
    title: `候補${id}`,
    memo: null,
    lat: 35.7,
    lon: 139.8,
    direction: "NE",
    bearingDeg: 45,
    createdAt: `2026-09-2${id}T00:00:00.000Z`,
    updatedAt: `2026-09-2${id}T00:00:00.000Z`,
    judgment: {
      tier,
      blocked,
      doyouSatsu: false,
      approximate: false,
      source: "map",
      distanceKm: km,
      context: {
        baseLat: "35.68",
        baseLon: "139.76",
        targetDate: "2026-10-01",
        useClassical: true,
        directionFilterMode: "composite",
        tenchusatsuMode: "strict",
        involuntaryMove: false,
      },
    },
    ...rest,
  } as Candidate;
}

function mockList(candidates: Candidate[]) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ candidates, cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("方位と並べ替え", () => {
  it("判定の鍵を日本語の方位名にする（知らない値はそのまま）", () => {
    expect(directionLabel("NE")).toBe("北東");
    expect(directionLabel("S")).toBe("南");
    expect(directionLabel("??")).toBe("??");
  });

  it("段階の良い順・近い順・新しい順", () => {
    const rows = [
      candidate("1", { tier: "C", km: 3 }),
      candidate("2", { tier: "S", km: 30 }),
      candidate("3", { tier: "X", km: 8 }),
    ];
    const ids = (k: Parameters<typeof sortCandidates>[1]) =>
      sortCandidates(rows, k).map((c) => c.id);
    expect(ids("tier")).toEqual(["2", "1", "3"]);
    expect(ids("near")).toEqual(["1", "3", "2"]);
    expect(ids("new")).toEqual(["3", "2", "1"]);
  });
});

describe("物件の情報", () => {
  it("数値は桁区切り、文字はそのまま", () => {
    expect(detailValue("rentYen", 118000)).toBe("118,000");
    expect(detailValue("floorAreaM2", 38.5)).toBe("38.5");
    expect(detailValue("layout", "1LDK")).toBe("1LDK");
  });
});

describe("一覧", () => {
  it("保存したときの条件は設定の鍵ではなく設定バーと同じ日本語で出す", async () => {
    mockList([candidate("1", { tier: "A", km: 120 })]);
    render(<CandidateHistory />);
    await screen.findByText("候補1");
    const { DIRECTION_FILTER_MODE_LABELS } =
      await import("@/utils/directionFilterMode");
    const { getTenchusatsuMode } = await import("@/utils/tenchusatsuPolicy");
    const text = document.body.textContent ?? "";
    expect(text).toContain(DIRECTION_FILTER_MODE_LABELS.composite);
    expect(text).toContain(getTenchusatsuMode("strict").label);
    expect(text).not.toMatch(/\bcomposite\b/);
    expect(text).not.toMatch(/\bstrict\b/);
  });

  it("札に段階・日本語の方位・距離を出し、NE をそのまま出さない", async () => {
    mockList([candidate("1", { tier: "S", km: 12.3 })]);
    render(<CandidateHistory />);
    const card = await screen.findByRole("article", { name: "候補1" });
    const text = card.textContent ?? "";
    expect(text).toContain("S 三盤吉");
    expect(text).toContain("北東");
    expect(text).toContain("約 12.3 km");
    expect(text).not.toMatch(/NE/);
  });

  it("件数と段階ごとの数、並べ替えのボタンで順が変わる", async () => {
    mockList([
      candidate("1", { tier: "S" }),
      candidate("2", { tier: "C" }),
      candidate("3", { tier: "S", blocked: true }),
    ]);
    render(<CandidateHistory />);
    await screen.findByRole("article", { name: "候補1" });
    expect(screen.getByText("3 件")).toBeTruthy();
    const counts = screen.getByRole("list", { name: "段階ごとの件数" });
    expect(counts.textContent).toContain("S 三盤吉 2");
    expect(counts.textContent).toContain("C 平 1");

    const order = () =>
      screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    // 既定は新しい順
    expect(order()).toEqual(["候補3", "候補2", "候補1"]);
    // 段階の良い順: S の 2 件（同じ段階は新しい順）→ C
    fireEvent.click(screen.getByRole("button", { name: "段階の良い順" }));
    expect(order()).toEqual(["候補3", "候補1", "候補2"]);
    expect(
      within(screen.getByRole("article", { name: "候補3" })).getByText(
        "天中殺により移動を避ける扱い",
      ),
    ).toBeTruthy();
  });

  it("編集を押したときだけタイトルとメモの欄が開く", async () => {
    mockList([candidate("1")]);
    render(<CandidateHistory />);
    await screen.findByRole("article", { name: "候補1" });
    expect(screen.queryByLabelText("メモ")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByLabelText("メモ")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText("メモ")).toBeNull();
  });

  it("0 件なら、ここに並ぶまでの 3 手と探しに行く入口を出す", async () => {
    mockList([]);
    render(<CandidateHistory />);
    expect(
      await screen.findByRole("heading", {
        name: "まだ保存した候補はありません",
      }),
    ).toBeTruthy();
    expect(screen.getByText("「候補に保存」")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "候補を探しに行く" })
        .getAttribute("href"),
    ).toBe("/relocation/arbitrage");
  });
});
