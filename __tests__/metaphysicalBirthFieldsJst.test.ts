import { describe, expect, it } from "vitest";

import {
  fetchMetaphysicalData,
  getLifePathNumber,
} from "@/utils/metaphysicalApis";
import { parseJapanDateTime } from "@/utils/japanDate";

/**
 * 生年月日から出すもの（ライフパスナンバー・太陽星座・大運の年齢）は
 * **日本時間で**読む。
 *
 * `getFullYear()` / `getMonth()` / `getDate()` は実行環境のタイムゾーンを
 * 見る。本番（Cloud Run）は UTC なので、日本時間の 0〜9 時に生まれた人が
 * **前日**として数えられていた。
 *
 * 生年月日の文字列を日本時間として読むよう直した（parseJapanDateTime）
 * ので、**読む側をそろえないと元に戻る。**この 2 つは対で意味を持つ。
 *
 * 直す前の読み方を LEGACY として写してある。戻すと落ちる。
 */

/** 直す前の読み方。実行環境のタイムゾーンで読んでいた。 */
const legacyFields = (d: Date) => ({
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

const TODAY = new Date("2026-09-07T12:00:00+09:00");

describe("生年月日を日本時間で読む", () => {
  it("日本時間の朝に生まれた人のライフパスが前日にならない", () => {
    /* 1990-01-02 05:30 JST。UTC では 1990-01-01 20:30 */
    const birth = parseJapanDateTime("1990-01-02T05:30");
    expect(birth.toISOString()).toBe("1990-01-01T20:30:00.000Z");

    /* 直す前は前日（1 月 1 日）として数えていた */
    expect(legacyFields(birth)).toEqual({ year: 1990, month: 1, day: 1 });

    /* 入れた日付（1 月 2 日）で数える */
    expect(getLifePathNumber(birth).lifePathNumber).toBe(4);
    expect(
      getLifePathNumber(new Date("1990-01-02T00:00:00Z")).lifePathNumber,
    ).toBe(4);
  });

  it("時刻を入れても、入れなくても同じ答えになる", () => {
    /* 同じ 1990-01-02 生まれ。時刻の有無で占いの結果が変わらない */
    const withTime = parseJapanDateTime("1990-01-02T05:30");
    const dateOnly = parseJapanDateTime("1990-01-02");

    const a = fetchMetaphysicalData(withTime, TODAY, null, true);
    const b = fetchMetaphysicalData(dateOnly, TODAY, null, true);

    expect(a.divineApi.numerology?.lifePathNumber).toBe(
      b.divineApi.numerology?.lifePathNumber,
    );
    expect(a.astrologyApi.horoscope).toBe(b.astrologyApi.horoscope);
  });

  it("星座の境目の日に生まれた人が隣の星座にならない", () => {
    /* 山羊座は 12/22 から。12/22 05:00 JST は UTC では 12/21 20:00 で
       射手座に落ちていた */
    const birth = parseJapanDateTime("1990-12-22T05:00");
    expect(legacyFields(birth).day).toBe(21);

    const m = fetchMetaphysicalData(birth, TODAY, null, true);
    expect(m.astrologyApi.horoscope).toContain("山羊座");
  });

  it("日付だけを入れた人の答えは変わらない（多数派）", () => {
    /* `YYYY-MM-DD` は UTC の 0 時＝日本時間の同じ日の 9 時。旧実装と
       同じ日を読むので、既に出ている答えが動かないことを固定する */
    for (const s of ["1990-01-02", "1985-02-04", "2000-12-31"]) {
      const d = parseJapanDateTime(s);
      expect(legacyFields(d)).toEqual({
        year: Number(s.slice(0, 4)),
        month: Number(s.slice(5, 7)),
        day: Number(s.slice(8, 10)),
      });
      expect(getLifePathNumber(d).lifePathNumber).toBe(
        getLifePathNumber(new Date(s)).lifePathNumber,
      );
    }
  });
});
