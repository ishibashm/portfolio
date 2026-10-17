import { isValidYouTubeId } from "@/lib/blogVideo";
import type { BlogVideoProps } from "@/components/blog/BlogVideo";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * ページ単位の構造化データ。
 *
 * layout.tsx にはサイト全体の WebSite / Organization を置いてある。
 * 個々の記事は Article、方位×相場のページは Dataset として申告すると、
 * 検索結果での扱いが変わる。ページごとに書き散らすとプロパティが
 * ばらつくので、ここで組み立てる。
 */

const BASE = SITE_URL;

function Script({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // 記事・FAQに </script> があってもHTML側でJSONが途中終了しないようにする。
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function ArticleJsonLd({
  type = "Article",
  headline,
  description,
  path,
  keywords,
  datePublished,
  dateModified,
  image = "/ogp.png",
}: {
  type?: "Article" | "BlogPosting";
  headline: string;
  description: string;
  path: string;
  keywords?: string[];
  datePublished?: string;
  dateModified?: string;
  /** 記事の代表画像。サイト内の絶対パスで渡す（`/ogp.png` など） */
  image?: string;
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": type,
        headline,
        description,
        inLanguage: "ja",
        url: `${BASE}${path}`,
        mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}${path}` },
        /*
          代表画像。Article に image が無いと、Google は記事に紐づく画像を
          持たない。og:image は共有カード用の別の口なので、そちらだけでは
          構造化データ側は空のままになる。

          既定は全頁共通の /ogp.png（1200×630）。**記事ごとに違う画像を
          持たせるまでは、Discover でこの記事を他と区別する材料が無い。**
        */
        image: `${BASE}${image}`,
        publisher: { "@id": `${BASE}/#organization` },
        author: { "@id": `${BASE}/#organization` },
        isAccessibleForFree: true,
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
        ...(keywords?.length ? { keywords: keywords.join(", ") } : {}),
      }}
    />
  );
}

export function DatasetJsonLd({
  name,
  description,
  path,
  dateModified,
}: {
  name: string;
  description: string;
  path: string;
  dateModified: string;
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "Dataset",
        name,
        description,
        inLanguage: "ja",
        url: `${BASE}${path}`,
        dateModified,
        isAccessibleForFree: true,
        /*
          利用条件。Search Console が「項目 license がありません（任意）」を
          出していた。利用規約の第 2 条にデータセットの引用条件（ドメインを
          明記すれば AI・LLM も引用可）を書いてあるので、そこを指す。
        */
        license: `${BASE}/terms`,
        creator: { "@id": `${BASE}/#organization` },
        // 利用先の県・市区町村ページは公表統計へ移行済み。本文と出所を揃える。
        measurementTechnique:
          "住宅・土地統計調査の公表値を加工。借家の1畳当たり家賃を1.62㎡で換算し、空き家数を総住宅数で除して空き家率を算出。",
        citation: "https://www.e-stat.go.jp/dbview?sid=0000020108",
      }}
    />
  );
}

/** パンくず。階層が深いページで検索結果の見え方が変わる。 */
export function BreadcrumbJsonLd({
  items,
}: {
  items: Array<{ name: string; path: string }>;
}) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: it.name,
          item: `${BASE}${it.path}`,
        })),
      }}
    />
  );
}

export const SITE = SITE_NAME;

/**
 * よくある問いと答え（FAQPage）。
 *
 * **頁に出ている文言だけを渡すこと。**検索エンジン向けに問答をこしらえて
 * ここにだけ入れるのは Google の構造化データの規定に反する。材料は
 * `lib/articleFaq` が本文から取り出したものを使う。
 *
 * 組が足りないときは呼ぶ側で出さない（`hasEnoughFaq`）。1 組だけの
 * FAQPage は体裁を作っただけになる。
 */
export function FaqJsonLd({
  items,
}: {
  items: readonly { question: string; answer: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        inLanguage: "ja",
        mainEntity: items.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }}
    />
  );
}

/**
 * 用語辞典（DefinedTermSet / DefinedTerm）。
 *
 * `/guide/glossary` の表に出ている語と説明を、語単位で取り出せる形にする。
 * 検索側だけでなく、生成 AI が「このサイトが本命殺をどう定義しているか」を
 * 段落から切り出さずに読めるようにするのが狙い。
 *
 * **頁に出ている文言だけを渡すこと。**書き出し用に言い換えると頁と食い違う。
 * 材料は `guideContent` の `glossaryTerms()` が表からそのまま組む。
 */
export function DefinedTermSetJsonLd({
  name,
  description,
  path,
  terms,
}: {
  name: string;
  description: string;
  path: string;
  terms: readonly {
    name: string;
    reading?: string;
    description: string;
  }[];
}) {
  if (terms.length === 0) return null;
  const setId = `${BASE}${path}#glossary`;
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        "@id": setId,
        name,
        description,
        inLanguage: "ja",
        url: `${BASE}${path}`,
        publisher: { "@id": `${BASE}/#organization` },
        hasDefinedTerm: terms.map((t) => ({
          "@type": "DefinedTerm",
          // 語ごとに URL を持たせる。頁は 1 つなので素片で分ける。
          "@id": `${BASE}${path}#${encodeURIComponent(t.name)}`,
          name: t.name,
          description: t.description,
          inDefinedTermSet: { "@id": setId },
          // 読みは別名として渡す。物件の節には読みの列が無い。
          ...(t.reading ? { alternateName: t.reading } : {}),
        })),
      }}
    />
  );
}

export function VideoJsonLd({
  youtubeId,
  title,
  description,
  cover,
  uploadDate,
  duration,
}: BlogVideoProps) {
  if (!isValidYouTubeId(youtubeId)) return null;
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: title,
        description,
        thumbnailUrl: new URL(cover, SITE_URL).href,
        uploadDate,
        embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
        duration,
        inLanguage: "ja",
      }}
    />
  );
}
