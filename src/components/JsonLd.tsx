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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
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
}: {
  type?: "Article" | "BlogPosting";
  headline: string;
  description: string;
  path: string;
  keywords?: string[];
  datePublished?: string;
  dateModified?: string;
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
        creator: { "@id": `${BASE}/#organization` },
        // 掲載中の賃貸情報から自前で集計したもの、という出所を明示する
        measurementTechnique: "掲載中の賃貸物件から算出した専有面積あたりの賃料",
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
