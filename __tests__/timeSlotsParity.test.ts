// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateTimePhase, isVoidTimeHour } from "@/lib/timePhase";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { parseJapanDateTime } from "@/utils/japanDate";
import { getKyusei, getKyuseiBoard } from "@/utils/kigaku";
import { calculateTimeSlots, TimeSlotsError } from "@/lib/timeSlots";

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

describe("刻の通信アダプター", () => {
  const input = {
    birthDate: "1990-05-15T12:00",
    date: "2026-06-21",
    lat: 35.18,
    lon: 136.91,
  };
  const directions = [
    "SE",
    "S",
    "SW",
    "E",
    "CENTER",
    "W",
    "NE",
    "N",
    "NW",
  ] as const;

  it("既存画面の全出力に一致しミリ秒を落とさない", () => {
    for (const birthDate of [
      ...births,
      "1990-05-15",
      "2026-02-04T00:00",
      "2026-02-04T23:59:59+09:00",
      "1990-05-15T03:00:00Z",
    ]) {
      for (const date of dates)
        for (const lon of longitudes) {
          const actual = calculateTimeSlots({
            ...input,
            birthDate,
            date,
            lon,
            includeBoard: true,
          });
          const expected = screenRows(birthDate, date, lon);
          expect(
            actual.slots.map((row) => ({
              branch: row.branch,
              stemBranch: row.stemBranch,
              start: Date.parse(row.start),
              end: Date.parse(row.end),
              hourStar: row.hourStar,
              label: row.label,
              isVoid: row.isVoid,
              isElementFavorable: row.isElementFavorable,
              relation: row.relation,
              myElement: row.myElement?.id,
              timeElement: row.timeElement?.id,
              board: directions.map((d) => row.board![d].number),
            })),
          ).toEqual(expected);
          expect(actual.coverage).toEqual({
            start: actual.slots[0].start,
            end: actual.slots[11].end,
          });
          for (const [index, row] of actual.slots.entries()) {
            expect(row.index).toBe(index);
            expect(row.start).toMatch(/\.\d{3}\+09:00$/);
            expect(row.status).toBe(
              row.isVoid
                ? "void"
                : row.isElementFavorable
                  ? "favorable"
                  : "neutral",
            );
          }
        }
    }
  });

  it("空亡overrideを優先し、空文字なら出生から計算する", () => {
    const base = calculateTimeSlots(input);
    expect(
      calculateTimeSlots({ ...input, settings: { voidZodiacOverride: "" } })
        .slots,
    ).toEqual(base.slots);
    const branch = base.slots.find((s) => s.isElementFavorable)!.branch;
    const override = branch + (branch === "子" ? "丑" : "子");
    const actual = calculateTimeSlots({
      ...input,
      settings: { useClassicalBoard: true, voidZodiacOverride: override },
    });
    expect(actual.slots.find((s) => s.branch === branch)).toMatchObject({
      status: "void",
      isElementFavorable: true,
    });
    expect(actual.settingsUsed.voidZodiacSource).toBe("override");
    expect(actual.settingsSources).toEqual({
      useClassicalBoard: "explicit",
      voidZodiacOverride: "explicit",
    });
  });

  it("JST深夜の省略日・区間境界・盤の方向と名前を守る", () => {
    const { date: _date, ...withoutDate } = input;
    void _date;
    expect(
      calculateTimeSlots(withoutDate, new Date("2026-06-20T15:00:00Z")).date,
    ).toBe("2026-06-21");
    const actual = calculateTimeSlots({ ...input, includeBoard: true });
    expect(Date.parse(actual.coverage.start)).toBeLessThan(
      Date.parse("2026-06-21T00:00:00+09:00"),
    );
    expect(Date.parse(actual.coverage.end)).toBeLessThan(
      Date.parse("2026-06-22T00:00:00+09:00"),
    );
    for (const [index, row] of actual.slots.entries()) {
      const start = Date.parse(row.start);
      const containing = (ms: number) =>
        actual.slots.find(
          (s) => Date.parse(s.start) <= ms && ms < Date.parse(s.end),
        );
      expect(containing(start)).toBe(row);
      expect(containing(start - 1)).toBe(
        index ? actual.slots[index - 1] : undefined,
      );
      expect(containing(Date.parse(row.end))).toBe(actual.slots[index + 1]);
      expect(row.board!.CENTER).toEqual(row.hourStar);
      expect(directions.map((d) => row.board![d])).toEqual(
        getKyuseiBoard(getKyusei(row.hourStar.number)).map((s) => ({
          number: s.number,
          name: s.japanese,
        })),
      );
    }
  });

  it.each([
    { birthDate: "2026-02-30" },
    { birthDate: "2026-02-30T12:00" },
    { birthDate: "2026-01-01T24:00" },
    { birthDate: "2026-01-01T12:00+99:99" },
    { birthDate: "" },
    { birthDate: "1899-12-31" },
    { birthDate: "2100-01-01" },
    { date: "2026-02-29" },
    { date: "2100-01-01" },
    { date: "2026-06-21T12:00" },
    { lat: undefined },
    { lon: undefined },
    { lat: NaN },
    { lon: Infinity },
    { lat: 19.99 },
    { lat: 46.01 },
    { lon: 121.99 },
    { lon: 154.01 },
    { settings: { voidZodiacOverride: "子子" } },
    { settings: { voidZodiacOverride: "辰" } },
    { settings: { voidZodiacOverride: "辰巳午" } },
    { settings: { voidZodiacOverride: "ab" } },
    { settings: { zodiacTimeBasis: "solar" } },
    { profile: { name: "テスト" } },
    { includeBoard: "true" },
    { userId: "other" },
  ])("不正入力を値の復唱なしで拒否する: %j", (patch) => {
    expect(() => calculateTimeSlots({ ...input, ...patch })).toThrowError(
      new TimeSlotsError("INVALID_INPUT"),
    );
  });

  it("非古典は別の計算へ切り替えず明示エラーにする", () => {
    expect(() =>
      calculateTimeSlots({ ...input, settings: { useClassicalBoard: false } }),
    ).toThrowError(new TimeSlotsError("UNSUPPORTED_SETTINGS"));
  });

  it("計算応答は入力値や不要な画面のCSSを返さない", () => {
    const result = calculateTimeSlots({ ...input, birthDate: "1990-05-15" });
    expect(result.slots.every((s) => !("board" in s))).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("DATE_ONLY_BIRTH");
    expect(result.directionJudgment).toBe("not_provided_by_time_table");
    const json = JSON.stringify(result);
    for (const privateValue of [
      "1990-05-15",
      "35.18",
      "136.91",
      "text-blue",
      'birthDate":',
      'lat":',
      'lon":',
    ])
      expect(json).not.toContain(privateValue);
    expect(() => calculateTimeSlots(input, new Date(NaN))).toThrowError(
      "INVALID_INPUT",
    );
    const { date: _date, ...withoutDate } = input;
    void _date;
    expect(() =>
      calculateTimeSlots(withoutDate, new Date("2100-01-01")),
    ).toThrowError("INVALID_INPUT");
  });
});

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
