import { describe, expect, it } from "vitest";
import {
  filterCollisionByMode,
  EIGHT_DIRECTIONS,
  type BoardLayout,
  type Direction,
  type StarFrequency,
  type VectorCollision,
  type VectorStatus,
} from "@/utils/ephemerisEngine";
import {
  filterLayersOf,
  type DirectionFilterMode,
} from "@/utils/directionFilterMode";

/**
 * 絞り込みを「排他のモード」から「層の組み合わせ」に変えた件。
 *
 * ## なぜ変えたか
 *
 * 利用者の報告：「本命星と環境方位は一緒にフィルタリングできるように
 * してほしい。天中殺のみ、本命星のみ、環境方位のみだと天中殺が効いて
 * いない、本命星と環境方位でのフィルタリングできない」。
 *
 * 以前は 4 つのモードが排他で、本命星と環境方位を**同時に見る手段が
 * 無かった**。中身は独立した 3 つの層（本命星・環境方位・天中殺）
 * なので、組み合わせを選べるようにした。
 *
 * ## この検査がやること（CLAUDE.md 3 節の手順）
 *
 * 1. **旧実装をここに写す**（下の `legacyFilter`）
 * 2. 既存の 4 モードで、新実装と旧実装の答えが**完全に一致する**ことを
 *    広い入力範囲で固定する。既存の利用者の答えは 1 つも変わらない
 * 3. 組み合わせは「層ごとの結果を束ねたもの」であることを固定する
 * 4. **旧実装に戻すと落ちる**ことを確かめる（下の最後の describe）
 */

/* ------------------------------------------------------------------ *
 * 旧実装の写し。#889 までの filterCollisionByMode そのまま。
 * ------------------------------------------------------------------ */
function legacyFilter(
  collision: VectorCollision,
  personalStar: StarFrequency,
  getsuMeiStar: StarFrequency | null,
  voidZodiacs: string[],
  directionFilterMode: string,
  yBoard: BoardLayout | null,
  mBoard: BoardLayout | null,
  dBoard: BoardLayout | null,
): VectorCollision {
  if (directionFilterMode === "composite") return collision;

  const directions = EIGHT_DIRECTIONS;

  const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
    switch (star) {
      case 1:
        return [6, 7, 3, 4];
      case 2:
        return [9, 6, 7];
      case 3:
        return [1, 9];
      case 4:
        return [1, 9];
      case 5:
        return [9, 6, 7];
      case 6:
        return [2, 5, 8, 1];
      case 7:
        return [2, 5, 8, 1];
      case 8:
        return [9, 6, 7];
      case 9:
        return [3, 4, 2, 5, 8];
      default:
        return [];
    }
  };
  const compatiblesHonmei = getCompatibleStars(personalStar);
  const compatiblesGetsumei = getsuMeiStar
    ? getCompatibleStars(getsuMeiStar)
    : [];

  const getOptimalStatus = (
    starNum: StarFrequency,
  ): "OPTIMAL" | "OPTIMAL_REGULAR" | "SAFE" => {
    const isHonmeiComp = compatiblesHonmei.includes(starNum);
    if (!getsuMeiStar) return isHonmeiComp ? "OPTIMAL" : "SAFE";
    const isGetsumeiComp = compatiblesGetsumei.includes(starNum);
    if (isHonmeiComp && isGetsumeiComp) return "OPTIMAL";
    else if (isHonmeiComp) return "OPTIMAL_REGULAR";
    return "SAFE";
  };

  const z2d: Record<string, Direction[]> = {
    子: ["N"],
    丑: ["NE"],
    寅: ["NE"],
    卯: ["E"],
    辰: ["SE"],
    巳: ["SE"],
    午: ["S"],
    未: ["SW"],
    申: ["SW"],
    酉: ["W"],
    戌: ["NW"],
    亥: ["NW"],
  };
  const voidDirs = new Set<Direction>();
  voidZodiacs.forEach((z) => (z2d[z] || []).forEach((d) => voidDirs.add(d)));

  const getOpposite = (d: Direction): Direction => {
    const opposites: Record<string, Direction> = {
      N: "S",
      S: "N",
      E: "W",
      W: "E",
      NE: "SW",
      SW: "NE",
      NW: "SE",
      SE: "NW",
    };
    return opposites[d];
  };

  const filterStatus = (
    status: VectorStatus | undefined,
    dir: Direction,
    activeBoard: BoardLayout | null,
  ): VectorStatus => {
    if (!status) return "SAFE";
    if (directionFilterMode === "personal_kigaku") {
      let honmeiD: Direction | null = null;
      directions.forEach((d) => {
        if (activeBoard && activeBoard[d] === personalStar) honmeiD = d;
      });
      if (dir === honmeiD) return "NOISE_HONMEI";
      if (honmeiD && dir === getOpposite(honmeiD)) return "NOISE_TEKI";
      return getOptimalStatus(activeBoard ? activeBoard[dir] : 1);
    } else if (directionFilterMode === "personal_bazi") {
      if (voidDirs.has(dir)) return "NOISE_VOID";
      return "SAFE";
    } else {
      let isGou = false;
      let isAnken = false;
      if (activeBoard) {
        directions.forEach((d) => {
          if (activeBoard[d] === 5) {
            if (d === dir) isGou = true;
            if (getOpposite(d) === dir) isAnken = true;
          }
        });
      }
      if (isGou) return "NOISE_GOU";
      if (isAnken) return "NOISE_ANKEN";
      if (status === "NOISE_HA") return "NOISE_HA";
      if (status === "NOISE_NODE") return "NOISE_NODE";
      return "SAFE";
    }
  };

  const newYearLayer: Partial<Record<Direction, VectorStatus>> = {};
  const newMonthLayer: Partial<Record<Direction, VectorStatus>> = {};
  const newDayLayer: Partial<Record<Direction, VectorStatus>> = {};
  const newFinalVectors = {} as Record<string, VectorStatus>;

  directions.forEach((d) => {
    newYearLayer[d] = filterStatus(collision.yearLayer[d], d, yBoard);
    newMonthLayer[d] = filterStatus(collision.monthLayer[d], d, mBoard);
    newDayLayer[d] = filterStatus(collision.dayLayer[d], d, dBoard);

    const list = [newYearLayer[d], newMonthLayer[d], newDayLayer[d]];
    if (directionFilterMode === "personal_kigaku") {
      const hasPurple = list.find(
        (s) => s === "NOISE_HONMEI" || s === "NOISE_TEKI",
      );
      if (hasPurple) newFinalVectors[d] = hasPurple;
      else if (list.find((s) => s === "OPTIMAL"))
        newFinalVectors[d] = "OPTIMAL";
      else if (list.find((s) => s === "OPTIMAL_REGULAR"))
        newFinalVectors[d] = "OPTIMAL_REGULAR";
      else newFinalVectors[d] = "SAFE";
    } else if (directionFilterMode === "personal_bazi") {
      newFinalVectors[d] = list.find((s) => s === "NOISE_VOID")
        ? "NOISE_VOID"
        : "SAFE";
    } else {
      const hasRed = list.find(
        (s) => s === "NOISE_GOU" || s === "NOISE_ANKEN" || s === "NOISE_HA",
      );
      if (hasRed) newFinalVectors[d] = hasRed;
      else if (list.find((s) => s === "NOISE_NODE"))
        newFinalVectors[d] = "NOISE_NODE";
      else newFinalVectors[d] = "SAFE";
    }
  });

  return {
    ...collision,
    yearLayer: newYearLayer,
    monthLayer: newMonthLayer,
    dayLayer: newDayLayer,
    finalVectors: newFinalVectors,
  } as VectorCollision;
}

/* ------------------------------------------------------------------ *
 * 入力の組み立て。盤と素の判定を、広い範囲で作る。
 * ------------------------------------------------------------------ */

/** 中宮 c の遁甲盤（後天定位に沿った並び）。実装と同じ形を作る。 */
function board(center: number): BoardLayout {
  const order: Direction[] = ["N", "SW", "E", "SE", "CENTER", "NW", "W", "NE"];
  const layout = {} as Record<Direction, StarFrequency>;
  order.forEach((d, i) => {
    layout[d] = (((center - 1 + i) % 9) + 1) as StarFrequency;
  });
  return layout as BoardLayout;
}

const RAW_STATUSES: VectorStatus[] = [
  "SAFE",
  "NOISE_HA",
  "NOISE_NODE",
  "NOISE_GOU",
  "NOISE_ANKEN",
];

function collisionOf(seed: number): VectorCollision {
  const layer = (offset: number): Partial<Record<Direction, VectorStatus>> => {
    const out: Partial<Record<Direction, VectorStatus>> = {};
    EIGHT_DIRECTIONS.forEach((d, i) => {
      out[d] = RAW_STATUSES[(seed + offset + i) % RAW_STATUSES.length];
    });
    return out;
  };
  const finals = {} as Record<string, VectorStatus>;
  EIGHT_DIRECTIONS.forEach((d, i) => {
    finals[d] = RAW_STATUSES[(seed + i) % RAW_STATUSES.length];
  });
  return {
    yearLayer: layer(0),
    monthLayer: layer(1),
    dayLayer: layer(2),
    finalVectors: finals,
  } as VectorCollision;
}

const VOID_SETS: string[][] = [[], ["午", "未"], ["子", "丑"], ["戌", "亥"]];
const LEGACY_MODES: DirectionFilterMode[] = [
  "composite",
  "personal_kigaku",
  "personal_bazi",
  "environmental",
];

/** 走査する入力の全組み合わせ。 */
function* cases() {
  for (let star = 1 as StarFrequency; star <= 9; star++) {
    for (const getsu of [null, 3 as StarFrequency]) {
      for (const voids of VOID_SETS) {
        for (let seed = 0; seed < 3; seed++) {
          yield {
            star: star as StarFrequency,
            getsu,
            voids,
            collision: collisionOf(seed),
            y: board(((star + seed) % 9) + 1),
            m: board(((star + seed + 3) % 9) + 1),
            d: board(((star + seed + 6) % 9) + 1),
          };
        }
      }
    }
  }
}

describe("既存の 4 モードは答えが 1 つも変わらない", () => {
  for (const mode of LEGACY_MODES) {
    it(`${mode} が旧実装と一致する`, () => {
      let checked = 0;
      for (const c of cases()) {
        const now = filterCollisionByMode(
          c.collision,
          c.star,
          c.getsu,
          c.voids,
          mode,
          c.y,
          c.m,
          c.d,
        );
        const before = legacyFilter(
          c.collision,
          c.star,
          c.getsu,
          c.voids,
          mode,
          c.y,
          c.m,
          c.d,
        );
        expect(now.finalVectors).toEqual(before.finalVectors);
        expect(now.yearLayer).toEqual(before.yearLayer);
        expect(now.monthLayer).toEqual(before.monthLayer);
        expect(now.dayLayer).toEqual(before.dayLayer);
        checked += 1;
      }
      /* 空回りしていないこと（入力が 0 件なら一致は自明） */
      expect(checked).toBeGreaterThan(200);
    });
  }
});

describe("組み合わせは、層ごとの結果を束ねたものになる", () => {
  const NOISE = (s: VectorStatus | undefined) =>
    typeof s === "string" && s.startsWith("NOISE_");

  it("本命星＋環境方位：どちらかが凶なら凶", () => {
    let sawBoth = 0;
    for (const c of cases()) {
      const both = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "personal_kigaku_environmental",
        c.y,
        c.m,
        c.d,
      );
      const k = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "personal_kigaku",
        c.y,
        c.m,
        c.d,
      );
      const e = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "environmental",
        c.y,
        c.m,
        c.d,
      );
      for (const d of EIGHT_DIRECTIONS) {
        const expectNoise =
          NOISE(k.finalVectors[d]) || NOISE(e.finalVectors[d]);
        expect(NOISE(both.finalVectors[d])).toBe(expectNoise);
        /* 環境が凶で本命が吉、という取りこぼしが実際に起きていた形 */
        if (NOISE(e.finalVectors[d]) && !NOISE(k.finalVectors[d])) sawBoth += 1;
      }
    }
    /* 「本命では吉なのに環境では凶」が実在する（検査が空回りしていない） */
    expect(sawBoth).toBeGreaterThan(50);
  });

  it("本命星＋天中殺：天中殺の方位が凶として残る", () => {
    let sawVoid = 0;
    for (const c of cases()) {
      if (c.voids.length === 0) continue;
      const both = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "personal_kigaku_bazi",
        c.y,
        c.m,
        c.d,
      );
      const b = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "personal_bazi",
        c.y,
        c.m,
        c.d,
      );
      for (const d of EIGHT_DIRECTIONS) {
        if (b.finalVectors[d] === "NOISE_VOID") {
          expect(NOISE(both.finalVectors[d])).toBe(true);
          sawVoid += 1;
        }
      }
    }
    expect(sawVoid).toBeGreaterThan(50);
  });

  it("3 層すべては composite と同じ（元の判定をそのまま返す）", () => {
    const layers = filterLayersOf("composite");
    expect(layers).toEqual({
      honmei: true,
      environmental: true,
      tenchusatsu: true,
    });
    for (const c of cases()) {
      const out = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "composite",
        c.y,
        c.m,
        c.d,
      );
      expect(out).toBe(c.collision);
    }
  });
});

describe("旧実装に戻すと落ちる（空回りしていない）", () => {
  it("旧実装は組み合わせを environmental として扱ってしまう", () => {
    /* 旧実装は名前で 3 分岐し、**知らない値を全部 environmental に
       倒す**。だから本命星＋環境方位を渡しても本命殺が出てこない。
       これがまさに利用者の報告した症状で、直したのはここ。 */
    let differs = 0;
    for (const c of cases()) {
      const now = filterCollisionByMode(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "personal_kigaku_environmental",
        c.y,
        c.m,
        c.d,
      );
      const before = legacyFilter(
        c.collision,
        c.star,
        c.getsu,
        c.voids,
        "personal_kigaku_environmental",
        c.y,
        c.m,
        c.d,
      );
      for (const d of EIGHT_DIRECTIONS) {
        if (now.finalVectors[d] !== before.finalVectors[d]) differs += 1;
      }
    }
    expect(differs).toBeGreaterThan(100);
  });
});
