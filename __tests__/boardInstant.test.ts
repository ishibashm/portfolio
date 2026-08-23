import { describe, it, expect } from "vitest";
import { directionBoardInstant, forecastAnchorMs } from "@/utils/boardInstant";
import { getClassicalYearStar } from "@/utils/ephemerisEngine";
import { calculateSolarTime } from "@/utils/solarTime";

const NAGOYA_LON = 136.9064;
const TOKYO_LON = 139.6917;

/**
 * 時計の現在時刻。時刻だけを変えて同じ日を指す。**日本時間で組み立てる。**
 *
 * `new Date(2026, 7, 2, hour)` と書くと**実行環境のタイムゾーン**の時刻に
 * なる。CI も本番（Cloud Run）も UTC なので、それだと 23 時が日本の翌日
 * 8 時になり、「同じ日」を検査しているつもりで別の日を見る。判定は
 * 日本時間で行うので、テスト側も日本時間で組み立てる。
 */
const clockAt = (hour: number, minute = 10) =>
  new Date(Date.UTC(2026, 7, 2, hour - 9, minute, 0, 0));

/** その瞬間を日本時間で見たときの暦日（YYYY-MM-DD）。 */
const jstDate = (d: Date) =>
  new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** その瞬間を日本時間で見たときの時分（HH:MM）。 */
const jstHm = (d: Date) =>
  new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16);

describe("directionBoardInstant", () => {
  it("同じ日なら時計の時刻が変わっても同じ評価時刻になる", () => {
    // 時計は毎分進むが、盤は年・月・日でしか変わらない。
    // 時刻に引きずられると、見ている間に地図の色が変わってしまう。
    const hours = [0, 5, 9, 12, 18, 23];
    const results = hours.map((h) =>
      directionBoardInstant(clockAt(h), 0, NAGOYA_LON).getTime(),
    );
    for (const t of results) expect(t).toBe(results[0]);
  });

  it("日をまたぐ時刻でも、その日の代表点に落ちる", () => {
    // 00:10 をそのまま太陽時に直すと前日 23:38 になり、日盤が 1 日ずれる。
    // 正午に丸めてから変換するので、そうならない。
    const midnight = directionBoardInstant(clockAt(0), 0, NAGOYA_LON);
    const noon = directionBoardInstant(clockAt(12), 0, NAGOYA_LON);
    expect(midnight.getTime()).toBe(noon.getTime());
    expect(midnight.getDate()).toBe(2);
  });

  it("地図（当日）とヒートマップ先頭列（dayOffset=0）が一致する", () => {
    // 地図は directionBoardInstant(baseTime, timeOffsetDays, lon) を、
    // ヒートマップは同じ引数に dayOffset を足して各列を作る。
    // 先頭列は必ず地図が描いている日と同じでなければならない。
    for (const hour of [0, 6, 12, 23]) {
      for (const offset of [0, 1, 15, 30, -5]) {
        const map = directionBoardInstant(clockAt(hour), offset, NAGOYA_LON);
        const firstColumn = directionBoardInstant(
          clockAt(hour),
          offset,
          NAGOYA_LON,
          0,
        );
        expect(firstColumn.getTime()).toBe(map.getTime());
      }
    }
  });

  it("ヒートマップ側が正午に丸めた基準日を渡しても結果が変わらない（二重丸めが安全）", () => {
    // 実装では先に正午へ丸めた Date を渡している。もう一度丸めても同じこと。
    const clock = clockAt(23, 50);
    const anchor = new Date(forecastAnchorMs(clock));
    expect(
      directionBoardInstant(anchor, 3, NAGOYA_LON, 2).getTime(),
    ).toBe(directionBoardInstant(clock, 3, NAGOYA_LON, 2).getTime());
  });

  it("dayOffset は 1 日ずつ進む（均時差ぶんの秒差は許容）", () => {
    // 太陽時への変換には均時差が入るため、日ごとに数秒の増減がある。
    // 日付が 1 日進むことが要件で、ミリ秒一致が要件ではない。
    const day0 = directionBoardInstant(clockAt(9), 0, NAGOYA_LON, 0);
    const day1 = directionBoardInstant(clockAt(9), 0, NAGOYA_LON, 1);
    expect(day1.getTime() - day0.getTime()).toBeCloseTo(86400000, -4);
    expect(day1.getDate()).toBe(day0.getDate() + 1);
  });

  it("timeOffsetDays と dayOffset は足し合わせで同じ日を指す", () => {
    // 列をクリックすると timeOffsetDays がその列の値になる。
    // その後の先頭列が、クリック前のその列と同じ日でなければ、
    // 地図とヒートマップがずれる。
    const clock = clockAt(3);
    const before = directionBoardInstant(clock, 0, NAGOYA_LON, 7);
    const afterClick = directionBoardInstant(clock, 7, NAGOYA_LON, 0);
    expect(afterClick.getTime()).toBe(before.getTime());
  });

  it("経度が違えば評価時刻も変わる（呼び出し側で揃える必要がある）", () => {
    const nagoya = directionBoardInstant(clockAt(12), 0, NAGOYA_LON);
    const tokyo = directionBoardInstant(clockAt(12), 0, TOKYO_LON);
    expect(nagoya.getTime()).not.toBe(tokyo.getTime());
  });

  it("負のオフセット（過去）も扱える", () => {
    const past = directionBoardInstant(clockAt(12), -30, NAGOYA_LON);
    const now = directionBoardInstant(clockAt(12), 0, NAGOYA_LON);
    // 均時差ぶん（30 日で最大数分）はずれる。日数として 30 日戻れていればよい。
    const diffDays = (now.getTime() - past.getTime()) / 86400000;
    expect(diffDays).toBeCloseTo(30, 2);
  });

  it("引数の Date を書き換えない", () => {
    const clock = clockAt(23, 45);
    const snapshot = clock.getTime();
    directionBoardInstant(clock, 5, NAGOYA_LON, 3);
    expect(clock.getTime()).toBe(snapshot);
  });
});

/**
 * 評価時刻を「実行環境の正午」から「日本時間の正午」に直した件の固定。
 *
 * 変更前は `anchor.setHours(12, 0, 0, 0)` で丸めていた。`setHours` は
 * 実行環境のタイムゾーンで動くので、
 *
 *   ブラウザ（日本の利用者）        12時 JST
 *   本番サーバ（Cloud Run は UTC）  12時 UTC ＝ 21時 JST
 *
 * と、同じ日を 9 時間ずれた時刻で判定していた。節入りがその間に来る日は
 * 年盤・月盤が食い違う。#456（`Solar.fromDate` の TZ 依存）と同じ形で、
 * `setHours` 経由のこちらが残っていた。
 *
 * ここでは 3 つを置く。
 *
 *   1. 旧実装を legacyForecastAnchorMs として写す
 *   2. 新実装が「日本時間の正午」であることを広い範囲で固定する
 *   3. **旧実装だと落ちる**ことを、食い違いが実際に出る立春で示す
 *
 * 3 が無いと、何を変えたのかを自分でも確かめられない。
 */

/** 変更前の丸め方。**現行実装のどこからも呼ばれていない。** */
function legacyForecastAnchorMs(baseTime: Date): number {
  const anchor = new Date(baseTime);
  anchor.setHours(12, 0, 0, 0);
  return anchor.getTime();
}

/** 旧実装の anchor から評価時刻を組み立てる（太陽時補正だけを同じ形で当てる）。 */
function legacyBoardInstant(baseTime: Date, lon: number): Date {
  return calculateSolarTime(new Date(legacyForecastAnchorMs(baseTime)), lon)
    .solarTime;
}

describe("forecastAnchorMs は日本時間の正午に寄せる", () => {
  it("どの瞬間から引いても、その日（JST）の 12:00 JST になる", () => {
    const bad: string[] = [];
    // 2026〜2028 を 7 時間刻みで走査する。刻みが 24 の約数でないので、
    // 3 年ぶんのあいだに 1 日の全時刻帯を通る。
    for (
      let t = Date.UTC(2026, 0, 1);
      t < Date.UTC(2029, 0, 1);
      t += 7 * 3600000
    ) {
      const now = new Date(t);
      const anchor = new Date(forecastAnchorMs(now));
      if (jstHm(anchor) !== "12:00") {
        bad.push(
          `${now.toISOString()} -> ${anchor.toISOString()}（正午でない）`,
        );
      }
      if (jstDate(anchor) !== jstDate(now)) {
        bad.push(
          `${now.toISOString()} -> ${anchor.toISOString()}（暦日がずれた）`,
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("戻り値は実行環境のタイムゾーンに依存しない", () => {
    // Date.UTC で組み立てているので、同じ入力なら必ず同じ数値になる。
    // setHours に戻すと、この期待値は TZ=UTC で 9 時間ずれて落ちる。
    expect(forecastAnchorMs(new Date("2028-02-04T00:00:00Z"))).toBe(
      Date.UTC(2028, 1, 4, 3, 0, 0, 0),
    );
    // JST の日付境界（00:00 JST ＝ 前日 15:00 UTC）の前後で日が変わる。
    expect(forecastAnchorMs(new Date("2028-02-03T15:00:00Z"))).toBe(
      Date.UTC(2028, 1, 4, 3, 0, 0, 0),
    );
    expect(forecastAnchorMs(new Date("2028-02-03T14:59:59Z"))).toBe(
      Date.UTC(2028, 1, 3, 3, 0, 0, 0),
    );
  });

  it("旧実装は UTC で動かすと 21時 JST の盤を見る（この修正の対象）", () => {
    // 2028年の立春は 2月4日 16時31分 JST。12時 JST は切り替わりの前、
    // 21時 JST は後なので、年盤の星が 1 つずれる。
    const now = new Date("2028-02-04T00:00:00Z"); // 9時 JST
    const legacy = legacyBoardInstant(now, NAGOYA_LON);
    const fixed = directionBoardInstant(now, 0, NAGOYA_LON);

    // CI も本番も UTC。旧実装だとここが 20 時台になる（太陽時補正ぶん）。
    expect(jstHm(legacy).slice(0, 2)).toBe("20");
    expect(jstHm(fixed).slice(0, 2)).toBe("11");

    // 星が実際に食い違うことまで見る。ここが等しくなったら、この検査は
    // 何も守っていない。
    expect(getClassicalYearStar(legacy)).not.toBe(getClassicalYearStar(fixed));

    // 正しいのは 12時 JST 側。立春（16:31）より前なので前年の盤と同じ。
    expect(getClassicalYearStar(fixed)).toBe(
      getClassicalYearStar(new Date("2028-02-03T03:00:00Z")),
    );
  });

  it("立春が正午より前の年は、旧実装でも同じ答えになる（2027年）", () => {
    // 2027年の立春は 2月4日 10時46分 JST。12時 JST も 21時 JST も
    // 切り替わりの後なので食い違わない。記事
    // （content/blog/year-board-blocks-a-whole-year.md）の表が、この修正で
    // 変わらないことの確認。
    const now = new Date("2027-02-04T00:00:00Z");
    expect(getClassicalYearStar(legacyBoardInstant(now, NAGOYA_LON))).toBe(
      getClassicalYearStar(directionBoardInstant(now, 0, NAGOYA_LON)),
    );
  });
});
