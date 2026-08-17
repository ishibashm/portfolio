import { describe, it, expect } from "vitest";
import {
  scoreDateForProperty,
  type DailyAstroState,
  type PropertyAstroContext,
} from "@/utils/arbitrageAstro";
import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * 物件検索の日別の吉凶を**必ず真北で**採点するようにした件の固定。
 *
 * 変更前は utils/arbitrageAstro.ts がこう書いていた。
 *
 *   const targetDirection = ctx.useTrueNorth
 *     ? ctx.direction
 *     : ctx.magneticDirection;
 *
 * `useTrueNorth` の既定は偽だったので、**既定では磁北基準の方位で採点して
 * いた。**方位角を掃いた実測で、真北と磁北で八方位の割り当てが変わるのは
 * 偏角 -7 度（東京あたり）で 15.6%。**物件の 6〜7 件に 1 件は別の方位として
 * 採点されていた。**
 *
 * CLAUDE.md 3 節は「判定は必ず真北。磁北は方位磁針で測るとずれる注意として
 * のみ使う」と決めている。
 *
 * ## 何を固定するか
 *
 * 「真北の方位で引いている」ことを、**磁北の方位を動かしても採点が変わら
 * ない**という形で固定する。あわせて**真北の方位を動かせば変わる**ことも
 * 見る。後者が無いと、そもそも方位を見ていないのと区別できない。
 */

/** 盤。方位ごとに違う判定を置いて、どちらを引いたか分かるようにする。 */
const activeVectors: Record<string, string> = {
  N: "OPTIMAL",
  NE: "NOISE_GOU",
  E: "SAFE",
  SE: "NOISE_ANKEN",
  S: "WARNING",
  SW: "NOISE_HA",
  W: "SAFE",
  NW: "NOISE_HONMEI",
};

/** 1 日ぶんの状態。__tests__/tenchusatsuScoring.test.ts と同じ組み立て。 */
function makeState(): DailyAstroState {
  return {
    date: new Date("2026-06-15"),
    dateStr: "2026-06-15",
    activeVectors,
    isDoyouHazard: false,
    lunarPhaseScore: 0,
    tendoDir: undefined,
    rokuyo: "大安",
    luckyDays: { isTensho: false, isIchiryumanbai: false },
    holiday: null,
    weekday: 1,
    isVoidTime: false,
    voidScopes: { year: false, month: false, day: false },
    baziScore: 50,
  } as DailyAstroState;
}

function score(
  direction: CompassDirection,
  magneticDirection: CompassDirection,
  useTrueNorth: boolean,
) {
  const ctx: PropertyAstroContext = {
    hasCoordinates: true,
    direction,
    magneticDirection,
    useTrueNorth,
    hasSunLine: false,
    hasVenusLine: false,
    hasJupiterLine: false,
    hasBirthLocation: false,
    actionIntent: "MIGRATION",
  } as PropertyAstroContext;
  return scoreDateForProperty(makeState(), ctx);
}

describe("物件検索の日別の吉凶は真北で採点する", () => {
  it("磁北の方位をどこに動かしても採点が変わらない", () => {
    const moved: string[] = [];

    for (const trueDir of COMPASS_DIRECTIONS) {
      // 真北の方位を固定したまま、磁北の方位だけを 8 方位に振る。
      const baseline = JSON.stringify(score(trueDir, trueDir, true));

      for (const magDir of COMPASS_DIRECTIONS) {
        for (const flag of [true, false]) {
          const got = JSON.stringify(score(trueDir, magDir, flag));
          if (got !== baseline) {
            moved.push(`真北 ${trueDir} / 磁北 ${magDir} / flag ${flag}`);
          }
        }
      }
    }

    expect(moved).toEqual([]);
  });

  it("真北の方位を動かせば採点は変わる（上が空回りしていないこと）", () => {
    // 盤は方位ごとに違う判定を置いてあるので、真北を見ているなら必ず動く。
    const seen = new Set<string>();
    for (const trueDir of COMPASS_DIRECTIONS) {
      seen.add(JSON.stringify(score(trueDir, "N", true)));
    }
    // 8 方位で少なくとも「大吉・吉・注意・凶」の別が出る。
    expect(seen.size).toBeGreaterThan(3);
  });

  it("旧挙動なら磁北の方位で採点が変わっていた（この修正の対象）", () => {
    /*
      旧実装（useTrueNorth が偽なら magneticDirection を引く）を写して、
      同じ入力で採点が変わることを示す。**この関数は現行実装のどこからも
      呼ばれていない。**
    */
    const legacyTargetDirection = (
      direction: CompassDirection,
      magneticDirection: CompassDirection,
      useTrueNorth: boolean,
    ) => (useTrueNorth ? direction : magneticDirection);

    // 真北では大吉（N）だが、方位磁針では凶（NE）に見える地点。
    // 偏角が方位の幅の何分の一かを占めるので、境目付近では実際に起きる。
    const trueDir: CompassDirection = "N";
    const magDir: CompassDirection = "NE";

    const legacyPicked = legacyTargetDirection(trueDir, magDir, false);
    expect(legacyPicked).toBe("NE");
    expect(activeVectors[legacyPicked]).toBe("NOISE_GOU");

    // 現行は真北を引くので大吉のまま。旧挙動なら凶になっていた。
    expect(activeVectors[trueDir]).toBe("OPTIMAL");
    const now = score(trueDir, magDir, false);
    const asOptimal = score(trueDir, trueDir, true);
    expect(JSON.stringify(now)).toBe(JSON.stringify(asOptimal));
  });
});
