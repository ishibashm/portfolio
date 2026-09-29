import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  readFengShui,
  honmeiGua,
  GUA_NAME,
  guaGroup,
  type Gua,
  type Sex,
} from "@/utils/fengShuiEngine";
import {
  DIRECTION_BEARINGS,
  DIRECTION_LABELS,
  directionFromBearing,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * 公開記事 feng-shui-looks-inside-the-home の表と数字をエンジンと照合する。
 *
 * この記事は宅卦（家の卦）を「坐（背にしている向き）→ 宅卦 → 東四宅／
 * 西四宅」の表で書き、さらに「東四宅の坐の 4 方位は東四命の吉の 4 方位と
 * 同じ集合」と書いている。サイトは宅卦を計算していないので、表の正しさは
 * 本命卦の表（fengShuiEngine）の側から検算する。
 *
 *   ・宅卦は、その卦の**伏位**が坐の方位に当たる卦（坎の伏位は北 → 坐北は坎宅）
 *   ・東四宅／西四宅の分け方は、東四命／西四命と同じ卦の組
 *   ・向は坐の反対
 *
 * 記事は散文で tsc も lint も守ってくれない。表を手で書き換えたとき、
 * またはエンジンの表を直したときに、ここが落ちる（blogFengShuiClaims と
 * 同じ考え方。あちらは本命卦ごとの 8 方位の表を見ている）。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/feng-shui-looks-inside-the-home.md"),
  "utf-8",
);

const GUAS: Gua[] = [1, 2, 3, 4, 6, 7, 8, 9];

const LABEL_TO_DIRECTION = new Map<string, CompassDirection>(
  (Object.entries(DIRECTION_LABELS) as [CompassDirection, string][]).map(
    ([d, label]) => [label, d],
  ),
);

/** 卦を直に渡す口が無いので、その卦になる年と性別を 1 つ見つける。 */
function readingForGua(gua: Gua) {
  for (let y = 1900; y < 2100; y++) {
    for (const s of ["male", "female"] as Sex[]) {
      if (honmeiGua(y, s) === gua) return readFengShui(y, s);
    }
  }
  throw new Error(`本命卦 ${gua} になる年が見つからない`);
}

/** その卦の伏位（本命卦そのものの方位）。宅卦ではこれが坐になる。 */
function fuweiOf(gua: Gua): CompassDirection {
  const d = readingForGua(gua).directions.find((x) => x.youxing === "伏位");
  if (!d) throw new Error(`卦 ${gua} に伏位が無い`);
  return d.direction;
}

function opposite(d: CompassDirection): CompassDirection {
  return directionFromBearing(DIRECTION_BEARINGS[d] + 180, "physical");
}

/** 宅卦の表の行。`| 北 | 南 | 坎 | 東四宅 |` の形。 */
function houseRows(): string[][] {
  return md
    .split("\n")
    .filter((l) => /^\|\s*(北|南|東|西|北東|北西|南東|南西)\s*\|/.test(l))
    .map((l) =>
      l
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    );
}

describe("記事: 風水は住まいの中の向きを見るのか", () => {
  it("宅卦の表が 8 行あり、坐・宅卦がそれぞれ重複しない", () => {
    const rows = houseRows();
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r[0])).size).toBe(8);
    expect(new Set(rows.map((r) => r[2])).size).toBe(8);
  });

  it("坐 → 宅卦は、伏位がその坐に当たる卦と一致する", () => {
    for (const [sit, , houseName] of houseRows()) {
      const dir = LABEL_TO_DIRECTION.get(sit);
      expect(dir, `坐「${sit}」が方位名でない`).toBeTruthy();
      const gua = GUAS.find((g) => fuweiOf(g) === dir);
      expect(gua, `伏位が ${sit} の卦が無い`).toBeTruthy();
      expect(houseName, `坐 ${sit}`).toBe(GUA_NAME[gua!]);
    }
  });

  it("向（正面）は坐の反対", () => {
    for (const [sit, face] of houseRows()) {
      const dir = LABEL_TO_DIRECTION.get(sit)!;
      expect(face, `坐 ${sit}`).toBe(DIRECTION_LABELS[opposite(dir)]);
    }
  });

  it("東四宅・西四宅の分け方が、エンジンの東四命・西四命と同じ卦の組", () => {
    for (const [sit, , houseName, group] of houseRows()) {
      const gua = GUAS.find((g) => GUA_NAME[g] === houseName)!;
      expect(group, `坐 ${sit}（${houseName}）`).toBe(
        guaGroup(gua) === "東四命" ? "東四宅" : "西四宅",
      );
    }
    const east = houseRows().filter((r) => r[3] === "東四宅");
    expect(east).toHaveLength(4);
  });

  it("東四宅（西四宅）の坐の集合は、東四命（西四命）の吉の 4 方位と同じ", () => {
    /* 本文の「東四宅の坐は**北・南・東・南東**」「西四宅の坐（**北西・南西・北東・西**）」 */
    const east = md.match(/東四宅の坐は\*\*([^*]+)\*\*/)?.[1];
    const west = md.match(/西四宅の坐（\*\*([^*]+)\*\*）/)?.[1];
    expect(east, "東四宅の坐の列挙が本文に無い").toBeTruthy();
    expect(west, "西四宅の坐の列挙が本文に無い").toBeTruthy();

    const auspiciousOf = (group: "東四命" | "西四命") => {
      const gua = GUAS.find((g) => guaGroup(g) === group)!;
      return new Set(
        readingForGua(gua)
          .directions.filter((d) => d.auspicious)
          .map((d) => DIRECTION_LABELS[d.direction]),
      );
    };
    const toSet = (s: string) => new Set(s.split("・"));

    expect(toSet(east!)).toEqual(auspiciousOf("東四命"));
    expect(toSet(west!)).toEqual(auspiciousOf("西四命"));

    /* 表の坐とも同じ集合（本文と表が互いに食い違っていない） */
    const tableEast = new Set(
      houseRows()
        .filter((r) => r[3] === "東四宅")
        .map((r) => r[0]),
    );
    expect(tableEast).toEqual(toSet(east!));
  });

  it("方位角 110 度は気学（伝統区分）で南東、八宅（45 度等分）で東", () => {
    /* 移動の方位に八宅を併記する札（FengShuiNote）は physical で落とす */
    expect(md).toContain("方位角 110 度は気学で南東、八宅では東です");
    expect(DIRECTION_LABELS[directionFromBearing(110, "traditional")]).toBe(
      "南東",
    );
    expect(DIRECTION_LABELS[directionFromBearing(110, "physical")]).toBe("東");
  });

  it("早見の頁から引いた断りが、頁に実際にある", () => {
    const page = readFileSync(
      join(__dirname, "../src/app/houi/fengshui/page.tsx"),
      "utf-8",
    );
    const quoted =
      "引越しの方位を測る九星気学とは、そもそも見ている対象が違います";
    expect(md).toContain(`「${quoted}」`);
    expect(page).toContain(quoted);
  });

  it("移動の方位への併記は 45 度等分で落としている（記事の説明どおり）", () => {
    const note = readFileSync(
      join(__dirname, "../src/components/relocation/FengShuiNote.tsx"),
      "utf-8",
    );
    expect(md).toContain("45 度ずつの 8 方位に落とし");
    expect(note).toContain('directionFromBearing(bearing, "physical")');
  });
});
