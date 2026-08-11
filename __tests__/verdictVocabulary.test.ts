import { describe, expect, it } from "vitest";
import { ratingForStatus } from "@/lib/verdictRating";
import {
  directionLabelShort,
  directionLabelDetailed,
  haLabelForLayer,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";
import { FIVE_FATAL_NOISES, NOISE_PRIORITY } from "@/utils/noiseSeverity";
import { statusInfo } from "@/lib/kigakuContent";
import { isAuspicious } from "@/utils/auspiciousDays";

/**
 * ページごとに違う言葉・違う重さで方位を評価していた問題の回し止め。
 *
 * 実測で見つかった食い違い:
 *   SAFE を「吉」と書く画面が 2 つあった（物件検索の API と資産マップ）
 *   本命殺・本命的殺（五大凶殺）を「凶」に格下げしていた画面が 2 つ
 *   天中殺方位（二次凶）を「大凶」に格上げしていた画面が 2 つ
 *   月盤で絞っていても破を「歳破」と書いていた
 */

const ALL_NOISES = NOISE_PRIORITY;

describe("方位の評価語彙が全ページで揃っている", () => {
  it("SAFE は吉ではない", () => {
    // 「凶方位ではない」であって吉ではない。ここが崩れると、
    // 物件検索で吉と出た方位が記事では吉でない、が再発する。
    expect(ratingForStatus("SAFE").rating).toBe("平穏");
    expect(ratingForStatus("SAFE").score).toBe(0);
    expect(directionLabelShort("SAFE")).toBe("平穏");
    expect(statusInfo("SAFE").kind).toBe("neutral");
    expect(isAuspicious("SAFE")).toBe(false);
  });

  it("吉と呼ぶのは OPTIMAL 系だけ", () => {
    for (const s of ["OPTIMAL", "OPTIMAL_REGULAR", "OPTIMAL_BOOST"]) {
      expect(ratingForStatus(s).score, s).toBeGreaterThan(0);
      expect(ratingForStatus(s).rating, s).toMatch(/^大?吉$/);
    }
  });

  it("五大凶殺は必ず最も重い「大凶」になる", () => {
    for (const s of FIVE_FATAL_NOISES) {
      const r = ratingForStatus(s);
      expect(r.rating, s).toBe("大凶");
      expect(r.score, s).toBe(-100);
    }
  });

  it("天中殺方位は五大凶殺より軽い", () => {
    // 以前はここが逆で、本命殺(-30) より天中殺方位(-100) が重かった。
    const voidDir = ratingForStatus("NOISE_VOID");
    expect(voidDir.rating).toBe("凶");
    for (const fatal of FIVE_FATAL_NOISES) {
      expect(
        ratingForStatus(fatal).score,
        `${fatal} は NOISE_VOID より重いはず`,
      ).toBeLessThan(voidDir.score);
    }
  });

  it("二次凶はすべて「凶」で、五大凶殺と混ざらない", () => {
    const secondary = ALL_NOISES.filter((n) => !FIVE_FATAL_NOISES.includes(n));
    expect(secondary.length).toBeGreaterThan(0);
    for (const s of secondary) {
      expect(ratingForStatus(s).rating, s).toBe("凶");
    }
  });

  it("凶はすべて日本語のラベルを持つ（内部コードを画面に出さない）", () => {
    for (const s of ALL_NOISES) {
      expect(isKnownDirectionStatus(s), s).toBe(true);
      expect(directionLabelShort(s), s).not.toMatch(/NOISE|OPTIMAL|SAFE/);
      expect(directionLabelDetailed(s), s).not.toMatch(/NOISE|OPTIMAL|SAFE/);
    }
  });

  it("未知のコードでも内部コードを画面に出さない", () => {
    expect(directionLabelShort("NOISE_UNKNOWN_XYZ")).toBe("判定なし");
    // 未知の NOISE_* は凶として扱う。吉に倒れるほうが危ない。
    expect(ratingForStatus("NOISE_UNKNOWN_XYZ").rating).toBe("凶");
    expect(ratingForStatus("まったく知らない値").rating).toBe("平穏");
  });

  it("破は盤によって呼び名が変わる", () => {
    // エンジンはどの盤でも NOISE_HA を返す。表示側が盤を知らずに
    // 「歳破」と書くと、月盤・日盤で嘘になる。
    expect(haLabelForLayer("year")).toBe("歳破");
    expect(haLabelForLayer("month")).toBe("月破");
    expect(haLabelForLayer("day")).toBe("日破");
    expect(haLabelForLayer("final")).toBe("歳破/月破/日破");
  });

  it("評価の段階は単調（良い順に点が下がる）", () => {
    const order = [
      "OPTIMAL",
      "OPTIMAL_REGULAR",
      "SAFE",
      "WARNING",
      "NOISE_VOID",
      "NOISE_GOU",
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        ratingForStatus(order[i]).score,
        `${order[i - 1]} → ${order[i]}`,
      ).toBeLessThan(ratingForStatus(order[i - 1]).score);
    }
  });
});
