/**
 * JSX の改行が、日本語の文の途中に半角スペースを入れている箇所を探す。
 *
 * JSX はテキストノードの改行を半角スペース 1 つに変換する。英語では
 * 単語の区切りとして正しいが、日本語では文の途中に空白が出る。
 * 本番でこう出ていた（#183）。
 *
 *   出発地・行き先の指定を少し変えるだけで結果が 変わります。
 *
 * grep で行末・行頭の文字を見る方法は、コメント・文字列リテラル・
 * テンプレートリテラルを拾ってしまう（実測で 238 件中 171 件が誤検出）。
 * ここでは TypeScript のパーサで JsxText ノードだけを見る。
 *
 * 使い方:
 *   node scripts/find_jsx_ja_linebreaks.mjs            # 一覧
 *   node scripts/find_jsx_ja_linebreaks.mjs --count    # 件数だけ
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/** 空白を入れてはいけない文字。ひらがな・カタカナ・漢字と、和文の約物。 */
const JA =
  /[぀-ゟ゠-ヿ一-鿿々〆！-｠。、「」『』（）・：；？！]/;

// リポジトリの直下から実行する前提（検証コマンドと同じ）。
const ROOT = process.cwd();

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walkFiles(p, out);
    } else if (name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 1 ファイル分の違反を返す。
 * @returns {{line:number, before:string, after:string}[]}
 */
export function findInSource(fileName, source) {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hits = [];

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      const text = node.getFullText();
      const start = node.getFullStart();
      // 改行の前後を見る。JSX は「改行＋前後の空白」を半角スペース 1 つにする。
      const re = /([^\s])[ \t]*\r?\n[ \t]*([^\s])/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!JA.test(m[1]) || !JA.test(m[2])) continue;
        const offset = start + m.index;
        const { line } = sf.getLineAndCharacterOfPosition(offset);
        hits.push({
          line: line + 1,
          before: text.slice(Math.max(0, m.index - 12), m.index + 1).trim(),
          after: text.slice(m.index + m[0].length - 1, m.index + m[0].length + 11).trim(),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

// import されたときは走らせない（テストから findInSource だけ使う）。
// Windows では import.meta.url と argv[1] の表記が揃わないので、
// ファイル名で見る。
if (process.argv[1]?.endsWith("find_jsx_ja_linebreaks.mjs")) {
  const files = walkFiles(join(ROOT, "src"));
  let total = 0;
  const perFile = [];
  for (const f of files) {
    const hits = findInSource(f, readFileSync(f, "utf8"));
    if (hits.length === 0) continue;
    total += hits.length;
    perFile.push([relative(ROOT, f).replace(/\\/g, "/"), hits]);
  }
  perFile.sort((a, b) => b[1].length - a[1].length);

  if (!process.argv.includes("--count")) {
    for (const [path, hits] of perFile) {
      console.log(`\n${path}  (${hits.length})`);
      for (const h of hits) {
        console.log(`  ${String(h.line).padStart(5)}  ${h.before} ␣ ${h.after}`);
      }
    }
  }
  console.log(`\n合計 ${total} 件 / ${perFile.length} ファイル`);
  process.exit(total === 0 ? 0 : 1);
}
