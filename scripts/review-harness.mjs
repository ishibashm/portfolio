import fs from "fs/promises";
import path from "path";

// AI Agent Harness Diagnostics Tool (Simulating "/review-harness")
// このツールはプロジェクト内のハーネス構成（ルール、コンテキスト、CI/CD、テスト、型定義など）を診断します。

const PROJECT_ROOT = process.cwd();

// 診断のスコア計算用
let score = 0;
const MAX_SCORE = 100;
const results = [];

function check(condition, points, successMsg, failMsg) {
  if (condition) {
    score += points;
    results.push({ status: "✅", msg: successMsg, points });
  } else {
    results.push({ status: "❌", msg: failMsg, points: 0 });
  }
}

async function fileExists(filename) {
  try {
    await fs.access(path.join(PROJECT_ROOT, filename));
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(filename) {
  try {
    return await fs.readFile(path.join(PROJECT_ROOT, filename), "utf8");
  } catch {
    return null;
  }
}

async function runDiagnostics() {
  console.log("🔍 [Agent Harness Review] 診断を開始します...\n");

  // 1. ルール層: CLAUDE.md / .clinerules / .roomd の存在
  const hasClaudeMd = await fileExists("CLAUDE.md");
  const hasClineRules = await fileExists(".clinerules");
  const hasRoomd = await fileExists(".roomd");
  const hasRuleLayer = hasClaudeMd || hasClineRules || hasRoomd;
  check(
    hasRuleLayer,
    15,
    "ルール層 (CLAUDE.md 等) が定義されています。",
    "ルール層が見つかりません。エージェントの行動が不安定になる可能性があります。",
  );

  if (hasClaudeMd) {
    const content = await readFileSafe("CLAUDE.md");
    const hasConstraints =
      content &&
      (content.includes("Constraint") ||
        content.includes("制約") ||
        content.includes("Never"));
    check(
      hasConstraints,
      5,
      "CLAUDE.md に明確な制約（Constraints）が記述されています。",
      "CLAUDE.md に明確な制約が見当たりません。安全な運用のため追記を推奨します。",
    );
  } else {
    check(false, 5, "", "CLAUDE.md がないため制約チェックをスキップしました。");
  }

  // 2. コンテキスト層: MEMORY.md の存在
  const hasMemoryMd = await fileExists("MEMORY.md");
  check(
    hasMemoryMd,
    15,
    "コンテキスト層 (MEMORY.md) が定義されています。状態の引継ぎが可能です。",
    "MEMORY.md が見つかりません。セッション間で文脈が失われる可能性があります。",
  );

  // 3. package.json の解析
  const pkgJsonRaw = await readFileSafe("package.json");
  let pkg = {};
  if (pkgJsonRaw) {
    try {
      pkg = JSON.parse(pkgJsonRaw);
    } catch {
      console.warn("⚠️ package.json のパースに失敗しました。");
    }
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasLinter = !!deps["eslint"];
  const hasFormatter = !!deps["prettier"];
  const hasTesting = !!deps["jest"] || !!deps["vitest"];
  const hasTypeScript = !!deps["typescript"];

  check(
    hasLinter,
    10,
    "Linter (ESLint) が設定されています。フィードバックループが早期化されます。",
    "Linter が見つかりません。エージェントが静的エラーに気付きにくくなります。",
  );
  check(
    hasFormatter,
    5,
    "Formatter (Prettier) が設定されています。",
    "Formatter が見つかりません。コードスタイルのブレが発生する可能性があります。",
  );
  check(
    hasTesting,
    15,
    "テストフレームワークが設定されています。品質検証フックとして機能します。",
    "テストフレームワークが見つかりません。「完了しました」の客観的検証が難しくなります。",
  );
  check(
    hasTypeScript,
    10,
    "TypeScriptが導入されています。型による強力なガードレールが機能します。",
    "TypeScriptが見つかりません。型の恩恵を受けられません。",
  );

  // 4. tsconfig.json の厳格さ
  const tsconfigRaw = await readFileSafe("tsconfig.json");
  if (tsconfigRaw) {
    const hasStrict = tsconfigRaw.includes('"strict": true');
    check(
      hasStrict,
      10,
      "tsconfig で strict モードが有効です。",
      "tsconfig で strict モードが無効、または明記されていません。",
    );
  } else {
    check(false, 10, "", "tsconfig.json が見つかりません。");
  }

  // 5. CI/CD フック層の存在
  const hasGithubActions = await fileExists(".github/workflows");
  check(
    hasGithubActions,
    10,
    "CI/CD (GitHub Actions等) の設定があります。継続的インテグレーションが保護されています。",
    "CI/CDの設定が見つかりません。破壊的変更が本番に流れるリスクがあります。",
  );

  // 6. エージェント環境のカスタム設定 (.roomodes 等)
  const hasRoomodes = await fileExists(".roomodes");
  const hasClinerules = await fileExists(".clinerules");
  const hasAgentConfig = hasRoomodes || hasClinerules;
  check(
    hasAgentConfig,
    5,
    "エージェントのカスタム設定ファイル (.roomodes 等) が定義され、動作が最適化されています。",
    "エージェントのカスタム設定ファイルが見つかりません。",
  );

  // 結果の集計
  console.log("--- 診断結果 ---");
  results.forEach((r) => {
    console.log(`${r.status} [${r.points}pt] ${r.msg}`);
  });

  console.log("\n--- 総合評価 ---");
  console.log(`Score: ${score} / ${MAX_SCORE}`);

  let grade = "E";
  if (score >= 90) grade = "S";
  else if (score >= 80) grade = "A";
  else if (score >= 60) grade = "B";
  else if (score >= 40) grade = "C";
  else if (score >= 20) grade = "D";

  console.log(`Grade: ${grade}`);

  if (grade === "S" || grade === "A") {
    console.log(
      "\n✨ 素晴らしい！ 堅牢なエージェント・ハーネスが構築されています。セッションが長引いても安定した品質が期待できます。",
    );
  } else if (grade === "B" || grade === "C") {
    console.log(
      "\n💡 基本的なハーネスは存在しますが、さらなる自動化（テストやCI）を導入することで、エージェントの「なぜか微妙」現象を減らせます。",
    );
  } else {
    console.log(
      "\n⚠️ ハーネス構成が不足しています。CLAUDE.mdの整備や、テスト・Lintなどの自動フィードバックループを構築してください。",
    );
  }
}

runDiagnostics().catch(console.error);
