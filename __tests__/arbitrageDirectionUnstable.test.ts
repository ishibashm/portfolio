import { describe, expect, it } from "vitest";
import {
  DIRECTION_UNSTABLE_KM,
  directionUnstableNote,
  isDirectionUnstable,
  sectorShiftMeters,
} from "@/lib/directionDistance";

/**
 * 「物件を方位で探す」でも、近すぎて方位が定まらない物件にはそう書く。
 *
 * この注意はシミュレータ（#176・#181）に先に入り、物件検索には入って
 * いなかった。同じ市内の物件が方位だけ違って並ぶのに、理由がどこにも
 * 出ていない状態だった。
 *
 * ここで見るのは**画面ごとに違う数字を書いていないこと**。閾値と文言は
 * `lib/directionDistance` の 1 か所から引く。
 *
 * **判定は変えない。**5km 未満でも方位盤の判定はこれまでどおり出る。
 * 距離で吉凶の強弱を変えるかどうかは流派で言うことが違うので、決まる
 * まで実装しない（docs/improvement-backlog.md の E）。
 */

describe("近すぎて方位が定まらない物件の注意", () => {
  it("閾値は 5km。物件検索とシミュレータで同じものを使う", () => {
    expect(DIRECTION_UNSTABLE_KM).toBe(5);
  });

  it("5km 未満なら注意が出て、それ以上なら出ない", () => {
    expect(directionUnstableNote(1.2)).toBeTruthy();
    expect(directionUnstableNote(4.9)).toBeTruthy();
    expect(directionUnstableNote(5)).toBeNull();
    expect(directionUnstableNote(40)).toBeNull();
  });

  it("注意には、どれだけずれると方位が変わるかを具体的な長さで書く", () => {
    // 「近いので不正確です」だけでは、どう受け取ればよいか分からない。
    const note = directionUnstableNote(2);
    expect(note).toContain("2.0km");
    expect(note).toContain(`${sectorShiftMeters(2)}m`);
    expect(note).toContain("方位が隣に変わります");
  });

  it("横ずれは距離に比例する（22.5 度の半区分ぶん）", () => {
    // 0.5km で約 207m、5km で約 2071m。距離が 10 倍なら横ずれも 10 倍。
    expect(sectorShiftMeters(0.5)).toBe(207);
    expect(sectorShiftMeters(5)).toBe(2071);
    expect(sectorShiftMeters(50)).toBe(20711);
  });

  it("距離が無い・おかしいときは注意を出さない", () => {
    // 物件の distanceKm は null になりうる。そこで注意を出すと、
    // 位置が分からない物件に「近すぎます」と書くことになる。
    expect(isDirectionUnstable(Number.NaN)).toBe(false);
    expect(isDirectionUnstable(Number.POSITIVE_INFINITY)).toBe(false);
    expect(directionUnstableNote(Number.NaN)).toBeNull();
  });
});
