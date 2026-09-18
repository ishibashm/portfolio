import { describe, expect, it } from "vitest";
import {
  destinationCandidates,
  jointTimeline,
  partyTimingReport,
  type Destination,
  type MemberTimeline,
  type TimelineRow,
} from "@/lib/partyTimeline";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { DIRECTION_UNSTABLE_KM } from "@/lib/directionDistance";

/*
  「合流先を選ぶ」のではなく「どこで合流できるか候補を出す」。

  利用者の指摘（2026-09-18）。合流先を選ばせる作りだと、どこなら全員で
  動けるのかを知るのに 47 回選び直すことになる。人ごとに出発地が違う
  ぶん、同じ合流先でも方位が違って答えが予想できないので、なおさら
  選べない。

  ここで固定するのは 3 つ。
    ・並びが「全員で動ける日数」の多い順であること
    ・合流先ごとに人の方位が変わること（この機能の理由そのもの）
    ・**選んだときの答えと、候補として出す答えが一致すること**
      （索引を作り直さない速さのための書き換えで、ここがずれうる）
*/

const TOKYO = { baseLat: 35.6895, baseLon: 139.6917 };
const FUKUOKA = { baseLat: 33.5902, baseLon: 130.4017 };
/* 県の代表点は県庁所在地ではなく県の重心。東京駅から見て北海道は
   「北」ではなく北東（889.9km）で、真北に来るのは青森県（575.0km）。
   実物を引いて確かめてから書く。 */
const AOMORI = "青森県";
const OKINAWA = "沖縄県";
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TODAY = "2027-01-01";

function row(
  date: string,
  tiers: Record<string, string>,
  blocked = false,
): TimelineRow {
  const all: Record<string, string> = {};
  for (const d of DIRS) all[d] = "C";
  return {
    date,
    weekday: 1,
    rokuyo: "大安 (Taian)",
    tags: [],
    blocked,
    tiers: { ...all, ...tiers },
  };
}

function member(
  id: string,
  base: { baseLat: number; baseLon: number },
  days: TimelineRow[],
  extra: Partial<MemberTimeline> = {},
): MemberTimeline {
  return {
    id,
    name: id,
    stationary: false,
    weight: 1,
    ...base,
    days,
    ...extra,
  };
}

/** 全方位 C の平坦な 3 日。方位で差が出ないので並びの検証に使える。 */
const FLAT = ["2027-01-01", "2027-01-02", "2027-01-03"].map((d) => row(d, {}));

describe("destinationCandidates: 並び", () => {
  it("全員で動ける日数の多い順に並ぶ", () => {
    /* 東京から見て北（北海道）だけを S、南西（九州）を X にする。
       北が上、南西が下に来ることで並びが効いていると言える。 */
    const days = FLAT.map((d) => row(d.date, { N: "S", SW: "X" }));
    const got = destinationCandidates(
      [member("me", TOKYO, days)],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    expect(got.length).toBeGreaterThan(40);
    const north = got.findIndex((c) => c.name === AOMORI);
    const southwest = got.findIndex((c) => c.name === OKINAWA);
    expect(north).toBeLessThan(southwest);
    expect(got[north].allClearDays).toBe(3);
    expect(got[southwest].allClearDays).toBe(0);
    /* 並びは単調（前が後ろより少ないことはない） */
    for (let i = 1; i < got.length; i++) {
      expect(got[i - 1].allClearDays).toBeGreaterThanOrEqual(
        got[i].allClearDays,
      );
    }
  });

  it("日数が 0 の県も落とさずに返す", () => {
    const days = FLAT.map((d) =>
      row(d.date, {
        N: "X",
        NE: "X",
        E: "X",
        SE: "X",
        S: "X",
        SW: "X",
        W: "X",
        NW: "X",
      }),
    );
    const got = destinationCandidates(
      [member("me", TOKYO, days)],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    expect(got).toHaveLength(Object.keys(PREFECTURE_CENTERS).length);
    expect(got.every((c) => c.allClearDays === 0)).toBe(true);
  });

  it("今日より前は数えない", () => {
    const days = [
      row("2026-12-31", { N: "S" }),
      ...FLAT.map((d) => row(d.date, { N: "S" })),
    ];
    const got = destinationCandidates(
      [member("me", TOKYO, days)],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    const north = got.find((c) => c.name === AOMORI)!;
    expect(north.allClearDays).toBe(3);
    expect(north.nextAllClearDate).toBe("2027-01-01");
  });
});

describe("destinationCandidates: 人ごとの向き", () => {
  it("同じ合流先でも人によって方位が違う", () => {
    const got = destinationCandidates(
      [member("東京の人", TOKYO, FLAT), member("福岡の人", FUKUOKA, FLAT)],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    const north = got.find((c) => c.name === AOMORI)!;
    const byName = Object.fromEntries(north.legs.map((l) => [l.name, l]));
    expect(byName["東京の人"].direction).toBe("N");
    expect(byName["福岡の人"].direction).toBe("NE");
  });

  it("移動しない人は方位も距離も持たない", () => {
    const got = destinationCandidates(
      [
        member("動く", TOKYO, FLAT),
        member("留まる", FUKUOKA, FLAT, { stationary: true }),
      ],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    const leg = got[0].legs.find((l) => l.name === "留まる")!;
    expect(leg.direction).toBeNull();
    expect(leg.distanceKm).toBeNull();
    expect(leg.unstable).toBe(false);
  });

  it("近すぎる合流先は方位が定まらない印が付く", () => {
    /* 東京駅から見ると東京都の代表点でも 22.7km あって印は付かない。
       同じ県に住んでいる人で実際に起きる形にする（代表点の真上）。 */
    const center = PREFECTURE_CENTERS["東京都"];
    const got = destinationCandidates(
      [member("me", { baseLat: center.lat, baseLon: center.lon }, FLAT)],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    const tokyo = got.find((c) => c.name === "東京都")!;
    const leg = tokyo.legs[0];
    expect(leg.distanceKm).toBeLessThan(DIRECTION_UNSTABLE_KM);
    expect(leg.unstable).toBe(true);
    expect(tokyo.hasUnstableLeg).toBe(true);

    /* 遠い県には付かない（一律に付くなら印の意味が無い）。 */
    const far = got.find((c) => c.name === OKINAWA)!;
    expect(far.legs[0].unstable).toBe(false);
    expect(far.hasUnstableLeg).toBe(false);
  });

  it("移動する人がいなければ候補を出さない", () => {
    const got = destinationCandidates(
      [member("留まる", TOKYO, FLAT, { stationary: true })],
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    expect(got).toEqual([]);
  });
});

describe("destinationCandidates: 選んだときと同じ答えになる", () => {
  /*
    速さのために索引（日 → 行）を 1 回だけ作るようにした。合流先ごとに
    作り直す元の経路（jointTimeline）と答えがずれたら、候補の一覧と
    選んだあとの表示が食い違う。**同じ入力で突き合わせる。**
  */
  it("47 県すべてで jointTimeline + partyTimingReport と一致する", () => {
    const members = [
      member(
        "東京の人",
        TOKYO,
        FLAT.map((d) => row(d.date, { N: "S", SW: "X" })),
      ),
      member(
        "福岡の人",
        FUKUOKA,
        FLAT.map((d) => row(d.date, { NE: "A", N: "D" })),
      ),
    ];
    const got = destinationCandidates(
      members,
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    );
    expect(got.length).toBe(Object.keys(PREFECTURE_CENTERS).length);
    for (const candidate of got) {
      const center: Destination = PREFECTURE_CENTERS[candidate.name];
      const want = partyTimingReport(
        jointTimeline(members, center, "everyone"),
        TODAY,
      );
      expect(candidate.allClearDays, candidate.name).toBe(want.allClearDays);
      expect(candidate.nextAllClearDate, candidate.name).toBe(
        want.nextAllClearDate,
      );
      expect(candidate.bestScore, candidate.name).toBe(want.bestScore);
      expect(candidate.bestDate, candidate.name).toBe(want.bestDate);
    }
  });

  it("まとめ方を変えると答えも変わる（全員一致と平均）", () => {
    const members = [
      member(
        "東京の人",
        TOKYO,
        FLAT.map((d) => row(d.date, { N: "S" })),
      ),
      member(
        "福岡の人",
        FUKUOKA,
        FLAT.map((d) => row(d.date, { NE: "X" })),
      ),
    ];
    const strict = destinationCandidates(
      members,
      PREFECTURE_CENTERS,
      "everyone",
      TODAY,
    ).find((c) => c.name === "北海道")!;
    const average = destinationCandidates(
      members,
      PREFECTURE_CENTERS,
      "average",
      TODAY,
    ).find((c) => c.name === "北海道")!;
    /* 福岡の人が X なので全員一致では 0 日。平均は点で均すので上がる。 */
    expect(strict.allClearDays).toBe(0);
    expect(average.bestScore).toBeGreaterThan(strict.bestScore);
  });
});
