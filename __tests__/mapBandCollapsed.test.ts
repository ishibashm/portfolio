import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_LAYER_MODES } from "@/utils/directionStatus";

/**
 * 目的地の地図の帯は、**既定では 1 行**で、押し口は「設定」で開く。
 *
 * ## なぜ
 *
 * 以前は時間軸 7 つ・層 4 つ・基準・立体表示・KML・出発地の札を常に
 * 全部並べていて、400px では **4 段**に折れて地図の上 4 分の 1 を帯が
 * 占めていた（docs/improvement-backlog.md 28 節の実測。減らせる候補が
 * 「KML を落とす」しか無い、と書いてあった）。
 *
 * KML は落とさない。**機能を削らずに、既定で見せる量を減らす。**
 * 開いたときの中身は以前と同じボタン。
 *
 * ## 見るもの
 *
 *   1. 時間軸の 7 つのボタンが `controlsOpen &&` の中にある
 *      （常時表示に戻ったら落ちる）
 *   2. 既定の 1 行は `layerModeLabel(` で名前を出す（名前の表を
 *      3 つ目に増やさない。directionStatus の LAYER_MODE_LABELS が 1 つ）
 *   3. KML の書き出しが残っている（削って「減らした」にしない）
 *   4. 開く口に aria-expanded がある（畳んだことが読み上げでも分かる）
 */
const SOURCE = join(process.cwd(), "src/components/TacticalMagneticMap.tsx");
const src = readFileSync(SOURCE, "utf8");

describe("目的地の地図の帯", () => {
  const openStart = src.indexOf("{controlsOpen && (");
  const openEnd = src.indexOf(
    '        </div>\n\n        <div className="w-full h-full relative z-0',
  );

  it("読めている（この検査自体が空回りしていない）", () => {
    expect(openStart).toBeGreaterThan(0);
    expect(openEnd).toBeGreaterThan(openStart);
  });

  it("時間軸の 7 つは「設定」を開いたときだけ出る", () => {
    const inside = src.slice(openStart, openEnd);
    for (const mode of ALL_LAYER_MODES) {
      const call = `setActiveLayerMode("${mode}")`;
      expect(src, `${mode} のボタンが無い`).toContain(call);
      expect(inside, `${mode} のボタンが畳みの外にある`).toContain(call);
    }
  });

  it("既定の 1 行は共有の名前（layerModeLabel）を使う", () => {
    const before = src.slice(0, openStart);
    expect(before).toContain("layerModeLabel(activeLayerMode)");
  });

  it("KML の書き出しは残っている", () => {
    expect(src).toContain("KML で書き出す");
    expect(src).toContain("downloadKML(");
  });

  it("開く口は aria-expanded を持つ", () => {
    expect(src).toMatch(/aria-expanded=\{controlsOpen\}/);
  });
});

/*
  層の切り替え（地形・宇宙天気・本命星・災害域）は全幅で押せる（2026-09-17）。

  以前は `hidden lg:flex` で携帯では押せなかった。帯が常時表示だった頃の
  幅の都合で、帯を「設定」に畳んだ今は要らない。災害域（洪水・土砂）は
  携帯で現地を見ながら使う層。
*/
describe("層の切り替えは携帯でも押せる", () => {
  it("4 つのボタンを包む div に hidden が付いていない", () => {
    const at = src.indexOf('toggleLayer?.("terrain")');
    expect(at).toBeGreaterThan(0);
    /* 直前の <div className="..."> がその器 */
    const before = src.slice(0, at);
    const m = before.match(/<div className="([^"]*)">\s*<button[^]*$/);
    expect(m, "器の div が見つからない").toBeTruthy();
    expect(m![1]).not.toMatch(/\bhidden\b/);
    for (const layer of ["terrain", "weather", "bio", "hazard"]) {
      expect(src).toContain(`toggleLayer?.("${layer}")`);
    }
  });
});
