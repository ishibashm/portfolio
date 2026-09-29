#!/usr/bin/env node
/**
 * PR が lint の警告を**増やしていない**ことを、同じ環境で前後を比べて確かめる。
 *
 *   node scripts/lint-warning-gate.mjs <比較元の ref>   # 例: HEAD^1
 *
 * ## なぜ要るか
 *
 * CLAUDE.md 1 節は「PR の前後で警告の総数が増えていないこと」を求めているが、
 * 確かめるのは人の手だった。自分が足したコード（テストを含む）で警告を
 * 増やす事故が実際に起きている。CI の Lint は error しか止めない。
 *
 * ## なぜ固定の上限（--max-warnings=N）にしないか
 *
 * **総数は環境をまたいで比べられない。**同じコミットでもクラウド側 423 /
 * ローカル 434 と 11 件ずれていた（CLAUDE.md 1 節）。上限を数字で書くと、
 * 環境が変わっただけで全員の PR が赤くなるか、逆に素通りする。
 *
 * そこで**同じランナーの中で**、比較元を git worktree に出して同じ
 * node_modules・同じ eslint で数え直す。比べるのは差だけなので、環境の
 * 違いは両側で打ち消し合う。
 *
 * ## 判定
 *
 * 総数が増えたら落とす（CLAUDE.md の基準と同じ）。あるファイルで 1 件
 * 減らして別のファイルで 1 件増やしたなら総数は同じで通る。増えたファイルは
 * どちらの場合も一覧に出す。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const baseRef = process.argv[2];
if (!baseRef) {
  console.error("使い方: node scripts/lint-warning-gate.mjs <比較元の ref>");
  process.exit(2);
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** eslint を JSON で回し、{ 相対パス: { 規則: 件数 } } と総数を返す */
function lintWarnings(cwd, outFile) {
  try {
    execFileSync(
      "npx",
      ["eslint", "--format", "json", "--output-file", outFile],
      {
        cwd,
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
  } catch {
    // error があると eslint は 1 で終わる。error は CI の Lint が別に止めるので、
    // ここでは出力が書かれていれば数える。書かれていなければ下の読み込みで落ちる。
  }
  const results = JSON.parse(readFileSync(outFile, "utf8"));
  const byFile = {};
  let total = 0;
  for (const r of results) {
    if (r.warningCount === 0) continue;
    const rel = path.relative(cwd, r.filePath);
    byFile[rel] = {};
    for (const m of r.messages) {
      if (m.severity !== 1) continue;
      const rule = m.ruleId ?? "(規則なし)";
      byFile[rel][rule] = (byFile[rel][rule] ?? 0) + 1;
      total += 1;
    }
  }
  return { byFile, total };
}

const work = mkdtempSync(path.join(tmpdir(), "lint-gate-"));
const baseDir = path.join(work, "base");
let exitCode = 0;
try {
  execFileSync("git", ["worktree", "add", "--detach", baseDir, baseRef], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
  });
  // 依存は入れ直さず、今の node_modules を指す。同じ eslint・同じ規則で
  // 数えるのが目的なので、入れ直すとかえって比較にならない。
  symlinkSync(
    path.join(root, "node_modules"),
    path.join(baseDir, "node_modules"),
  );

  const head = lintWarnings(root, path.join(work, "head.json"));
  const base = lintWarnings(baseDir, path.join(work, "base.json"));

  const increased = [];
  for (const [file, rules] of Object.entries(head.byFile)) {
    for (const [rule, n] of Object.entries(rules)) {
      const before = base.byFile[file]?.[rule] ?? 0;
      if (n > before) increased.push({ file, rule, before, after: n });
    }
  }

  const lines = [
    "## lint の警告（PR の前後を同じ環境で比較）",
    "",
    `- 比較元（${baseRef}）: ${base.total} 件`,
    `- この PR: ${head.total} 件（${head.total - base.total >= 0 ? "+" : ""}${head.total - base.total}）`,
  ];
  if (increased.length > 0) {
    lines.push("", "増えたところ:", "");
    for (const x of increased) {
      lines.push(`- \`${x.file}\` ${x.rule}: ${x.before} → ${x.after}`);
    }
  }
  const summary = lines.join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    execFileSync("sh", ["-c", 'cat >> "$GITHUB_STEP_SUMMARY"'], {
      input: summary + "\n",
    });
  }

  if (head.total > base.total) {
    for (const x of increased) {
      console.log(
        `::warning file=${x.file}::${x.rule} が ${x.before} → ${x.after} 件に増えた`,
      );
    }
    console.log(
      `::error::lint の警告が ${base.total} → ${head.total} 件に増えた。CLAUDE.md 1 節「PR の前後で総数が増えていないこと」。`,
    );
    exitCode = 1;
  }
} finally {
  try {
    execFileSync("git", ["worktree", "remove", "--force", baseDir], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    // 片付けの失敗で判定を変えない
  }
  rmSync(work, { recursive: true, force: true });
}
process.exit(exitCode);
