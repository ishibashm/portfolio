import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";

/**
 * 頁どうしの文章が似すぎていないこと。
 *
 * #379 で 1,022 頁が索引から外れた原因は「地の文はどの URL でも同一、
 * 変わるのは地名と表の数字だけ」だった。1 頁ずつ手で書いていても、
 * **同じ状況の県が続くと第 2 段落が定型化する**。実際に岡山・熊本・
 * 宮城・鹿児島の 4 県は「掲載が◯◯市だけです」「方位で県内を選び分ける
 * 読み方はまだできません」がほぼ同文で、3 組が 0.49〜0.56 まで似ていた
 * （2026-08-31 に実測。県の地形と、まだ表に無い市の名前を足して外した）。
 *
 * 人の目では気付けないので、機械で見張る。文字 3-gram の Jaccard 係数で
 * 測り、**上限を実測より少し上に置く**。新しい頁が定型に寄ったら落ちる。
 */

/** 句読点と空白を落とした文字 3-gram。日本語は分かち書きが要らない。 */
function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  const body = text.replace(/[。、\s]/g, "");
  for (let i = 0; i + 3 <= body.length; i++) out.add(body.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function worstPair(table: Record<string, { intro: string[] }>) {
  const grams = Object.entries(table).map(
    ([code, e]) => [code, trigrams(e.intro.join(""))] as const,
  );
  let worst = { a: "", b: "", score: 0 };
  for (let i = 0; i < grams.length; i++) {
    for (let j = i + 1; j < grams.length; j++) {
      const score = jaccard(grams[i][1], grams[j][1]);
      if (score > worst.score)
        worst = { a: grams[i][0], b: grams[j][0], score };
    }
  }
  return worst;
}

/**
 * 上限。実測の最大は市区町村 0.38（静岡市の駿河区と清水区。同じ市で
 * 駿河湾に向く方位が同じなので、ここは似ていて当然）、県 0.36。
 * **下げるより、超えたときに中身を見る**ための線。
 */
const MAX_SIMILARITY = 0.45;

describe("頁ごとの文章が似すぎていない", () => {
  it("市区町村ページ", () => {
    const worst = worstPair(AREA_EDITORIAL);
    expect(
      worst.score,
      `${worst.a} と ${worst.b} が ${worst.score.toFixed(3)} まで似ている`,
    ).toBeLessThan(MAX_SIMILARITY);
  });

  it("県ページ", () => {
    const worst = worstPair(PREF_EDITORIAL);
    expect(
      worst.score,
      `${worst.a} と ${worst.b} が ${worst.score.toFixed(3)} まで似ている`,
    ).toBeLessThan(MAX_SIMILARITY);
  });

  it("測り方そのものが空回りしていない", () => {
    /* 同じ文なら 1、まったく違う文なら小さい値になることを確かめる。
       ここが壊れていると、何を並べても 0 のまま緑になる */
    const a = trigrams("南には市区町村が 1 つもありません");
    expect(jaccard(a, trigrams("南には市区町村が 1 つもありません"))).toBe(1);
    expect(
      jaccard(a, trigrams("厚いのは北東で、京都まで続きます")),
    ).toBeLessThan(0.1);
  });
});
