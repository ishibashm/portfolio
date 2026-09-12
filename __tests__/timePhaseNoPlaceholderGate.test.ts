import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateTimePhase, isVoidTimeHour } from "@/lib/timePhase";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { getZonedDateTimeFields } from "@/utils/solarTime";
import type { KimonScheduleItem } from "@/utils/solarTime";

/**
 * 時間帯の「動いてよい」（[ GO ] 推奨）から八門を外した件の固定。
 *
 * 変更前は lib/timePhase がこう書いていた。
 *
 *   const isGoodGate = item.hachimon.auspicious;   // 生・休・開・景
 *   return { isOptimal: isGoodGate && isFavorable, … };
 *
 * ところが八門を出していた `utils/kigaku` の `getHourlyHachimon` は計算
 * ではなく仮実装で、月の陰陽で起点を変えて刻の順に 8 つの門を回して
 * いるだけだった（ソースに "Placeholder Algorithm … Just returning a
 * cycle for visualization" とあった）。**日干を変えても門は変わらない。**
 * 奇門遁甲の盤は組んでいない。
 *
 * #724 の「月のボイドタイム」（土曜 14〜16 時を返すだけのモック）と
 * 同じ形。計算を装った表示は出さない方針に揃え、判定は五行の相生・
 * 相比だけにし（#1238）、表示（#1239）と実装そのものも消した。
 *
 * ここでは CLAUDE.md 3 節の手順どおり、
 *
 *   1. 旧実装（八門の表と回し方、門 && 五行）をこのファイルに写し、
 *   2. 新実装が門に依らないことを実際の 1 年ぶんの刻で固定し、
 *   3. **旧実装だと落ちる**ことを、同じ 1 年ぶんで示す
 *
 * の 3 つを置く。写した旧実装が「日干を見ていない」ことも固定しておく。
 */

/** 変更前の八門の表。**現行実装のどこにも無い。** */
const LEGACY_HACHIMON = [
  { japanese: "休門", auspicious: true },
  { japanese: "生門", auspicious: true },
  { japanese: "傷門", auspicious: false },
  { japanese: "杜門", auspicious: false },
  { japanese: "景門", auspicious: true },
  { japanese: "死門", auspicious: false },
  { japanese: "驚門", auspicious: false },
  { japanese: "開門", auspicious: true },
] as const;

/** 変更前の getHourlyHachimon。月（0〜11）と刻の番号だけで決まる。 */
function legacyHachimon(
  dayJikkanIndex: number,
  hourJunishiIndex: number,
  month: number,
) {
  void dayJikkanIndex; // 旧実装も受け取るだけで読んでいなかった
  const isYangDun = month >= 11 || month <= 5;
  const baseIndex = isYangDun ? 0 : 4;
  return LEGACY_HACHIMON[(baseIndex + hourJunishiIndex) % 8];
}

/** 変更前の isOptimal（門 && 五行）。五行の側は変えていない。 */
function legacyIsOptimal(
  item: KimonScheduleItem,
  hourIndex: number,
  month: number,
  honmei: { classical: number; physical: number },
): boolean {
  const favorable = evaluateTimePhase(item, honmei, true).isFavorable;
  return Boolean(legacyHachimon(0, hourIndex, month).auspicious && favorable);
}

const LON_TOKYO = 139.6917;
/** 古典 7（金）・物理 5（土）。timePhase.test.ts と同じ人。 */
const HONMEI = { classical: 7, physical: 5 };

/** 2026 年の全日 × 12 刻。刻の番号と、その日の月（0〜11）を添える。 */
function yearOfHours(): {
  item: KimonScheduleItem;
  i: number;
  month: number;
}[] {
  const out: { item: KimonScheduleItem; i: number; month: number }[] = [];
  for (let d = 0; d < 365; d++) {
    // 日本時間の正午。getDailySolarSchedule はその日の刻を 12 本返す。
    const day = new Date(Date.UTC(2026, 0, 1 + d, 12 - 9, 0, 0, 0));
    const month = getZonedDateTimeFields(day, 9).month - 1;
    getDailySolarSchedule(day, LON_TOKYO).forEach((item, i) =>
      out.push({ item, i, month }),
    );
  }
  return out;
}

describe("時間帯の「動いてよい」は八門を見ない", () => {
  const hours = yearOfHours();

  it("1 年ぶんの刻を読めている（空回りしていない）", () => {
    expect(hours.length).toBe(365 * 12);
  });

  it("刻の項目に八門が無い（型ごと消した）", () => {
    for (const { item } of hours.slice(0, 24)) {
      expect("hachimon" in item).toBe(false);
    }
  });

  it("旧実装は同じ 1 年で、門の名前によって「動いてよい」を落としていた", () => {
    let dropped = 0;
    let optimalNow = 0;
    for (const { item, i, month } of hours) {
      const now = evaluateTimePhase(item, HONMEI, true).isOptimal;
      const before = legacyIsOptimal(item, i, month, HONMEI);
      if (now) optimalNow++;
      if (now && !before) dropped++;
      // 旧実装が吉で新実装が凶、はあり得ない（門は落とす側にしか働かない）。
      expect(before && !now).toBe(false);
    }
    /*
      仮実装の門は 8 つのうち 4 つが吉なので、五行が相生・相比の刻の
      およそ半分が門で落とされていた。実測（2026 年の 4,380 刻・東京・
      古典 7）は、新実装で吉 2,921 刻、そのうち旧実装が落としていたのが
      1,499 刻（51.3%）。門は刻の番号で決まるので、ほぼ半分になる。
    */
    expect(optimalNow).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(optimalNow * 0.4);
    expect(dropped).toBeLessThan(optimalNow * 0.6);
  });

  it("写した旧実装は日干を見ていない（仮実装だった証拠）", () => {
    for (let month = 0; month < 12; month++) {
      for (let hour = 0; hour < 12; hour++) {
        const names = new Set<string>();
        for (let stem = 0; stem < 10; stem++) {
          names.add(legacyHachimon(stem, hour, month).japanese);
        }
        expect(names.size, `month=${month} hour=${hour}`).toBe(1);
      }
      // 刻を 1 つ進めると次の門へ。8 つを順に回しているだけ。
      const base = LEGACY_HACHIMON.findIndex(
        (g) => g.japanese === legacyHachimon(0, 0, month).japanese,
      );
      for (let hour = 0; hour < 12; hour++) {
        expect(legacyHachimon(0, hour, month).japanese).toBe(
          LEGACY_HACHIMON[(base + hour) % 8].japanese,
        );
      }
    }
  });

  it("天中殺の時間帯の判定はこの変更で動かない", () => {
    for (const { item } of hours.slice(0, 12)) {
      expect(isVoidTimeHour(item, ["午", "未"])).toBe(
        item.japanese === "午" || item.japanese === "未",
      );
    }
  });

  it("八門が判定・部品・実装に戻っていない", () => {
    const codeOf = (rel: string) =>
      readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    expect(codeOf("src/lib/timePhase.ts")).not.toMatch(/hachimon/i);
    expect(codeOf("src/utils/solarTime.ts")).not.toMatch(/hachimon/i);
    expect(codeOf("src/utils/kigaku.ts")).not.toMatch(
      /HACHIMON|getHourlyHachimon/,
    );
    expect(codeOf("src/components/SolarTimeTable.tsx")).not.toMatch(
      /hachimon/i,
    );
    expect(codeOf("src/components/home/HomePortal.tsx")).not.toMatch(
      /hachimon/i,
    );
    expect(codeOf("src/lib/timePhase.ts")).toMatch(/isOptimal:\s*isFavorable/);
  });
});
