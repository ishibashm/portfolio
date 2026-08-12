import { describe, expect, it } from "vitest";
import * as astro from "astronomy-engine";
import { AstroTime, Body, Equator, Horizon, Observer } from "astronomy-engine";

/**
 * `scripts/site_guardian_daemon.ts` が太陽の方位・高度を出す呼び方を固定する。
 *
 * デーモンは 2 つ間違えていた。どちらも例外になり、すぐ下の try/catch が
 * 拾って警告ログを出すだけだったので、**気付かないまま既定値
 * （方位 180 度・高度 45 度）で動き続けていた**。
 *
 *   1. `Horizontal` という輸出は無い（正しくは `Horizon`）
 *   2. refraction に "apparent" は渡せない（"normal" / "jplhor" / 未指定のみ）
 *
 * `scripts/` は tsconfig の exclude に入っていて `npx tsc --noEmit` が見ない。
 * ここで呼び方そのものを押さえておけば、同じ書き方に戻したときに落ちる。
 */

/** 東京。デーモンの既定の観測地点と同じ。 */
const TOKYO = new Observer(35.6895, 139.6917, 0);

function solarAt(iso: string, refraction?: string) {
  const time = new AstroTime(new Date(iso));
  const equ = Equator(Body.Sun, time, TOKYO, true, true);
  return Horizon(time, TOKYO, equ.ra, equ.dec, refraction);
}

describe("デーモンが使う太陽位置の呼び方", () => {
  it("輸出名は Horizon。Horizontal は存在しない", () => {
    const exports = astro as unknown as Record<string, unknown>;
    expect(typeof exports.Horizon).toBe("function");
    // ここが function に戻ったら、下の期待値も含めて見直すこと。
    expect(exports.Horizontal).toBeUndefined();
  });

  it('refraction に "apparent" は渡せない', () => {
    // 渡すと例外。デーモンでは catch が握って既定値のままになっていた。
    expect(() => solarAt("2026-08-12T12:00:00+09:00", "apparent")).toThrow(
      /refraction/i,
    );
  });

  it('"normal" なら実際の方位と高度が返る', () => {
    // 8 月の東京。朝は東寄りで低く、正午は南寄りで高く、夕方は西寄りで低い。
    const morning = solarAt("2026-08-12T06:00:00+09:00", "normal");
    const noon = solarAt("2026-08-12T12:00:00+09:00", "normal");
    const evening = solarAt("2026-08-12T18:00:00+09:00", "normal");

    expect(morning.azimuth).toBeGreaterThan(45);
    expect(morning.azimuth).toBeLessThan(110);
    expect(noon.azimuth).toBeGreaterThan(150);
    expect(noon.azimuth).toBeLessThan(220);
    expect(evening.azimuth).toBeGreaterThan(250);
    expect(evening.azimuth).toBeLessThan(315);

    expect(noon.altitude).toBeGreaterThan(morning.altitude);
    expect(noon.altitude).toBeGreaterThan(evening.altitude);
  });

  it("既定値（180 度 / 45 度）とは違う値が出る", () => {
    // 例外で落ちていた頃はこの 2 つがそのまま使われ、方位の変化量
    // （15 度以上で進化トリガ）が初回以外はゼロになっていた。
    const noon = solarAt("2026-08-12T12:00:00+09:00", "normal");
    expect(noon.azimuth).not.toBe(180);
    expect(noon.altitude).not.toBe(45);
  });
});
