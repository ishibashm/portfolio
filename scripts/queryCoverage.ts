/**
 * Search Console の検索語ごとに、**どの記事が答えているか**を Jev
 * （TypeSafe System One）で採点する部品。CLI は score_query_coverage.ts、
 * 見張りは __tests__/queryCoverage.test.ts。
 *
 * 利用者が共有した「Jev を広告運用に使う」手順（2026-09-24）のうち、
 * **検索語の意図の分類**と**広告と LP のズレ**を SEO に置き換えたもの。
 * 検索語が広告の検索語、記事が LP に当たる。
 *
 * - どの記事も答えていない検索語 … 記事の空き（新しく書く候補）
 * - 答えている記事はあるが、冒頭に答えが無い … 来た人がすぐ戻る候補
 *
 * 1 記事 = state。検索語 1 つにつき問いを 2 つ（答えているか／冒頭で
 * 答えているか）。1 回の呼び出しに載せる検索語は `QUERIES_PER_CALL` まで。
 *
 * ここには I/O を置かない（ファイルも fetch も無し）。
 */
import type { PostLike } from "./linkCandidates";
import { alignmentState, leadOf } from "./titleAlignment";

export interface SearchQuery {
  /** Search Console の書き出しのまま（語の間の空白も残す）。 */
  query: string;
  clicks: number;
  impressions: number;
  /** 平均掲載順位。 */
  position: number;
}

/**
 * 1 回の呼び出しに載せる検索語の数。問いは 2 倍になる。
 * 内部リンクの採点は 1 回に 35 前後の問いで答えが返っていた
 * （2026-09-19）。それを超えない。
 */
export const QUERIES_PER_CALL = 16;

/** 問いの種類。Jev の答えは `q<番号>_<種類>` の名前で返る。 */
export const COVERAGE_KINDS = ["answers", "lead"] as const;
export type CoverageKind = (typeof COVERAGE_KINDS)[number];

export function questionId(index: number, kind: CoverageKind): string {
  return `q${index}_${kind}`;
}

/** CSV の 1 行を割る。引用符で囲んだ欄（中に `,` や `""` を含む）も読む。 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Search Console の「クエリ.csv」（上位のクエリ,クリック数,表示回数,CTR,
 * 掲載順位）を読む。**列は見出しの名前で引く**（並びが変わっても
 * 黙って別の列を読まない）。見出しが無ければ例外。
 */
export function parseQueriesCsv(text: string): SearchQuery[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  const col = (names: string[]) => {
    const i = head.findIndex((h) => names.includes(h));
    if (i < 0) {
      throw new Error(
        `見出しに ${names.join(" / ")} が無い: ${head.join(",")}`,
      );
    }
    return i;
  };
  const q = col(["上位のクエリ", "Top queries"]);
  const c = col(["クリック数", "Clicks"]);
  const imp = col(["表示回数", "Impressions"]);
  const pos = col(["掲載順位", "Position"]);
  return lines.slice(1).map((line) => {
    const f = splitCsvLine(line);
    return {
      query: f[q].trim(),
      clicks: Number(f[c]),
      impressions: Number(f[imp]),
      position: Number(f[pos]),
    };
  });
}

/**
 * 家賃・相場を聞く検索語。記事は相場の額を書かない決まり（CLAUDE.md
 * 2-b）なので、記事が答えていないのが正しい。受け持つのは県・市区町村の
 * 頁。表では分けて出す（記事の空きと混ぜない）。
 */
export function isRentQuery(query: string): boolean {
  return /家賃|相場|賃貸|物件/.test(query);
}

/** 検索語を `QUERIES_PER_CALL` ずつに分ける。番号は通しで持つ。 */
export function chunkQueries(
  queries: readonly SearchQuery[],
  size = QUERIES_PER_CALL,
): { index: number; query: SearchQuery }[][] {
  const out: { index: number; query: SearchQuery }[][] = [];
  for (let i = 0; i < queries.length; i += size) {
    out.push(
      queries.slice(i, i + size).map((query, j) => ({ index: i + j, query })),
    );
  }
  return out;
}

export interface CoverageRequest {
  model: string;
  state: string;
  questions: Record<string, { type: "noul"; instructions: string }>;
}

/**
 * 記事を state、検索語を問いにする。state は題・説明文のあとに
 * 冒頭と本文の全体（`alignmentState`。冒頭の切り方は題のズレの採点と
 * 同じにする）。
 */
export function buildCoverageRequest(
  post: Pick<PostLike, "title" | "description" | "body">,
  chunk: readonly { index: number; query: SearchQuery }[],
  model: string,
): CoverageRequest {
  const questions: CoverageRequest["questions"] = {};
  for (const { index, query } of chunk) {
    questions[questionId(index, "answers")] = {
      type: "noul",
      instructions:
        `state は記事です。検索語「${query.query}」で調べた人が知りたいことに、` +
        `この記事は答えていますか。検索語の語が出てくるだけで答えが書かれていない場合、` +
        `または記事が検索語と別の問いに答えている場合は「いいえ」。`,
    };
    questions[questionId(index, "lead")] = {
      type: "noul",
      instructions:
        `state の【冒頭（最初の節）】だけを見てください。` +
        `検索語「${query.query}」で調べた人が知りたいことへの答えが、この冒頭に書かれていますか。` +
        `答えが【本文の全体】の後半にしか無い場合、または記事が答えていない場合は「いいえ」。`,
    };
  }
  return {
    model,
    state: `【題】${post.title}\n【説明文】${post.description}\n\n${alignmentState(post.body)}`,
    questions,
  };
}

export interface CoverageScore {
  slug: string;
  index: number;
  answers: number;
  lead: number;
}

export interface QueryCoverage {
  query: SearchQuery;
  /** answers が最も高い記事。採点が 1 件も無ければ null。 */
  best: CoverageScore | null;
  /** answers が threshold 以上の記事の数。 */
  answering: number;
}

/**
 * 検索語ごとに、answers が最も高い記事を選ぶ。同点は先に来たもの。
 * 採点の無い検索語も落とさず、best を null にして返す（黙って消さない）。
 */
export function bestByQuery(
  queries: readonly SearchQuery[],
  scores: readonly CoverageScore[],
  threshold: number,
): QueryCoverage[] {
  return queries.map((query, index) => {
    const mine = scores.filter((s) => s.index === index);
    const best = mine.reduce<CoverageScore | null>(
      (b, s) => (b === null || s.answers > b.answers ? s : b),
      null,
    );
    return {
      query,
      best,
      answering: mine.filter((s) => s.answers >= threshold).length,
    };
  });
}

/**
 * 鍵が無いときの偽の採点。**決定的**で、通しの確認にだけ使う。
 * 検索語の空白を外した語が本文・冒頭に出ていれば高い、というだけの目安。
 */
export function mockCoverage(
  post: Pick<PostLike, "title" | "body">,
  query: SearchQuery,
): { answers: number; lead: number } {
  const words = query.query.split(/\s+/).filter(Boolean);
  const joined = words.join("");
  const hit = (where: string) => {
    if (where.includes(joined)) return 0.9;
    const n = words.filter((w) => where.includes(w)).length;
    return Number((0.1 + 0.6 * (n / Math.max(1, words.length))).toFixed(3));
  };
  return {
    answers: hit(`${post.title}\n${post.body}`),
    lead: hit(leadOf(post.body)),
  };
}
