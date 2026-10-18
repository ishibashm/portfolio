import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findPlateau } from "@/lib/city3d/plateau";

/**
 * PLATEAU の建物タイルは**利用者が選んだときだけ**読む。
 *
 * 1 枚の b3dm が 1〜10MB あり、名古屋駅の周り 650m を黙って読むと実測で
 * 約 108MB だった。対象かどうかの確認（findPlateau）は逆ジオコーダ 1 回と
 * 同梱の索引だけで済ませ、タイルの取得はボタンの先に置く。
 */

const NAGOYA_STATION = { lat: 35.1709, lon: 136.8815 };

afterEach(() => vi.unstubAllGlobals());

function stubReverse(muniCd: string) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
    Response.json({ results: { muniCd, lv01Nm: "名駅一丁目" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PLATEAU は対象確認だけを先に行う", () => {
  it("名古屋駅（中村区）は索引に当たり、通信は逆ジオコーダの 1 回だけ", async () => {
    const fetchMock = stubReverse("23105");
    const entry = await findPlateau(
      NAGOYA_STATION,
      new AbortController().signal,
    );
    expect(entry?.url).toMatch(/23105_nakamura-ku_lod1\/tileset\.json$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain(
      "mreversegeocoder.gsi.go.jp",
    );
  });

  it("索引に無い市区町村は null（目安の高さのまま）", async () => {
    stubReverse("05201");
    expect(
      await findPlateau(
        { lat: 39.7168, lon: 140.1293 },
        new AbortController().signal,
      ),
    ).toBeNull();
  });

  it("画面は PLATEAU を既定で読まず、選んだときだけ渡す", () => {
    const panel = readFileSync(
      join(__dirname, "../src/components/city3d/CityPanel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/useState\(false\)/);
    expect(panel).toMatch(/plateau=\{usePlateau \? plateauEntry : null\}/);
  });
});
