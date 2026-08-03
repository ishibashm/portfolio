import { describe, it, expect } from "vitest";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
  evaluateTenchusatsu,
  getTenchusatsuMode,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import { getRokuyo } from "@/utils/lunar";

const scopes = (year: boolean, month: boolean, day: boolean) => ({
  year,
  month,
  day,
});

describe("evaluateTenchusatsu", () => {
  it("既定は従来どおり年・月・日のいずれでも移転不可にする", () => {
    expect(DEFAULT_TENCHUSATSU_MODE).toBe("strict");
    expect(evaluateTenchusatsu(scopes(true, false, false), "strict").blocks).toBe(
      true,
    );
    expect(evaluateTenchusatsu(scopes(false, true, false), "strict").blocks).toBe(
      true,
    );
    expect(evaluateTenchusatsu(scopes(false, false, true), "strict").blocks).toBe(
      true,
    );
    expect(
      evaluateTenchusatsu(scopes(false, false, false), "strict").blocks,
    ).toBe(false);
  });

  it("年天中殺を除く設定では、年だけの空亡を通す", () => {
    // 年天中殺は 2 年続くため、strict のままだとその間どこへも動けない。
    expect(
      evaluateTenchusatsu(scopes(true, false, false), "month_day").blocks,
    ).toBe(false);
    expect(
      evaluateTenchusatsu(scopes(true, true, false), "month_day").blocks,
    ).toBe(true);
    expect(
      evaluateTenchusatsu(scopes(true, false, true), "month_day").blocks,
    ).toBe(true);
  });

  it("日のみの設定では日の空亡だけを見る", () => {
    expect(
      evaluateTenchusatsu(scopes(true, true, false), "day_only").blocks,
    ).toBe(false);
    expect(
      evaluateTenchusatsu(scopes(false, false, true), "day_only").blocks,
    ).toBe(true);
  });

  it("弱める設定では禁止せず、吉凶を中央へ寄せる倍率を返す", () => {
    const v = evaluateTenchusatsu(scopes(true, true, true), "weaken");
    expect(v.blocks).toBe(false);
    expect(v.attenuation).toBeLessThan(1);
    expect(v.attenuation).toBeGreaterThan(0);
  });

  it("弱める設定でも、空亡でなければ弱めない", () => {
    const v = evaluateTenchusatsu(scopes(false, false, false), "weaken");
    expect(v.attenuation).toBe(1);
  });

  it("使わない設定では禁止も減衰もしない", () => {
    const v = evaluateTenchusatsu(scopes(true, true, true), "off");
    expect(v.blocks).toBe(false);
    expect(v.attenuation).toBe(1);
    // 事実としての空亡は失わない
    expect(v.inVoidPeriod).toBe(true);
  });

  it("やむを得ない移動なら、禁止則のモードでも通す（弱めるだけ）", () => {
    // 多くの流派が自発的な移動と他動的な移動を区別し、
    // 転勤などの他動的な移動は天中殺の影響を受けないとする。
    const forced = evaluateTenchusatsu(scopes(true, true, true), "strict", true);
    expect(forced.blocks).toBe(false);
    expect(forced.attenuation).toBeLessThan(1);
    expect(forced.note).toContain("やむを得ない");
  });

  it("やむを得ない移動でも、そもそも空亡でなければ弱めない", () => {
    const v = evaluateTenchusatsu(scopes(false, false, false), "strict", true);
    expect(v.blocks).toBe(false);
    expect(v.attenuation).toBe(1);
  });

  it("どの範囲の空亡に当たっているかを返す（理由の説明に使う）", () => {
    const v = evaluateTenchusatsu(scopes(true, false, true), "strict");
    expect(v.activeScopes).toEqual(["year", "day"]);
    expect(v.inVoidPeriod).toBe(true);
  });

  it("空亡でない日は範囲が空になる", () => {
    const v = evaluateTenchusatsu(scopes(false, false, false), "strict");
    expect(v.activeScopes).toEqual([]);
    expect(v.inVoidPeriod).toBe(false);
  });
});

describe("モード定義", () => {
  it("id が重複せず、説明と根拠を持つ", () => {
    const ids = TENCHUSATSU_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of TENCHUSATSU_MODES) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.rationale.length).toBeGreaterThan(0);
    }
  });

  it("未知の id は既定に落ちる", () => {
    expect(getTenchusatsuMode("no-such-mode").id).toBe("strict");
    expect(isTenchusatsuMode("strict")).toBe(true);
    expect(isTenchusatsuMode("whatever")).toBe(false);
  });
});

describe("getRokuyo（閏月）", () => {
  it("閏月でも六曜を返す（負の月番号で undefined にならない）", () => {
    // lunar-javascript は閏月を負の月番号で返す。素通しすると剰余が負になり
    // ROKUYO[-3] が undefined になって、呼び出し側の .includes が例外になる。
    const leapDays = [
      new Date(2025, 6, 25, 12), // 2025 閏6月1日
      new Date(2025, 6, 26, 12),
      new Date(2025, 6, 29, 12),
      new Date(2028, 5, 23, 12), // 2028 閏5月1日
      new Date(2028, 5, 26, 12),
    ];
    for (const d of leapDays) {
      const r = getRokuyo(d);
      expect(typeof r).toBe("string");
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it("通常月の六曜は 2024〜2030 年の全日で必ず取れる", () => {
    for (let y = 2024; y <= 2030; y++) {
      for (let m = 0; m < 12; m++) {
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const r = getRokuyo(new Date(y, m, d, 12));
          expect(typeof r, `${y}-${m + 1}-${d}`).toBe("string");
        }
      }
    }
  });
});
