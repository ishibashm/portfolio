import { describe, expect, it } from "vitest";

import { parseCoordinates } from "@/components/relocation/SpotVerdict";

/**
 * 「この地点を調べる」の入力の読み取り。
 *
 * 地図のクリックは座標をクリップボードへ入れるので、貼り付けたものを
 * そのまま受けたい。一方で**住所の一部を座標として読んではいけない。**
 * 「1,2」を座標として受けると、地球のどこかを指したまま、それらしい
 * 方位と吉凶が出る。判定が間違っていることが画面から分からない形の
 * 事故になるので、日本の範囲外は座標として扱わない。
 */
describe("parseCoordinates", () => {
  it("地図から写した形をそのまま読む", () => {
    expect(parseCoordinates("35.0116, 135.7681")).toEqual({
      lat: 35.0116,
      lon: 135.7681,
    });
  });

  it("区切りが読点・空白でも読む", () => {
    expect(parseCoordinates("35.0116、135.7681")).toEqual({
      lat: 35.0116,
      lon: 135.7681,
    });
    expect(parseCoordinates(" 43.0642 141.3469 ")).toEqual({
      lat: 43.0642,
      lon: 141.3469,
    });
  });

  it("住所は座標として読まない", () => {
    expect(parseCoordinates("京都府京都市西京区御陵峰ケ堂町1丁目")).toBeNull();
    expect(parseCoordinates("上桂駅")).toBeNull();
  });

  // ここが本題。範囲の検査を外すと、下の 3 件が座標として通る。
  it("日本の範囲外は座標として扱わない", () => {
    expect(parseCoordinates("1,2")).toBeNull();
    expect(parseCoordinates("51.5074, -0.1278")).toBeNull(); // ロンドン
    expect(parseCoordinates("0,0")).toBeNull();
  });

  it("数値にならないものは読まない", () => {
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("abc, def")).toBeNull();
    expect(parseCoordinates("35.0116")).toBeNull();
    expect(parseCoordinates("35.0116, 135.7681, 100")).toBeNull();
  });
});
