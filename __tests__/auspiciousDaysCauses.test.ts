import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/relocation/auspicious-days/route";
import { decodeBlockCause } from "@/lib/blockCause";

/*
  時期の走査（mode=timeline）は、方位ごとの段階に加えて「なぜ塞がって
  いるか」の符号を返す。利用者報告（2026-09-19）の実データで確かめる:
  七赤の人は 2027 年（九紫中宮）に東が本命殺・西が本命的殺で、その
  気学年のあいだ日取りでは戻らない。段階「X」だけでは、それが天中殺
  でないことを画面が言えなかった。
*/
describe("時期の走査が塞いでいる理由を返す", () => {
  it("七赤の 2027 年は、東が年盤の本命殺・西が年盤の本命的殺", async () => {
    const params = new URLSearchParams({
      birthDate: "1966-09-22T12:00",
      lon: "135.7681",
      tenchusatsuMode: "strict",
      involuntaryMove: "false",
      directionFilterMode: "personal_kigaku_environmental",
      mode: "timeline",
      from: "2027-03-01",
      to: "2027-03-10",
    });
    const res = await GET(
      new Request(`http://x/api/relocation/auspicious-days?${params}`),
    );
    const json = await res.json();
    expect(json.days.length).toBeGreaterThan(0);
    for (const row of json.days) {
      expect(row.tiers.E).toBe("X");
      expect(decodeBlockCause(row.causes.E)).toBe("年盤の本命殺");
      expect(decodeBlockCause(row.causes.W)).toBe("年盤の本命的殺");
    }
  });

  it("凶の無い方位は空で、同行者の行にも同じ形で入る", async () => {
    const party = JSON.stringify([
      {
        id: "me",
        name: "私",
        birthDate: "1970-11-25T04:26",
        birthLat: null,
        birthLon: null,
        baseLat: 35.147,
        baseLon: 136.905,
        weight: 1,
        stationary: false,
      },
    ]);
    const params = new URLSearchParams({
      birthDate: "1966-09-22T12:00",
      lon: "135.7681",
      tenchusatsuMode: "strict",
      involuntaryMove: "false",
      directionFilterMode: "personal_kigaku_environmental",
      mode: "timeline",
      from: "2026-09-19",
      to: "2026-09-25",
      party,
    });
    const json = await (
      await GET(
        new Request(`http://x/api/relocation/auspicious-days?${params}`),
      )
    ).json();
    const me = json.members[0];
    expect(me.days.length).toBe(json.days.length);
    for (const row of [...json.days, ...me.days]) {
      for (const dir of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) {
        const isBad = row.tiers[dir] === "X" || row.tiers[dir] === "D";
        expect(row.causes[dir] !== "").toBe(isBad);
        if (isBad) expect(decodeBlockCause(row.causes[dir])).not.toBe("");
      }
    }
    // 三碧の 2026 年は西が年盤の本命殺・東が本命的殺
    expect(decodeBlockCause(me.days[0].causes.W)).toBe("年盤の本命殺");
    expect(decodeBlockCause(me.days[0].causes.E)).toBe("年盤の本命的殺");
  });
});
