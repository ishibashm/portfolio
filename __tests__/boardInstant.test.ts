import { describe, it, expect } from "vitest";
import { directionBoardInstant } from "@/utils/boardInstant";

const NAGOYA_LON = 136.9064;
const TOKYO_LON = 139.6917;

/** 時計の現在時刻。時刻だけを変えて同じ日を指す。 */
const clockAt = (hour: number, minute = 10) =>
  new Date(2026, 7, 2, hour, minute, 0, 0);

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
    const anchor = new Date(clock);
    anchor.setHours(12, 0, 0, 0);
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
