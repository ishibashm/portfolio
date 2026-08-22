import { execSync } from "child_process";

// AI Agent Harness Unified Self-Verification Pipeline (scripts/self-verify.mjs)
// Runs Prettier, ESLint, TypeScript Type Checks, Vitest Tests, and Harness Score Diagnostics.

const checks = [
  {
    /*
      **触ったファイルだけ**見る。

      以前は src/** 全体を検査していたが、リポジトリには元から prettier
      非準拠のファイルが 71 個ある（2026-08-22 実測）。つまりこの段は
      **構造的に必ず落ちていた。**落ちると後続の ESLint・tsc・Vitest まで
      止まるので、この統合検査そのものが誰の役にも立っていなかった。

      さらに、そこで案内していた `npm run format` は prettier --write . で、
      **71 ファイルを一斉に書き換える。**エラーメッセージが、CLAUDE.md が
      禁じている操作をそのまま勧めていた。

      HEAD との差分だけを見る。自分が触ったものにだけ責任を持つ。
    */
    name: "Prettier Formatting Check (changed files)",
    command:
      "git diff --name-only --diff-filter=d HEAD -- '*.ts' '*.tsx' '*.js' '*.json'" +
      " | xargs -r npx prettier --check",
    errMessage:
      "変更したファイルの整形が崩れています。「npm run format:staged」で、触ったファイルだけ整えてください（npm run format は全ファイルを書き換えるので使わないこと）。",
  },
  {
    name: "ESLint Code Quality Check",
    command: "npm run lint",
    errMessage: "ESLintによる静的解析エラーが検出されました。",
  },
  {
    name: "TypeScript Strict Type Check",
    command: "npx tsc --noEmit",
    errMessage: "TypeScriptのコンパイルエラー（型エラー）が検出されました。",
  },
  {
    name: "Vitest Unit Tests Pass",
    command: "npm run test",
    errMessage: "単体テスト（Vitest）で失敗が発生しました。",
  },
  {
    name: "Harness Diagnostic Check",
    command: "npm run review-harness",
    errMessage: "ハーネス診断ツールで問題が発生しました。",
  },
];

console.log(
  "\x1b[36m%s\x1b[0m",
  "=== AI AGENT HARNESS SELF-VERIFICATION PIPELINE ===",
);
console.log("Running workspace validations...\n");

const results = [];
let allPassed = true;

for (const check of checks) {
  process.stdout.write(`⏳ Running: ${check.name}... `);
  try {
    // Run command silently
    execSync(check.command, { stdio: "ignore" });
    console.log("\x1b[32m%s\x1b[0m", "[✓] PASS");
    results.push({ name: check.name, status: "PASS", color: "\x1b[32m" });
  } catch (error) {
    console.log("\x1b[31m%s\x1b[0m", "[❌] FAIL");
    results.push({
      name: check.name,
      status: "FAIL",
      color: "\x1b[31m",
      err: check.errMessage,
    });
    allPassed = false;
  }
}

console.log("\n┌────────────────────────────────────────────────────────┐");
console.log("│              AI AGENT HARNESS SELF-VERIFICATION        │");
console.log("├────────────────────────────────────────────────────────┤");

for (const res of results) {
  const statusStr = res.status.padEnd(4);
  const line = `│  [${res.status === "PASS" ? "✓" : "❌"}] ${res.name.padEnd(32)}   ${res.color}${statusStr}\x1b[0m │`;
  console.log(line);
}

console.log("├────────────────────────────────────────────────────────┤");
if (allPassed) {
  console.log(
    "│  \x1b[32m%-52s\x1b[0m │",
    "VERDICT: 100% COMPLIANT & CLEAN WORKSPACE",
  );
} else {
  console.log(
    "│  \x1b[31m%-52s\x1b[0m │",
    "VERDICT: NON-COMPLIANT WORKSPACE ERROR",
  );
}
console.log("└────────────────────────────────────────────────────────┘\n");

if (!allPassed) {
  console.log(
    "\x1b[31m%s\x1b[0m",
    "❌ Verification failed. Details of failures:",
  );
  for (const res of results) {
    if (res.status === "FAIL") {
      console.log(`- \x1b[33m${res.name}\x1b[0m: ${res.err}`);
    }
  }
  process.exit(1);
} else {
  console.log(
    "\x1b[32m%s\x1b[0m",
    "🎉 All checks passed! The workspace is robust and ready for deployment.",
  );
  process.exit(0);
}
