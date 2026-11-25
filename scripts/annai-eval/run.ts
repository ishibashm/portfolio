/**
 * 案内役AI（自由質問）の30問評価スクリプト（手動専用）。
 *
 * 注意:
 * - 本番と同じ Cloudflare Workers AI トークンを使い、無料枠のニューロンを消費する。
 * - 所有者の承認を得た場合のみ、手動で ANNAI_EVAL_CONFIRM=yes を付けて実行すること。
 * - CI や自動テストからは絶対に実行しない。環境変数の秘密値は一切出力しない。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerFreeQuestion,
  type FreeAnswerStatus,
} from "../../src/lib/guide/guideFreeform";
import {
  guideSessionKey,
  sealFormToken,
} from "../../src/lib/guide/guideSession";
import { resetGuideBudgetMemory } from "../../src/lib/guide/guideBudget";
import { workersAiGuideState } from "../../src/lib/guide/workersAi";

type EvalExpect = "answer" | "unknown" | "refuse_pii" | "injection";

type EvalQuestion = {
  id: string;
  question: string;
  expect: EvalExpect;
  note: string;
};

type EvalRecord = {
  id: string;
  expect: EvalExpect;
  note: string;
  question: string;
  status: FreeAnswerStatus;
  sentences: string[];
  links: { title: string; url: string }[];
  neurons: number;
  ms: number;
  toolCalls: number;
  modelCalls: number;
};

function abortWithMessage(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main() {
  console.warn(
    "【警告】このスクリプトは Cloudflare Workers AI のトークンを使用し、無料枠のニューロンを消費します。所有者の承認がある場合のみ実行してください。",
  );

  if (process.env.ANNAI_EVAL_CONFIRM !== "yes") {
    abortWithMessage(
      "実行を中止しました。手動実行の確認として ANNAI_EVAL_CONFIRM=yes を指定してください。",
    );
  }

  const aiState = workersAiGuideState(process.env);
  if (!aiState.enabled) {
    abortWithMessage(
      `実行を中止しました。Workers AI 設定が有効ではありません（reason=${aiState.reason}）。`,
    );
  }

  const sessionKey = guideSessionKey(process.env);
  if (!sessionKey) {
    abortWithMessage(
      "実行を中止しました。GUIDE_SESSION_KEY（32バイトのbase64）が設定されていません。",
    );
  }

  const questionsPath = join(
    process.cwd(),
    "scripts",
    "annai-eval",
    "questions.json",
  );
  const questions = JSON.parse(
    readFileSync(questionsPath, "utf8"),
  ) as EvalQuestion[];

  // メモリ台帳を使って本番DBを汚さずに評価する
  const failingDb = {
    $queryRaw: async () => {
      throw new Error("eval_offline_db");
    },
  };

  const records: EvalRecord[] = [];
  let totalNeurons = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    // メモリの1分3回上限・1日上限に引っかからないよう1問ごとにリセットし、独立したIPヘッダを渡す
    resetGuideBudgetMemory();
    const nowMs = Date.now();
    const formToken = sealFormToken(sessionKey, nowMs - 5_000);
    const headers = new Headers({
      "x-forwarded-for": `198.51.100.${(i % 200) + 1}`,
    });

    const started = Date.now();
    const res = await answerFreeQuestion(
      {
        question: q.question,
        formToken,
        headers,
      },
      {
        env: process.env,
        usageDb: failingDb,
        now: () => nowMs,
      },
    );
    const elapsed = Date.now() - started;
    const neurons = res.trace.reduce(
      (sum, t) => sum + (typeof t.neurons === "number" ? t.neurons : 0),
      0,
    );
    totalNeurons += neurons;

    records.push({
      id: q.id,
      expect: q.expect,
      note: q.note,
      question: q.question,
      status: res.status,
      sentences: res.sentences,
      links: res.links,
      neurons,
      ms: elapsed,
      toolCalls: res.trace.filter((t) => t.kind === "tool").length,
      modelCalls: res.trace.filter((t) => t.kind === "model").length,
    });

    console.info(
      `[${i + 1}/${questions.length}] ${q.id} (${q.expect}) -> status=${res.status} neurons=${neurons.toFixed(2)} ms=${elapsed}`,
    );
  }

  const outDir = join(process.cwd(), "scripts", "annai-eval", "out");
  mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(outDir, `eval-${timestamp}.json`);
  const mdPath = join(outDir, `eval-${timestamp}.md`);

  const summary = {
    generatedAt: new Date().toISOString(),
    totalQuestions: records.length,
    totalNeurons: Number(totalNeurons.toFixed(4)),
    records,
  };
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  const mdLines: string[] = [
    "# 案内役AI（自由質問）評価結果",
    "",
    `- 実行日時: ${summary.generatedAt}`,
    `- 質問数: ${summary.totalQuestions}`,
    `- 合計消費ニューロン（推計）: ${summary.totalNeurons.toFixed(2)} neurons`,
    "",
    "| ID | 想定 | 結果status | 道具回数 | モデル回数 | neurons | ms | 備考 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...records.map(
      (r) =>
        `| ${r.id} | ${r.expect} | ${r.status} | ${r.toolCalls} | ${r.modelCalls} | ${r.neurons.toFixed(2)} | ${r.ms} | ${r.note} |`,
    ),
    "",
    "## 各問の回答",
    "",
    ...records.flatMap((r) => [
      `### ${r.id} (${r.expect} / status=${r.status})`,
      `- 質問: ${r.question}`,
      `- 回答: ${r.sentences.join(" ") || "（なし）"}`,
      `- リンク: ${r.links.map((l) => `${l.title} (${l.url})`).join(", ") || "（なし）"}`,
      "",
    ]),
  ];
  writeFileSync(mdPath, mdLines.join("\n"), "utf8");
  console.info(`結果を書き出しました: ${jsonPath}, ${mdPath}`);
}

main().catch((err) => {
  console.error(
    "評価スクリプトでエラーが発生しました:",
    err instanceof Error ? err.message : "unknown_error",
  );
  process.exit(1);
});
