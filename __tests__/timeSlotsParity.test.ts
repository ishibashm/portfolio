// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateTimePhase, isVoidTimeHour } from "@/lib/timePhase";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { parseJapanDateTime } from "@/utils/japanDate";
import { getKyusei, getKyuseiBoard } from "@/utils/kigaku";

// 2026-10-11 SolarTimeClock → SolarTimeTable の呼出し・表示優先順位の写し。
// adapter の導入前に固定する。計算式は共通関数、表示の期待値はここが持つ。
function screenRows(
  birthDate: string,
  date: string,
  lon: number,
  override = "",
  classical = true,
) {
  const birth = parseJapanDateTime(birthDate);
  const honmei = getHonmeiStar(birth);
  const voids = override ? override.split("") : getPersonalVoidZodiac(birth);
  return getDailySolarSchedule(new Date(`${date}T12:00:00+09:00`), lon).map(
    (item) => {
      const isVoid = isVoidTimeHour(item, voids);
      const phase = evaluateTimePhase(item, honmei, classical);
      return {
        branch: item.japanese,
        stemBranch: item.etoKanji,
        start: item.startStandard.getTime(),
        end: item.endStandard.getTime(),
        hourStar: { number: item.kyusei.number, name: item.kyusei.japanese },
        label: isVoid ? "天中殺" : phase.isOptimal ? "動いてよい" : "ふつう",
        isVoid,
        isElementFavorable: phase.isFavorable,
        relation: phase.relation,
        myElement: phase.myElement?.id,
        timeElement: phase.timeElement?.id,
        board: getKyuseiBoard(item.kyusei).map((star) => star.number),
      };
    },
  );
}

const births = Array.from({ length: 9 }, (_, i) => `${1980 + i}-05-15T12:00`);
const dates = [
  "1900-01-01",
  "2024-02-29",
  "2026-02-04",
  "2026-06-21",
  "2026-09-23",
  "2026-12-21",
  "2026-12-31",
  "2099-12-31",
];
const longitudes = [122, 124.16, 139.69, 154];

describe("刻の画面互換（adapter 導入前の固定）", () => {
  it("全9本命星・季節・端年・東西端の全出力を固定する", () => {
    expect(
      new Set(
        births.map(
          (birth) => getHonmeiStar(parseJapanDateTime(birth)).classical,
        ),
      ).size,
    ).toBe(9);
    const hash = createHash("sha256");
    for (const birth of births)
      for (const date of dates)
        for (const lon of longitudes) {
          const rows = screenRows(birth, date, lon);
          expect(rows).toHaveLength(12);
          expect(rows.map((r) => r.branch).join("")).toBe(
            "子丑寅卯辰巳午未申酉戌亥",
          );
          rows.forEach((row, i) => {
            expect(row.end - row.start).toBe(7_200_000);
            if (i) expect(row.start).toBe(rows[i - 1].end);
          });
          hash.update(JSON.stringify(rows));
        }
    // TZを変えた別プロセスでもこの同一ハッシュと比較する。
    expect(hash.digest("hex")).toMatchInlineSnapshot(
      `"2f16c0eb7536c62c00aef87e4289420fd9669e84354b2c23b51dea3f2fe7c460"`,
    );
  });

  it("五行の独立した期待表を9×9で固定する", () => {
    const favorable = [
      "13467",
      "256789",
      "1349",
      "1349",
      "256789",
      "125678",
      "125678",
      "256789",
      "234589",
    ];
    for (let mine = 1; mine <= 9; mine++)
      for (let hour = 1; hour <= 9; hour++) {
        const item = {
          ...getDailySolarSchedule(new Date("2026-06-21T12:00+09:00"), 135)[0],
          kyusei: getKyusei(hour),
        };
        expect(
          evaluateTimePhase(item, { classical: mine }, true).isOptimal,
        ).toBe(favorable[mine - 1].includes(String(hour)));
      }
  });

  it("空亡は五行好相性より優先し、非古典の画面も固定する", () => {
    const rows = screenRows("1990-05-15", "2026-06-21", 139.69);
    const good = rows.find((r) => r.isElementFavorable)!;
    const override = good.branch + (good.branch === "子" ? "丑" : "子");
    expect(
      screenRows("1990-05-15", "2026-06-21", 139.69, override).find(
        (r) => r.branch === good.branch,
      ),
    ).toMatchObject({ label: "天中殺", isElementFavorable: true });
    expect(
      createHash("sha256")
        .update(
          JSON.stringify(
            screenRows("1990-05-15", "2026-06-21", 139.69, "辰巳", false),
          ),
        )
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"f26fb73740400f718f777f154c034e631f55773b4376e51a9ca8f7d1f63eea34"`,
    );
  });

  it("出生解釈と南上の盤配置を固定する", () => {
    expect(parseJapanDateTime("1990-05-15").toISOString()).toBe(
      "1990-05-15T00:00:00.000Z",
    );
    expect(parseJapanDateTime("1990-05-15T12:00").toISOString()).toBe(
      "1990-05-15T03:00:00.000Z",
    );
    expect(screenRows("1990-05-15T12:00", "2026-02-04", 122)).toEqual(
      screenRows("1990-05-15T03:00:00Z", "2026-02-04", 122),
    );
    // SE,S,SW,E,CENTER,W,NE,N,NW。北上へ反転しない。
    expect(getKyuseiBoard(getKyusei(5)).map((s) => s.number)).toEqual([
      4, 9, 2, 3, 5, 7, 8, 1, 6,
    ]);
  });
});
