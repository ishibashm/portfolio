import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateTimePhase, isVoidTimeHour } from "@/lib/timePhase";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { getHourlyHachimon, HACHIMON } from "@/utils/kigaku";
import type { KimonScheduleItem } from "@/utils/solarTime";

/**
 * 時間帯の「動いてよい」（[ GO ] 推奨）から八門を外した件の固定。
 *
 * 変更前は lib/timePhase がこう書いていた。
 *
 *   const isGoodGate = item.hachimon.auspicious;   // 生・休・開・景
 *   return { isOptimal: isGoodGate && isFavorable, … };
 *
 * ところが八門を出す `utils/kigaku` の `getHourlyHachimon` は計算では
 * なく仮実装で、月の陰陽で起点を変えて刻の順に 8 つの門を回している
 * だけ（ソースに "Placeholder Algorithm … Just returning a cycle for
 * visualization" とある）。**日干を変えても門は変わらない。**
 * 奇門遁甲の盤は組んでいない。
 *
 * #724 の「月のボイドタイム」（土曜 14〜16 時を返すだけのモック）と
 * 同じ形。計算を装った表示は出さない方針に揃え、判定は五行の相生・
 * 相比だけにした。ここでは CLAUDE.md 3 節の手順どおり、
 *
 *   1. 旧実装（門 && 五行）を legacyIsOptimal として写し、
 *   2. 新実装が門に依らないことを実際の 1 年ぶんの刻で固定し、
 *   3. **旧実装だと落ちる**ことを、同じ 1 年ぶんで示す
 *
 * の 3 つを置く。仮実装であること自体も固定しておく（日干を変えても
 * 門が変わらない）。ここが通らなくなったら、八門が本物の計算になった
 * ということなので、そのときは判定へ戻すかを改めて決める。
 */

/** 変更前。**現行実装のどこからも呼ばれていない。** */
function legacyIsOptimal(
  item: KimonScheduleItem,
  honmei: { classical: number; physical: number },
  useClassical: boolean,
): boolean {
  // 五行の側（isFavorable）は変えていない（timePhase.test.ts が固定）。
  const favorable = evaluateTimePhase(item, honmei, useClassical).isFavorable;
  return Boolean(item.hachimon.auspicious && favorable);
}

const LON_TOKYO = 139.6917;
/** 古典 7（金）・物理 5（土）。timePhase.test.ts と同じ人。 */
const HONMEI = { classical: 7, physical: 5 };

/** 2026 年の全日 × 12 刻。 */
function yearOfHours(): KimonScheduleItem[] {
  const out: KimonScheduleItem[] = [];
  for (let d = 0; d < 365; d++) {
    // 日本時間の正午。getDailySolarSchedule はその日の刻を 12 本返す。
    const day = new Date(Date.UTC(2026, 0, 1 + d, 12 - 9, 0, 0, 0));
    out.push(...getDailySolarSchedule(day, LON_TOKYO));
  }
  return out;
}

describe("時間帯の「動いてよい」は八門を見ない", () => {
  const hours = yearOfHours();

  it("1 年ぶんの刻を読めている（空回りしていない）", () => {
    expect(hours.length).toBe(365 * 12);
  });

  it("新実装は、門の吉凶を入れ替えても答えが変わらない", () => {
    for (const item of hours) {
      const a = evaluateTimePhase(item, HONMEI, true).isOptimal;
      const flipped: KimonScheduleItem = {
        ...item,
        hachimon: { ...item.hachimon, auspicious: !item.hachimon.auspicious },
      };
      const b = evaluateTimePhase(flipped, HONMEI, true).isOptimal;
      expect(b).toBe(a);
    }
  });

  it("旧実装は同じ 1 年で、門の名前によって「動いてよい」を落としていた", () => {
    let dropped = 0;
    let optimalNow = 0;
    for (const item of hours) {
      const now = evaluateTimePhase(item, HONMEI, true).isOptimal;
      const before = legacyIsOptimal(item, HONMEI, true);
      if (now) optimalNow++;
      if (now && !before) dropped++;
      // 旧実装が吉と言って新実装が吉と言わない、はあり得ない（門は
      // 落とす側にしか働かなかった）。
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

  it("八門は仮実装（日干を変えても門が変わらない。刻の番号で回っているだけ）", () => {
    for (let month = 0; month < 12; month++) {
      for (let hour = 0; hour < 12; hour++) {
        const names = new Set<string>();
        for (let stem = 0; stem < 10; stem++) {
          names.add(getHourlyHachimon(stem, hour, month).japanese);
        }
        // 10 通りの日干で門が 1 つしか出ない＝日干を見ていない。
        expect(names.size, `month=${month} hour=${hour}`).toBe(1);
      }
      // 刻を 1 つ進めると次の門へ。8 つを順に回しているだけ。
      const base = HACHIMON.findIndex(
        (g) => g.japanese === getHourlyHachimon(0, 0, month).japanese,
      );
      for (let hour = 0; hour < 12; hour++) {
        expect(getHourlyHachimon(0, hour, month).japanese).toBe(
          HACHIMON[(base + hour) % 8].japanese,
        );
      }
    }
  });

  it("天中殺の時間帯の判定はこの変更で動かない", () => {
    // 門を外したのは「動いてよい」の側だけ。天中殺は別の関数で、
    // 生年月日の空亡だけを見る。
    const sample = hours.slice(0, 12);
    for (const item of sample) {
      expect(isVoidTimeHour(item, ["午", "未"])).toBe(
        item.japanese === "午" || item.japanese === "未",
      );
    }
  });

  it("lib/timePhase が八門を判定に戻していない", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/timePhase.ts"),
      "utf8",
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 説明文（getGateDescription）は読み手を外すまで残る。判定の側だけ見る。
    expect(code).not.toMatch(/hachimon\.auspicious/);
    expect(code).not.toMatch(/isGoodGate/);
    expect(code).toMatch(/isOptimal:\s*isFavorable/);
  });
});
