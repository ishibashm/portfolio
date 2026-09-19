/**
 * 記事どうしの内部リンク候補を Jev（TypeSafe System One）で採点する。
 *
 * 利用者が共有した内部リンクの手順の第 5 手（支援記事どうしを繋ぐ）を
 * 自動化する。#1417 では 34 本の本文を人が読んで 13 本張った。ここは
 * その「読んで候補を探す」工程を機械に回し、**張るかどうかは人が決める**。
 * 本文は書き換えない。
 *
 * ## 使い方
 *
 *   npx -y tsx scripts/score_link_candidates.ts --dry-run          # 組と概算だけ。鍵不要
 *   npx -y tsx scripts/score_link_candidates.ts --mock             # 偽の採点で通しを確かめる。鍵不要
 *   TYPESAFE_API_KEY=... npx -y tsx scripts/score_link_candidates.ts --limit 50 --out /tmp/links.tsv
 *
 *   --source a,b   採点する元の記事（slug）。省くと全記事
 *   --dest a,b     宛先を絞る（新しい記事へ張る先を探すときはこれ）
 *   --all-pairs    タグ・カテゴリの共有で絞らない
 *   --limit N      API を呼ぶ段落数の上限（既定 200）。費用の天井
 *   --top N        表に出す件数（既定 30）
 *   --out path     全件を TSV に書く
 *   --threshold p  表に出す確率の下限（既定 0.6）
 *   --provider p   typesafe / openrouter（省くと鍵のある方。両方なら typesafe）
 *
 * ## 鍵（2 つの入口）
 *
 *   OPENROUTER_API_KEY … OpenRouter の Decisions API 経由（待ち行列なし）。
 *                        POST https://openrouter.ai/api/alpha/decisions、
 *                        model は typesafe/jev-1.13。本文の形は TypeSafe 直と同じ
 *   TYPESAFE_API_KEY   … TypeSafe 直（POST /v1/systemone、model jev-latest）
 *
 * 両方あれば TypeSafe 直を使う（--provider openrouter で切り替え）。
 * どちらも無ければ --dry-run と同じ動きになり、**外へは何も送らない**。
 * 鍵はコードに書かない（ANTHROPIC_API_KEY と同じ）。
 *
 * OpenRouter の chat/completions は Jev を受け付けない（decisions model と
 * して弾かれる）。必ず decisions の口を使う。
 *
 * ## 費用
 *
 * 入力 100 万トークンあたり $0.042（2026-09 の公表値）。全記事 × 関連の
 * 宛先で数百回、合計で数百万トークン → 数十円の桁。--limit が天井。
 *
 * ## 応答の項目名
 *
 * 公式の仕様書をこの環境から読めていない（proxy）。linkCandidates.parseAnswer
 * が項目名の揺れを吸収し、読めなければ **その場で止める**（0 点にして
 * 続けると「候補なし」に見える）。最初の 1 回は --limit 1 で応答を目で見ること。
 */
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import { getBlogPost, getBlogPosts } from "../src/lib/blog";
import {
  buildRequest,
  candidatePairs,
  costOf,
  estimateTokens,
  mockScore,
  parseAnswer,
  type PostLike,
  type Scored,
} from "./linkCandidates";

dotenv.config();

const PRICE_PER_MTOK_USD = 0.042;

/** どの口から Jev を呼ぶか。本文の形は同じで、URL・モデル名・鍵が違う。 */
const PROVIDERS = {
  typesafe: {
    endpoint: `${process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai"}/v1/systemone`,
    model: "jev-latest",
    key: process.env.TYPESAFE_API_KEY,
  },
  openrouter: {
    endpoint: `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api"}/alpha/decisions`,
    model: "typesafe/jev-1.13",
    key: process.env.OPENROUTER_API_KEY,
  },
} as const;
type ProviderName = keyof typeof PROVIDERS;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const list = (v: string | undefined) =>
  v
    ? new Set(
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : undefined;

const wanted = arg("provider") as ProviderName | undefined;
if (wanted && !(wanted in PROVIDERS)) {
  console.error(`--provider は typesafe か openrouter（${wanted} は不明）`);
  process.exit(1);
}
const providerName: ProviderName =
  wanted ?? (PROVIDERS.typesafe.key ? "typesafe" : "openrouter");
const provider = PROVIDERS[providerName];
const apiKey = provider.key;
const mode: "dry-run" | "mock" | "live" = flag("mock")
  ? "mock"
  : flag("dry-run") || !apiKey
    ? "dry-run"
    : "live";
const limit = Number(arg("limit") ?? 200);
const top = Number(arg("top") ?? 30);
const threshold = Number(arg("threshold") ?? 0.6);
const out = arg("out");

const posts: PostLike[] = getBlogPosts()
  .map((s) => getBlogPost(s.slug))
  .filter((p): p is NonNullable<typeof p> => !!p && !p.draft)
  .map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    tags: p.tags,
    body: p.body,
  }));
const bySlug = new Map(posts.map((p) => [p.slug, p]));

const pairs = candidatePairs(posts, {
  allPairs: flag("all-pairs"),
  sources: list(arg("source")),
  dests: list(arg("dest")),
});

// 段落ごとにまとめる（1 段落 = API 1 回。宛先は問いとして束ねる）
const byParagraph = new Map<
  string,
  { source: PostLike; paragraph: Scored["paragraph"]; dests: PostLike[] }
>();
for (const c of pairs) {
  const key = `${c.source}#${c.paragraph.index}`;
  const cur = byParagraph.get(key) ?? {
    source: bySlug.get(c.source)!,
    paragraph: c.paragraph,
    dests: [],
  };
  cur.dests.push(bySlug.get(c.dest)!);
  byParagraph.set(key, cur);
}
const calls = [...byParagraph.values()];
const tokens = calls.reduce(
  (n, c) =>
    n +
    estimateTokens(
      buildRequest(c.source, c.paragraph, c.dests, provider.model),
    ),
  0,
);

console.log(
  `記事 ${posts.length} 本 / 候補の組 ${pairs.length} / API 呼び出し ${calls.length} 回（--limit ${limit}）`,
);
console.log(
  `概算 ${tokens.toLocaleString()} トークン ≒ $${((tokens / 1e6) * PRICE_PER_MTOK_USD).toFixed(3)}`,
);
console.log(
  `モード: ${mode}` +
    (mode === "live"
      ? `（${providerName}: ${provider.endpoint} / ${provider.model}）`
      : mode === "dry-run" && !apiKey
        ? "（TYPESAFE_API_KEY も OPENROUTER_API_KEY も無い）"
        : ""),
);

/** 応答の usage.cost の合計（USD）。概算ではなく実費。 */
let spentUsd = 0;

async function scoreLive(c: (typeof calls)[number]): Promise<Scored[]> {
  const req = buildRequest(c.source, c.paragraph, c.dests, provider.model);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey!,
      },
      body: JSON.stringify(req),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const json: unknown = await res.json();
    const cost = costOf(json);
    if (cost !== null) spentUsd += cost;
    return c.dests.map((d) => {
      const a = parseAnswer(json, d.slug);
      if (!a) {
        throw new Error(
          `応答から ${d.slug} の確率を読めなかった。応答の先頭:\n${JSON.stringify(json).slice(0, 600)}`,
        );
      }
      return {
        source: c.source.slug,
        paragraph: c.paragraph,
        dest: d.slug,
        ...a,
      };
    });
  }
  throw new Error("Jev が 429/5xx を返し続けた");
}

async function main() {
  const scored: Scored[] = [];
  if (mode === "dry-run") {
    for (const c of calls.slice(0, 10)) {
      console.log(
        `\n[${c.source.slug} #${c.paragraph.index}] ${c.paragraph.text.slice(0, 60)}…`,
      );
      console.log(
        `  宛先 ${c.dests.length} 件: ${c.dests.map((d) => d.slug).join(", ")}`,
      );
    }
    if (calls.length > 10) console.log(`\n…ほか ${calls.length - 10} 段落`);
    return;
  }
  const targets = calls.slice(0, limit);
  const planned = targets.length;
  let done = 0;
  /**
   * **途中で落ちても、採点済みは捨てない。**
   *
   * run #4（2026-09-19。全宛先 897 段落）は 700 段落まで採点したところで
   * OpenRouter が 402（残高切れ）を返し、例外がそのまま main を抜けて
   * TSV も表も出なかった。約 $0.2 ぶんの答えが全部消えた。
   *
   * 1 本の worker が致命的な誤りを受けたら、他の worker も次の段落を
   * 取らずに止まり、そこまでの結果を書き出してから失敗で終える
   * （終了コードは 1 のまま。緑にはしない）。
   */
  // 閉包の中で代入するので、tsc の絞り込みが効かない形（入れ物）で持つ
  const halt: { fatal: Error | null } = { fatal: null };
  const worker = async () => {
    while (targets.length && !halt.fatal) {
      const c = targets.shift()!;
      if (mode === "mock") {
        for (const d of c.dests) {
          scored.push({
            source: c.source.slug,
            paragraph: c.paragraph,
            dest: d.slug,
            probability: mockScore(c.paragraph, c.source, d),
            confidence: null,
          });
        }
      } else {
        try {
          scored.push(...(await scoreLive(c)));
        } catch (e) {
          halt.fatal ??= e instanceof Error ? e : new Error(String(e));
          return;
        }
      }
      done++;
      if (done % 20 === 0) console.log(`  ${done} / ${planned}`);
    }
  };
  await Promise.all(Array.from({ length: mode === "live" ? 4 : 1 }, worker));

  if (halt.fatal) {
    console.log(
      `\n**途中で止まった: ${done} / ${planned} 段落まで採点。**残りは未採点（候補なしではない）。` +
        `\n${halt.fatal.message}`,
    );
  }
  if (mode === "live")
    console.log(`\n実費（usage.cost の合計）: $${spentUsd.toFixed(6)}`);
  scored.sort((a, b) => b.probability - a.probability);
  if (out) {
    const lines = ["source\tparagraph\tdest\tprobability\tconfidence\texcerpt"];
    for (const s of scored) {
      lines.push(
        [
          s.source,
          s.paragraph.index,
          s.dest,
          s.probability.toFixed(3),
          s.confidence ?? "",
          s.paragraph.text.slice(0, 80).replace(/\t/g, " "),
        ].join("\t"),
      );
    }
    fs.writeFileSync(out, lines.join("\n") + "\n");
    console.log(`\n全 ${scored.length} 件を ${out} に書いた`);
  }
  const shown = scored.filter((s) => s.probability >= threshold).slice(0, top);
  console.log(
    `\n確率 ${threshold} 以上の上位 ${shown.length} 件（人が見て張るかを決める）\n`,
  );
  console.log("| 元の記事 | 段落 | 宛先 | 確率 | 段落の冒頭 |");
  console.log("|---|---:|---|---:|---|");
  for (const s of shown) {
    console.log(
      `| ${s.source} | ${s.paragraph.index} | ${s.dest} | ${s.probability.toFixed(2)} | ${s.paragraph.text.slice(0, 40)}… |`,
    );
  }
  // 書き出しと表を出し切ってから失敗にする（Summary に途中までが残る）
  if (halt.fatal) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
