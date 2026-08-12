import { describe, expect, it } from "vitest";
import {
  DAY_CATEGORIES,
  allCategories,
  dayCategory,
  isLuckyDay,
  isUnfiltered,
  matchesTimingFilter,
  toggleCategory,
  type DayCategory,
  type FilterableDay,
} from "@/lib/timingFilter";
import { TIER_LABELS } from "@/utils/auspiciousDays";

/**
 * 時期ヒートマップの絞り込み。
 *
 * 表示を絞るだけで、判定にも段階の割り当てにも触らない。ここで守るのは
 * 「選んだ色と残るマスが一致すること」と「段階と暦注が別の軸であること」。
 */

const day = (over: Partial<FilterableDay> = {}): FilterableDay => ({
  blocked: false,
  tiers: { E: "S", N: "X", W: "C" },
  tags: [],
  ...over,
});

describe("マスの区分", () => {
  it("方位ごとの段階を返す", () => {
    expect(dayCategory(day(), "E")).toBe("S");
    expect(dayCategory(day(), "N")).toBe("X");
  });

  it("天中殺は段階より優先する（画面の塗りがそうなっている）", () => {
    // blocked の日は段階に関わらず BLOCKED_FILL で塗られる。絞り込みが
    // 段階側を見ると、選んだ色と残るマスが食い違う。
    expect(dayCategory(day({ blocked: true }), "E")).toBe("BLOCKED");
    expect(dayCategory(day({ blocked: true, tiers: { E: "X" } }), "E")).toBe(
      "BLOCKED",
    );
  });

  it("方位が未選択なら平（C）として扱う", () => {
    expect(dayCategory(day(), null)).toBe("C");
  });

  it("その方位の段階が無くても平に倒す（内部コードを漏らさない）", () => {
    expect(dayCategory(day({ tiers: {} }), "SE")).toBe("C");
  });

  it("区分は段階 6 つ＋天中殺の 7 つ", () => {
    expect(DAY_CATEGORIES).toHaveLength(7);
    for (const t of ["S", "A", "B", "C", "D", "X"] as const) {
      expect(DAY_CATEGORIES).toContain(t);
      // 画面に出す名前は auspiciousDays の 1 か所から引く
      expect(TIER_LABELS[t]).toBeTruthy();
    }
    expect(DAY_CATEGORIES).toContain("BLOCKED");
  });
});

describe("暦注は段階と別の軸", () => {
  it("天赦日・一粒万倍日を拾う", () => {
    expect(isLuckyDay(day({ tags: ["天赦日"] }))).toBe(true);
    expect(isLuckyDay(day({ tags: ["一粒万倍日"] }))).toBe(true);
    expect(isLuckyDay(day({ tags: ["大安"] }))).toBe(false);
    expect(isLuckyDay(day())).toBe(false);
  });

  it("「S かつ天赦日」を表現できる（AND で重なる）", () => {
    // 段階と同じ選択肢に混ぜると、この組み合わせが作れない。
    const sAndLucky = day({ tiers: { E: "S" }, tags: ["天赦日"] });
    const sOnly = day({ tiers: { E: "S" } });
    const onlyS = new Set<DayCategory>(["S"]);

    expect(matchesTimingFilter(sAndLucky, "E", onlyS, true)).toBe(true);
    expect(matchesTimingFilter(sOnly, "E", onlyS, true)).toBe(false);
  });

  it("暦注だけ絞っても段階の条件は効いたまま", () => {
    const xLucky = day({ tiers: { E: "X" }, tags: ["一粒万倍日"] });
    expect(
      matchesTimingFilter(xLucky, "E", new Set<DayCategory>(["S"]), true),
    ).toBe(false);
  });
});

describe("絞り込み", () => {
  it("既定（全選択）では 1 日も落とさない", () => {
    const all = allCategories();
    for (const d of [
      day(),
      day({ blocked: true }),
      day({ tiers: { E: "X" } }),
      day({ tags: ["天赦日"] }),
    ]) {
      expect(matchesTimingFilter(d, "E", all, false)).toBe(true);
    }
  });

  it("全部外したら 0 件。「全部出す」ではない", () => {
    const none = new Set<DayCategory>();
    expect(matchesTimingFilter(day(), "E", none, false)).toBe(false);
    expect(matchesTimingFilter(day({ blocked: true }), "E", none, false)).toBe(
      false,
    );
  });

  it("天中殺だけを選べる", () => {
    const onlyBlocked = new Set<DayCategory>(["BLOCKED"]);
    expect(
      matchesTimingFilter(day({ blocked: true }), "E", onlyBlocked, false),
    ).toBe(true);
    expect(matchesTimingFilter(day(), "E", onlyBlocked, false)).toBe(false);
  });

  it("方位を変えると残る日も変わる", () => {
    const onlyS = new Set<DayCategory>(["S"]);
    const d = day({ tiers: { E: "S", N: "X" } });
    expect(matchesTimingFilter(d, "E", onlyS, false)).toBe(true);
    expect(matchesTimingFilter(d, "N", onlyS, false)).toBe(false);
  });
});

describe("絞り込み中かどうかの判定", () => {
  it("全選択かつ暦注オフなら絞り込んでいない", () => {
    expect(isUnfiltered(allCategories(), false)).toBe(true);
  });

  it("暦注だけ入れても絞り込み扱い", () => {
    expect(isUnfiltered(allCategories(), true)).toBe(false);
  });

  it("段階を 1 つでも外したら絞り込み扱い", () => {
    expect(isUnfiltered(toggleCategory(allCategories(), "X"), false)).toBe(
      false,
    );
  });
});

describe("選択の切り替え", () => {
  it("入っていれば外し、無ければ入れる", () => {
    const base = new Set<DayCategory>(["S", "A"]);
    expect([...toggleCategory(base, "S")]).toEqual(["A"]);
    expect([...toggleCategory(base, "B")]).toEqual(["S", "A", "B"]);
  });

  it("元の Set を書き換えない（React が変化に気付けるように）", () => {
    const base = new Set<DayCategory>(["S"]);
    const next = toggleCategory(base, "A");
    expect(base.size).toBe(1);
    expect(next).not.toBe(base);
  });
});
