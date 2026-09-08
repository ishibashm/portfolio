import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 移住先の比較（/relocation/wealth）も、保存済みの設定が無いときは
 * 古典（節切り暦）で始める。
 *
 * ホーム（SolarTimeClock）・設定バー（MetaphysicalConfigBar）・物件検索・
 * シミュレータはすべて古典が既定で、/houi の表も古典。この頁だけ
 * 「天体軌道モデル」で始まっていて、初めて来た人に**この頁だけ違う答え**
 * が出ていた（ガイドの初期値の表もそう書いていた）。物件検索が同じ理由で
 * 古典に揃えた経緯（__tests__/arbitrageConfigBar）に合わせる。
 *
 * ソースを読んで見ている（arbitrageConfigBar と同じ作法）。既定は 3 か所
 * （state の初期値・読み込み時の既定・設定バーの通知を受けたときの既定）
 * にあるので、どれか 1 つが戻っても落ちるように 3 つとも見る。
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .split("\r\n")
    .join("\n");

const PAGE = read("src", "app", "relocation", "wealth", "page.tsx");
const GUIDE = read("src", "lib", "guideContent.ts");

describe("移住先の比較の既定エンジン", () => {
  it("ページを読めている（空回りしていない）", () => {
    expect(PAGE.length).toBeGreaterThan(10000);
  });

  it("保存済みの設定が無いときは古典で始める（3 か所）", () => {
    expect(PAGE).toContain(
      'const [engineType, setEngineType] = useState("classical");',
    );
    expect(PAGE).toContain('let engine = "classical";');
    // 設定バーの通知（use_classical_board が無い）→ 古典
    expect(PAGE).toMatch(
      /config\.use_classical_board !== undefined\s*\?\s*config\.use_classical_board\s*\?\s*"classical"\s*:\s*"physical"\s*:\s*"classical"/,
    );
  });

  it("ガイドの初期値の表も古典と書いている", () => {
    expect(GUIDE).toMatch(/\["方位計算エンジン", "節切り暦モデル"/);
  });
});
