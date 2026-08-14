import { describe, expect, it } from "vitest";

import { normalizePostInput, validatePostInput } from "../src/lib/blogAdmin";

/**
 * 管理画面のブログ記事の入力規則。
 *
 * 空のタイトルで保存できると一覧に押せない行が並び、slug が URL に
 * 使えない文字を含むと記事ページが開けない。保存できてしまってからでは
 * 画面から原因が見えないので、入口の規則をここで固定する。
 */
const valid = {
  title: "方位の基本",
  slug: "direction-basics",
  content: "本文",
};

describe("validatePostInput", () => {
  it("必須が揃っていれば通る", () => {
    expect(validatePostInput(valid)).toBeNull();
  });

  it("タイトルの空文字・空白だけは弾く", () => {
    expect(validatePostInput({ ...valid, title: "" })).toContain("タイトル");
    expect(validatePostInput({ ...valid, title: "   " })).toContain("タイトル");
    expect(validatePostInput({ ...valid, title: undefined })).toContain(
      "タイトル",
    );
  });

  it("slug は英小文字・数字・ハイフンだけ", () => {
    for (const bad of ["ABC", "日本語", "a_b", "a b", "-a", "a-", ""]) {
      expect(validatePostInput({ ...valid, slug: bad }), bad).toContain("slug");
    }
    expect(validatePostInput({ ...valid, slug: "a-1-b" })).toBeNull();
  });

  it("本文の空は弾く", () => {
    expect(validatePostInput({ ...valid, content: "" })).toContain("本文");
  });

  it("公開日は読める日付だけ。未指定は通す", () => {
    expect(
      validatePostInput({ ...valid, publishedAt: "not a date" }),
    ).toContain("公開日");
    expect(
      validatePostInput({ ...valid, publishedAt: "2026-08-14" }),
    ).toBeNull();
    expect(validatePostInput(valid)).toBeNull();
  });
});

describe("normalizePostInput", () => {
  it("tags は配列でもカンマ区切りでも同じ形に落ちる", () => {
    expect(
      normalizePostInput({ ...valid, tags: ["方位", " 引越し "] }).tags,
    ).toBe("方位,引越し");
    expect(normalizePostInput({ ...valid, tags: "方位, 引越し ,," }).tags).toBe(
      "方位,引越し",
    );
    expect(normalizePostInput(valid).tags).toBe("");
  });

  it("空の任意項目は null にする（空文字を DB に入れない）", () => {
    const n = normalizePostInput({ ...valid, excerpt: "  ", category: "" });
    expect(n.excerpt).toBeNull();
    expect(n.category).toBeNull();
  });

  it("published は true だけを真にする（文字列の 'true' は下書き扱い）", () => {
    expect(normalizePostInput({ ...valid, published: true }).published).toBe(
      true,
    );
    expect(normalizePostInput({ ...valid, published: "true" }).published).toBe(
      false,
    );
    expect(normalizePostInput(valid).published).toBe(false);
  });

  it("公開日は未指定なら undefined（DB の既定 now() に任せる）", () => {
    expect(normalizePostInput(valid).publishedAt).toBeUndefined();
    expect(
      normalizePostInput({ ...valid, publishedAt: "2026-08-14" }).publishedAt,
    ).toEqual(new Date("2026-08-14"));
  });
});
