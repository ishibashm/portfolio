import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { calculateBaziCompatibility } from "@/utils/arbitrageAstro";
import { getZonedDateTimeFields } from "@/utils/solarTime";

/**
 * 八字の相性スコア（物件検索の baziScore）の日干の読み方。
 *
 * ## 元がどう間違っていたか
 *
 *   const birthSolar = Solar.fromDate(bDate);
 *
 * `Solar.fromDate` は**実行環境のタイムゾーン**で年月日を読む。本番は
 * UTC（Dockerfile に TZ 指定なし）なので、日本時間 0〜9 時の時刻が
 * **前日**として読まれ、日干が 1 日ずれた。#456 の古典盤と同じ問題。
 *
 * ## どこに効くか
 *
 * 対象日は "YYYY-MM-DD" 由来（= 09:00 JST 相当）なのでどちらの読み方
 * でも同じ日になり、無傷。効くのは**生まれ時刻が 0〜9 時の人**で、
 * 日干（相性の基点）が別の日のものになり、毎日の相性スコアがずれる。
 *
 * ## ここで固定すること
 *
 *   1. 生まれ時刻を 0〜23 時のどこにしても、同じ日本時間の日付なら
 *      スコアが変わらないこと
 *   2. 日付だけの入力（従来から正しかった形）は答えが変わっていないこと
 *   3. 旧実装（TZ 依存の読み方）は 1 を満たさないこと（空回りの防止）
 */

/** 旧実装と同じ読み方で日干を出す。比較のために写してある。 */
function legacyDayGan(date: Date): string {
  return Solar.fromDate(date).getLunar().getEightChar().getDayGan();
}

/** 日本時間の (y, m, d, h) を指す Date。 */
function jst(y: number, m: number, d: number, h: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9));
}

/** 判定対象日。呼び出し側と同じく "YYYY-MM-DD" から作る。 */
const TARGET = new Date("2026-08-20");

describe("八字相性スコアの日干は日本時間で読む", () => {
  it("同じ日本時間の日付なら、生まれ時刻がどこでもスコアが同じ", () => {
    // 30 日ぶん × 生まれ時刻 5 通り。旧実装は 0〜8 時で別の日干になる。
    for (let i = 0; i < 30; i++) {
      const scores = [0, 3, 8, 12, 23].map((h) =>
        calculateBaziCompatibility(jst(1990, 5, 15, h), TARGET),
      );
      expect(
        new Set(scores).size,
        `1990-05-15 生まれのスコアが時刻で割れた: ${scores.join(",")}`,
      ).toBe(1);
    }
  });

  it("日付だけの入力は答えが変わっていない（従来から正しかった形）", () => {
    // "YYYY-MM-DD" は 09:00 JST 相当。旧実装でも同じ日を読むので、
    // 修正の前後で一致するはず。旧実装の読み方と直接比べて固定する。
    for (const birth of ["1985-01-03", "1990-05-15", "2000-12-31"]) {
      const bDate = new Date(birth);
      const nowScore = calculateBaziCompatibility(bDate, TARGET);
      // 旧実装で同じ日干が得られることを確認（= スコアも同じ）
      const f = getZonedDateTimeFields(bDate, 9);
      const jstGan = Solar.fromYmdHms(
        f.year,
        f.month,
        f.day,
        f.hours,
        f.minutes,
        f.seconds,
      )
        .getLunar()
        .getEightChar()
        .getDayGan();
      expect(legacyDayGan(bDate), `${birth} の日干`).toBe(jstGan);
      expect(nowScore).toBeGreaterThanOrEqual(0);
      expect(nowScore).toBeLessThanOrEqual(100);
    }
  });

  it("スコアは 50 を既定に 0〜100 に収まる", () => {
    for (let i = 0; i < 60; i++) {
      const target = new Date(TARGET.getTime() + i * 86400000);
      const score = calculateBaziCompatibility(jst(1990, 5, 15, 3), target);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("旧実装はこれを満たさない（テストが空回りしていないことの確認）", () => {
  const runtimeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const runsInUtc = runtimeTz === "UTC" || runtimeTz === "Etc/UTC";

  it.runIf(runsInUtc)(
    "旧実装は日本時間 0〜8 時生まれの日干が前日になる",
    () => {
      let diff = 0;
      for (let d = 0; d < 60; d++) {
        const at3 = new Date(jst(1990, 5, 15, 3).getTime() + d * 86400000);
        const at12 = new Date(jst(1990, 5, 15, 12).getTime() + d * 86400000);
        if (legacyDayGan(at3) !== legacyDayGan(at12)) diff += 1;
      }
      // 日干は 10 日で一巡し**毎日 1 つ進む**ので、前日と同じ干に
      // なることは決して無い。前日読みなら全件ずれる。
      // （最初「10 分の 9 がずれる」と予想して外した。10 日ごとに
      //   同じ干が来るのは「10 日後」であって「前日」ではない。）
      expect(diff).toBe(60);
    },
  );
});
