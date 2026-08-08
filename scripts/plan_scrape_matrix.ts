/**
 * その日に回す県を決めて、GitHub Actions の matrix として吐く。
 *
 * 以前は matrix に 12 県を直書きしていた。県を増やすと 1 回の実行の実時間が
 * そのまま伸びて、47 県では 26 時間を超えて日次の cron を追い越す。
 * 全県を毎日回すのをやめ、在庫の多い県だけ毎日、少ない県は数日に 1 回にする。
 * どの県をいつ回すかは src/lib/scrapeTargets.ts が持つ。
 *
 * 依存は入れない。plan ジョブは npm ci を挟まずに npx tsx でこれを実行する。
 *
 *   環境変数
 *     PLAN_PREFECTURES   カンマ区切り。指定するとその日の巡回予定を無視して
 *                        この県だけを対象にする（手動実行用）
 *     PLAN_BUDGET_MIN    全県の分数をこの値で上書きする（手動実行用）
 *     PLAN_DATE          基準日 (YYYY-MM-DD)。テストと再現用
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  SCRAPE_MAX_PARALLEL,
  SCRAPE_TARGETS,
  targetsForDate,
  type ScrapeTarget,
} from "../src/lib/scrapeTargets";

export interface MatrixEntry {
  prefecture: string;
  budget: number;
}

export interface Plan {
  entries: MatrixEntry[];
  /** 全ジョブの分数の合計 */
  totalMin: number;
  /** いちばん長いジョブの分数。並列数を上げてもここより速くはならない */
  longestMin: number;
  /** 実時間の見積もり（分） */
  estimatedWallMin: number;
}

/** 1 日は 1440 分。ここを超えると次の cron を追い越す */
const DAY_MIN = 24 * 60;
/** 実時間がこれを超えたら警告する。取り込み後の geocode ぶんの余裕を残す */
const WALL_WARN_MIN = 20 * 60;

export function buildPlan(
  date: Date,
  opts: { only?: string[]; budgetOverrideMin?: number } = {},
): Plan {
  const only = opts.only?.filter(Boolean) ?? [];

  let targets: ScrapeTarget[];
  if (only.length > 0) {
    const bySlug = new Map(SCRAPE_TARGETS.map((t) => [t.slug, t]));
    const unknown = only.filter((s) => !bySlug.has(s));
    if (unknown.length > 0) {
      throw new Error(
        `対象外の県が指定されています: ${unknown.join(", ")}\n` +
          `src/lib/scrapeTargets.ts にある県のみ指定できます。`,
      );
    }
    // 手動指定は巡回予定を無視する。落ちた県をその日のうちに回し直したい、
    // という使い方が本来の用途なので、間引きを適用すると意図に反する。
    targets = only.map((s) => bySlug.get(s)!);
  } else {
    targets = targetsForDate(date);
  }

  const entries = targets.map((t) => ({
    prefecture: t.slug,
    budget: opts.budgetOverrideMin ?? t.budgetMin,
  }));

  const totalMin = entries.reduce((a, e) => a + e.budget, 0);
  const longestMin = entries.reduce((a, e) => Math.max(a, e.budget), 0);
  // max-parallel は同時実行数の上限で、空いた枠から順に次のジョブが入る。
  // 詰め方に無駄が無ければ合計 / 並列数まで縮むが、いちばん長いジョブより
  // 速くはならない。
  const estimatedWallMin = Math.max(
    longestMin,
    Math.ceil(totalMin / SCRAPE_MAX_PARALLEL),
  );

  return { entries, totalMin, longestMin, estimatedWallMin };
}

function main(): void {
  const dateEnv = process.env.PLAN_DATE;
  const date = dateEnv ? new Date(`${dateEnv}T00:00:00Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PLAN_DATE を日付として読めません: ${dateEnv}`);
  }

  const only = (process.env.PLAN_PREFECTURES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const budgetRaw = parseInt(process.env.PLAN_BUDGET_MIN || "", 10);
  const budgetOverrideMin =
    Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : undefined;

  const plan = buildPlan(date, { only, budgetOverrideMin });

  console.log(`基準日 (UTC): ${date.toISOString().slice(0, 10)}`);
  console.log(`対象: ${plan.entries.length} 県 / 並列 ${SCRAPE_MAX_PARALLEL}`);
  for (const e of plan.entries) {
    console.log(
      `  ${e.prefecture.padEnd(10)} ${String(e.budget).padStart(4)} 分`,
    );
  }
  console.log(`合計 ${plan.totalMin} 分、最長 ${plan.longestMin} 分`);
  console.log(
    `実時間の見積もり およそ ${(plan.estimatedWallMin / 60).toFixed(1)} 時間`,
  );

  if (plan.estimatedWallMin >= DAY_MIN) {
    // 追い越すと concurrency で待たされ、実質その日の巡回が飛ぶ。
    throw new Error(
      `実時間の見積もり ${plan.estimatedWallMin} 分が 24 時間を超えます。` +
        `budgetMin を下げるか everyNDays を延ばすか、SCRAPE_MAX_PARALLEL を` +
        `上げてください。並列数を上げると相手サーバーへの負荷が比例して増えます。`,
    );
  }
  if (plan.estimatedWallMin >= WALL_WARN_MIN) {
    console.warn(
      `::warning::実時間の見積もりが ${(plan.estimatedWallMin / 60).toFixed(1)} 時間です。` +
        `geocode の時間を足すと日次の枠に収まらなくなる恐れがあります。`,
    );
  }

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    const matrix = JSON.stringify({ include: plan.entries });
    appendFileSync(out, `matrix=${matrix}\n`);
    appendFileSync(out, `count=${plan.entries.length}\n`);
    // 並列数もここから渡す。ワークフロー側に数字を書くと、負荷に直結する値が
    // レジストリと二重管理になる。
    appendFileSync(out, `max_parallel=${SCRAPE_MAX_PARALLEL}\n`);
  }
}

// テストは buildPlan だけを import する。直接実行されたときだけ走らせる。
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
