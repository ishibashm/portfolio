import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JAPAN_BOUNDS, hasUsableBase, isInJapan } from "@/lib/japanBounds";
import { parseCoordinates } from "@/components/relocation/SpotVerdict";

/*
  出発地が未入力のとき、(0, 0) から方位と距離を出していた件。

  ## 何が起きていたか（2026-09-15 に実機で発見）

  物件検索の「この地点を調べる」は出発地を

      baseLat={Number(baseLat)}   // baseLat の初期値は ""

  で受け取る。**`Number("")` は `NaN` ではなく `0`。**受け取る側の守りが
  `Number.isFinite()` だったので 0 が素通りし、緯度 0・経度 0（ギニア湾）
  から計算していた。実機で

      愛知県名古屋市中区   NE   約14083.5km

  と出る。**距離は桁違いだと分かるが、方位（NE）は一見それらしく気付けない。**

  同じページの地図は `hasBaseLocation` という正しい旗を使っていて、
  **この呼び出しだけが外にいた**（CLAUDE.md 3 節で 3 回踏んでいる形）。

  ## 判定の見え方が変わるので、手順を踏む（CLAUDE.md 3 節）

  1. 変更前の実装をここに写す（`OLD_HAS_BASE`）
  2. 変更後と旧が**どこで一致し、どこで変わるか**を広い入力で固定する
  3. 旧挙動に戻すとこの検査が落ちる（確認済み）
*/

/** 変更前の実装。**そのまま写す。** */
function OLD_HAS_BASE(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

/** 日本国内の代表的な出発地（どちらの実装でも通るべきもの）。 */
const IN_JAPAN: [number, number, string][] = [
  [35.6895, 139.6917, "東京駅"],
  [35.0116, 135.7681, "京都市"],
  [43.0642, 141.3469, "札幌市"],
  [26.2124, 127.6809, "那覇市"],
  [24.3448, 124.1572, "石垣市"],
  [45.3981, 141.6849, "稚内市"],
  [33.5904, 130.4017, "福岡市"],
];

/** 出発地として通してはいけない値。 */
const NOT_A_BASE: [number, number, string][] = [
  [0, 0, "未入力（Number('') が 0）"],
  [0, 139.6917, "緯度だけ未入力"],
  [35.6895, 0, "経度だけ未入力"],
  [NaN, NaN, "NaN"],
  [51.5074, -0.1278, "ロンドン"],
  [40.7128, -74.006, "ニューヨーク"],
  [-33.8688, 151.2093, "シドニー（経度は日本の範囲内）"],
  [1.3521, 103.8198, "シンガポール"],
];

describe("出発地として使える座標か", () => {
  it("日本国内は通る（旧実装と同じ）", () => {
    for (const [lat, lon, name] of IN_JAPAN) {
      expect(hasUsableBase(lat, lon), name).toBe(true);
      expect(OLD_HAS_BASE(lat, lon), `旧: ${name}`).toBe(true);
    }
  });

  it("未入力（0）と国外は止める。**ここが変わったところ**", () => {
    for (const [lat, lon, name] of NOT_A_BASE) {
      expect(hasUsableBase(lat, lon), name).toBe(false);
    }
    /* 旧実装は NaN 以外を全部通していた。**空回り防止**として、
       「旧なら通ってしまう」ことをここで固定する */
    const slippedThrough = NOT_A_BASE.filter(([lat, lon]) =>
      OLD_HAS_BASE(lat, lon),
    );
    expect(
      slippedThrough.map(([, , n]) => n),
      "旧実装が素通りさせていたもの",
    ).toEqual([
      "未入力（Number('') が 0）",
      "緯度だけ未入力",
      "経度だけ未入力",
      "ロンドン",
      "ニューヨーク",
      "シドニー（経度は日本の範囲内）",
      "シンガポール",
    ]);
  });

  it("広い入力で、旧と新が食い違うのは日本の外だけ", () => {
    /* 1 度刻みで世界を舐める。**食い違いが「日本の外」に限られること**を
       示せれば、この変更が何を変えたのか自分で説明できている */
    let checked = 0;
    let differed = 0;
    for (let lat = -90; lat <= 90; lat += 3) {
      for (let lon = -180; lon <= 180; lon += 3) {
        checked += 1;
        const oldSays = OLD_HAS_BASE(lat, lon);
        const newSays = hasUsableBase(lat, lon);
        if (oldSays === newSays) continue;
        /* 変わったのは必ず「旧は通す・新は止める」の向きで、
           かつ日本の外であること */
        expect(oldSays, `${lat},${lon}`).toBe(true);
        expect(newSays, `${lat},${lon}`).toBe(false);
        expect(isInJapan(lat, lon), `${lat},${lon} は日本の外のはず`).toBe(
          false,
        );
        differed += 1;
      }
    }
    expect(checked).toBeGreaterThan(3000);
    /*
      **空回り防止。**旧と新が同じなら食い違いは 0 件になり、上の for の
      中身が 1 度も走らないまま緑になる（旧実装に戻して実測したら、この
      検査だけ通ってしまった）。**変わったことが実際にあると言い切る。**
    */
    expect(differed, "旧と新で答えが変わった座標が 1 つも無い").toBeGreaterThan(
      1000,
    );
  });

  it("枠の縁はどちらも含む（境目で落ちない）", () => {
    const { minLat, maxLat, minLon, maxLon } = JAPAN_BOUNDS;
    for (const [lat, lon] of [
      [minLat, minLon],
      [minLat, maxLon],
      [maxLat, minLon],
      [maxLat, maxLon],
    ] as [number, number][]) {
      expect(hasUsableBase(lat, lon), `${lat},${lon}`).toBe(true);
    }
    expect(hasUsableBase(minLat - 0.001, minLon)).toBe(false);
    expect(hasUsableBase(maxLat + 0.001, maxLon)).toBe(false);
  });
});

describe("座標の読み取りは変えていない", () => {
  /* parseCoordinates は元から同じ枠で弾いていた。共通の定数に
     差し替えただけで、答えは変わらないこと */
  it("日本国内の座標は今までどおり読める", () => {
    for (const [lat, lon, name] of IN_JAPAN) {
      expect(parseCoordinates(`${lat}, ${lon}`), name).toEqual({ lat, lon });
    }
  });

  it("国外・壊れた値は今までどおり読まない", () => {
    for (const bad of ["51.5074, -0.1278", "0, 0", "1,2", "あ", ""]) {
      expect(parseCoordinates(bad), bad).toBeNull();
    }
  });
});

describe("枠の写しを増やさない", () => {
  const VERDICT = "src/components/relocation/SpotVerdict.tsx";

  it("SpotVerdict は数字を持たず lib から読む", () => {
    const src = readFileSync(join(process.cwd(), VERDICT), "utf8");
    expect(src).toContain('from "@/lib/japanBounds"');
    /* 写しが戻っていないこと */
    expect(src).not.toMatch(/lat < 20 \|\| lat > 46/);
    expect(src).not.toContain("Number.isFinite(baseLat)");
  });
});
