import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_FIELDS } from "@/lib/profileFields";

/**
 * 判定の土台になる 3 つの入力欄の呼び名が、画面ごとに割れていないこと。
 *
 * 同じ値を入れる欄が 3 つの画面（ホームの入力欄・プロフィール欄・設定バー）
 * にあり、設定バーだけ「現在地＝出発地」「生年月日（本命星と天中殺の基準）」
 * と別の名前だった。利用者から表記ずれとして指摘を受けている。
 *
 * 同じ欄だと分からないと、別の設定だと思って両方に入れようとする。
 *
 * 文言を `lib/profileFields` に寄せたので、**画面側に同じ文字列が現れたら
 * また割れ始めたしるし。**ここで 0 件を要求する。
 */

const SRC = join(process.cwd(), "src");

/** 寄せ先そのもの。ここには文字列があってよい。 */
const SOURCE_OF_TRUTH = "src/lib/profileFields.ts";

/** 割れていた側の呼び名。復活したら落とす。 */
const RETIRED_LABELS = ["現在地＝出発地", "生年月日（本命星と天中殺の基準）"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((p) => ({
  path: relative(process.cwd(), p),
  text: readFileSync(p, "utf8"),
}));

describe("入力欄の呼び名", () => {
  it("走査対象を見つけている（空回りしていない）", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("寄せ先の外に同じ文言が書かれていない", () => {
    /*
      「生まれたところ」のような短い語は、案内文の中にも普通に出てくる
      （「生年月日・現在地・生まれたところの 3 つ」）。それまで落とすと
      日本語が書けなくなるので、**欄の名前として使われている形**だけを
      見る。文字列リテラル（label="…"）か、JSX のテキストノードとして
      その行にそれだけ書かれている場合。
    */
    const labels = Object.values(PROFILE_FIELDS).flatMap((f) => [
      f.label,
      f.help,
    ]);
    const hits: string[] = [];
    for (const file of FILES) {
      if (file.path === SOURCE_OF_TRUTH) continue;
      const lines = file.text.split("\n");
      for (const label of labels) {
        if (file.text.includes(`"${label}"`)) {
          hits.push(`${file.path}: label="${label}"`);
          continue;
        }
        if (lines.some((line) => line.trim() === label)) {
          hits.push(`${file.path}: ${label}（テキストノード）`);
        }
      }
    }
    expect(hits, `${hits.length} 件:\n${hits.join("\n")}`).toEqual([]);
  });

  it("割れていた側の呼び名が復活していない", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      // 寄せ先の説明文が、割れていた経緯として旧称を引用している。
      if (file.path === SOURCE_OF_TRUTH) continue;
      for (const label of RETIRED_LABELS) {
        if (file.text.includes(label)) hits.push(`${file.path}: ${label}`);
      }
    }
    expect(hits, `${hits.length} 件:\n${hits.join("\n")}`).toEqual([]);
  });
});
