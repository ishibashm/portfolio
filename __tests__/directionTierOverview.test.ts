import { describe, expect, it } from "vitest";
import {
  fillFor,
  sortDirectionRows,
  tierLabelFor,
  type DirectionTierRow,
} from "@/components/relocation/DirectionTierOverview";
import { TIER_FILL, TIER_JP, BLOCKED_FILL } from "@/utils/tierDisplay";

/**
 * 方位ごとの内訳。
 *
 * 守るのは「色と言葉を自前で持たないこと」と「並び順が段階の良い順で
 * あること」。色表を新しく作ると、同じ段階が地図と一覧で違う色になる。
 */

const row = (over: Partial<DirectionTierRow> = {}): DirectionTierRow => ({
  direction: "E",
  directionLabel: "東",
  tier: "C",
  blocked: false,
  count: 0,
  ...over,
});

describe("並び順", () => {
  it("段階の良い順に並ぶ", () => {
    const rows = [
      row({ direction: "N", tier: "X" }),
      row({ direction: "E", tier: "S" }),
      row({ direction: "W", tier: "C" }),
      row({ direction: "S", tier: "A" }),
    ];
    expect(sortDirectionRows(rows).map((r) => r.tier)).toEqual([
      "S",
      "A",
      "C",
      "X",
    ]);
  });

  it("天中殺は最後。段階が良くても動けないので上に出さない", () => {
    const rows = [
      row({ direction: "N", tier: "X" }),
      row({ direction: "E", tier: "S", blocked: true }),
    ];
    expect(sortDirectionRows(rows).map((r) => r.direction)).toEqual(["N", "E"]);
  });

  it("同じ段階なら物件が多い順", () => {
    const rows = [
      row({ direction: "N", tier: "S", count: 3 }),
      row({ direction: "E", tier: "S", count: 12 }),
    ];
    expect(sortDirectionRows(rows).map((r) => r.count)).toEqual([12, 3]);
  });

  it("元の配列を書き換えない", () => {
    const rows = [row({ tier: "X" }), row({ tier: "S" })];
    sortDirectionRows(rows);
    expect(rows[0].tier).toBe("X");
  });

  it("知らない段階でも落ちない（最後に寄せる）", () => {
    const rows = [row({ direction: "N", tier: "???" }), row({ tier: "D" })];
    expect(sortDirectionRows(rows)[0].tier).toBe("D");
  });
});

describe("色と言葉は既存の 1 か所から引く", () => {
  it("段階の色は TIER_FILL のまま。自前の色表を作らない", () => {
    // 別に持つと、同じ S が地図では緑、一覧では別の緑になる。
    for (const t of ["S", "A", "B", "C", "D", "X"] as const) {
      expect(fillFor(row({ tier: t }))).toBe(TIER_FILL[t]);
    }
  });

  it("天中殺は BLOCKED_FILL。段階の色に混ぜない", () => {
    expect(fillFor(row({ tier: "S", blocked: true }))).toBe(BLOCKED_FILL);
  });

  it("段階の名前は TIER_JP のまま", () => {
    for (const t of ["S", "A", "B", "C", "D", "X"] as const) {
      expect(tierLabelFor(row({ tier: t }))).toBe(TIER_JP[t]);
    }
    expect(tierLabelFor(row({ blocked: true }))).toBe("天中殺");
  });

  it("知らない段階でも内部コードを画面に出さない色にする", () => {
    // 色は既定に落ちるが、名前はコードがそのまま出るしかない。
    // せめて色が undefined にならないこと。
    expect(fillFor(row({ tier: "???" }))).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
