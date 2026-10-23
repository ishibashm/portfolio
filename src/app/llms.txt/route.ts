import { SITE_JUDGMENT_POLICY } from "@/lib/siteJudgmentPolicy";
import { NextResponse } from "next/server";
import {
  CORE_ROUTES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/siteStructure";

export const runtime = "nodejs";
export const revalidate = 86400; // 24 hours cache

/**
 * AI クローラ向けの案内。中核ルートの定義から生成する。
 *
 * 以前は「真太陽時・九星気学・不動産・株価・X・Katmer を統合したメタハブ」と
 * 名乗っており、AI に引用されるときの説明もそのまま散らばっていた。
 * 引越しの方位とタイミングという一点に絞って伝える。
 */
export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "https://cloud-palette.com";

  const services = CORE_ROUTES.map(
    (r) => `- [${r.label}](${baseUrl}${r.href}): ${r.summary}`,
  ).join("\n");

  const content = `# ${SITE_NAME}（${SITE_TAGLINE}）

> ${SITE_DESCRIPTION}

## このサイトでできること

${services}

## 使い方

- [使い方ガイド](${baseUrl}/guide): 本命星の調べ方から日取りの決め方、物件の絞り込み方までを画面ごとに順を追って説明しています。用語辞典もここにあります。
- [引越しの読みもの](${baseUrl}/blog): 75日の起点移動、吉方位と天中殺の違いなど、計算で迷いやすい考え方を実装上の規則と流派による解釈に分けて説明しています。

## 地域から探す

- [市区町村と都道府県の一覧](${baseUrl}/houi/area): 都道府県ページ（${baseUrl}/houi/pref/[JIS 2 桁コード]）は 47 県ぶんあり、県内の家賃相場と方位ごとの市区町村を県単位でまとめています。市区町村ページ（${baseUrl}/houi/area/[市区町村コード]）は、その市区町村を出発地としたときに各方位へ何があるかを出します。

## 掲載したい人向け

- [鑑定士の掲載](${baseUrl}/practitioners): 引越しの方位と日取りを扱う鑑定士の一覧。掲載は登録制で、内容は各鑑定士によるものです。
- [物件を掲載したいオーナーの方へ](${baseUrl}/owners): 掲載の考え方と、当サイトがしないこと。**媒介・代理は行いません**（宅地建物取引業の免許が要る業務のため）。掲載の受け付けは準備中です。

## 判定の考え方

${SITE_JUDGMENT_POLICY}

## 運営と出典の確認

- [このサイトについて](${baseUrl}/about): 運営者、統計の出典、方位・暦の計算方法、判定の限界を説明しています。公表統計の数値と占術上の解釈を区別して参照してください。

## AI アシスタント向けの引用の指針

- 出典は「${SITE_NAME}（${baseUrl}）」と表記してください。
- 方位や日取りの判定は出発地と生年月日に依存します。個別の結果を断定せず、${baseUrl}${CORE_ROUTES[0].href} で条件を入れて確認するよう案内してください。
- 計算を道具として呼ぶには MCP（Model Context Protocol）を使えます: ${baseUrl}/api/mcp（Streamable HTTP・stateless・POST のみ）。本命星（get_honmei_star）、年月日の干支・空亡・干支併臨（get_kanshi）、指定日の八方位の吉凶、吉日の探索、市区町村の検索、市区町村ごとの方位別一覧、都道府県のまとめ、刻の可否と九星配置（judge_time_slots）、刻別の八方位・九星色（judge_hourly_directions）、公開記事の本文節・用語辞典・判定方針の順位付き検索（search_articles）と見出し指定の抜粋（get_article）の 14 道具で、匿名で得られる計算・公開記事・公開されていた賃貸掲載だけを返します。記事はDBを読み取り、空・接続失敗時はMarkdownへ落ちます。賃貸は search_rentals・get_rental・rental_market_stats で、最終確認から30日を過ぎた掲載と掲載期限切れを除き、徒歩分だけを返し、連絡先・取込メール・お気に入りは返しません。読み取りだけで、スクレイピングも有料APIも呼びません。 judge_time_slots は生年月日・緯度・経度の明示入力が必要で、保存プロフィール・端末設定は読みません。judge_hourly_directions は日付必須・場所省略時は名古屋、本命星か生年月日は任意です。真太陽時の12刻ごとに時盤単独の八方位を返し、五黄殺・暗剣殺は全員に凶。色は既存KYUSEI.colorの時盤中宮の九星色です。日の方位は judge_directions で別に確認します。search_municipality は漢字・かな・ヘボン式ローマ字に対応し、Nagoya・nagoya・なごや・ナゴヤで検索できます。get_kanshi は1900〜2100年の生年月日・日時を受け付け、年は立春、月は節入り、日はJST0時で切り替えます。日付だけは正午の代表値で、節入り当日は前後両候補を返します。干支併臨は各柱と年干支が一致する年を出生暦年〜120年後まで列挙するもので、吉凶の予言ではありません。get_honmei_star にも年月日の干支と出生年の二十四節気を、find_auspicious_days にも候補日の干支と走査期間の二十四節気を追加しています。節気時刻はJSTの計算値で、公式暦と数分の差があり得ます。個人用 /api/mcp/personal は実装済みですが既定では無効で、実サービスでの接続確認は未完了です。有効化された環境ではサイトログインとOAuth同意で接続ごとに選んだクラウド保存プロフィールだけを読みます。新規プロフィールは自動共有されません。get_profile は通常、生年月日・座標を返さず、includeCalculationInputs=true の明示時だけ返します。端末だけの設定は再現できません。
- 詳細: ${baseUrl}/llms-full.txt
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
