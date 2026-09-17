import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 地図の左上を、帯（見出しと時間軸の 1 行）と地図の見た目（明暗・名所・
 * 駅）とで取り合わない。
 *
 * ## 何が起きていたか
 *
 * `MagneticMapInner` の 3 つのボタンが `absolute top-4 left-4 z-[1000]`
 * で、同じ角にある `TacticalMagneticMap` の帯（z-10）の**上に重なって
 * 見出しを隠していた。**帯を 1 行に畳んだ #1338 で、その 1 行
 * （時間軸・基準）まで隠れるようになり、実測で 400px・1280px とも
 * 3 つのボタンが見出しと 1 行の両方に掛かっていた。
 *
 * ## 決めごと
 *
 *   - 見た目のボタンは**右上**（帯の右側は #1338 で空いた）
 *   - lg 未満は幅が無いので 1 つの「地図 ▾」に畳む（aria-expanded 付き）
 *   - 帯の側は lg 未満でその列ぶん右を空ける（pr-20 lg:pr-0）
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("地図の左上の取り合い", () => {
  const inner = read("src/components/MagneticMapInner.tsx");
  const band = read("src/components/TacticalMagneticMap.tsx");

  it("明暗・名所・駅の列は右上に置く（左上に戻したら落ちる）", () => {
    const rowStart = inner.indexOf("ダークマップ");
    expect(rowStart).toBeGreaterThan(0);
    /* その列を包む absolute の指定を、ボタンより前の 1,500 字から拾う */
    const before = inner.slice(Math.max(0, rowStart - 1500), rowStart);
    const m = before.match(
      /className="absolute (top-4 [a-z-]+4)[^"]*z-\[1000\]/g,
    );
    expect(m, "列の absolute 指定が見つからない").toBeTruthy();
    const last = m![m!.length - 1];
    expect(last).toContain("top-4 right-4");
    expect(last).not.toContain("left-4");
  });

  it("lg 未満は「地図」の 1 つに畳み、開閉が読み上げでも分かる", () => {
    expect(inner).toMatch(/aria-expanded=\{mapMenuOpen\}/);
    expect(inner).toMatch(/mapMenuOpen \? "flex" : "hidden lg:flex"/);
  });

  it("帯は lg 未満で右を空ける", () => {
    expect(band).toContain("pr-20 lg:pr-0");
  });
});
