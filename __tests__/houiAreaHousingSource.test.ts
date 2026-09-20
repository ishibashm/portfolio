import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import housingStats from "@/data/housingStats.json";
import {
  housingFiguresFor,
  rentDiffPct,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";

/**
 * 市区町村ページ（`/houi/area/[code]`）の家賃が、**掲載ではなく公開統計**
 * から出ていること。
 *
 * ## なぜ見張るか
 *
 * 賃貸の巡回は規約に従って止めた（backlog 29 節）。`areaDirections.json` を
 * 焼く `build_area_dataset` は `scrape-rentals.yml` の中にしか無いので、
 * **0 件にはならず、2026-09-13 の値のまま凍結している。**頁は集計日を
 * 出していたが、日付だけでは「取り込みが遅れているのかな」としか読めない。
 *
 * 2026-09-19 に e-Stat「統計でみる市区町村のすがた」Ｈ 居住へ移した。
 * `area.sqmRent` / `area.medianRent` はデータ側にまだ残っているので、
 * **1 行書き戻すだけで凍結した数字が画面に戻る。**字面で見張る。
 *
 * ## 数えないもの
 *
 * カバー率（何頁に家賃があるか）は**固定しない。**次の調査（2028 年）で
 * 顔ぶれが変わる。ここで見るのは「無いときに 0 を作っていないか」だけ。
 */

const PAGE = join(process.cwd(), "src/app/houi/area/[code]/page.tsx");
const source = readFileSync(PAGE, "utf8");
const PREF_PAGE = join(process.cwd(), "src/app/houi/pref/[code]/page.tsx");
const prefSource = readFileSync(PREF_PAGE, "utf8");
const snapshot = housingStats as unknown as HousingSnapshotData;

describe("市区町村ページの家賃は公開統計から出す", () => {
  it("掲載由来の家賃を読んでいない", () => {
    for (const field of ["sqmRent", "medianRent", "rentDiffPct"]) {
      /* `rentDiffPct` は lib/housingSnapshot にも同名の関数があるので、
         `n.` を付けた一覧の行の読み取りだけを見る。 */
      expect(source, `掲載由来の ${field} を読んでいる`).not.toContain(
        `n.${field}`,
      );
      expect(source, `掲載由来の ${field} を読んでいる`).not.toContain(
        `area.${field}`,
      );
    }
    /* 凍結の断りは要らなくなった（凍結した数字を出さなくなったので）。 */
    expect(source).not.toContain("listingSnapshotNote");
  });

  it("e-Stat の写しから引いている", () => {
    expect(source).toContain("housingFiguresFor");
    expect(source).toContain("@/data/housingStats.json");
  });

  it("公表値が無い市区町村は 0 ではなく null になる", () => {
    /* ここが 0 を返すと、頁は「家賃 0 円」と書く。**無いことは 0 では
       ない。**写しの中から実際に家賃の無い行を 1 つ選んで見る。 */
    const noRent = Object.entries(snapshot.areas).find(
      ([, a]) => a.rentPerTatamiYen === null,
    );
    expect(noRent, "家賃の無い行が写しに 1 つも無い").toBeTruthy();
    const figures = housingFiguresFor(snapshot, noRent![0]);
    expect(figures).not.toBeNull();
    expect(figures!.rentPerSqm).toBeNull();
    expect(figures!.monthlyRentEstimate).toBeNull();
  });

  it("写しに行が無い市区町村は null を返す", () => {
    expect(housingFiguresFor(snapshot, "99999")).toBeNull();
  });

  it("県ページも掲載由来の家賃を読んでいない", () => {
    /* 県ページは安い側・高い側の 5 件を並べる。**表示だけ差し替えて
       順序を掲載のままにすると**、安い順のはずが別の基準で並ぶ。
       並べ替えも同じ公開統計で行っていることを見る。 */
    expect(prefSource).not.toContain("a.medianRent");
    expect(prefSource).not.toContain("medianOfMedians");
    expect(prefSource).not.toContain("listingSnapshotNote");
    expect(prefSource).toContain("housingFiguresFor");
    expect(prefSource).toMatch(/\.sort\(\(x, y\) => x\.rent - y\.rent\)/);
  });

  it("差の計算は、どちらかが欠けたら null", () => {
    const withRent = Object.entries(snapshot.areas).find(
      ([, a]) => a.rentPerTatamiYen !== null,
    );
    expect(withRent, "家賃のある行が写しに 1 つも無い").toBeTruthy();
    const base = housingFiguresFor(snapshot, withRent![0])!;
    expect(rentDiffPct(base, null)).toBeNull();
    expect(rentDiffPct(null, base)).toBeNull();
    /* 自分自身との差は 0。向きの取り違えがあればここで出る。 */
    expect(rentDiffPct(base, base)).toBe(0);
  });
});
