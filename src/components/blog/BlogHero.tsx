import { preload } from "react-dom";
import type { BlogHeroWebp } from "@/lib/blogImage";

/**
 * 記事の先頭の図。`public/blog/<slug>.png` があるときだけ頁が出す。
 *
 * 共通の /ogp.png はサイトの顔であって記事の中身ではないので、本文の頭に
 * 置くと「どの記事も同じ絵」になる。置き場所は説明文の直後。図の中身は
 * 記事の主張そのものなので、見出しと説明を読んだ直後がいちばん効く。
 *
 * 大きさを属性で持たせて、読み込み前に場所を取らせる。無いと本文が
 * 読み込みのたびに下へ飛ぶ。
 *
 * **この図が記事のモバイル LCP。** PNG をそのまま配っていたので、WebP
 * （1800 幅・900 幅）を `<picture>` で先に出し、対応しない環境と WebP が
 * 無い記事は PNG の `<img>` に落とす。列の幅は lg 以上で最大 1300px 前後
 * （1700px − 本文外の 300px の欄 − 余白）、それ未満は画面幅いっぱい。
 *
 * React 19 は `<picture>` の中の img を自動では先読みしない。先読みが
 * 要る WebP はここで明示する。PNG は fallback なので先読みしない
 * （先読みすると、対応ブラウザが WebP と PNG を両方取りに行く）。
 * WebP が無い記事だけ、その PNG を先読みする。
 */
export const BLOG_HERO_SIZES = "(min-width: 1024px) 1300px, 100vw";

export function BlogHero({
  src,
  webp,
  alt,
}: {
  src: string;
  webp: BlogHeroWebp | null;
  alt: string;
}) {
  if (webp) {
    preload(webp.full, {
      as: "image",
      type: "image/webp",
      fetchPriority: "high",
      imageSrcSet: `${webp.small} 900w, ${webp.full} 1800w`,
      imageSizes: BLOG_HERO_SIZES,
    });
  } else {
    preload(src, { as: "image", fetchPriority: "high" });
  }

  return (
    <figure className="mt-8 m-0">
      <picture>
        {webp && (
          <source
            type="image/webp"
            srcSet={`${webp.small} 900w, ${webp.full} 1800w`}
            sizes={BLOG_HERO_SIZES}
          />
        )}
        <img
          src={src}
          alt={alt}
          width={1800}
          height={945}
          fetchPriority="high"
          decoding="async"
          className="w-full h-auto rounded-xl border border-stone-200"
        />
      </picture>
    </figure>
  );
}
