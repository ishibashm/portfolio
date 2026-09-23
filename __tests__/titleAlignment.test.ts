import { describe, expect, it } from "vitest";
import { parseAnswer } from "../scripts/linkCandidates";
import {
  ALIGNMENT_QUESTIONS,
  LEAD_PARAGRAPHS,
  alignmentState,
  buildAlignmentRequest,
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
  "## 見出し",
  "",
  "一段落目は答えです。五黄殺は年盤で五黄土星が入った方位で、[詳しくはこちら](/blog/x)に書きました。",
  "",
  "二段落目です。**強調**を含みます。ここも四十字を超えるように少し長めに書いておきます。",
  "",
  "| 表 | は |",
  "|---|---|",
  "",
  "三段落目です。ここまでが冒頭の三段落に入る想定で、四十字を超えるように書いています。",
  "",
  "四段落目は冒頭に入りません。後半の話で、四十字を超えるようにもう少しだけ書き足しておきます。",
].join("\n");

describe("state の組み方", () => {
  it("冒頭の段落を先に切り出し、そのあとに本文の全体を置く", () => {
    const s = alignmentState(body);
    const [lead, full] = s.split("【本文の全体】");
    expect(lead).toContain(`【冒頭の ${LEAD_PARAGRAPHS} 段落】`);
    expect(lead).toContain("一段落目は答えです");
    expect(lead).toContain("三段落目です");
    // 4 段落目は冒頭に入らない。見出しと表は段落と数えない
    expect(lead).not.toContain("四段落目");
    expect(lead).not.toContain("見出し");
    expect(full).toContain("四段落目");
  });

  it("リンクの URL と強調の記号は外す（読む人に見えないもの）", () => {
    const s = alignmentState(body);
    expect(s).not.toContain("/blog/x");
    expect(s).not.toContain("**");
    expect(s).toContain("詳しくはこちら");
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
    expect(req.questions.answer_first.instructions).toContain("【冒頭の");
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

  it("どの記事でも冒頭が空にならない（空だと answer_first が意味を持たない）", () => {
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) {
      const lead = alignmentState(p.body).split("【本文の全体】")[0];
      expect(
        lead.replace(/【[^】]+】/, "").trim().length,
        p.slug,
      ).toBeGreaterThan(40);
    }
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
