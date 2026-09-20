import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PER_DIRECTION,
  housingStatsByDirection,
  type HousingPoint,
  type HousingStatRow,
} from "@/lib/housingStatsDirections";
import { destinationAtBearing } from "@/utils/directionGeo";

/*
  方位ごとの「街を見る」（`HousingStatsByDirection` の開閉部分）。

  ## なぜ要るか

  賃貸の巡回を止めたので（backlog 29 節）、物件検索の掲載は 10 月中旬に
  0 件になる。**並べる先を部屋から街へ移す**のがこの移行の本体で、ここが
  その入口。

  ## 気にしていること

  1. **外部リンクをここに置かない。**8 方位 × 12 件を全部ポータルへ繋ぐと
     1 画面で最大 96 本の外部リンクになる。行き先はこのサイトの市区町村
     ページで、外部への導線はその頁が持っている（#1296）
  2. **新しい要求を出さない。**街の一覧は同じ応答に入っている（#1300）。
     開閉のために fetch を足すと、DB の走査が倍になる（backlog 19 節で
     「同じ走査が 2 本」が本番 17〜40 秒の正体だった）
  3. **切った件数と全体の数を取り違えない。**12 件出して「12 市区町村」と
     書くと、30 件ある方位が 12 件に見える
*/

const COMPONENT = "src/components/relocation/HousingStatsByDirection.tsx";
const SRC = readFileSync(join(process.cwd(), COMPONENT), "utf8");

const BASE_LAT = 35.6812;
const BASE_LON = 139.7671;

let seq = 0;
function town(
  bearing: number,
  km: number,
  pref: string,
  city: string,
): { row: HousingStatRow; point: HousingPoint } {
  const code = `9${String(++seq).padStart(4, "0")}`;
  const { lat, lon } = destinationAtBearing(BASE_LAT, BASE_LON, bearing, km);
  return {
    row: {
      area_code: code,
      area_name: city,
      total_dwellings: 50000,
      vacant_dwellings: 5000,
      rent_per_tatami_yen: 3240,
      tatami_per_rental: 18,
      floor_area_per_rental: 40,
    },
    point: { code, lat, lon, pref, city },
  };
}

describe("街の一覧の作り", () => {
  it("外部の不動産サイトへ直接繋いでいない", () => {
    /* 行き先はこのサイトの /houi/area/{code}。外部への導線はその頁が持つ */
    expect(SRC).not.toMatch(/https?:\/\/(www\.)?(suumo|homes)\./);
    /* 字面でファイル全体を見ると、この判断を説明したコメント自身を拾う。
       **import 文だけ**を取り出して、外部への導線の部品を持ち込んで
       いないことを見る */
    const imports = SRC.split("\n").filter((l) => l.startsWith("import"));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.join("\n")).not.toContain("CityPortalLinks");
    expect(imports.join("\n")).not.toContain("portalLinks");
    expect(SRC).toContain("/houi/area/${m.code}");
  });

  it("開閉のために新しい要求を出していない", () => {
    /* fetch は 1 か所だけ。開閉は描画の話 */
    expect(SRC.match(/fetch\(/g) ?? []).toHaveLength(1);
  });

  it("開いている方位は 1 つだけ（積み上がらない）", () => {
    /* 8 方位 × 12 件を常に開くと 96 行になり、上の集計が読めなくなる */
    expect(SRC).toContain("useState<CompassDirection | null>");
    expect(SRC).toContain("cur === d.direction ? null : d.direction");
  });

  it("開閉の状態を支援技術にも伝えている", () => {
    /* 開いている方位は、押した方位か、絞り込んだ 1 方位（effectiveOpen）。
       2026-09-20 に方位で絞ると最初から開くようにした */
    expect(SRC).toContain("aria-expanded={effectiveOpen === d.direction}");
  });

  it("押せる大きさがある（24px 以上）", () => {
    /* WCAG 2.2 Target Size。頁の他の操作と同じ扱い */
    expect(SRC).toMatch(/min-h-\[24px\][^"]*"\s*>\s*\{effectiveOpen/);
  });
});

describe("件数の出し方", () => {
  const items = Array.from({ length: DEFAULT_PER_DIRECTION + 8 }, (_, i) =>
    town(0, 10 + i, "東京都", `区${i}`),
  );
  const north = housingStatsByDirection(
    items.map((i) => i.row),
    items.map((i) => i.point),
    BASE_LAT,
    BASE_LON,
  ).find((s) => s.direction === "N")!;

  it("切ったときは、出した数と全体の数の両方が要る", () => {
    /* 12 件出して「12 市区町村」と書くと、30 件ある方位が 12 件に見える */
    expect(north.truncated).toBe(true);
    expect(north.municipalities).toHaveLength(DEFAULT_PER_DIRECTION);
    expect(north.count).toBe(DEFAULT_PER_DIRECTION + 8);
  });

  it("画面が両方を出している（切ったときだけ全体の数を添える）", () => {
    expect(SRC).toContain("d.truncated ?");
    expect(SRC).toContain(
      "この方位は全部で ${d.count.toLocaleString()} 市区町村",
    );
  });

  it("切っていない方位に余計な断りを出さない", () => {
    const one = town(90, 30, "千葉県", "市");
    const east = housingStatsByDirection(
      [one.row],
      [one.point],
      BASE_LAT,
      BASE_LON,
    ).find((s) => s.direction === "E")!;
    expect(east.truncated).toBe(false);
    expect(east.municipalities).toHaveLength(1);
  });
});
