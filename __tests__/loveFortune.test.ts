import { describe, expect, it } from "vitest";
import { STAR_NAMES, STARS } from "@/lib/kigakuContent";
import { buildLoveFortune, buildLoveFortuneFromBoard } from "@/lib/loveFortune";
import { buildTodayBoard } from "@/lib/todayDirections";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

describe("本命星別の今日の恋愛の目安", () => {
  const fixtureDate = new Date("2026-11-21T12:00:00+09:00");

  it("1〜9の本命星が順番にそろい、STAR_NAMESと一致する", () => {
    const result = buildLoveFortune(fixtureDate);
    expect(result.items).toHaveLength(9);
    expect(result.items.map((item) => item.star)).toEqual([...STARS]);
    expect(result.items.map((item) => item.name)).toEqual(
      STARS.map((star) => STAR_NAMES[star]),
    );
    expect(result.items.map((item) => item.href)).toEqual(
      STARS.map((star) => `/houi/2026/${star}`),
    );
  });

  it("同じJST日付の別時刻なら同一の文になる", () => {
    const morning = buildLoveFortune(new Date("2026-11-21T00:05:00+09:00"));
    const night = buildLoveFortune(new Date("2026-11-21T23:55:00+09:00"));
    expect(morning).toEqual(night);
  });

  it("別のJST日付では結果が変わりうる", () => {
    const day1 = buildLoveFortune(new Date("2026-11-21T12:00:00+09:00"));
    const day2 = buildLoveFortune(new Date("2026-11-22T12:00:00+09:00"));
    expect(day1.date).not.toBe(day2.date);
    expect(day1.items.map((item) => item.text)).not.toEqual(
      day2.items.map((item) => item.text),
    );
  });

  it("既存の日盤から組み立てても同じ結果になる", () => {
    const board = buildTodayBoard(fixtureDate);
    expect(buildLoveFortuneFromBoard(board)).toEqual(
      buildLoveFortune(fixtureDate),
    );
  });

  it("吉方位がある星は方位ラベルを含み、ない星は吉方位はなしと述べる", () => {
    const board = buildTodayBoard(fixtureDate);
    const result = buildLoveFortune(fixtureDate);
    for (const [index, star] of board.stars.entries()) {
      const item = result.items[index];
      expect(item.lucky).toEqual(star.lucky);
      if (star.lucky.length > 0) {
        for (const direction of star.lucky) {
          expect(item.text).toContain(DIRECTION_LABELS[direction]);
        }
      } else {
        expect(item.text).toContain("吉方位はなし");
      }
    }
  });

  it("点数・順位・誇張・不安を煽る表現を含まず、七赤を恋愛の星と断定しない", () => {
    const forbidden = [
      /[0-9０-９]+[%％点位]/,
      /ランキング/,
      /当たる/,
      /必ず/,
      /別離|不幸|破局|災い/,
      /数千年/,
    ];
    for (const dateStr of [
      "2026-11-21T12:00:00+09:00",
      "2026-11-22T12:00:00+09:00",
      "2026-11-23T12:00:00+09:00",
    ]) {
      const result = buildLoveFortune(new Date(dateStr));
      for (const item of result.items) {
        for (const pattern of forbidden) {
          expect(item.text).not.toMatch(pattern);
        }
      }
      const seven = result.items.find((item) => item.star === 7)!;
      expect(seven.text).not.toContain("恋愛の星");
      expect(seven.text).not.toMatch(/七赤.*恋愛/);
    }
  });

  it("吉方位の回座星が四緑木星のときは縁談または結婚を含む", () => {
    const board = buildTodayBoard(fixtureDate);
    const result = buildLoveFortuneFromBoard(board);
    const kyuushi = result.items.find((item) => item.star === 9)!;
    expect(kyuushi.lucky.some((dir) => board.board[dir] === 4)).toBe(true);
    expect(kyuushi.text).toMatch(/縁談|結婚/);
  });

  it("2026-11-21 JSTの9星分の文がフィクスチャと完全一致する", () => {
    const result = buildLoveFortune(fixtureDate);
    expect(result.items.map((item) => item.text)).toEqual([
      "吉方位は北（発展や音・若さの象意）。会合や約束の外出先に向きます。",
      "今日は吉方位はなし。待ち合わせや会合は共通の避けたい方位を外して選ぶのが目安です。",
      "吉方位は北東（交わりやはじまりの象意）。会合や約束の外出先に向きます。",
      "今日は吉方位はなし。待ち合わせや会合は共通の避けたい方位を外して選ぶのが目安です。",
      "今日は吉方位はなし。待ち合わせや会合は共通の避けたい方位を外して選ぶのが目安です。",
      "吉方位は北東（交わりやはじまりの象意）・南（土台や地道さの象意）。会合や約束の外出先に向きます。",
      "吉方位は北東（交わりやはじまりの象意）・南（土台や地道さの象意）・北西（変化や節目の象意）。会合や約束の外出先に向きます。",
      "今日は吉方位はなし。待ち合わせや会合は共通の避けたい方位を外して選ぶのが目安です。",
      "吉方位は北（発展や音・若さの象意）・南（土台や地道さの象意）・南西（縁談・結婚や信用の象意）・北西（変化や節目の象意）。会合や約束の外出先に向きます。",
    ]);
  });
});
