import type { Metadata } from "next";
import Link from "next/link";
import { coreRouteLabel } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";
import { ToolPageIntro } from "@/components/relocation/ToolPageIntro";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
/* 名前は siteStructure が正（2026-09-20 に「物件を方位で探す」から改名）。
   文言は siteStructure の summary と同じ意味で書く。 */
const TITLE = coreRouteLabel("/relocation/arbitrage") ?? "";
const DESCRIPTION =
  "今住んでいる場所から見た八方位の吉凶と、それぞれの方位にある市区町村の家賃の水準・空き家率（e-Stat）を並べます。物件の掲載は出しません。";

export const metadata: Metadata = {
  alternates: { canonical: "/relocation/arbitrage" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/relocation/arbitrage", TITLE, DESCRIPTION),
};

export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ToolPageIntro
        guideHref="/guide/find-property"
        guideLabel="街の探し方を読む"
      >
        決まった日付に開いている方位の街を、家賃の水準と空き家率つきで並べます。いま募集中の部屋の一覧ではありません。
      </ToolPageIntro>
      <div className="mx-auto max-w-[1700px] px-4 pt-4 md:px-8">
        <section
          aria-label="このツールの概要と使い方"
          className="rounded-2xl border border-slate-200 bg-white/90 p-5 space-y-4"
        >
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">
              {coreRouteLabel("/relocation/arbitrage")}で分かること（結論）
            </h2>
            <p className="max-w-[70ch] text-sm leading-relaxed text-slate-700">
              いま住んでいる場所（出発地）から見た八方位の吉凶を、選んだ日付について地図の塗り分けで確認できるツールです（ログインなしで使えます）。あわせて、その方位にある市区町村の家賃水準と空き家率を並べて比較できます。
            </p>
            <p className="max-w-[70ch] text-xs leading-relaxed text-slate-600">
              九星気学にもとづく方位の吉凶は占い上の目安であり、科学的な効果を保証するものではありません。引越し先は契約条件や費用、通勤・生活環境とあわせて判断してください。
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-3">
            <h3 className="text-xs font-bold text-slate-800">
              使い方の手順と関連ツール
            </h3>
            <ol className="list-decimal pl-5 space-y-1 text-xs leading-relaxed text-slate-700 max-w-[70ch]">
              <li>
                生年月日と出発地を設定します（設定は他のページと共有されます。未入力の間は地図の塗り分けと街の一覧は表示されません）。
              </li>
              <li>移動や引越しの対象日を決めます。</li>
              <li>
                地図の八方位の吉凶と、方位ごとの市区町村一覧を確認します。
              </li>
            </ol>
            <p className="max-w-[70ch] text-xs leading-relaxed text-slate-600">
              候補日を広い期間から絞るときや同行者がいる場合の判定は
              <Link
                href="/relocation/timing"
                className="mx-1 font-bold text-indigo-700 underline hover:text-indigo-900"
              >
                {coreRouteLabel("/relocation/timing")}
              </Link>
              、生まれ年から本命星と年の方位早見表を見るときは
              <Link
                href="/houi"
                className="mx-1 font-bold text-indigo-700 underline hover:text-indigo-900"
              >
                {coreRouteLabel("/houi")}
              </Link>
              、六曜や天赦日・一粒万倍日などの暦注で日を見るときは
              <Link
                href="/calendar"
                className="mx-1 font-bold text-indigo-700 underline hover:text-indigo-900"
              >
                {coreRouteLabel("/calendar")}
              </Link>
              を使ってください。
            </p>
          </div>

          <div className="space-y-1.5 border-t border-slate-200 pt-3">
            <h3 className="text-xs font-bold text-slate-800">
              家賃水準・空き家率の統計について（方位の判定とは別の公的統計）
            </h3>
            <p className="max-w-[70ch] text-xs leading-relaxed text-slate-600">
              方位ごとに並べる市区町村の家賃の水準と空き家率は、e-Stat「統計でみる市区町村のすがた」（総務省「住宅・土地統計調査」）にもとづく街ごとの統計値です。いま募集中の家賃や物件一覧ではなく、部屋の募集掲載は出していません。
            </p>
          </div>
        </section>
      </div>
      {children}
    </>
  );
}
