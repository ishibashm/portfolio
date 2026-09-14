import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_KM,
  DEFAULT_MIN_KM,
  TATAMI_SQM,
  housingStatsByDirection,
  type HousingPoint,
  type HousingStatRow,
} from "@/lib/housingStatsDirections";
import { COMPASS_DIRECTIONS, destinationAtBearing } from "@/utils/directionGeo";

/**
 * 住宅の統計を方位別にまとめる集計。方位の割り当ては
 * `directionFromBearing` に任せているので、見るのは**集計の側**——
 * 距離で切る、空の方位を消さない、円/㎡と月額の目安と空き家率の式、
 * 欠測の扱い——の 4 点。
 */
const BASE_LAT = 35.6812;
const BASE_LON = 139.7671;

let seq = 0;
function town(
  bearing: number,
  km: number,
  stat: Partial<HousingStatRow> = {},
): { row: HousingStatRow; point: HousingPoint } {
  const code = `9${String(++seq).padStart(4, "0")}`;
  const { lat, lon } = destinationAtBearing(BASE_LAT, BASE_LON, bearing, km);
  return {
    row: {
      area_code: code,
      area_name: `町${seq}`,
      total_dwellings: null,
      vacant_dwellings: null,
      rent_per_tatami_yen: null,
      tatami_per_rental: null,
      floor_area_per_rental: null,
      ...stat,
    },
    point: { code, lat, lon },
  };
}

function run(
  items: { row: HousingStatRow; point: HousingPoint }[],
  options?: Parameters<typeof housingStatsByDirection>[4],
) {
  return housingStatsByDirection(
    items.map((i) => i.row),
    items.map((i) => i.point),
    BASE_LAT,
    BASE_LON,
    options,
  );
}

/** その方位に入った市区町村の数。 */
function countIn(
  stats: ReturnType<typeof housingStatsByDirection>,
  d: string,
): number {
  return stats.find((s) => s.direction === d)!.count;
}

describe("housingStatsByDirection", () => {
  it("8 方位を必ず全部返し、材料の無い方位は count 0", () => {
    const stats = run([town(0, 30, { rent_per_tatami_yen: 3000 })]);
    expect(stats.map((s) => s.direction)).toEqual(COMPASS_DIRECTIONS);
    const north = stats.find((s) => s.direction === "N")!;
    expect(north.count).toBe(1);
    expect(stats.filter((s) => s.count === 0)).toHaveLength(7);
    const empty = stats.find((s) => s.direction === "S")!;
    expect(empty.medianRentPerSqm).toBeNull();
    expect(empty.vacancyRate).toBeNull();
    expect(empty.topMunicipalities).toEqual([]);
  });

  it("近すぎる・遠すぎる市区町村は入れない", () => {
    const stats = run([
      town(90, DEFAULT_MIN_KM - 1, { rent_per_tatami_yen: 9000 }),
      town(90, DEFAULT_MAX_KM + 1, { rent_per_tatami_yen: 9000 }),
      town(90, 40, { rent_per_tatami_yen: 3240 }),
    ]);
    const east = stats.find((s) => s.direction === "E")!;
    expect(east.count).toBe(1);
    expect(east.medianRentPerSqm).toBe(Math.round(3240 / TATAMI_SQM));
  });

  it("円/㎡は 1 畳当たり家賃 ÷ 1.62、月額の目安は × 借家の平均畳数", () => {
    const stats = run([
      town(180, 30, { rent_per_tatami_yen: 3240, tatami_per_rental: 20 }),
    ]);
    const south = stats.find((s) => s.direction === "S")!;
    expect(south.medianRentPerSqm).toBe(2000);
    expect(south.medianMonthlyRentEstimate).toBe(64800);
    expect(south.rentCount).toBe(1);
  });

  it("空き家率は方位内の合計どうしの比（戸数で重み付け）", () => {
    const stats = run([
      town(270, 30, { total_dwellings: 1000, vacant_dwellings: 100 }),
      town(270, 50, { total_dwellings: 3000, vacant_dwellings: 600 }),
      /* 空き家数が欠測の市区町村は空き家率に入れない（count には入る） */
      town(270, 60, { total_dwellings: 500 }),
    ]);
    const west = stats.find((s) => s.direction === "W")!;
    expect(west.count).toBe(3);
    expect(west.vacancyCount).toBe(2);
    expect(west.vacancyRate).toBeCloseTo(700 / 4000, 6);
  });

  it("家賃が欠測の市区町村は円/㎡に入れないが、count と名前には入る", () => {
    const stats = run([
      town(45, 30, { total_dwellings: 800 }),
      town(45, 35, { rent_per_tatami_yen: 1620, total_dwellings: 2000 }),
    ]);
    const ne = stats.find((s) => s.direction === "NE")!;
    expect(ne.count).toBe(2);
    expect(ne.rentCount).toBe(1);
    expect(ne.medianRentPerSqm).toBe(1000);
    /* 総住宅数の多い順 */
    expect(ne.topMunicipalities[0]).toBe(stats && "町" + seq);
  });

  it("代表点の無い市区町村は集計に入らない（落ちない）", () => {
    const t = town(0, 30, { rent_per_tatami_yen: 3000 });
    const stats = housingStatsByDirection([t.row], [], BASE_LAT, BASE_LON);
    expect(stats.every((s) => s.count === 0)).toBe(true);
  });
});

/**
 * 方位の切り方（`nodeMapping`）を呼ぶ側から渡せるようにした（2026-09-14）。
 *
 * ## 何が問題だったか
 *
 * ここは長らく `"traditional"` の決め打ちだった。スキャナー
 * （`api/rentals/arbitrage`）は古典盤なら `traditional`、独自モデルなら
 * **`physical`（45 度等分）**で切る。**独自モデルを選んでいる利用者は、
 * 同じ画面で 2 通りの方位割り当てを見ていた。**
 *
 * ## 検査の組み方（CLAUDE.md 3 節）
 *
 * 1. 変更前の挙動（= 決め打ちの `traditional`）を、既定として写す
 * 2. 広い方位角の範囲で、旧と新の答えを突き合わせる
 * 3. **旧挙動に戻すと落ちる**ことを示す。`physical` を渡したときに
 *    `physical` の答えになることを見ているので、決め打ちへ戻せば必ず落ちる
 */
describe("方位の切り方を呼ぶ側から渡せる", () => {
  /*
    伝統区分は四正 30 度・四隅 60 度（N は 345〜15、NE は 15〜75）、
    physical は 45 度等分（N は 337.5〜22.5、NE は 22.5〜67.5）。
    下の 2 つはどちらの規則かで答えが変わる方位角。
  */
  const SPLIT: { bearing: number; traditional: string; physical: string }[] = [
    { bearing: 20, traditional: "NE", physical: "N" },
    { bearing: 70, traditional: "NE", physical: "E" },
    { bearing: 200, traditional: "SW", physical: "S" },
    { bearing: 250, traditional: "SW", physical: "W" },
  ];

  it("渡さないときは今までどおり（伝統区分）", () => {
    for (const c of SPLIT) {
      const stats = run([town(c.bearing, 30)]);
      expect(countIn(stats, c.traditional), `${c.bearing}度`).toBe(1);
      expect(countIn(stats, c.physical), `${c.bearing}度`).toBe(0);
    }
  });

  it("traditional を明示しても同じ（既定と食い違わない）", () => {
    for (const c of SPLIT) {
      const stats = run([town(c.bearing, 30)], { nodeMapping: "traditional" });
      expect(countIn(stats, c.traditional), `${c.bearing}度`).toBe(1);
    }
  });

  it("physical を渡すと 45 度等分になる（決め打ちに戻すとここが落ちる）", () => {
    for (const c of SPLIT) {
      const stats = run([town(c.bearing, 30)], { nodeMapping: "physical" });
      expect(countIn(stats, c.physical), `${c.bearing}度`).toBe(1);
      expect(countIn(stats, c.traditional), `${c.bearing}度`).toBe(0);
    }
  });

  it("空回りしていない: 2 つの規則で答えが割れる方位角が実在する", () => {
    /* 上の 4 件が「たまたま同じ」になっていたら、この検査は何も見ていない */
    for (const c of SPLIT) {
      expect(c.traditional, `${c.bearing}度`).not.toBe(c.physical);
    }
    /* 1 度刻みで全周を回し、割れる角度が十分あることも確かめる */
    let differ = 0;
    for (let b = 0; b < 360; b++) {
      const t = run([town(b, 30)], { nodeMapping: "traditional" });
      const p = run([town(b, 30)], { nodeMapping: "physical" });
      const td = COMPASS_DIRECTIONS.find((d) => countIn(t, d) === 1);
      const pd = COMPASS_DIRECTIONS.find((d) => countIn(p, d) === 1);
      if (td !== pd) differ += 1;
    }
    /*
      実測 60（1 度刻み）。当て推量で 120 と書いて落ちたので測り直した。

      四隅 60 度・四正 30 度と 45 度等分の境目は 8 か所あり、1 か所につき
      7.5 度ずれる（例: NE の始まりが 15 度 と 22.5 度）。8 × 7.5 = 60。
      「1 方位あたり 15 度 × 8 方位」と数えると**同じずれを両隣で二重に
      数える**ことになる。
    */
    expect(differ).toBe(60);
  });

  it("方位以外は変わらない（集計の式に手を付けていない）", () => {
    const items = [
      town(20, 30, { rent_per_tatami_yen: 3240, tatami_per_rental: 10 }),
      town(200, 40, { rent_per_tatami_yen: 1620, tatami_per_rental: 20 }),
    ];
    const t = run(items, { nodeMapping: "traditional" });
    const p = run(items, { nodeMapping: "physical" });
    const sum = (s: ReturnType<typeof housingStatsByDirection>) =>
      s.reduce((n, d) => n + d.count, 0);
    /* 入る先が変わるだけで、落ちる件数も拾う件数も同じ */
    expect(sum(p)).toBe(sum(t));
    expect(sum(t)).toBe(2);
    /* 円/㎡ は畳から直した値。規則を変えても数字は同じ */
    expect(t.find((d) => d.direction === "NE")!.medianRentPerSqm).toBe(
      Math.round(3240 / TATAMI_SQM),
    );
    expect(p.find((d) => d.direction === "N")!.medianRentPerSqm).toBe(
      Math.round(3240 / TATAMI_SQM),
    );
  });
});
