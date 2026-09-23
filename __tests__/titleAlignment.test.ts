import { describe, expect, it } from "vitest";
import { parseAnswer } from "../scripts/linkCandidates";
import {
  ALIGNMENT_QUESTIONS,
  LEAD_MAX_CHARS,
  alignmentState,
  buildAlignmentRequest,
  leadOf,
  mockAlignment,
  toScore,
} from "../scripts/titleAlignment";
import { getBlogPost, getBlogPosts } from "@/lib/blog";

/**
 * 記事の題・説明文と本文のズレの採点（scripts/titleAlignment）。
 *
 * API は呼ばない。見るのは、state の組み方（冒頭を切り出して先に見せる）、
 * 問いに題と説明文がそのまま入ること、答えの id が問いの id と同じで
 * 既存の読み方（parseAnswer）で読めること。
 */

const body = [
  "前置きの 1 行。",
  "",
  "## 先に結論",
  "",
  "- **短い答え**",
  "- 五黄殺は年盤で五黄土星が入った方位で、[詳しくはこちら](/blog/x)に書きました。",
  "",
  "| 体系 | 見るもの |",
  "| --- | --- |",
  "| 風水 | 場所 |",
  "",
  "## 本文の節",
  "",
  "後半の話は冒頭に入りません。",
].join("\n");

describe("冒頭の切り出し", () => {
  it("最初の節の終わりまで。前置きも含み、次の見出しで止まる", () => {
    const lead = leadOf(body);
    expect(lead).toContain("前置きの 1 行");
    expect(lead).toContain("五黄殺は年盤で");
    expect(lead).not.toContain("本文の節");
    expect(lead).not.toContain("後半の話");
  });

  it("表と短い行も落とさない（答えが表や短い箇条書きの記事で空振りした）", () => {
    // run #7 では段落分け（paragraphsOf）で切っていて、表と 40 字未満の
    // 行が消え、答えが結論にある 5 本が冒頭で低く出た
    const lead = leadOf(body);
    expect(lead).toContain("短い答え");
    expect(lead).toContain("| 風水 | 場所 |");
  });

  it("リンクの URL と強調の記号は外す（読む人に見えないもの）", () => {
    const s = alignmentState(body);
    expect(s).not.toContain("/blog/x");
    expect(s).not.toContain("**");
    expect(s).toContain("詳しくはこちら");
  });

  it("state は冒頭を先に、本文の全体を後に置く", () => {
    const [head, full] = alignmentState(body).split("【本文の全体】");
    expect(head).toContain("【冒頭（最初の節）】");
    expect(full).toContain("後半の話");
  });

  it("最初の節が長すぎる記事は上限で切る", () => {
    const long = "## 先に結論\n\n" + "あ".repeat(LEAD_MAX_CHARS + 500);
    expect(leadOf(long).length).toBe(LEAD_MAX_CHARS + 1);
  });
});

describe("問いの形", () => {
  const post = {
    title: "五黄殺とはどの方位か",
    description: "五黄殺の決まり方と、2026 年の位置。",
    body,
  };

  it("3 つの問いがあり、題と説明文がそのまま入る", () => {
    const req = buildAlignmentRequest(post, "m");
    expect(Object.keys(req.questions)).toEqual([...ALIGNMENT_QUESTIONS]);
    expect(req.model).toBe("m");
    expect(req.questions.title_answered.instructions).toContain(
      "「五黄殺とはどの方位か」",
    );
    expect(req.questions.description_supported.instructions).toContain(
      "「五黄殺の決まり方と、2026 年の位置。」",
    );
    expect(req.questions.answer_first.instructions).toContain(
      "【冒頭（最初の節）】",
    );
    for (const q of ALIGNMENT_QUESTIONS) {
      expect(req.questions[q].type).toBe("noul");
      expect(q).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("答えは問いの id で返り、リンク採点と同じ読み方で読める", () => {
    // 実測の形（OpenRouter Decisions API、2026-09-19）
    const res = {
      answers: {
        title_answered: { type: "noul", noul: 0.81 },
        description_supported: { type: "noul", noul: 0.42 },
        answer_first: { type: "noul", noul: 0.66 },
      },
    };
    const scores = Object.fromEntries(
      ALIGNMENT_QUESTIONS.map((q) => [q, parseAnswer(res, q)!.probability]),
    ) as Record<(typeof ALIGNMENT_QUESTIONS)[number], number>;
    const row = toScore({ slug: "s", ...post }, scores);
    expect(row.min).toBe(0.42);
    // 読めない id は null（0 に倒さない）
    expect(parseAnswer(res, "missing")).toBeNull();
  });
});

describe("実際の記事", () => {
  const posts = getBlogPosts()
    .map((s) => getBlogPost(s.slug))
    .filter((p): p is NonNullable<typeof p> => !!p && !p.draft);

  it("どの記事でも冒頭に結論の節が入り、空にならない", () => {
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) {
      const lead = leadOf(p.body);
      expect(lead.length, p.slug).toBeGreaterThan(40);
      // 全記事が「## 先に結論」で始まる。入っていなければ切り方が壊れている
      if (/^## 先に結論/m.test(p.body)) {
        expect(lead, p.slug).toContain("先に結論");
      }
    }
  });

  it("答えが表の記事でも、表が冒頭に入る（九星気学以外の評価基準）", () => {
    const p = posts.find((x) => x.slug === "other-systems-beyond-kigaku");
    expect(p).toBeDefined();
    expect(leadOf(p!.body)).toContain("奇門遁甲");
  });

  it("偽の採点は決定的で 0〜1 に収まる", () => {
    for (const p of posts.slice(0, 5)) {
      const a = mockAlignment(p);
      expect(mockAlignment(p)).toEqual(a);
      for (const q of ALIGNMENT_QUESTIONS) {
        expect(a[q]).toBeGreaterThanOrEqual(0);
        expect(a[q]).toBeLessThanOrEqual(1);
      }
    }
  });
});
