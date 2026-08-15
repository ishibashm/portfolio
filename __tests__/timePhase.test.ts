import { describe, expect, it } from "vitest";
import {
  evaluateTimePhase,
  getElementInfo,
  getGateDescription,
  isVoidTimeHour,
} from "@/lib/timePhase";
import type { KimonScheduleItem } from "@/utils/solarTime";

/**
 * 時間帯の吉凶判定を、SolarTimeTable から lib/timePhase へ移したときの
 * 固定。ホームのポータルが同じ判定を出すため集約した（同じことを
 * 2 か所に書かない）。**移しただけで中身は変えていない**ことを、
 * 移す前の実装の答えで押さえる。
 *
 * ここが崩れると、詳細画面の緑帯（[GO] 推奨）とポータルの要点が
 * 食い違う。利用者からは「同じ時間なのに画面によって言うことが違う」
 * としか見えないので、静かにずれないよう固定しておく。
 */

function hour(
  japanese: string,
  gate: { japanese: string; auspicious: boolean },
  star: number,
): KimonScheduleItem {
  return {
    japanese,
    hachimon: gate,
    kyusei: { number: star, japanese: `${star}星` },
  } as unknown as KimonScheduleItem;
}

const GOOD_GATE = { japanese: "開門", auspicious: true };
const BAD_GATE = { japanese: "死門", auspicious: false };

describe("天中殺の時間帯", () => {
  it("生年月日から出た空亡の十二支に当たれば true", () => {
    expect(isVoidTimeHour(hour("辰", GOOD_GATE, 1), ["辰", "巳"])).toBe(true);
    expect(isVoidTimeHour(hour("巳", GOOD_GATE, 1), ["辰", "巳"])).toBe(true);
    expect(isVoidTimeHour(hour("子", GOOD_GATE, 1), ["辰", "巳"])).toBe(false);
  });

  it("空亡が出せないときは午・未を既定にする（元の実装のまま）", () => {
    expect(isVoidTimeHour(hour("午", GOOD_GATE, 1))).toBe(true);
    expect(isVoidTimeHour(hour("未", GOOD_GATE, 1))).toBe(true);
    expect(isVoidTimeHour(hour("子", GOOD_GATE, 1))).toBe(false);
    // 空配列も「出せない」と同じ扱い
    expect(isVoidTimeHour(hour("午", GOOD_GATE, 1), [])).toBe(true);
  });
});

describe("五行の属性", () => {
  it("九星の番号から属性を引く", () => {
    expect(getElementInfo(1).id).toBe("Water");
    expect(getElementInfo(2).id).toBe("Earth");
    expect(getElementInfo(3).id).toBe("Wood");
    expect(getElementInfo(4).id).toBe("Wood");
    expect(getElementInfo(5).id).toBe("Earth");
    expect(getElementInfo(6).id).toBe("Metal");
    expect(getElementInfo(7).id).toBe("Metal");
    expect(getElementInfo(8).id).toBe("Earth");
    expect(getElementInfo(9).id).toBe("Fire");
  });
});

describe("時間帯の吉凶", () => {
  const honmei = { classical: 7, physical: 5 };

  it("本命星が出ていなければ吉にしない", () => {
    expect(
      evaluateTimePhase(hour("子", GOOD_GATE, 1), null, true).isOptimal,
    ).toBe(false);
  });

  it("吉門でも五行が相剋なら吉にしない", () => {
    // 古典 7（金）に対して 9（火）は火剋金
    const r = evaluateTimePhase(hour("子", GOOD_GATE, 9), honmei, true);
    expect(r.isGoodGate).toBe(true);
    expect(r.isFavorable).toBe(false);
    expect(r.isOptimal).toBe(false);
  });

  it("五行が相生でも凶門なら吉にしない", () => {
    // 古典 7（金）に対して 8（土）は土生金
    const r = evaluateTimePhase(hour("子", BAD_GATE, 8), honmei, true);
    expect(r.isFavorable).toBe(true);
    expect(r.isGoodGate).toBe(false);
    expect(r.isOptimal).toBe(false);
  });

  it("吉門かつ相生なら吉にする", () => {
    const r = evaluateTimePhase(hour("子", GOOD_GATE, 8), honmei, true);
    expect(r.isOptimal).toBe(true);
    expect(r.relation).toContain("土生金");
  });

  it("同じ属性は相比として吉にする", () => {
    // 古典 7（金）に対して 6（金）
    const r = evaluateTimePhase(hour("子", GOOD_GATE, 6), honmei, true);
    expect(r.relation).toContain("相比");
    expect(r.isOptimal).toBe(true);
  });

  it("古典と物理で本命星が違えば答えも変わる", () => {
    // 古典 7（金）／物理 5（土）。時間帯 8（土）は
    // 古典なら土生金で吉、物理なら相比で吉。9（火）で差を見る。
    const classical = evaluateTimePhase(hour("子", GOOD_GATE, 9), honmei, true);
    const physical = evaluateTimePhase(hour("子", GOOD_GATE, 9), honmei, false);
    // 7（金）に火は相剋、5（土）に火は火生土で相生
    expect(classical.isOptimal).toBe(false);
    expect(physical.isOptimal).toBe(true);
  });
});

describe("八門の説明", () => {
  it("門の名前から意味を引く", () => {
    expect(getGateDescription("生門")).toContain("新しい開始");
    expect(getGateDescription("開門")).toContain("開拓");
    expect(getGateDescription("死門")).toContain("停止");
    expect(getGateDescription("未知門")).toBe("通常 (Normal)");
  });
});
