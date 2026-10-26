import type { Metadata } from "next";
import Link from "next/link";
import { FaqJsonLd } from "@/components/JsonLd";
import { TenchusatsuChecker } from "@/components/houi/TenchusatsuChecker";
import { tenchusatsuTimeline } from "@/lib/tenchusatsuTimeline";
import { JUNISHI, TENCHUSATSU_GROUPS } from "@/utils/tenchusatsuCore";
import { pageOpenGraph } from "@/lib/siteUrl";

const TITLE = "天中殺の引越しは大丈夫？生年月日で計算・3年間の月別早見表";
const DESCRIPTION =
  "生年月日から6つの天中殺グループと今年・今後3年間の天中殺月を確認。引越しの方位・日取り・仮住まいの考え方、相談先をご案内します。";
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/houi/tenchusatsu" },
  openGraph: pageOpenGraph("/houi/tenchusatsu", TITLE, DESCRIPTION),
};
// 現在の節年・節月と、公開中のカレンダー範囲をリクエスト時に揃える。
export const dynamic = "force-dynamic";
const FAQ = [
  {
    question: "天中殺に引越ししてはいけませんか？",
    answer:
      "一律に不可とはしません。自発的な移転を慎む流派もありますが、転勤など避けられない事情は別に扱う考え方があります。方位・日取り・生活上の条件を分けて確認しましょう。",
  },
  {
    question: "天中殺の年や月はいつ切り替わりますか？",
    answer:
      "このページでは日本標準時で、年は立春、月は各月の節入りで切り替えます。1月1日や毎月1日からではありません。天中殺は12年のうち2年、12節月のうち2か月が巡ります。",
  },
  {
    question: "吉方位なら天中殺を打ち消せますか？",
    answer:
      "打ち消せるとはいえません。天中殺は算命学・四柱推命、方位の吉凶は九星気学の別の判断です。五黄殺・暗剣殺は誰にとっても凶方位として扱います。八宅風水と九星気学の点数も合算しません。",
  },
];

export default function TenchusatsuPage() {
  const timeline = tenchusatsuTimeline();
  return (
    <main className="wg-page min-h-screen px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <FaqJsonLd items={FAQ} />
        <header>
          <Link href="/houi" className="text-sm text-rose-700 underline">
            方位と引越し
          </Link>
          <h1 className="mt-3 text-2xl font-bold">
            天中殺の引越し・生年月日から時期を確認
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {timeline.today}
            （JST）時点。伝統的な暦の見方であり、出来事を予測・保証するものではありません。
          </p>
        </header>
        <TenchusatsuChecker timeline={timeline} />
        <section className="wg-card p-6">
          <h2 className="text-xl font-bold">6つの天中殺・年と月の早見表</h2>
          <p className="mt-2 text-sm">
            年は立春から翌年の立春前まで。月は表の月の節入りから次の節入り前までです。年の例は
            {timeline.year}年から12年間を表示します。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                天中殺グループ別の対象年・節月
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-2">
                    グループ
                  </th>
                  <th scope="col" className="p-2">
                    対象年の支・年の例
                  </th>
                  <th scope="col" className="p-2">
                    毎年の節月
                  </th>
                </tr>
              </thead>
              <tbody>
                {TENCHUSATSU_GROUPS.map((g) => {
                  const years = Array.from(
                    { length: 12 },
                    (_, i) => timeline.year + i,
                  ).filter((y) =>
                    g.voidBranches.includes(
                      JUNISHI[(((y - 4) % 12) + 12) % 12],
                    ),
                  );
                  const months = g.voidBranches.map(
                    (b) => JUNISHI.indexOf(b) || 12,
                  );
                  return (
                    <tr key={g.id} className="border-b border-rose-100">
                      <th scope="row" className="p-2">
                        {g.name}天中殺
                      </th>
                      <td className="p-2">
                        {g.voidBranches.join("・")}年（{years.join("・")}年）
                      </td>
                      <td className="p-2">{months.join("・")}月</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="wg-card p-6">
          <h2 className="text-xl font-bold">契約日が決まっている方へ</h2>
          <p className="mt-2 text-sm">
            転勤・仮住まいなどの事情と、移転先・入居日を整理して相談できます。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/practitioners" className="wg-btn-accent">
              鑑定士に相談する
            </Link>
            <Link href="/ask" className="wg-btn-primary">
              AIに相談する
            </Link>
          </div>
        </section>
        <section className="wg-card p-6">
          <h2 className="text-xl font-bold">よくある質問</h2>
          <dl className="mt-4 space-y-4">
            {FAQ.map((f) => (
              <div key={f.question}>
                <dt className="font-bold">{f.question}</dt>
                <dd className="mt-1 text-sm">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        <nav
          aria-label="関連する解説"
          className="flex flex-col gap-3 text-rose-700 underline"
        >
          <Link href="/blog/moving-during-tenchusatsu">
            天中殺の引っ越しは大丈夫？避けられない時の対処法
          </Link>
          <Link href="/blog/houi-and-tenchusatsu">
            方位判定に天中殺は必要？九星気学との違い
          </Link>
        </nav>
      </div>
    </main>
  );
}
