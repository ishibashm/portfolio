import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { findInSource } from "../scripts/find_jsx_ja_linebreaks.mjs";

/**
 * JSX の改行が、日本語の文の途中に半角スペースを入れていないこと。
 *
 * JSX はテキストノードの改行を半角スペース 1 つに変換する。英語では
 * 単語の区切りとして正しいが、日本語では文が割れる。本番でこう出ていた。
 *
 *   出発地・行き先の指定を少し変えるだけで結果が 変わります。
 *   この方位には現在の検索範囲に物件が ありません。
 *   五黄殺・暗剣殺・歳破・本命殺に 当たる方位は避けます。
 *
 * ソースを読みやすく折り返しただけのつもりが、そのまま画面に出る。
 * 書いた本人が気付きにくく、実際に 144 か所／28 ファイルまで溜まっていた
 * （#183〜#195 で全部消した）。放っておくと同じ形でまた増えるので、
 * ここで 0 件を要求する。
 *
 * 直し方は「行を連結する」だけ。prettier は日本語テキストを再分割しない
 * （区切る空白が無い）ので、連結しておけば整形で元に戻らない。
 *
 * 検出は TypeScript のパーサで JsxText ノードだけを見ている。grep で
 * 行末・行頭の文字を見る方法だと、コメント・文字列リテラル・テンプレート
 * リテラルを拾って誤検出が半分以上になる（実測 238 件中 171 件）。
 *
 *   node scripts/find_jsx_ja_linebreaks.mjs   # 一覧を出す
 *
 * 対象は「両側が日本語」のときだけ。日本語と数字の境目（「約11.86年に
 * もとづくため 9年周期にならず」）は含めない。和文と数字の間に空白を
 * 置くのは表記の流儀としてありうるし、このリポジトリにも意図して
 * 空けている箇所がある（「掲載中の 1,234 件」など）。
 */

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      tsxFiles(p, out);
    } else if (name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

describe("JSX の改行が日本語の文中に半角スペースを入れていない", () => {
  const files = tsxFiles(SRC);

  it("走査対象の .tsx を見つけている（空回りしていない）", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("検出そのものが働いている", () => {
    // 直したあとで 0 件になるので、検出側が壊れても気付けない。
    // 実際に起きていた形をここで固定する。
    const bad = `export const A = () => (
  <p>
    この方位には現在の検索範囲に物件が
    ありません。
  </p>
);`;
    expect(findInSource("bad.tsx", bad)).toHaveLength(1);

    // コメントと文字列リテラルは拾わない（grep で数えたときの誤検出源）。
    const ok = `// 方位は出発地から見た向きで
// 決まります。
export const B = () => (
  <p title="方位は出発地から見た向きで
決まります。">
    方位は出発地から見た向きで決まります。
  </p>
);`;
    expect(findInSource("ok.tsx", ok)).toHaveLength(0);
  });

  it("該当が 1 件も無い", () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const h of findInSource(f, readFileSync(f, "utf8"))) {
        const path = relative(process.cwd(), f).split("\\").join("/");
        hits.push(`${path}:${h.line}  ${h.before} ␣ ${h.after}`);
      }
    }
    expect(hits, `${hits.length} 件:\n${hits.join("\n")}`).toEqual([]);
  });
});
