import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_ROUTES, coreRouteLabel } from "@/lib/siteStructure";

/*
  道具の名前は `CORE_ROUTES` が正。**写さずに `coreRouteLabel` で引く。**

  ## なぜ

  2026-09-14 に実測したところ、「物件を方位で探す」という文字列が
  **17 ファイル**に写されていた（ナビ・ホーム・ガイド・記事・県ページ・
  市区町村ページ・MCP の説明文など。行数では 25）。`CORE_ROUTES` が正の値を
  持っているのに、参照しているのはナビだけだった。

  **最初「25 か所」と書いて落ちた。**grep の行数をファイル数と取り違えて
  いた。数は必ず測ってから書く。

  賃貸の巡回を止めたので（backlog 29 節）、掲載は 2026 年 10 月中旬に
  0 件になる。**部屋を並べなくなった時点でこの名前は実態とずれる**ので
  名前を変える（利用者の判断 A。URL は据え置き）。手で直すと必ず取り
  こぼすため、先に引く形へ寄せる。

  ## この検査の役目

  **写しの数を「増やさない」ことだけを見る。**いま何か所あるかを数えて
  上限として固定する。減らすのは別の PR で少しずつ行い、そのたびにこの
  数字を下げる。**下げ忘れると落ちる**ので、減ったのに固定値が古いまま、
  という状態にならない。

  字面で探すと取りこぼすので（CLAUDE.md 4 節。この session で 2 回踏んだ）、
  母集団は `src` の .ts/.tsx を全部走査して作る。
*/

/** 走査から外す。ここは正を持っている側。 */
const SOURCE_OF_TRUTH = "src/lib/siteStructure.ts";

function allSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(name)) out.push(full);
    }
  };
  walk(join(process.cwd(), "src"));
  return out;
}

/** その名前を字面で持っているファイル（正を持つ側は除く）。 */
function filesRepeating(label: string): string[] {
  return allSourceFiles()
    .filter((f) => relative(process.cwd(), f) !== SOURCE_OF_TRUTH)
    .filter((f) => readFileSync(f, "utf8").includes(label));
}

describe("道具の名前は CORE_ROUTES が正", () => {
  it("href から名前を引ける", () => {
    expect(coreRouteLabel("/relocation/arbitrage")).toBe("方位で街を探す");
    expect(coreRouteLabel("/relocation/simulator")).toBe("引越し先を試算する");
  });

  it("知らない href は null（当てずっぽうの名前を作らない）", () => {
    /* 綴り違いで黙って別の名前が出ると、ナビと本文で食い違う */
    expect(coreRouteLabel("/relocation/arbitrag")).toBeNull();
    expect(coreRouteLabel("")).toBeNull();
    expect(coreRouteLabel("/")).toBeNull();
  });

  it("すべての道具の名前が引ける（表と関数が食い違っていない）", () => {
    for (const r of CORE_ROUTES) {
      expect(coreRouteLabel(r.href), r.href).toBe(r.label);
    }
  });
});

describe("写しを増やさない", () => {
  /*
    2026-09-14 の実測。**この数を増やす変更は通さない。**減らしたら
    ここも下げる（下げ忘れると下の検査が落ちる）。
  */
  const BASELINE: Record<string, number> = {
    /* 2026-09-20 に「物件を方位で探す」から改名し、画面の字面は
       coreRouteLabel で引く形に寄せた（17 → 2）。残る 2 つはコメント
       （HomePortal・arbitrage/page の経緯）。 */
    方位で街を探す: 2,
  };

  for (const [label, max] of Object.entries(BASELINE)) {
    it(`「${label}」を持つファイルが ${max} 以下`, () => {
      const files = filesRepeating(label);
      expect(
        files.length,
        `増えている:\n${files.map((f) => relative(process.cwd(), f)).join("\n")}`,
      ).toBeLessThanOrEqual(max);
    });

    it(`「${label}」の固定値が古くなっていない`, () => {
      /* 減ったのに固定値が古いまま、という状態を作らない。
       **空回りするだけの上限**にしないための見張り */
      const files = filesRepeating(label);
      expect(
        files.length,
        `減っている。BASELINE を ${files.length} に下げること`,
      ).toBe(max);
    });
  }

  it("見張りが空回りしていない（走査できている）", () => {
    expect(allSourceFiles().length).toBeGreaterThan(100);
    expect(filesRepeating("方位で街を探す").length).toBeGreaterThan(0);
  });
});
