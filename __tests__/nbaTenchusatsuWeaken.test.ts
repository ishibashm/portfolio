import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  TENCHUSATSU_WEAK_NOTE,
  attenuateTowardNeutral,
  summarizeTenchusatsu,
  tenchusatsuModeFrom,
  voidScopesOf,
} from "@/utils/tenchusatsuPolicy";
import { POST as nbaEvaluate } from "@/app/api/relocation/nba-evaluate/route";

/**
 * NBA 系（/api/nba・/api/relocation/nba-evaluate）でも天中殺は
 * **禁止しない・弱める**（2026-11-02 本人決定）。止めるのは strict などを
 * 明示したときだけ。
 */
describe("NBA 向けの天中殺の要約", () => {
  const inVoid = { year: false, month: false, day: true };

  it("既定（weaken）は止めず、弱めて注記を付ける", () => {
    const s = summarizeTenchusatsu(inVoid, tenchusatsuModeFrom(undefined));
    expect(s.mode).toBe("weaken");
    expect(s.blocksMove).toBe(false);
    expect(s.inVoidPeriod).toBe(true);
    expect(s.attenuation).toBe(0.6);
    expect(s.note).toBe(TENCHUSATSU_WEAK_NOTE);
  });

  it("strict を明示したときだけ止める", () => {
    const s = summarizeTenchusatsu(inVoid, tenchusatsuModeFrom("strict"));
    expect(s.blocksMove).toBe(true);
    expect(s.attenuation).toBe(1);
  });

  it("不正な値は既定に落ちる", () => {
    expect(tenchusatsuModeFrom("nope")).toBe("weaken");
    expect(tenchusatsuModeFrom(3)).toBe("weaken");
  });

  it("空亡に当たらない日は何もしない", () => {
    const s = summarizeTenchusatsu(
      { year: false, month: false, day: false },
      "weaken",
    );
    expect(s).toMatchObject({ blocksMove: false, attenuation: 1, note: "" });
  });

  it("voidScopesOf は年・月・日の支を見る", () => {
    expect(
      voidScopesOf(["午", "未"], {
        yearZodiac: "午",
        monthZodiac: "子",
        dayZodiac: "未",
      }),
    ).toEqual({ year: true, month: false, day: true });
  });

  it("弱める倍率で 50 へ寄せる", () => {
    expect(attenuateTowardNeutral(100, 0.6)).toBe(80);
    expect(attenuateTowardNeutral(0, 0.6)).toBe(20);
    expect(attenuateTowardNeutral(70, 1)).toBe(70);
  });
});

async function evaluate(body: Record<string, unknown>) {
  const res = await nbaEvaluate(
    new Request("http://localhost/api/relocation/nba-evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as {
    success: boolean;
    data: {
      date: string;
      isVoidTime: boolean;
      envCost: number;
      riskFactors: string[];
      tenchusatsu: { inVoidPeriod: boolean; blocksMove: boolean; note: string };
    }[];
  };
}

describe("/api/relocation/nba-evaluate は天中殺で止めない", () => {
  // 12 日あれば日の空亡（2 支）に必ず当たる。
  const dates = Array.from(
    { length: 12 },
    (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}T12:00:00`,
  );
  const birthDate = "1990-05-15";

  it("既定では isVoidTime=false・注記付き、strict では止める", async () => {
    const weak = await evaluate({ birthDate, dates });
    const strict = await evaluate({
      birthDate,
      dates,
      tenchusatsuMode: "strict",
    });
    expect(weak.success).toBe(true);
    const voidDays = weak.data.filter((d) => d.tenchusatsu.inVoidPeriod);
    expect(voidDays.length).toBeGreaterThan(0);
    for (const d of voidDays) {
      expect(d.isVoidTime).toBe(false);
      expect(d.tenchusatsu.blocksMove).toBe(false);
      expect(d.tenchusatsu.note).toBe(TENCHUSATSU_WEAK_NOTE);
      expect(d.riskFactors).not.toContain("天中殺（空亡）");
    }
    for (const d of strict.data.filter((x) => x.tenchusatsu.inVoidPeriod)) {
      expect(d.isVoidTime).toBe(true);
      expect(d.riskFactors).toContain("天中殺（空亡）");
    }
    for (const d of weak.data.filter((x) => !x.tenchusatsu.inVoidPeriod)) {
      expect(d.isVoidTime).toBe(false);
    }
  }, 60_000);
});

describe("/api/nba も同じ方針で配線している", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/nba/route.ts"),
    "utf8",
  );
  it("空亡の当たり外れを直接 isVoidTime にしない", () => {
    expect(src).toContain("summarizeTenchusatsu(");
    expect(src).toContain("tenchusatsuModeFrom(clientBody.tenchusatsuMode)");
    expect(src).not.toMatch(/const isVoidTime =\s*\n\s*voidZodiacArray/);
  });
});
