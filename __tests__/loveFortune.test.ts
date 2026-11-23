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

  it("回座と吉方位の短い目安を方位順に返す", () => {
    const { items } = buildLoveFortune(fixtureDate);
    expect(items[8]).toMatchObject({
      sitting: "西",
      sittingKind: "commonUnlucky",
      action: "会合や約束の外出先に",
      luckyHints: [
        { direction: "N", label: "北", hint: "発展・音・若さ" },
        { direction: "S", label: "南", hint: "土台・地道さ" },
        { direction: "SW", label: "南西", hint: "縁談・結婚" },
        { direction: "NW", label: "北西", hint: "変化・節目" },
      ],
    });
    expect(items[6]).toMatchObject({
      sitting: "中宮",
      sittingKind: "center",
      action: "会合や約束の外出先に",
    });
  });

  it("吉方位がないときは回座の種類に合う行動の目安を返す", () => {
    const board = buildTodayBoard(fixtureDate);
    const { items } = buildLoveFortuneFromBoard({
      ...board,
      stars: board.stars.map((star) =>
        star.star === board.center ? { ...star, lucky: [] } : star,
      ),
    });
    expect(items[1]).toMatchObject({
      sitting: "南",
      sittingKind: "normal",
      action: "近場で過ごす、連絡をていねいに",
      luckyHints: [],
    });
    expect(items[4]).toMatchObject({
      sitting: "東",
      sittingKind: "commonUnlucky",
      action: "その方位への外出は控え、近場や家で連絡を",
      luckyHints: [],
    });
    expect(items[6]).toMatchObject({
      sitting: "中宮",
      sittingKind: "center",
      action: "近場や家でのやり取りをていねいに",
      luckyHints: [],
    });
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
        for (const copy of [
          item.text,
          item.action,
          ...item.luckyHints.map(({ hint }) => hint),
        ]) {
          for (const pattern of [...forbidden, /恋愛の星/]) {
            expect(copy).not.toMatch(pattern);
          }
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

  it("2026-11-21とその前後の日付で9星すべての文が重複しない", () => {
    for (const dateStr of [
      "2026-11-19T12:00:00+09:00",
      "2026-11-20T12:00:00+09:00",
      "2026-11-21T12:00:00+09:00",
      "2026-11-22T12:00:00+09:00",
      "2026-11-23T12:00:00+09:00",
    ]) {
      const texts = buildLoveFortune(new Date(dateStr)).items.map(
        (item) => item.text,
      );
      expect(new Set(texts).size, dateStr).toBe(9);
    }
  });

  it("2026-11-21 JSTの9星分の文がフィクスチャと完全一致する", () => {
    const result = buildLoveFortune(fixtureDate);
    expect(result.items.map((item) => item.text)).toEqual([
      "北東に回座。吉方位は北（発展や音・若さの象意）。会合や約束の外出先に向きます。",
      "今日は吉方位はなし。南に回座し、土台や地道さの象意。遠出は控え、近場で過ごしたり連絡をていねいにするのが目安です。",
      "北に回座。吉方位は北東（交わりやはじまりの象意）。会合や約束の外出先に向きます。",
      "今日は吉方位はなし。南西に回座し、縁談・結婚や信用の象意。遠出は控え、近場で過ごしたり連絡をていねいにするのが目安です。",
      "今日は吉方位はなし。東に回座し、中心の象意。その方位への外出は控え、近場や家での連絡をていねいにするのが目安です。",
      "南東に回座。吉方位は北東（交わりやはじまりの象意）・南（土台や地道さの象意）。会合や約束の外出先に向きます。",
      "中宮に回座。吉方位は北東（交わりやはじまりの象意）・南（土台や地道さの象意）・北西（変化や節目の象意）。会合や約束の外出先に向きます。",
      "今日は吉方位はなし。北西に回座し、変化や節目の象意。遠出は控え、近場で過ごしたり連絡をていねいにするのが目安です。",
      "西に回座。吉方位は北（発展や音・若さの象意）・南（土台や地道さの象意）・南西（縁談・結婚や信用の象意）・北西（変化や節目の象意）。会合や約束の外出先に向きます。",
    ]);
  });
});
