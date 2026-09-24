/**
 * Search Console の検索語ごとに、どの記事が答えているかを Jev で採点する
 * （scripts/queryCoverage）。**本文は書き換えない。**
 *
 * 出るのは 2 つの表。
 *
 * - 記事が答えていない検索語 … 記事の空き。新しく書くか、近い記事に節を足す候補
 * - 答えている記事はあるが、冒頭に答えが無い検索語 … 冒頭を直す候補
 *
 * 家賃・相場の検索語は記事が答えないのが正しい（額を書かない決まり）ので、
 * 別に数だけ出す。
 *
 * ## 使い方
 *
 *   npx -y tsx scripts/score_query_coverage.ts --queries <クエリ.csv> --dry-run
 *   npx -y tsx scripts/score_query_coverage.ts --queries <クエリ.csv> --mock
 *   OPENROUTER_API_KEY=... npx -y tsx scripts/score_query_coverage.ts --queries <クエリ.csv> --provider openrouter --limit 1
 *
 *   --queries path  Search Console の「クエリ.csv」（必須）
 *   --only a,b      採点する記事（slug）。省くと公開記事すべて
 *   --limit N       API を呼ぶ回数の上限（既定 5）。費用の天井。
 *                   全部で「記事数 × 検索語を QUERIES_PER_CALL ずつに割った数」
 *   --threshold p   「答えている」とみなす下限（既定 0.5）
 *   --out path      全件（記事 × 検索語）を TSV に書く
 *   --provider p    typesafe / openrouter（省くと鍵のある方）
 *
 * ## 読み方
 *
 * 確率は「はい」の確からしさ。Jev は理由を返さないので、空きと出た
 * 検索語は必ず記事を読んで確かめる。**問いの文言を変えたら、前の run の
 * 数字とは比べられない。**
 *
 * 検索語は公開リポジトリの Actions のログに出る。利用者の了承を得て
 * 回している（2026-09-24）。
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
  bestByQuery,
  buildCoverageRequest,
  chunkQueries,
  isRentQuery,
  mockCoverage,
  parseQueriesCsv,
  questionId,
  type CoverageScore,
} from "./queryCoverage";

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
const queriesPath = arg("queries");
if (!queriesPath) {
  console.error("--queries に Search Console の「クエリ.csv」を渡す");
  process.exit(1);
}
const mode: "dry-run" | "mock" | "live" = flag("mock")
  ? "mock"
  : flag("dry-run") || !provider.key
    ? "dry-run"
    : "live";
const limit = Number(arg("limit") ?? 5);
const threshold = Number(arg("threshold") ?? 0.5);
const out = arg("out");
const only = arg("only")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const queries = parseQueriesCsv(fs.readFileSync(queriesPath, "utf-8"));
const posts = getBlogPosts()
  .map((s) => getBlogPost(s.slug))
  .filter((p): p is NonNullable<typeof p> => !!p && !p.draft)
  .filter((p) => !only || only.includes(p.slug));
const chunks = chunkQueries(queries);
const jobs = posts.flatMap((post) => chunks.map((chunk) => ({ post, chunk })));

const tokens = jobs.reduce(
  (n, j) =>
    n + estimateTokens(buildCoverageRequest(j.post, j.chunk, provider.model)),
  0,
);
console.log(
  `検索語 ${queries.length} 件 × 記事 ${posts.length} 本 / API 呼び出し ${Math.min(jobs.length, limit)} 回（全部で ${jobs.length} 回、--limit ${limit}）`,
);
console.log(
  `概算 ${tokens.toLocaleString()} トークン（全部）≒ $${((tokens / 1e6) * PRICE_PER_MTOK_USD).toFixed(3)}`,
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

async function scoreLive(job: (typeof jobs)[number]): Promise<CoverageScore[]> {
  const json = await callJev(
    provider,
    buildCoverageRequest(job.post, job.chunk, provider.model),
  );
  const cost = costOf(json);
  if (cost !== null) spentUsd += cost;
  return job.chunk.map(({ index }) => {
    const answers = parseAnswer(json, questionId(index, "answers"));
    const lead = parseAnswer(json, questionId(index, "lead"));
    if (!answers || !lead) {
      // 0 に倒すと「答えていない」に見える。読めなければ止める
      throw new Error(
        `応答から ${job.post.slug} の q${index} を読めなかった。応答の先頭:\n${JSON.stringify(json).slice(0, 600)}`,
      );
    }
    return {
      slug: job.post.slug,
      index,
      answers: answers.probability,
      lead: lead.probability,
    };
  });
}

const cell = (s: string) => s.replace(/\|/g, "｜");

async function main() {
  if (mode === "dry-run") {
    for (const q of queries.slice(0, 10))
      console.log(`  ${q.query}（表示 ${q.impressions}）`);
    if (queries.length > 10) console.log(`  …ほか ${queries.length - 10} 件`);
    return;
  }
  const run = await runPool(
    jobs.slice(0, limit),
    mode === "live" ? 4 : 1,
    async (job) =>
      mode === "mock"
        ? job.chunk.map(({ index, query }) => ({
            slug: job.post.slug,
            index,
            ...mockCoverage(job.post, query),
          }))
        : scoreLive(job),
    (done, planned) => {
      if (done % 20 === 0) console.log(`  ${done} / ${planned}`);
    },
  );
  if (run.fatal) {
    console.log(
      `\n**途中で止まった: ${run.done} / ${run.planned} 回まで採点。**残りは未採点。` +
        `\n${run.fatal.message}`,
    );
  }
  if (run.planned < jobs.length) {
    console.log(
      `\n**--limit で ${run.planned} / ${jobs.length} 回だけ回した。**` +
        `採点していない記事があるので、「答えていない」は確定ではない。`,
    );
  }
  if (mode === "live")
    console.log(`\n実費（usage.cost の合計）: $${spentUsd.toFixed(6)}`);

  if (out) {
    const lines = [["query", "slug", "answers", "lead"].join("\t")];
    for (const s of run.results) {
      lines.push(
        [
          queries[s.index].query,
          s.slug,
          s.answers.toFixed(3),
          s.lead.toFixed(3),
        ].join("\t"),
      );
    }
    fs.writeFileSync(out, lines.join("\n") + "\n");
    console.log(`\n全 ${run.results.length} 件を ${out} に書いた`);
  }

  const cov = bestByQuery(queries, run.results, threshold).sort(
    (a, b) => b.query.impressions - a.query.impressions,
  );
  const rent = cov.filter((c) => isRentQuery(c.query.query));
  const rest = cov.filter((c) => !isRentQuery(c.query.query));
  const gaps = rest.filter((c) => !c.best || c.best.answers < threshold);
  const buried = rest.filter(
    (c) => c.best && c.best.answers >= threshold && c.best.lead < threshold,
  );
  const fmt = (n: number | undefined) => (n === undefined ? "-" : n.toFixed(2));

  console.log(
    `\n### 記事が答えていない検索語（${gaps.length} 件。答えている下限 ${threshold}）\n`,
  );
  console.log("| 検索語 | 表示 | 順位 | いちばん近い記事 | 答え | 冒頭 |");
  console.log("|---|---:|---:|---|---:|---:|");
  for (const c of gaps) {
    console.log(
      `| ${cell(c.query.query)} | ${c.query.impressions} | ${c.query.position} | ${c.best?.slug ?? "-"} | ${fmt(c.best?.answers)} | ${fmt(c.best?.lead)} |`,
    );
  }

  console.log(
    `\n### 答えている記事はあるが、冒頭に答えが無い検索語（${buried.length} 件）\n`,
  );
  console.log("| 検索語 | 表示 | 順位 | 記事 | 答え | 冒頭 | 答える記事の数 |");
  console.log("|---|---:|---:|---|---:|---:|---:|");
  for (const c of buried) {
    console.log(
      `| ${cell(c.query.query)} | ${c.query.impressions} | ${c.query.position} | ${c.best!.slug} | ${fmt(c.best!.answers)} | ${fmt(c.best!.lead)} | ${c.answering} |`,
    );
  }

  const answered = rest.length - gaps.length - buried.length;
  console.log(
    `\n冒頭まで答えている検索語 ${answered} 件。` +
      `家賃・相場の検索語 ${rent.length} 件（表示 ${rent.reduce((n, c) => n + c.query.impressions, 0)}）は` +
      `県・市区町村の頁が受け持つので上の表から外した` +
      `（うち記事が答えたと出たもの ${rent.filter((c) => c.best && c.best.answers >= threshold).length} 件）。`,
  );
  // 書き出しと表を出し切ってから失敗にする（Summary に途中までが残る）
  if (run.fatal) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
