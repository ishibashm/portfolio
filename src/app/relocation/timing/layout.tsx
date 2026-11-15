import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph } from "@/lib/siteUrl";
import { coreRouteLabel } from "@/lib/siteStructure";
import { ToolPageIntro } from "@/components/relocation/ToolPageIntro";

export const metadata: Metadata = {
  title: "引っ越し時期の全期間分析",
  description:
    "過去から未来まで、日ごと・方位ごとの吉凶を一望する。カレンダーヒートマップ、段階の分布、窓の帯グラフ、平年比で「いつ・どこへ動くか」を決める。",
  // market と同じく canonical と og:image が抜けていた。同格のページに揃える。
  alternates: { canonical: "/relocation/timing" },
  openGraph: pageOpenGraph(
    "/relocation/timing",
    "引っ越し時期の全期間分析",
    "日×方位の吉凶をカレンダーと分布で一望。窓の長さ・間隔・平年比まで。",
  ),
};

export default function TimingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ToolPageIntro
        guideHref="/guide/choose-date"
        guideLabel="日取りの使い方を読む"
      >
        生年月日と出発地から、年・月・日の条件が重なる引越しの時期を見ます。動ける日が先に決まると、探す範囲を絞れます。
      </ToolPageIntro>
      <div className="mx-auto max-w-[1700px] px-4 pt-4 md:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
            <h2 className="text-sm font-bold text-stone-800">
              引っ越し料金が抑えやすい時期の一般的な傾向
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
              SUUMO引越しの解説では、2〜4月を依頼が集中し料金が上がりやすい繁忙期、5月〜翌1月を比較的安く抑えられる傾向がある通常期としています（出典:{" "}
              <a
                href="https://hikkoshi.suumo.jp/oyakudachi/788.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-600 underline hover:text-indigo-800"
              >
                SUUMO引越し（時期の解説）
              </a>
              、
              <a
                href="https://hikkoshi.suumo.jp/soba/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-600 underline hover:text-indigo-800"
              >
                SUUMO引越し（費用相場）
              </a>
              ）。繁忙期の中でも3月下旬〜4月上旬に依頼が特に集中し料金も高くなりやすいとされ、国土交通省の発表資料でも3月中旬〜4月上旬が例年の最繁忙期として案内されています（出典:{" "}
              <a
                href="https://www.mlit.go.jp/report/press/content/001863859.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-600 underline hover:text-indigo-800"
              >
                国土交通省（引越時期の分散協力に関する発表資料PDF）
              </a>
              ）。また、同じ月の中では下旬にかけて需要が高まりやすく、上旬のほうが抑えやすいとされています（出典:
              上記SUUMO引越し、
              <a
                href="https://hikkoshi-pedia.com/yen/536/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-600 underline hover:text-indigo-800"
              >
                引越しペディア
              </a>
              ）。
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
              実際の引っ越し料金は、地域・日程・荷物量・移動距離・業者などの条件によって変わります（出典:
              上記SUUMO引越し、
              <a
                href="https://hikkoshizamurai.jp/prices/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-600 underline hover:text-indigo-800"
              >
                引越し侍
              </a>
              。このページに料金の実測データはありません）。関連するサイト内の説明として、暦と生活の都合の兼ね合いは
              <Link
                href="/blog/what-is-hidori-for-moving"
                className="mx-1 font-semibold text-indigo-600 underline hover:text-indigo-800"
              >
                引越しの日取りとは。何を見て、どの順に決めるのか
              </Link>
              でも扱っています。
            </p>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
            <h2 className="text-sm font-bold text-stone-800">
              方位と時期の確認手順（占い上の目安）
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
              九星気学や天中殺による方位・時期の判定は、伝統的な暦に基づく占い上の目安であり、科学的な効果や料金を保証するものではありません。
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-stone-600">
              <li>
                生年月日・出発地・天中殺の扱いは
                <Link
                  href="/relocation/arbitrage"
                  className="mx-1 font-semibold text-indigo-600 underline hover:text-indigo-800"
                >
                  {coreRouteLabel("/relocation/arbitrage")}
                </Link>
                の設定と共有しています（未設定の場合は先に設定します）。
              </li>
              <li>
                このページで過去・未来の範囲を決め、「走査を始める」を押すと、日ごと・方位ごとの吉凶が出ます。
              </li>
              <li>
                方位別サマリーやカレンダーヒートマップ、選択日の地図で、動ける日と方位を確認できます。
              </li>
              <li>
                絞った候補日を六曜・天赦日・一粒万倍日などの暦注で確かめるときは
                <Link
                  href="/calendar"
                  className="mx-1 font-semibold text-indigo-600 underline hover:text-indigo-800"
                >
                  日取りカレンダー
                </Link>
                を使います。
              </li>
            </ol>
          </section>
        </div>
      </div>
      {children}
    </>
  );
}
