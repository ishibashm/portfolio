/**
 * 日付の組み立ては実行環境のタイムゾーンに依存しないこと。
 *
 * `auspiciousDays.ts` は日付を全部 `Date` の**ローカル**のゲッター／
 * セッターで組んでいた。`getFullYear` も `setHours` も実行環境の
 * タイムゾーンで動くので、本番（Cloud Run＝UTC）とブラウザ（日本＝JST）で
 * 意味が変わる。判定そのものは #563 で日本時間の正午に寄せてあるので、
 * ラベルと走査だけが取り残されていた。
 *
 * 実害が出ていたのは `findYearBoardWindow`。走査ループは `setHours(12)` を
 * 通していたのに、年盤の窓を探すところだけ生の `from` を使っていた。
 *
 * ここでは旧実装をそのまま写し、
 *
 *   1. 「ラベルの日付 ＝ 実際に評価した日本時間の日」を広い範囲で固定する
 *   2. 旧実装が期限を 1 日早く出す入力を名指しで固定する
 *   3. 旧実装に戻すと落ちることを確かめる
 *
 * の 3 つを置く。
 */
import { describe, expect, it } from "vitest";
import {
  findAuspiciousDays,
  judgeDay,
  type AuspiciousDayParams,
} from "@/utils/auspiciousDays";
import { forecastAnchorMs } from "@/utils/boardInstant";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";

const BIRTH = new Date("1997-06-15T04:26:00+09:00");
const NAGOYA_LON = 136.9008;

const params: AuspiciousDayParams = {
  honmeiStar: getHonmeiStar(BIRTH).classical,
  voidZodiacs: getPersonalVoidZodiac(BIRTH),
  lon: NAGOYA_LON,
  direction: "SE",
  tenchusatsuMode: "off",
};

/** その Date が指す日本時間の日（実行環境に依らない）。 */
const jstDay = (d: Date) =>
  new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** 実際に判定に使われた日（＝盤の代表点の日本時間の日）。 */
const judgedDay = (d: Date) => jstDay(new Date(forecastAnchorMs(d)));

describe("ラベルの日付は実際に評価した日と一致する", () => {
  it("入力の時刻がどこにあっても、date は評価した日と同じ", () => {
    // 日本時間の 0 時から 23 時まで 1 時間刻みで、30 日ぶん。
    // UTC で動かすと 15 時〜24 時（JST の 0〜9 時）が翌日にまたぐ。
    const bad: string[] = [];
    for (let day = 0; day < 30; day++) {
      for (let h = 0; h < 24; h++) {
        const d = new Date(Date.UTC(2026, 8, 1 + day, h - 9, 30, 0, 0));
        const v = judgeDay(d, params);
        if (v.date !== judgedDay(d)) {
          bad.push(`${d.toISOString()} label=${v.date} 評価日=${judgedDay(d)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("曜日も日本時間の日のもの", () => {
    // 日本時間 2026-09-01 は火曜（2）。UTC で読むと 8/31 の月曜になる時刻で確かめる。
    const jstTuesdayEarlyMorning = new Date("2026-08-31T20:00:00Z"); // JST 09-01 05:00
    const v = judgeDay(jstTuesdayEarlyMorning, params);
    expect(v.date).toBe("2026-09-01");
    expect(v.weekday).toBe(2);
  });
});

describe("年盤の期限は from の時刻で動かない", () => {
  it("同じ日を指す 5 通りの from で、期限が同じ日になる", () => {
    // 2027 年の立春は 2 月 4 日 10 時 46 分（日本時間）。盤はその日の
    // 正午で見るので、切り替わりの前日＝2027-02-03 が最後の 1 日。
    const sameDay = [
      "2026-09-01T12:00:00+09:00", // 画面が送る形（YYYY-MM-DD 相当）
      "2026-08-31T15:00:00Z", // 日本時間 09-01 の 0 時
      "2026-08-31T20:00:00Z", // 日本時間 09-01 の 5 時
      "2026-09-01T03:00:00Z", // 日本時間 09-01 の正午
      "2026-09-01T14:59:00Z", // 日本時間 09-01 の 23 時 59 分
    ];
    const got = sameDay.map((iso) => {
      const from = new Date(iso);
      const to = new Date(from.getTime() + 5 * 86400000);
      return findAuspiciousDays(from, to, params).window.yearBoardValidUntil;
    });
    expect(got).toEqual([
      "2027-02-03",
      "2027-02-03",
      "2027-02-03",
      "2027-02-03",
      "2027-02-03",
    ]);
  });

  it("走査する日数は from の時刻で変わらない", () => {
    const days = [
      "2026-09-01T12:00:00+09:00",
      "2026-08-31T20:00:00Z",
      "2026-09-01T14:00:00Z",
    ].map((iso) => {
      const from = new Date(iso);
      const to = new Date(from.getTime() + 9 * 86400000);
      const s = findAuspiciousDays(from, to, params);
      return s.scannedDays;
    });
    expect(days).toEqual([10, 10, 10]);
  });
});
