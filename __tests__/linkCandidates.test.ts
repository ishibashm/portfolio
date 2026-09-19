import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRequest,
  candidatePairs,
  linkedSlugs,
  mockScore,
  paragraphsOf,
  parseAnswer,
  type PostLike,
} from "../scripts/linkCandidates";
import { getBlogPost } from "@/lib/blog";

/**
 * 内部リンク候補の組み立て（scripts/linkCandidates）。
 *
 * API を呼ぶ部分は見ない（鍵が要る）。見るのは、段落の切り方・既に
 * 張ってある宛先を除くこと・問いの形・答えの読み方の 4 つ。答えの
 * 読み方は項目名の揺れを吸収するので、読めないときに null を返す
 * こと（0 に倒さないこと）を固定する。
 */

const post = (o: Partial<PostLike> & { slug: string }): PostLike => ({
  title: o.slug,
  description: "",
  category: "c",
  tags: [],
  body: "",
  ...o,
});

describe("段落の切り方", () => {
  it("見出し・表・コードを除き、リンクと強調の記法を外す", () => {
    const body = [
      "## 見出し",
      "",
      "| a | b |",
      "|---|---|",
      "",
      "```",
      "const x = 1; // コードの中は読まない。長さが足りていても除く。",
      "```",
      "",
      "これは十分に長い段落で、[リンクの文言](/blog/foo)と**強調**を含みます。読者が次に進む先を探す材料になります。",
      "",
      "短い。",
    ].join("\n");
    const ps = paragraphsOf(body);
    expect(ps).toHaveLength(1);
    expect(ps[0].text).toContain("リンクの文言");
    expect(ps[0].text).not.toContain("](");
    expect(ps[0].text).not.toContain("**");
  });

  it("箇条書きは 1 項目を 1 段落と数える", () => {
    const body = [
      "1. まず候補日が土用の期間かどうかを確認する。ここは十分に長い項目にしておく必要がある",
      "2. 期間中なら、間日に当たる日がないかを見る。ここも十分に長い項目にしておく必要がある",
    ].join("\n");
    expect(paragraphsOf(body)).toHaveLength(2);
  });
});

describe("候補の組", () => {
  const a = post({
    slug: "a",
    tags: ["x"],
    body: "本文は十分に長い段落を 1 つ持っています。宛先の候補を探すための材料になる文です。[既に張った](/blog/b)。",
  });
  const b = post({ slug: "b", tags: ["x"] });
  const c = post({ slug: "c", tags: ["x"] });
  const far = post({ slug: "far", category: "other", tags: ["y"] });

  it("自分自身と、既に本文から張っている宛先は除く", () => {
    const pairs = candidatePairs([a, b, c, far]);
    const dests = pairs.filter((p) => p.source === "a").map((p) => p.dest);
    expect(dests).toContain("c");
    expect(dests).not.toContain("a");
    expect(dests).not.toContain("b");
  });

  it("既定ではタグかカテゴリを共有する宛先だけ。allPairs で全部", () => {
    expect(candidatePairs([a, b, c, far]).some((p) => p.dest === "far")).toBe(
      false,
    );
    expect(
      candidatePairs([a, b, c, far], { allPairs: true }).some(
        (p) => p.dest === "far",
      ),
    ).toBe(true);
  });

  it("linkedSlugs は末尾のスラッシュと #anchor を落とす", () => {
    expect([...linkedSlugs("[x](/blog/foo/) [y](/blog/bar#sec)")]).toEqual([
      "foo",
      "bar",
    ]);
  });
});

describe("問いと答え", () => {
  const src = post({ slug: "src", title: "元", body: "" });
  const dest = post({ slug: "dest-1", title: "宛先", description: "説明" });
  const paragraph = { index: 0, text: "段落" };

  it("段落が state、宛先ごとに noul の問い。id は slug", () => {
    const req = buildRequest(src, paragraph, [dest]);
    expect(req.model).toBe("jev-latest");
    expect(req.state).toBe("段落");
    expect(req.questions["dest-1"].type).toBe("noul");
    expect(req.questions["dest-1"].instructions).toContain("宛先");
    expect(req.questions["dest-1"].instructions).toContain("説明");
  });

  it("答えの項目名の揺れを吸収する", () => {
    expect(
      parseAnswer(
        { answers: { "dest-1": { probability: 0.8, confidence: 0.9 } } },
        "dest-1",
      ),
    ).toEqual({ probability: 0.8, confidence: 0.9 });
    expect(
      parseAnswer({ results: { "dest-1": { p: 0.3 } } }, "dest-1"),
    ).toEqual({ probability: 0.3, confidence: null });
    expect(parseAnswer({ "dest-1": 0.5 }, "dest-1")).toEqual({
      probability: 0.5,
      confidence: null,
    });
  });

  it("読めないときは null（0 に倒さない）", () => {
    expect(parseAnswer({ answers: {} }, "dest-1")).toBeNull();
    expect(
      parseAnswer({ answers: { "dest-1": { text: "yes" } } }, "dest-1"),
    ).toBeNull();
    expect(parseAnswer("oops", "dest-1")).toBeNull();
  });

  it("偽の採点は決定的で 0〜1 に収まる", () => {
    const p = { index: 0, text: "宛先の題の語が出てくる段落" };
    const s1 = mockScore(p, src, dest);
    expect(s1).toBe(mockScore(p, src, dest));
    expect(s1).toBeGreaterThan(0);
    expect(s1).toBeLessThan(1);
  });
});

describe("本物の記事に当てる", () => {
  const dir = join(process.cwd(), "content", "blog");
  const posts: PostLike[] = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => getBlogPost(f.replace(/\.md$/, "")))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      tags: p.tags,
      body: p.body,
    }));

  it("候補が出て、自分自身への組と既に張った宛先が混ざらない", () => {
    const pairs = candidatePairs(posts);
    expect(pairs.length).toBeGreaterThan(100);
    const bySlug = new Map(posts.map((p) => [p.slug, p]));
    for (const p of pairs) {
      expect(p.dest).not.toBe(p.source);
      expect(linkedSlugs(bySlug.get(p.source)!.body).has(p.dest)).toBe(false);
    }
  });
});
