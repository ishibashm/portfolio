import { describe, expect, it } from "vitest";
import { getCurrentZodiac } from "@/utils/ephemerisEngine";

/**
 * 時支の時刻基準を**設定で切り替えられる**ようにしたことの固定。
 *
 * ## 元がどうだったか
 *
 * `getCurrentZodiac(date, lon)` は経度を受け取っておきながら**一度も
 * 使っていなかった。**呼び出しは 19 か所あり、どれも実際の出発地を
 * 渡している。時支は JST の時計時刻（標準子午線 135 度）で決まっていて、
 * 誰の真太陽時でもなかった。
 *
 * 標準子午線からのずれは那覇 -29.3 分・根室 +42.3 分で、**全国で 71 分の
 * 開き。**時支の 1 枠は 120 分なので、境目付近では答えが変わる。
 *
 * ## どう直したか
 *
 * 時支を真太陽時で採るかは**流派で分かれる**ため、既定は変えずに
 * 第 3 引数で切り替える形にした（利用者の判断）。
 *
 *   "standard"  標準時（JST 一律）。**既定。**従来どおり lon を見ない
 *   "solar"     真太陽時（経度補正 + 均時差）
 *
 * ## 何を見張るか
 *
 * 1. 既定が "standard" であること。**変えると全利用者の答えが動く**
 * 2. "standard" は経度を見ない（従来の挙動そのもの）
 * 3. "solar" は経度で変わる（1・2 が空回りしていないこと）
 * 4. **年支と月支はどちらの基準でも動かない。**木星黄経・太陽黄経で
 *    決まる地心の量なので、観測地の経度に依らない
 */

/** 全国の東西の幅を代表する地点。 */
const PLACES: [string, number][] = [
  ["那覇", 127.68],
  ["福岡", 130.4],
  ["明石", 135.0],
  ["東京", 139.6917],
  ["根室", 145.58],
];

/** 未/申 の境目（15:00）の 2 分前。境目付近を狙う。 */
const NEAR_BOUNDARY = new Date("2026-08-18T14:58:00+09:00");

describe("既定は標準時のまま", () => {
  it("第 3 引数を省くと standard と同じ", () => {
    for (const [name, lon] of PLACES) {
      const omitted = getCurrentZodiac(NEAR_BOUNDARY, lon);
      const explicit = getCurrentZodiac(NEAR_BOUNDARY, lon, "standard");
      expect(omitted, `${name} で既定が standard になっていない`).toEqual(
        explicit,
      );
    }
  });

  it("standard では経度を変えても答えが同じ（従来の挙動）", () => {
    // ここが崩れると、既存の利用者の答えが黙って変わる。
    const answers = new Set(
      PLACES.map(([, lon]) => getCurrentZodiac(NEAR_BOUNDARY, lon).hourZodiac),
    );
    expect(answers.size).toBe(1);
  });
});

describe("solar にすると経度が効く", () => {
  it("同じ瞬間でも地点で時支が変わる", () => {
    // 2 と 3 は表裏。これが 1 種類しか出ないなら、切り替えが効いていない。
    const answers = new Set(
      PLACES.map(
        ([, lon]) => getCurrentZodiac(NEAR_BOUNDARY, lon, "solar").hourZodiac,
      ),
    );
    expect(
      answers.size,
      "solar にしても地点で答えが変わらない。経度が効いていない",
    ).toBeGreaterThan(1);
  });

  it("東ほど時刻が進む（根室が那覇より先の枠に入る瞬間がある）", () => {
    const naha = getCurrentZodiac(NEAR_BOUNDARY, 127.68, "solar");
    const nemuro = getCurrentZodiac(NEAR_BOUNDARY, 145.58, "solar");
    // 15:00 の 2 分前。根室は +42 分ぶん進むので申、那覇は -29 分で未のまま。
    expect(naha.hourZodiac).toBe("未");
    expect(nemuro.hourZodiac).toBe("申");
  });

  it("明石でも均時差のぶんだけ動きうる", () => {
    /*
      明石は標準子午線（東経 135 度）そのものなので経度補正は 0 だが、
      均時差（最大 ±16 分）が残る。実測で年間 7.1% の時刻で時支が変わる。
      「経度補正だけ」の実装に差し替えるとここが 0 になって落ちる。
    */
    let moved = 0;
    for (let d = 0; d < 365; d += 1) {
      const base = new Date(Date.UTC(2026, 0, 1 + d, 0, 0, 0));
      for (let m = 0; m < 1440; m += 30) {
        const t = new Date(base.getTime() + m * 60_000);
        if (
          getCurrentZodiac(t, 135.0, "standard").hourZodiac !==
          getCurrentZodiac(t, 135.0, "solar").hourZodiac
        ) {
          moved++;
        }
      }
    }
    expect(moved, "均時差が効いていない").toBeGreaterThan(0);
  });
});

describe("年支と月支は基準に依らない", () => {
  it("どちらの基準でも、どの地点でも同じ", () => {
    // 木星黄経・太陽黄経で決まる地心の量。観測地の経度で動いてはいけない。
    for (let d = 0; d < 365; d += 7) {
      const t = new Date(Date.UTC(2026, 0, 1 + d, 3, 0, 0));
      const base = getCurrentZodiac(t, 135.0, "standard");
      for (const [name, lon] of PLACES) {
        for (const basis of ["standard", "solar"] as const) {
          const z = getCurrentZodiac(t, lon, basis);
          expect(z.yearZodiac, `${name}/${basis} で年支が動いた`).toBe(
            base.yearZodiac,
          );
          expect(z.monthZodiac, `${name}/${basis} で月支が動いた`).toBe(
            base.monthZodiac,
          );
        }
      }
    }
  });
});
