import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diffBlogPost,
  formatBlogPostDiff,
  importUpdatedAt,
  isSameAsFile,
  type ComparablePost,
} from "@/lib/blogImportDiff";
import { toJapanDateString } from "@/utils/japanDate";

/**
 * 記事の上書き（blog-import の overwrite）の前に、DB の中身とファイルの
 * 差を出す。上書きは管理画面の手直しを消すので戻せない。dry-run で
 * 「DB にだけある行＝上書きで消える行」が見えること。
 */

const base: ComparablePost = {
  title: "年盤は 1 年を丸ごと塞ぐ",
  content: "# 見出し\n\n段落 A。\n\n段落 B。\n",
  excerpt: "要約",
  category: "kigaku",
  tags: "年盤,方位",
  published: true,
  publishedAt: new Date("2026-09-01T00:00:00+09:00"),
};

describe("diffBlogPost", () => {
  it("段落を足しただけなら、消える行は 0 で、入る行だけが出る", () => {
    const file = { ...base, content: base.content + "\n段落 C。\n" };
    expect(diffBlogPost(base, file)).toEqual({
      changedFields: [],
      onlyInDb: [],
      onlyInFile: ["段落 C。"],
    });
  });

  it("管理画面で直した行は、消える行として出る", () => {
    const db = {
      ...base,
      content: base.content.replace("段落 A。", "段落 A（直した）。"),
    };
    const d = diffBlogPost(db, base);
    expect(d.onlyInDb).toEqual(["段落 A（直した）。"]);
    expect(d.onlyInFile).toEqual(["段落 A。"]);
  });

  it("空行・行末の空白・改行コードの揺れは差にしない", () => {
    const db = {
      ...base,
      content: "# 見出し  \r\n\r\n\r\n段落 A。\r\n段落 B。",
    };
    const d = diffBlogPost(db, base);
    expect(d.onlyInDb).toEqual([]);
    expect(d.onlyInFile).toEqual([]);
  });

  it("本文以外の項目の差を名前で出す（null と未設定は同じ）", () => {
    const db = { ...base, excerpt: null, category: null };
    const file = {
      ...base,
      excerpt: null,
      category: "fengshui",
      title: "別の題",
      publishedAt: new Date("2026-09-02T00:00:00+09:00"),
    };
    expect(diffBlogPost(db, file).changedFields).toEqual([
      "title",
      "category",
      "publishedAt",
    ]);
  });
});

describe("formatBlogPostDiff", () => {
  it("件数と、消える行・入る行を印つきで出す", () => {
    const lines = formatBlogPostDiff({
      changedFields: [],
      onlyInDb: ["x".repeat(130)],
      onlyInFile: ["新しい段落"],
    });
    expect(lines[0]).toContain("項目の差: なし");
    expect(lines[1]).toContain("DB にだけある行 1（上書きで消える）");
    expect(lines[2]).toBe(`      - ${"x".repeat(120)}…`);
    expect(lines[3]).toBe("      + 新しい段落");
  });
});

/**
 * 更新日は frontmatter の値を入れる。
 *
 * BlogPost.updatedAt は Prisma の @updatedAt で、値を渡さないと書き込んだ
 * 時刻が入る。取り込みが渡していなかったので、上書きを流した日が全記事の
 * 更新日（頁の「更新」と JSON-LD の dateModified）になっていた。
 * サイトマップの lastmod は frontmatter から出るので、同じ記事の更新日が
 * 2 通りあった。
 */
describe("importUpdatedAt", () => {
  it("updatedAt があればその日、無ければ公開日（どちらも日本時間の日付）", () => {
    const edited = importUpdatedAt({
      publishedAt: "2026-09-16",
      updatedAt: "2026-10-02",
    });
    expect(toJapanDateString(edited)).toBe("2026-10-02");
    // JST の 0 時。UTC の 0 時にすると、表示側で前日にはならないが
    // 公開日（JST 0 時）と 9 時間ずれて「同じ日」の比較が崩れる。
    expect(edited.toISOString()).toBe("2026-10-01T15:00:00.000Z");

    const untouched = importUpdatedAt({ publishedAt: "2026-09-16" });
    expect(toJapanDateString(untouched)).toBe("2026-09-16");
  });

  it("取り込みは更新日を必ず渡す（渡さないと書き込んだ時刻になる）", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/import_blog_markdown.ts"),
      "utf8",
    );
    // 追加・上書きに渡す data。
    expect(script).toContain("updatedAt: importUpdatedAt(post),");
    // 上書きしないモードで日付だけ揃えるときは、本文に書き込まない。
    expect(script).toContain("data: { updatedAt: data.updatedAt },");
  });
});

describe("isSameAsFile", () => {
  it("項目も本文も同じときだけ true（日付だけ揃えてよい記事）", () => {
    expect(isSameAsFile(diffBlogPost(base, { ...base }))).toBe(true);
    expect(isSameAsFile(diffBlogPost(base, { ...base, title: "別の題" }))).toBe(
      false,
    );
    // 管理画面で直した記事は、日付だけ揃える対象にしない。
    const edited = {
      ...base,
      content: base.content.replace("段落 A。", "段落 A（直した）。"),
    };
    expect(isSameAsFile(diffBlogPost(edited, base))).toBe(false);
  });
});
