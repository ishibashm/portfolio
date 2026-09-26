import { beforeEach, describe, expect, it } from "vitest";
import {
  MCP_URL,
  SAVED_ANALYSES_KEY,
  SAVED_ANALYSES_MAX,
  buildTimingReport,
  deleteAnalysis,
  readSavedAnalyses,
  saveAnalysis,
  type TimingReportInput,
} from "@/lib/timingReport";

/**
 * 時期の分析を残す・AI に渡すための文書（利用者の依頼、2026-09-26）。
 * 生年月日と座標を書かないこと、端末にだけ残ることを固定する。
 */

const INPUT: TimingReportInput = {
  title: "引越し時期の全期間分析",
  generatedAt: new Date("2026-09-25T20:00:00Z"), // 日本時間 9/26 5:00
  honmeiStarName: "七赤金星",
  voidZodiacs: ["辰", "巳"],
  range: { from: "2026-03-26", to: "2028-03-25" },
  conditions: ["盤: 古典暦基準", "天中殺の扱い: 弱める"],
  directions: [
    {
      label: "南東",
      bestTier: "S 三盤吉",
      firstDate: "2026-10-12",
      totalOpen: 9,
      windows: { count: 4, avgLen: 2.3, avgGapDays: 41 },
    },
    {
      label: "北",
      bestTier: null,
      firstDate: null,
      totalOpen: 0,
      windows: null,
    },
  ],
  sourcePath: "/relocation/timing",
};

describe("buildTimingReport", () => {
  const md = buildTimingReport(INPUT);

  it("作成日は日本時間で書く", () => {
    expect(md).toContain("作成日: 2026-09-26（日本時間）");
  });

  it("方位ごとの行を表にする（動ける日が無い方位も消さない）", () => {
    expect(md).toContain(
      "| 南東 | S 三盤吉 | 2026-10-12 | 9 | 4 回・2.3 日・41 日 |",
    );
    expect(md).toContain("| 北 | 動ける日なし | — | 0 | — |");
  });

  it("本命星と空亡までは書き、生年月日と座標は書かない", () => {
    expect(md).toContain("本命星: 七赤金星");
    expect(md).toContain("空亡（天中殺）: 辰巳");
    expect(md).not.toMatch(
      /\d{4}-\d{2}-\d{2}T|生年月日: |緯度|経度|\d{2}\.\d{4}/,
    );
  });

  it("AI で続きを調べる方法（MCP の URL）を添える", () => {
    expect(md).toContain(MCP_URL);
  });

  it("表を壊す記号はセルの中で置き換える", () => {
    const broken = buildTimingReport({
      ...INPUT,
      directions: [{ ...INPUT.directions[0], label: "南|東" }],
    });
    expect(broken).toContain("| 南／東 |");
  });
});

describe("端末に残す", () => {
  let store: Map<string, string>;
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  beforeEach(() => {
    store = new Map();
  });

  it("残した分析は新しい順に読める・消せる", () => {
    const a = saveAnalysis(
      storage,
      { kind: "timing", name: "A", markdown: "# A" },
      new Date("2026-09-26T00:00:00Z"),
    );
    const b = saveAnalysis(
      storage,
      { kind: "calendar", name: "B", markdown: "# B" },
      new Date("2026-09-26T01:00:00Z"),
    );
    expect(readSavedAnalyses(storage).map((x) => x.name)).toEqual(["B", "A"]);
    deleteAnalysis(storage, b!.id);
    expect(readSavedAnalyses(storage).map((x) => x.id)).toEqual([a!.id]);
  });

  it(`上限（${SAVED_ANALYSES_MAX} 件）を超えたら古いものから落とす`, () => {
    for (let i = 0; i < SAVED_ANALYSES_MAX + 3; i++) {
      saveAnalysis(storage, { kind: "timing", name: `n${i}`, markdown: "" });
    }
    const list = readSavedAnalyses(storage);
    expect(list).toHaveLength(SAVED_ANALYSES_MAX);
    expect(list[0].name).toBe(`n${SAVED_ANALYSES_MAX + 2}`);
  });

  it("壊れた保存は捨てる", () => {
    store.set(SAVED_ANALYSES_KEY, "{not json");
    expect(readSavedAnalyses(storage)).toEqual([]);
    store.set(SAVED_ANALYSES_KEY, JSON.stringify([{ id: 1 }]));
    expect(readSavedAnalyses(storage)).toEqual([]);
  });

  it("書けない端末では null を返す（残せたふりをしない）", () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(
      saveAnalysis(full, { kind: "timing", name: "x", markdown: "" }),
    ).toBeNull();
  });
});

describe("「すべて消す」の対象", () => {
  it("端末に残した分析は生年月日から出た結果なので消す側", async () => {
    const { ACCOUNT_LOCAL_KEYS } = await import("@/lib/accountData");
    expect(ACCOUNT_LOCAL_KEYS).toContain(SAVED_ANALYSES_KEY);
  });
});
