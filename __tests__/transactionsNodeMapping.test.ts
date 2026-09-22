import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { directionFromBearing } from "@/utils/directionGeo";

/**
 * 成約価格の方位別集計が、盤の設定と同じ規則で切られること。
 *
 * ## なぜ
 *
 * route（`api/relocation/transactions`）は `node_mapping` を読むのに、
 * **画面が送っていなかった。**渡さないと向こうは traditional に倒すので、
 * 独自モデル（45 度等分）を選んでいる利用者は、同じサイドバーの
 * 住宅・土地統計と**別の振り分け**を見ていた。四正と四隅の境目にある街は、
 * 統計では東なのに成約価格では北東に入る。
 *
 * #1297・#1298 で統計だけを直したときの取り残し。地価は #1498 で直した。
 * `directionGeo` の註にある「写しが増えると、また 1 つだけ取り残される」を、
 * 同じ画面で 2 つ踏んでいたことになる。
 *
 * ## 何を見るか
 *
 * 集計そのものは route の中で DB を引くので、ここでは**繋がっているか**を
 * 見る。型は任意引数ではなく必須にしてあるので渡し忘れは tsc が止めるが、
 * **URL に載せ忘れる**のは型では出ない。そこを字面で押さえる。
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PANEL = read("src/components/relocation/TransactionsPanel.tsx");
const ROUTE = read("src/app/api/relocation/transactions/route.ts");
const PAGE = read("src/app/relocation/arbitrage/page.tsx");

describe("成約価格の方位は盤の設定と同じ規則で切る", () => {
  it("画面が規則を URL に載せている", () => {
    expect(PANEL).toContain("&node_mapping=${nodeMapping}");
  });

  it("取り直しの鍵に規則が入っている（切り替えても古い答えが残らない）", () => {
    /* requestKey が同じだと、結果は「この条件で取った」と見なされて
       読み込みが走らない。盤を切り替えたのに前の振り分けが残る */
    expect(PANEL).toMatch(/const requestKey = `[^`]*\$\{nodeMapping\}`/);
  });

  it("規則は必須の props（渡し忘れを tsc が止める）", () => {
    expect(PANEL).toContain("nodeMapping: NodeMapping;");
    expect(PANEL).not.toContain("nodeMapping?: NodeMapping");
  });

  it("物件検索の画面が、成約価格の札にも規則を渡している", () => {
    const from = PAGE.indexOf("<TransactionsPanel");
    expect(from, "TransactionsPanel が見つからない").toBeGreaterThan(-1);
    const panel = PAGE.slice(from, PAGE.indexOf("/>", from));
    expect(panel).toContain("nodeMapping={nodeMappingForBoard(useClassical)}");
  });

  it("route が規則を読んで八方位に落としている", () => {
    expect(ROUTE).toContain('searchParams.get("node_mapping")');
    expect(ROUTE).toContain("directionFromBearing(bearing, nodeMapping)");
  });

  it("この検査が空回りしていない（規則で方位が変わる）", () => {
    /* 方位角 20 度は、伝統区分では北東（北は 345〜15 度）、
       45 度等分では北（337.5〜22.5 度）。 */
    expect(directionFromBearing(20, "traditional")).toBe("NE");
    expect(directionFromBearing(20, "physical")).toBe("N");
  });
});
