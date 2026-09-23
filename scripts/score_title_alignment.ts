/**
 * 記事の題・説明文と本文のズレを Jev で採点する（scripts/titleAlignment）。
 *
 * 広告運用でいう「広告と LP のズレ」を記事に当てる。検索結果に出る題と
 * 説明文が約束していることに、本文が答えているか。**本文は書き換えない。**
 * 低い記事を人が読んで、題・説明文・冒頭のどれを直すかを決める。
 *
 * ## 使い方
 *
 *   npx -y tsx scripts/score_title_alignment.ts --dry-run   # 本数と概算だけ。鍵不要
 *   npx -y tsx scripts/score_title_alignment.ts --mock      # 偽の採点で通しを確かめる
 *   OPENROUTER_API_KEY=... npx -y tsx scripts/score_title_alignment.ts --provider openrouter --limit 1
 *
 *   --only a,b     採点する記事（slug）。省くと公開記事すべて
 *   --limit N      API を呼ぶ記事数の上限（既定 5）。費用の天井
 *   --threshold p  表に出す下限（3 つのうち最低の値がこれ未満の記事を出す。既定 1 = 全部）
 *   --out path     全件を TSV に書く
 *   --provider p   typesafe / openrouter（省くと鍵のある方）
 *
 * ## 費用
 *
 * 本文は最長 7,151 字（2026-09-24 実測）。34 本で約 21 万字 ≒ 32 万
 * トークン ≒ $0.013。
 *
 * ## 読み方
 *
 * 確率は「はい」の確からしさ。**低いほどズレている。**ただし Jev は理由を
 * 返さないので、低い記事は必ず本文を読んで、どこがズレているかを人が
 * 確かめる。問いの文言を変えたら前の run とは比べられない。
 */
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import { getBlogPost, getBlogPosts } from "../src/lib/blog";
import {
  PRICE_PER_MTOK_USD,
  callJev,
  resolveProvider,
  runPool,
} from "./jevClient";
import { costOf, estimateTokens, parseAnswer } from "./linkCandidates";
import {
  ALIGNMENT_QUESTIONS,
  buildAlignmentRequest,
  mockAlignment,
  toScore,
  type AlignmentQuestion,
  type AlignmentScore,
} from "./titleAlignment";

dotenv.config();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

let provider: ReturnType<typeof resolveProvider>;
try {
  provider = resolveProvider(arg("provider"));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
const mode: "dry-run" | "mock" | "live" = flag("mock")
  ? "mock"
  : flag("dry-run") || !provider.key
    ? "dry-run"
    : "live";
const limit = Number(arg("limit") ?? 5);
const threshold = Number(arg("threshold") ?? 1);
const out = arg("out");
const only = arg("only")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const posts = getBlogPosts()
  .map((s) => getBlogPost(s.slug))
  .filter((p): p is NonNullable<typeof p> => !!p && !p.draft)
  .filter((p) => !only || only.includes(p.slug));

const tokens = posts.reduce(
  (n, p) => n + estimateTokens(buildAlignmentRequest(p, provider.model)),
  0,
);
console.log(
  `記事 ${posts.length} 本 / API 呼び出し ${Math.min(posts.length, limit)} 回（--limit ${limit}）`,
);
console.log(
  `概算 ${tokens.toLocaleString()} トークン（全記事）≒ $${((tokens / 1e6) * PRICE_PER_MTOK_USD).toFixed(3)}`,
);
console.log(
  `モード: ${mode}` +
    (mode === "live"
      ? `（${provider.name}: ${provider.endpoint} / ${provider.model}）`
      : mode === "dry-run" && !provider.key
        ? "（TYPESAFE_API_KEY も OPENROUTER_API_KEY も無い）"
        : ""),
);

let spentUsd = 0;

async function scoreLive(p: (typeof posts)[number]): Promise<AlignmentScore[]> {
  const json = await callJev(
    provider,
    buildAlignmentRequest(p, provider.model),
  );
  const cost = costOf(json);
  if (cost !== null) spentUsd += cost;
  const scores = {} as Record<AlignmentQuestion, number>;
  for (const q of ALIGNMENT_QUESTIONS) {
    const a = parseAnswer(json, q);
    if (!a) {
      // 0 に倒すと「ズレている」に見える。読めなければ止める
      throw new Error(
        `応答から ${p.slug} の ${q} を読めなかった。応答の先頭:\n${JSON.stringify(json).slice(0, 600)}`,
      );
    }
    scores[q] = a.probability;
  }
  return [toScore(p, scores)];
}

const LABEL: Record<AlignmentQuestion, string> = {
  title_answered: "題",
  description_supported: "説明文",
  answer_first: "冒頭",
};

async function main() {
  if (mode === "dry-run") {
    for (const p of posts.slice(0, 10)) console.log(`  ${p.slug}  ${p.title}`);
    if (posts.length > 10) console.log(`  …ほか ${posts.length - 10} 本`);
    return;
  }
  const run = await runPool(
    posts.slice(0, limit),
    mode === "live" ? 4 : 1,
    async (p) =>
      mode === "mock" ? [toScore(p, mockAlignment(p))] : scoreLive(p),
    (done, planned) => {
      if (done % 10 === 0) console.log(`  ${done} / ${planned}`);
    },
  );
  if (run.fatal) {
    console.log(
      `\n**途中で止まった: ${run.done} / ${run.planned} 本まで採点。**残りは未採点。` +
        `\n${run.fatal.message}`,
    );
  }
  if (mode === "live")
    console.log(`\n実費（usage.cost の合計）: $${spentUsd.toFixed(6)}`);

  const rows = [...run.results].sort((a, b) => a.min - b.min);
  if (out) {
    const lines = [
      ["slug", ...ALIGNMENT_QUESTIONS, "min", "title", "description"].join(
        "\t",
      ),
    ];
    for (const r of rows) {
      lines.push(
        [
          r.slug,
          ...ALIGNMENT_QUESTIONS.map((q) => r.scores[q].toFixed(3)),
          r.min.toFixed(3),
          r.title.replace(/\t/g, " "),
          r.description.replace(/\t/g, " "),
        ].join("\t"),
      );
    }
    fs.writeFileSync(out, lines.join("\n") + "\n");
    console.log(`\n全 ${rows.length} 本を ${out} に書いた`);
  }
  const shown = rows.filter((r) => r.min < threshold);
  console.log(
    `\n低い順（最低値が ${threshold} 未満の ${shown.length} 本）。低いほどズレている。理由は返らないので本文を読んで確かめる\n`,
  );
  console.log(
    `| 記事 | ${ALIGNMENT_QUESTIONS.map((q) => LABEL[q]).join(" | ")} | 題 |`,
  );
  console.log(`|---|${ALIGNMENT_QUESTIONS.map(() => "---:").join("|")}|---|`);
  for (const r of shown) {
    console.log(
      `| ${r.slug} | ${ALIGNMENT_QUESTIONS.map((q) => r.scores[q].toFixed(2)).join(" | ")} | ${r.title} |`,
    );
  }
  // 書き出しと表を出し切ってから失敗にする（Summary に途中までが残る）
  if (run.fatal) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
