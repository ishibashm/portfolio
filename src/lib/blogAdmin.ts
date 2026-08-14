/**
 * 管理画面のブログ記事の入力検証と正規化。
 *
 * route ファイルには HTTP メソッド以外を export できない（Next.js が
 * ビルドで弾く）ので、検証の規則はここに置く。規則はテストで固定する。
 * 空のタイトルで保存できると一覧に押せない行が並び、slug が URL に
 * 使えない文字を含むと記事ページが開けない。保存できてしまってから
 * では画面から原因が見えない類いの壊れ方なので、入口で止める。
 */

export type PostInput = {
  title?: unknown;
  slug?: unknown;
  content?: unknown;
  excerpt?: unknown;
  category?: unknown;
  tags?: unknown;
  published?: unknown;
  publishedAt?: unknown;
};

/** slug に使える形。日付や英数の URL 断片だけを通す。 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 入力の検証。通らない理由を文字列で返す（画面がそのまま出す）。
 * 型だけでなく空文字も弾く。空のタイトルで保存できると、一覧に
 * 押せない行が並ぶ。
 */
export function validatePostInput(body: PostInput): string | null {
  if (typeof body.title !== "string" || body.title.trim() === "") {
    return "タイトルが要ります。";
  }
  if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug)) {
    return "slug は英小文字・数字・ハイフンだけで入れてください（例: direction-basics）。";
  }
  if (typeof body.content !== "string" || body.content.trim() === "") {
    return "本文が要ります。";
  }
  if (body.publishedAt !== undefined && body.publishedAt !== null) {
    if (
      typeof body.publishedAt !== "string" ||
      Number.isNaN(Date.parse(body.publishedAt))
    ) {
      return "公開日は日付として読める形式で入れてください。";
    }
  }
  return null;
}

/** 保存する形に整える。tags は配列でも文字列でも受けてカンマ区切りに。 */
export function normalizePostInput(body: PostInput) {
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean)
    : typeof body.tags === "string"
      ? body.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  return {
    title: String(body.title).trim(),
    slug: String(body.slug),
    content: String(body.content),
    excerpt:
      typeof body.excerpt === "string" && body.excerpt.trim() !== ""
        ? body.excerpt.trim()
        : null,
    category:
      typeof body.category === "string" && body.category.trim() !== ""
        ? body.category.trim()
        : null,
    tags: tags.join(","),
    published: body.published === true,
    publishedAt:
      typeof body.publishedAt === "string" && body.publishedAt
        ? new Date(body.publishedAt)
        : undefined,
  };
}
