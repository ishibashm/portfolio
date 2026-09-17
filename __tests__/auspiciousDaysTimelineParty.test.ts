import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/relocation/auspicious-days/route";

/*
  時期ツール（/relocation/timing）の走査に同行者・合流する人を足す。

  物件検索の「同行者」は 1 物件 × 人数 × 日数を候補ぶん回すので、時期の
  走査を 90 日で止めている。「合流する人を選んで 2 年ぶん見たい」
  （利用者の要望 2026-09-17）は、合流先が 1 つなら人数ぶん 730 日を
  走査すれば足りるので、時期ツールの API（mode=timeline）に `party` を
  足した。物件検索の 90 日は据え置き。

  ここで固定するのは次の 4 つ。

    1. party を付けても本人の `days` は 1 人のときと同じ（既存の画面を壊さない）
    2. 移動する同行者ごとに、本人と同じ日付の並びが返る（人ごとの本命星で）
    3. 移動しない人（stationary）は一覧に残るが days は空
    4. 上限を超えた人数は切る（1 人 730 日 ≒ 3 秒が人数ぶん線形に増えるため）
*/

const BASE =
  "http://localhost/api/relocation/auspicious-days?mode=timeline" +
  "&birthDate=1997-06-15T04:26&lon=136.9008&from=2026-03-01&to=2026-03-31";

const MOTHER = {
  id: "mother",
  name: "母",
  birthDate: "1965-02-03T12:00",
  birthLat: null,
  birthLon: null,
  baseLat: 33.5902,
  baseLon: 130.4017,
  weight: 1,
  stationary: false,
};

const PARTNER_THERE = {
  id: "partner",
  name: "現地の相手",
  birthDate: "1990-08-08",
  birthLat: null,
  birthLon: null,
  baseLat: 43.0618,
  baseLon: 141.3545,
  weight: 1,
  stationary: true,
};

async function call(party?: unknown) {
  const url = party
    ? `${BASE}&party=${encodeURIComponent(JSON.stringify(party))}`
    : BASE;
  const res = await GET(new Request(url));
  expect(res.status).toBe(200);
  return res.json();
}

describe("mode=timeline の party", () => {
  it("party を付けても本人の days は 1 人のときと同じ", async () => {
    const solo = await call();
    const withParty = await call([MOTHER]);
    expect(solo.members).toBeUndefined();
    expect(withParty.days).toEqual(solo.days);
    expect(withParty.honmeiStar).toBe(solo.honmeiStar);
  });

  it("移動する同行者は本人と同じ日付の並びで、その人の本命星で返る", async () => {
    const json = await call([MOTHER]);
    expect(json.members).toHaveLength(1);
    const m = json.members[0];
    expect(m.id).toBe("mother");
    expect(m.name).toBe("母");
    expect(m.stationary).toBe(false);
    expect(m.baseLat).toBe(33.5902);
    expect(m.baseLon).toBe(130.4017);
    expect(m.days.map((d: { date: string }) => d.date)).toEqual(
      json.days.map((d: { date: string }) => d.date),
    );
    // 本命星が違うので、少なくともどこかの日・方位で段階が違う
    expect(m.honmeiStar).not.toBe(json.honmeiStar);
    const differs = m.days.some(
      (d: { tiers: Record<string, string> }, i: number) =>
        Object.keys(d.tiers).some((k) => d.tiers[k] !== json.days[i].tiers[k]),
    );
    expect(differs).toBe(true);
    for (const d of m.days) {
      expect(Object.keys(d.tiers)).toHaveLength(8);
      for (const t of Object.values(d.tiers)) {
        expect(["S", "A", "B", "C", "D", "X"]).toContain(t);
      }
    }
  });

  it("移動しない人は一覧に残るが days は空", async () => {
    const json = await call([PARTNER_THERE, MOTHER]);
    expect(json.members.map((m: { id: string }) => m.id)).toEqual([
      "partner",
      "mother",
    ]);
    expect(json.members[0].stationary).toBe(true);
    expect(json.members[0].days).toEqual([]);
    expect(json.members[0].honmeiStar).toBeNull();
    expect(json.members[1].days).toHaveLength(json.days.length);
  });

  it("壊れた party は無視して 1 人ぶんを返す", async () => {
    const res = await GET(new Request(`${BASE}&party=%7Bnot-json`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toBeUndefined();
    expect(json.days.length).toBeGreaterThan(0);
  });

  it("人数の上限（4 人）を超えたぶんは切る", async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...MOTHER,
      id: `m${i}`,
      name: `同行者${i}`,
    }));
    const json = await call(many);
    expect(json.members).toHaveLength(4);
    expect(json.members.map((m: { id: string }) => m.id)).toEqual([
      "m0",
      "m1",
      "m2",
      "m3",
    ]);
  });
});
