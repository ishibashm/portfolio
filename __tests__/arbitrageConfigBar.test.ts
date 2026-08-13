import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 物件スキャナーから算出方法を切り替えられること。
 *
 * 2026-07-26 の 39d4bed は「見た目を揃える」コミットだが、差分の中で
 * <MetaphysicalConfigBar> ごと落としていた。以来スキャナー本体に
 * 古典 / 独自モデルの切替が無い。
 *
 * 一方 /houi の記事は 2 箇所でこう書いている。
 *
 *   このサイトのスキャナーには、木星の黄経から星を求める独自モデルも
 *   用意しており、設定で切り替えられます
 *
 * 記事の側が正しい（公開している仕様）ので、バーを戻して合わせた。
 * 見た目のコミットで機能が落ちるのは静かに起きるので、ここで固定する。
 *
 * ソースを読んで見ている。8,000 行のクライアント component で、
 * 描画して確かめるのが現実的でないため。
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .split("\r\n")
    .join("\n");

const PAGE = read("src", "app", "relocation", "arbitrage", "page.tsx");

describe("物件スキャナーの設定バー", () => {
  it("ページを読めている（空回りしていない）", () => {
    expect(PAGE.length).toBeGreaterThan(10000);
  });

  it("MetaphysicalConfigBar を描いている", () => {
    expect(PAGE).toContain(
      'import { MetaphysicalConfigBar } from "@/components/layout/MetaphysicalConfigBar";',
    );
    expect(PAGE).toContain("<MetaphysicalConfigBar");
  });

  it("切替がページの state に反映される", () => {
    expect(PAGE).toContain("setUseClassical(newConfig.useClassicalBoard);");
    expect(PAGE).toContain("setTargetDate(newConfig.targetDate);");
    expect(PAGE).toContain(
      "setDirectionFilterMode(newConfig.directionFilterMode);",
    );
    expect(PAGE).toContain("setActionIntent(newConfig.actionIntent);");
  });

  it("保存済みの設定が無いときは古典で始める", () => {
    // バーの既定も /houi の表も古典。ここだけ独自モデルで始まると、
    // バーがマウント時に古典を押し込んで判定が一瞬で変わる。
    expect(PAGE).toContain(
      "const [useClassical, setUseClassical] = useState(true);",
    );
    expect(PAGE).toContain("let classical = true;");
  });
});

describe("/houi の記事", () => {
  it("スキャナーで切り替えられると書いている（バーを消したら記事も直す）", () => {
    const houi = read("src", "app", "houi", "page.tsx");
    const detail = read("src", "app", "houi", "[year]", "[star]", "page.tsx");

    expect(houi).toContain("設定で切り替えられます");
    expect(detail).toContain("設定で切り替えられます");
  });
});
