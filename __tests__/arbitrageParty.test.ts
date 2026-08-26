import { describe, it, expect } from "vitest";
import {
  DEFAULT_PARTY_POLICY,
  type JointOutcome,
  MemberOutcome,
  combineOutcomes,
  isPartyPolicy,
  normalizeParty,
  parsePartyParam,
  partyWeights,
  summarizeTiming,
} from "@/utils/arbitrageParty";

function outcome(o: Partial<MemberOutcome> & { name: string }): MemberOutcome {
  return {
    memberId: o.name,
    direction: "N",
    magneticDirection: "N",
    distanceKm: 10,
    score: 50,
    status: "SAFE",
    isAvoid: false,
    maxFactor: "吉方位",
    ...o,
  };
}

describe("combineOutcomes", () => {
  it("全員一致では最も低い人に合わせる", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", score: 90 }),
        outcome({ name: "母", score: 40 }),
      ],
      "everyone",
    );
    expect(joint.score).toBe(40);
  });

  it("平均では全員を等しく扱う", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", score: 90 }),
        outcome({ name: "母", score: 40 }),
      ],
      "average",
    );
    expect(joint.score).toBe(65);
  });

  it("重み付きでは比重の大きい人に寄る", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", memberId: "a", score: 90 }),
        outcome({ name: "母", memberId: "b", score: 40 }),
      ],
      "weighted",
      { a: 3, b: 1 },
    );
    expect(joint.score).toBeCloseTo(77.5);
  });

  it("重みが全て 0 なら最低点に倒す（重みの情報が無いのと同じ扱い）", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", memberId: "a", score: 90 }),
        outcome({ name: "母", memberId: "b", score: 40 }),
      ],
      "weighted",
      { a: 0, b: 0 },
    );
    expect(joint.score).toBe(40);
  });

  it("誰か 1 人でも避けるべきなら everyoneSafe が false になり、名前が出る", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", score: 90 }),
        outcome({ name: "母", score: 10, status: "NOISE_GOU", isAvoid: true }),
      ],
      "average",
    );
    expect(joint.everyoneSafe).toBe(false);
    expect(joint.blockedBy).toEqual(["母"]);
  });

  it("平均で点が高くても、避けるべき人がいれば通らないと分かる", () => {
    // 平均だけ見ると 50 点で「普通」に見えるが、母は五黄殺で移転不可。
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", score: 100 }),
        outcome({ name: "母", score: 10, status: "NOISE_GOU", isAvoid: true }),
      ],
      "average",
    );
    expect(joint.score).toBeCloseTo(55);
    expect(joint.everyoneSafe).toBe(false);
    expect(joint.bindingMember?.name).toBe("母");
  });

  it("利害が割れているほど一致度が下がる", () => {
    const aligned = combineOutcomes(
      [outcome({ name: "A", score: 70 }), outcome({ name: "B", score: 70 })],
      "average",
    );
    const split = combineOutcomes(
      [outcome({ name: "A", score: 100 }), outcome({ name: "B", score: 40 })],
      "average",
    );
    expect(aligned.harmony).toBe(100);
    expect(split.harmony).toBe(40);
    expect(split.spread).toBe(60);
  });

  it("移動する人が 1 人だけなら一致度は算出しない", () => {
    const joint = combineOutcomes([outcome({ name: "あなた" })], "everyone");
    expect(joint.harmony).toBeNull();
  });

  it("移動しない人（現地在住）は方位判定から外す", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "あなた", score: 80 }),
        outcome({ name: "祖母", score: 0, direction: null }),
      ],
      "everyone",
    );
    // 祖母は動かないので 0 点に引きずられない
    expect(joint.score).toBe(80);
    expect(joint.harmony).toBeNull();
    // 一覧には残る
    expect(joint.members).toHaveLength(2);
  });

  it("誰も移動しないなら判定が成立しない", () => {
    const joint = combineOutcomes(
      [outcome({ name: "祖母", direction: null })],
      "everyone",
    );
    expect(joint.score).toBe(0);
    expect(joint.everyoneSafe).toBe(false);
    expect(joint.bindingMember).toBeNull();
  });

  it("足を引っ張っている人は、点が最低の人ではなく移転不可の人を優先する", () => {
    const joint = combineOutcomes(
      [
        outcome({ name: "低いが可", score: 20 }),
        outcome({ name: "不可", score: 30, status: "NOISE_TENCHU", isAvoid: true }),
      ],
      "average",
    );
    expect(joint.bindingMember?.name).toBe("不可");
  });
});

describe("normalizeParty", () => {
  const valid = {
    id: "m1",
    name: "母",
    birthDate: "1960-04-01T10:00",
    birthLat: 34.4,
    birthLon: 132.4,
    baseLat: 35.1,
    baseLon: 136.9,
  };

  it("最低限の項目がそろっていれば通す", () => {
    const [m] = normalizeParty([valid]);
    expect(m.id).toBe("m1");
    expect(m.name).toBe("母");
    expect(m.weight).toBe(1);
    expect(m.stationary).toBe(false);
  });

  it("出発地が無い人は落とす（方位が決まらないため）", () => {
    expect(normalizeParty([{ ...valid, baseLat: "x", baseLon: "y" }])).toHaveLength(
      0,
    );
  });

  it("出発地が null / 空文字の人を赤道上(0,0)に置かない", () => {
    // Number(null) は 0 になる。素通しすると、座標を持たない同行者が
    // ギニア湾から動く人として判定され、方位も距離も別物になる。
    expect(normalizeParty([{ ...valid, baseLat: null, baseLon: null }])).toHaveLength(0);
    expect(normalizeParty([{ ...valid, baseLat: "", baseLon: "" }])).toHaveLength(0);
    expect(
      normalizeParty([{ ...valid, baseLat: undefined, baseLon: undefined }]),
    ).toHaveLength(0);
    expect(normalizeParty([{ ...valid, baseLat: true, baseLon: true }])).toHaveLength(0);
  });

  it("数値文字列の座標は受け入れる（フォーム入力がそのまま来るため）", () => {
    const [m] = normalizeParty([{ ...valid, baseLat: "35.1", baseLon: "136.9" }]);
    expect(m.baseLat).toBeCloseTo(35.1);
    expect(m.baseLon).toBeCloseTo(136.9);
  });

  it("移動しない人は出発地が無くても通す", () => {
    const members = normalizeParty([
      { ...valid, baseLat: null, baseLon: null, stationary: true },
    ]);
    expect(members).toHaveLength(1);
    expect(members[0].stationary).toBe(true);
  });

  it("生年月日が無い人は落とす", () => {
    expect(normalizeParty([{ ...valid, birthDate: "" }])).toHaveLength(0);
  });

  it("id の重複は先勝ちで 1 人だけ残す", () => {
    const members = normalizeParty([valid, { ...valid, name: "別人" }]);
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("母");
  });

  it("出生地が無くても通す（方位だけで判定する）", () => {
    const [m] = normalizeParty([{ ...valid, birthLat: null, birthLon: null }]);
    expect(m.birthLat).toBeNull();
  });

  it("重みは 0 より大きい値に丸める", () => {
    expect(normalizeParty([{ ...valid, weight: -5 }])[0].weight).toBe(1);
    expect(normalizeParty([{ ...valid, weight: 999 }])[0].weight).toBe(10);
    expect(normalizeParty([{ ...valid, weight: 2.5 }])[0].weight).toBe(2.5);
  });

  it("名前が長すぎる場合は切り詰める", () => {
    const [m] = normalizeParty([{ ...valid, name: "あ".repeat(200) }]);
    expect(m.name.length).toBe(40);
  });

  it("配列でなければ空", () => {
    expect(normalizeParty(null)).toEqual([]);
    expect(normalizeParty({ id: "x" })).toEqual([]);
  });
});

describe("parsePartyParam", () => {
  it("JSON を読む", () => {
    const raw = JSON.stringify([
      {
        id: "m1",
        name: "父",
        birthDate: "1958-01-01T00:00",
        baseLat: 35,
        baseLon: 135,
      },
    ]);
    expect(parsePartyParam(raw)).toHaveLength(1);
  });

  it("壊れた JSON でも例外にせず空を返す", () => {
    expect(parsePartyParam("{not json")).toEqual([]);
    expect(parsePartyParam(null)).toEqual([]);
    expect(parsePartyParam("")).toEqual([]);
  });
});

describe("partyWeights", () => {
  it("id 引きの表にする", () => {
    const members = normalizeParty([
      {
        id: "a",
        name: "A",
        birthDate: "1990-01-01",
        baseLat: 35,
        baseLon: 135,
        weight: 3,
      },
    ]);
    expect(partyWeights(members)).toEqual({ a: 3 });
  });
});

describe("summarizeTiming", () => {
  const joint = (score: number, everyoneSafe: boolean) => ({
    score,
    policy: DEFAULT_PARTY_POLICY,
    everyoneSafe,
    blockedBy: [] as string[],
    spread: 0,
    harmony: null,
    bindingMember: null,
    members: [],
  });

  it("直近で全員が動ける日を返す", () => {
    const summary = summarizeTiming([
      { date: "2026-08-02", joint: joint(20, false) },
      { date: "2026-08-03", joint: joint(30, false) },
      { date: "2026-08-04", joint: joint(70, true) },
      { date: "2026-08-05", joint: joint(90, true) },
    ]);
    expect(summary.nextAllClearDate).toBe("2026-08-04");
    expect(summary.allClearDays).toBe(2);
    expect(summary.scannedDays).toBe(4);
  });

  it("最も点数が高い日を返す", () => {
    const summary = summarizeTiming([
      { date: "2026-08-02", joint: joint(20, false) },
      { date: "2026-08-03", joint: joint(90, true) },
      { date: "2026-08-04", joint: joint(70, true) },
    ]);
    expect(summary.bestDate).toBe("2026-08-03");
    expect(summary.bestScore).toBe(90);
  });

  it("1 日も開かない場合は null を返す（0 日目扱いにしない）", () => {
    const summary = summarizeTiming([
      { date: "2026-08-02", joint: joint(20, false) },
      { date: "2026-08-03", joint: joint(30, false) },
    ]);
    expect(summary.nextAllClearDate).toBeNull();
    expect(summary.allClearDays).toBe(0);
  });

  it("空の走査結果でも壊れない", () => {
    const summary = summarizeTiming([]);
    expect(summary.scannedDays).toBe(0);
    expect(summary.bestScore).toBe(0);
    expect(summary.nextAllClearDate).toBeNull();
    expect(summary.alwaysBlockedBy).toEqual([]);
  });

  describe("全期間が塞がっている理由", () => {
    /* 戻りを実物の JointOutcome で注釈する。推論に任せると members が
       「direction: string」に狭まり、移動しない人（null）を足すのに
       as any が要るように見えてしまう（実際に 3 つ紛れ込んでいた）。 */
    const blockedJoint = (
      memberStates: { name: string; isAvoid: boolean; status: string }[],
    ): JointOutcome => ({
      score: 0,
      policy: DEFAULT_PARTY_POLICY,
      everyoneSafe: memberStates.every((m) => !m.isAvoid),
      blockedBy: memberStates.filter((m) => m.isAvoid).map((m) => m.name),
      spread: 0,
      harmony: null,
      bindingMember: null,
      members: memberStates.map((m) => ({
        memberId: m.name,
        name: m.name,
        direction: "N",
        magneticDirection: "N",
        distanceKm: 10,
        score: 0,
        status: m.status,
        isAvoid: m.isAvoid,
        maxFactor: m.status,
      })),
    });

    it("走査した全日で塞がっている人と主な理由を返す", () => {
      // 天中殺は年単位で成立することがあり、その年の人はどこへも動けない。
      // 「0日」だけでは期間を延ばせば済むのか年を変えるしかないのかが分からない。
      const summary = summarizeTiming([
        {
          date: "2026-08-02",
          joint: blockedJoint([{ name: "母", isAvoid: true, status: "NOISE_TENCHU" }]),
        },
        {
          date: "2026-08-03",
          joint: blockedJoint([{ name: "母", isAvoid: true, status: "NOISE_TENCHU" }]),
        },
      ]);
      expect(summary.allClearDays).toBe(0);
      expect(summary.alwaysBlockedBy).toEqual([
        { name: "母", status: "NOISE_TENCHU" },
      ]);
    });

    it("一部の日だけ塞がっている人は挙げない（期間を延ばせば動ける）", () => {
      const summary = summarizeTiming([
        {
          date: "2026-08-02",
          joint: blockedJoint([{ name: "母", isAvoid: true, status: "NOISE_GOU" }]),
        },
        {
          date: "2026-08-03",
          joint: blockedJoint([{ name: "母", isAvoid: false, status: "SAFE" }]),
        },
      ]);
      expect(summary.allClearDays).toBe(1);
      expect(summary.alwaysBlockedBy).toEqual([]);
    });

    it("理由が複数ある場合は最も多いものを採る", () => {
      const summary = summarizeTiming([
        {
          date: "d1",
          joint: blockedJoint([{ name: "父", isAvoid: true, status: "NOISE_VOID" }]),
        },
        {
          date: "d2",
          joint: blockedJoint([{ name: "父", isAvoid: true, status: "NOISE_TENCHU" }]),
        },
        {
          date: "d3",
          joint: blockedJoint([{ name: "父", isAvoid: true, status: "NOISE_TENCHU" }]),
        },
      ]);
      expect(summary.alwaysBlockedBy).toEqual([
        { name: "父", status: "NOISE_TENCHU" },
      ]);
    });

    it("移動しない人は塞いでいる扱いにしない", () => {
      const joint = blockedJoint([
        { name: "あなた", isAvoid: false, status: "SAFE" },
      ]);
      joint.members.push({
        memberId: "祖母",
        name: "祖母",
        /* MemberOutcome は「移動しない人は null」を型で許している。
           以前の as any は要らない cast だった。 */
        direction: null,
        magneticDirection: null,
        distanceKm: null,
        score: 0,
        status: "UNKNOWN",
        isAvoid: true,
        maxFactor: "UNKNOWN",
      });
      const summary = summarizeTiming([{ date: "d1", joint }]);
      expect(summary.alwaysBlockedBy).toEqual([]);
    });
  });
});

describe("isPartyPolicy", () => {
  it("既知のまとめ方だけ通す", () => {
    expect(isPartyPolicy("everyone")).toBe(true);
    expect(isPartyPolicy("weighted")).toBe(true);
    expect(isPartyPolicy("whatever")).toBe(false);
  });
});
