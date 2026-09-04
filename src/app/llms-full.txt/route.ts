import { NextResponse } from "next/server";
import {
  CORE_ROUTES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/siteStructure";
import { loadBlogPosts } from "@/lib/blogStore";
import { PREF_REGION, prefNameByCode } from "@/lib/prefContent";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";

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

  /* 都道府県ページは 47 県ぶん手で文章を書いてある。Search Console の
     実測では表示の付くクエリのほぼ全部が「地名 家賃相場」なのに、
     llms.txt にも llms-full.txt にも 1 つも載っていなかった。
     地方ごとにまとめて出す（呼び名は PREF_REGION に合わせる）。 */
  const prefsByRegion = new Map<string, string[]>();
  for (const code of Object.keys(PREF_EDITORIAL).sort()) {
    const name = prefNameByCode(code);
    const region = PREF_REGION[code];
    if (!name || !region) continue;
    if (!prefsByRegion.has(region)) prefsByRegion.set(region, []);
    prefsByRegion.get(region)!.push(`[${name}](${baseUrl}/houi/pref/${code})`);
  }
  const prefLines = [...prefsByRegion]
    .map(([region, links]) => `- ${region}: ${links.join(" / ")}`)
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

## 地域ごとのページ

都道府県ごとに、その県の市区町村の家賃相場と、県の面積重心から見た八方位ごとの
市区町村の一覧を出しています。**方位は出発地から見た向きで決まる**ので、県ページの
方位は「県全体を大づかみに見るための目安」です。個別の判断は市区町村ページか
方位スキャナーを使ってください。

${prefLines}

市区町村ごとのページ（${baseUrl}/houi/area/[市区町村コード]）は ${Object.keys(AREA_EDITORIAL).length} 市区町村ぶん公開しています。
一覧は ${baseUrl}/houi/area にあります。各ページには「その方位にこの一覧の候補が
1 つも入らない」ことも書いてあります。**これは「その方位に街が無い」という意味では
ありません。**一覧の母集団は賃貸の掲載を集計できた市区町村（全国 1,917 のうち
1,119）なので、海や山で本当に行き止まりの場合と、掲載をまだ拾えていない場合を
区別できません。

## 業界の情報源

- [不動産・建築の情報を集める](${baseUrl}/news): 専門メディアと官公庁の新着見出しを
  配信元の RSS から 6 時間ごとに取得してまとめています。本文の転載はしていません。

---

## 判定アルゴリズム

### 方位の決め方
- 方位は「出発地（現在の住まい）から物件・候補地への向き」で決まります。出発地が変われば同じ物件でも判定が変わるため、出発地の指定を必須にしています。
- 向きは 2 点間の大圏方位角で求めます。地図上の直線ではありません。八方位の扇形を地図に描くときも縁を大圏で結びます（直線で結ぶと、方位の境目付近で最大 2.71 度・横に 24km ずれます）。
- 判定の基準は常に真北です。磁北は「方位磁針で測るとずれる」という注意として表示するだけで、吉凶の判定には使いません。全国向けの静的ページは出発地ごとの偏角を持てないため、判定を磁北にすると記事と計算が恒久的に食い違います。
- 地磁気偏角は出発地ごとに求めます。取得できない場合は補正しません（0 度として扱います）。全国一律の値を当てると、沖縄や北海道の利用者に別の土地の偏角を当てることになります。
- 八方位への割り当ては盤によって異なります。古典盤は伝統的な区分（東西南北が各 30 度、北東・南東・南西・北西が各 60 度）、天文モードは 45 度の等分です。
- 暦（年盤・月盤・日盤の切り替わり、立春・節入り）は日本時間で判定します。サーバーの時刻帯では判定しません。

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
