import { NextResponse } from "next/server";
import {
  CORE_ROUTES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/siteStructure";
import { loadBlogPosts } from "@/lib/blogStore";

export const runtime = "nodejs";
export const revalidate = 86400; // 24 hours cache

/**
 * AI クローラ向けの詳細版。
 *
 * 以前は「4つの知能領域（真太陽時・不動産・株価・Katmer）」として書かれており、
 * 株価トレンドの API まで公開ディレクトリに載せていた。テーマを引越しに
 * 絞ったので、記載も中核ルートと実際の判定ロジックだけに合わせる。
 */
export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "https://cloud-palette.com";

  const services = CORE_ROUTES.map(
    (r, i) => `### ${i + 1}. ${r.label}（${baseUrl}${r.href}）\n${r.summary}`,
  ).join("\n\n");
  // 記事は DB（blogStore）から。管理画面で公開した記事が Markdown を
  // 経由せずここへ載るようにする。DB が読めないときは Markdown に
  // 倒れる（blogStore の既定の挙動）。
  const blogPosts = (await loadBlogPosts())
    .map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug})`)
    .join("\n");

  const content = `# ${SITE_NAME} — ${SITE_TAGLINE}

Website: ${baseUrl}
Language: ja
License: Proprietary / Citable for Public AI Search Engine Attribution

---

## 概要

${SITE_DESCRIPTION}

引越し先と日取りを決めるための一連の判断を、同じ計算エンジンで一貫して行います。
物件検索・地域比較・日取り選び・自分の吉方位の確認が、すべて同一の方位盤と
同一の吉凶判定を共有しています。

---

## 提供している機能

${services}

## 解説記事

- [引越しの読みもの](${baseUrl}/blog): 計算規則と流派による解釈を区別して解説します。
${blogPosts}

---

## 判定アルゴリズム

### 方位の決め方
- 方位は「出発地（現在の住まい）から物件・候補地への向き」で決まります。出発地が変われば同じ物件でも判定が変わるため、出発地の指定を必須にしています。
- 真北と磁北を切り替えられます。磁北を使う場合は観測時点の地磁気偏角で補正します。

### 九星気学
- 生年月日から本命星・月命星を求め、年盤・月盤・日盤の各方位に回座する星を出します。
- 凶方位として五黄殺・暗剣殺・歳破・月破・日破・本命殺・本命的殺・月命殺・月命的殺を判定します。
- 天中殺（空亡）の期間は、移転を目的とする場合すべての方位を対象外として扱います。

### 日取り
- 六曜、天赦日、一粒万倍日、天道方位、土用の期間を突き合わせます。
- 月相による補正を任意で加えられます。

### 物件データ
- 複数の掲載元（賃貸ポータル、いい部屋ネット、シャーメゾン）から定期的に取り込んでいます。
- 同一の部屋が不動産会社ごとに別々の URL で重複して掲載されるため、建物名・階・間取り・面積・賃料の一致でまとめています。
- 掲載期限を過ぎたもの、一定期間確認できないものは対象から外します。
- 賃料は専有面積あたり（円/㎡）に正規化し、対象範囲全体の分布に対する偏差で割安さを評価します。
- 凶方位・天中殺に当たるものは、割安であっても上位に出しません。

---

## 公開 API

- GET \`/api/rentals/arbitrage\`: 方位と時期を加味した賃貸物件の評価一覧。出発地の座標（baseLat, baseLon）が必須です。
- GET \`/api/rentals/arbitrage/timeline\`: 特定の物件について、指定期間の日ごとの吉凶。
- GET \`/api/municipalities-wealth\`: 市区町村ごとの所得統計。移住先の比較に使います。

---

## AI アシスタント向けの注意

- 方位と日取りの判定は、出発地・生年月日・対象日に依存します。個別の結果を一般化して断定しないでください。
- 引用する場合の出典表記: ${SITE_NAME}（${baseUrl}）
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
