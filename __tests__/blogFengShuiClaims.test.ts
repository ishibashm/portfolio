import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  readFengShui,
  honmeiGua,
  GUA_NAME,
  guaGroup,
  type Gua,
} from "@/utils/fengShuiEngine";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { getHonmeiStar } from "@/utils/ephemerisEngine";

/**
 * 公開記事 feng-shui-and-kigaku-side-by-side の表をエンジンと照合する。
 *
 * この記事は本命卦ごとの吉凶 8 方位を**具体的な札の名前**（生気・天医・
 * 延年・伏位・絶命・五鬼・六殺・禍害）まで書いている。表を手で書き写して
 * いるので、エンジン側の表を直したときに記事だけ古くなる。記事は散文で
 * tsc も lint も守ってくれないので、ここで機械的に突き合わせる
 * （blogHonmeisatsuClaims と同じ考え方）。
 *
 * 対象は**表と、本命卦を出す例の数字**だけ。言い回しまでは追わない。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/feng-shui-and-kigaku-side-by-side.md"),
  "utf-8",
);

const GUAS: Gua[] = [1, 2, 3, 4, 6, 7, 8, 9];

/** 記事の表から「卦 → 行」を拾う。行は `| 坎（1） | 東四命 | 吉… | 凶… |`。 */
function rowFor(gua: Gua): string[] {
  const name = GUA_NAME[gua];
  const line = md.split("\n").find((l) => l.startsWith(`| ${name}（${gua}）`));
  expect(line, `本命卦 ${name}（${gua}）の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/** その卦の吉（または凶）方位を「北（伏位）・東（天医）」の形にする。 */
function expectedCell(gua: Gua, auspicious: boolean): string {
  /* 卦を直に渡す口が無いので、その卦になる年と性別を 1 つ見つけて引く。
     honmeiGua は年と性別だけで決まるので、どの組でも同じ表になる。 */
  let year = 1900;
  let sex: "male" | "female" = "male";
  let found = false;
  for (let y = 1900; y < 2100 && !found; y++) {
    for (const s of ["male", "female"] as const) {
      if (honmeiGua(y, s) === gua) {
        year = y;
        sex = s;
        found = true;
        break;
      }
    }
  }
  expect(found, `本命卦 ${gua} になる年が見つからない`).toBe(true);
  return readFengShui(year, sex)
    .directions.filter((d) => d.auspicious === auspicious)
    .map((d) => `${DIRECTION_LABELS[d.direction]}（${d.youxing}）`)
    .join("・");
}

describe("記事: 風水（八宅）と九星気学", () => {
  it("8 つの本命卦ぶんの行が揃っている", () => {
    for (const gua of GUAS) {
      expect(rowFor(gua).length, `${GUA_NAME[gua]} の列数`).toBe(4);
    }
  });

  for (const gua of GUAS) {
    it(`${GUA_NAME[gua]}（${gua}）の組・吉・凶が engine と一致する`, () => {
      const [, group, auspicious, inauspicious] = rowFor(gua);
      expect(group).toBe(guaGroup(gua));
      expect(auspicious).toBe(expectedCell(gua, true));
      expect(inauspicious).toBe(expectedCell(gua, false));
    });
  }

  it("東四命・西四命の吉方位が 2 通りしかない（記事の主張）", () => {
    const sets = new Set(GUAS.map((g) => expectedCell(g, true)));
    /* 札（生気・天医…）まで含めると卦ごとに違うので、方位だけで見る。 */
    const dirSets = new Set(
      GUAS.map((g) => expectedCell(g, true).replace(/（[^）]+）/g, "")),
    );
    expect(dirSets.size).toBe(2);
    expect(sets.size).toBe(8);
  });

  it("1993 年生まれの例（男は兌・女は艮、気学では七赤金星）", () => {
    expect(honmeiGua(1993, "male")).toBe(7);
    expect(honmeiGua(1993, "female")).toBe(8);
    expect(md).toContain("**兌（7）**");
    expect(md).toContain("**艮（8）**");

    /* 気学の本命星は立春で切るので、年の途中を代表点にする。 */
    const star = getHonmeiStar(new Date("1993-06-01T12:00:00+09:00"));
    expect(star.classical).toBe(7);
    expect(md).toContain("**七赤金星**");
  });

  it("兌の南西・北東は吉（記事が「気学と真逆」と書く根拠）", () => {
    const dirs = readFengShui(1993, "male").directions;
    const sw = dirs.find((d) => d.direction === "SW");
    const ne = dirs.find((d) => d.direction === "NE");
    expect(sw?.youxing).toBe("天医");
    expect(ne?.youxing).toBe("延年");
    expect(sw?.auspicious).toBe(true);
    expect(ne?.auspicious).toBe(true);
  });
});
