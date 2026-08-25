/**
 * 下地（ベースマップ）の定義を固定する。
 *
 * いちばん怖いのは **`maxNativeZoom` を書き間違えること**。配信の無い
 * ズームのタイルは 404 になり、Leaflet はそれを静かに透明として扱う。
 * 下地が透明になると画面が真っ白になり、「壊れた」ようにしか見えない。
 * しかもエラーは出ないので、拡大した人だけが遭遇する。
 *
 * 目で見て気付くしかない類なので、ここで数値ごと固定する。
 * 上限を変えるときは、地理院タイル一覧
 * （https://maps.gsi.go.jp/development/ichiran.html）で
 * 実際の提供ズームを確かめてから。
 */
import { describe, expect, it } from "vitest";

import {
  BASE_MAPS,
  BASE_MAP_ORDER,
  GSI_ATTRIBUTION,
  HILLSHADE,
  parseBaseMapId,
  type BaseMapId,
} from "@/lib/baseMapLayers";

describe("下地の定義", () => {
  it("並び順と定義が 1 対 1 で対応している", () => {
    expect([...BASE_MAP_ORDER].sort()).toEqual(
      (Object.keys(BASE_MAPS) as BaseMapId[]).sort(),
    );
    // 既定は先頭。従来と同じ見え方から始める。
    expect(BASE_MAP_ORDER[0]).toBe("carto");
  });

  /**
   * 空回りを避けるための固定。地理院タイルの実際の提供ズーム。
   * relief（色別標高図）は 15、hillshade（陰影起伏図）は 16 までしか無い。
   */
  it("配信の上限が種類ごとに正しい", () => {
    const limits = (Object.keys(BASE_MAPS) as BaseMapId[]).map(
      (id) => `${id}=${BASE_MAPS[id].maxNativeZoom}`,
    );
    expect(limits.sort()).toEqual([
      "carto=19",
      "pale=18",
      "photo=18",
      "relief=15",
    ]);
    expect(HILLSHADE.maxNativeZoom).toBe(16);
  });

  it("拡大の上限は配信の上限以上（引き伸ばして描く）", () => {
    for (const id of BASE_MAP_ORDER) {
      const def = BASE_MAPS[id];
      expect(def.maxZoom).toBeGreaterThanOrEqual(def.maxNativeZoom);
    }
    expect(HILLSHADE.maxZoom).toBeGreaterThanOrEqual(HILLSHADE.maxNativeZoom);
  });

  it("タイル URL に {z}/{x}/{y} がそろっている", () => {
    const all = [...BASE_MAP_ORDER.map((id) => BASE_MAPS[id]), HILLSHADE];
    for (const def of all) {
      expect(def.url).toContain("{z}");
      expect(def.url).toContain("{x}");
      expect(def.url).toContain("{y}");
      expect(def.url.startsWith("https://")).toBe(true);
    }
  });

  /** 地理院タイルの利用規約で出典の明示が要る。落とすと規約違反になる。 */
  it("地理院タイルには必ず出典が付く", () => {
    const all = [...BASE_MAP_ORDER.map((id) => BASE_MAPS[id]), HILLSHADE];
    for (const def of all) {
      if (def.url.includes("cyberjapandata.gsi.go.jp")) {
        expect(def.attribution).toBe(GSI_ATTRIBUTION);
        expect(def.attribution).toContain("国土地理院");
      } else {
        expect(def.attribution.length).toBeGreaterThan(0);
      }
    }
  });

  it("説明と名前が空でない", () => {
    const all = [...BASE_MAP_ORDER.map((id) => BASE_MAPS[id]), HILLSHADE];
    for (const def of all) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.note.length).toBeGreaterThan(0);
    }
  });

  it("保存された値が壊れていても既定へ倒れる", () => {
    expect(parseBaseMapId("photo")).toBe("photo");
    expect(parseBaseMapId("relief")).toBe("relief");
    expect(parseBaseMapId(null)).toBe("carto");
    expect(parseBaseMapId(undefined)).toBe("carto");
    expect(parseBaseMapId("")).toBe("carto");
    expect(parseBaseMapId("知らない値")).toBe("carto");
    // Object.prototype のキーを拾わない
    expect(parseBaseMapId("toString")).toBe("carto");
    expect(parseBaseMapId("constructor")).toBe("carto");
  });
});
