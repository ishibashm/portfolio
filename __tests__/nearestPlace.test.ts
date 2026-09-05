import { describe, expect, it } from "vitest";
import { nearestMunicipality, nearestPlaceLabel } from "@/lib/nearestPlace";

/**
 * 座標が「だいたいどこか」を、手元のデータだけで言う。
 *
 * 利用者の報告「その地点がそもそもどこに当たるのかが分からない」。
 * 逆引き API は持っておらず、足すと**地点を選ぶたびに外部へ要求**が
 * 出る。手元の 1,894 市区町村の代表点で足りる。
 *
 * **返すのは住所ではなく「近くの市区町村」。**だから検査でも
 * 「その座標を含む自治体」を期待しない。断定しない文言になっている
 * ことのほうを固定する。
 */
describe("近くの市区町村", () => {
  it("東京駅あたりで東京都内が返る", () => {
    const p = nearestMunicipality(35.6812, 139.7671);
    expect(p).not.toBeNull();
    expect(p!.pref).toBe("東京都");
    /* 区までは断定しない。代表点は大字・町丁目の平均で、千代田区の
       代表点より中央区の代表点が近いことがありうる。 */
    expect(p!.distanceKm).toBeLessThan(15);
  });

  it("大阪と札幌でそれぞれの府県が返る", () => {
    expect(nearestMunicipality(34.7025, 135.4959)?.pref).toBe("大阪府");
    expect(nearestMunicipality(43.0618, 141.3545)?.pref).toBe("北海道");
  });

  it("壊れた入力では null", () => {
    expect(nearestMunicipality(Number.NaN, 139)).toBeNull();
    expect(nearestMunicipality(35, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("近いときは「付近」、遠いときは距離を書く", () => {
    expect(
      nearestPlaceLabel({
        code: "13101",
        pref: "東京都",
        city: "千代田区",
        distanceKm: 2,
      }),
    ).toBe("東京都千代田区付近");
    expect(
      nearestPlaceLabel({
        code: "13101",
        pref: "東京都",
        city: "千代田区",
        distanceKm: 42.4,
      }),
    ).toBe("東京都千代田区から約42km");
  });

  it("断定しない（「です」で言い切らない）", () => {
    /* 返すのは最寄りの代表点であって、その座標を含む自治体ではない。
       「東京都千代田区です」と書くと嘘になりうる。 */
    for (const km of [1, 10, 30, 200]) {
      const label = nearestPlaceLabel({
        code: "13101",
        pref: "東京都",
        city: "千代田区",
        distanceKm: km,
      })!;
      expect(label.endsWith("です")).toBe(false);
      expect(/付近|から約/.test(label)).toBe(true);
    }
  });

  it("海の上を選んでも、遠いことが分かる形で返る", () => {
    /* 太平洋のど真ん中。最寄りでも遠いので「付近」とは書かない。 */
    const p = nearestMunicipality(33.0, 142.0);
    expect(p).not.toBeNull();
    expect(nearestPlaceLabel(p)).toContain("から約");
  });

  it("null を渡したら null", () => {
    expect(nearestPlaceLabel(null)).toBeNull();
  });
});
