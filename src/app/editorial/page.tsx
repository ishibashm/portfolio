import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * 編集方針。AdSense の再審査で求められる「継続的なキュレーションと
 * 構造のメンテナンス」を、サイト自身の言葉で示す頁。
 *
 * **書いてよいこと。**すでに /about・地域頁の決め事・プライバシー
 * ポリシーにある事実だけ。運営者の経歴や肩書、効果の保証、件数の
 * 約束は書かない（/about と同じ）。
 */
const TITLE = "編集方針";
const DESCRIPTION = `${SITE_NAME}が、ページを公開し検索の対象にするときの考え方です。出典、索引の範囲、広告の扱い、訂正の窓口をまとめています。`;

export const metadata: Metadata = {
  alternates: { canonical: "/editorial" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/editorial", TITLE, DESCRIPTION),
};

export default function EditorialPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <h1 className="text-3xl font-bold font-serif tracking-tight">
          編集方針
        </h1>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          {SITE_NAME}
          （cloud-palette.com）が、ページを公開し、検索の対象にするときの考え方です。運営者情報と判定の免責は
          <Link href="/about" className="underline hover:text-rose-600">
            このサイトについて
          </Link>
          に、個人情報と広告の取り扱いは
          <Link href="/privacy" className="underline hover:text-rose-600">
            プライバシーポリシー
          </Link>
          にあります。
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            扱うこと、扱わないこと
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            このサイトが答えるのは、引越しの方位、動く時期、住む場所の家賃水準と空き家率です。九星気学の方位盤、六曜・天赦日・一粒万倍日・土用・天中殺、公的統計を突き合わせます。募集中の部屋の一覧は出していません。掲載元の規約に従って取り込みを
            2026 年 9 月 13 日に止め、同月 20
            日に物件検索の掲載を閉じました。実際の募集は各社のサイトでご確認ください。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            情報の出典
          </h2>
          <ul className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700 space-y-2 list-disc pl-5">
            <li>
              市区町村ごとの借家の家賃と空き家率は、e-Stat「統計でみる市区町村のすがた」（2023
              年住宅・土地統計調査）の公表値です。成約価格と地価公示は国土交通省の公開データを使っています。いま募集中の部屋の情報ではありません。
            </li>
            <li>
              座標は国土地理院の住所検索 API
              を用いて求めています。番地まで特定できない場合は町丁目の代表点になります。
            </li>
            <li>
              方位盤と暦はサイト内で計算しています。判定の基準は常に真北、暦の日付は日本時間です。磁北は「方位磁針で測るとずれる」という注意として表示するだけで、吉凶の判定には使いません。
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            索引に載せるページ
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            同じ雛形を大量に検索へ出すと、ページごとの違いが地名と数字だけになります。そのため、次の範囲に絞っています。ページ自体は道具として残し、検索から外す場合は
            noindex にしてサイトマップにも載せません。
          </p>
          <ul className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700 space-y-2 list-disc pl-5">
            <li>
              市区町村ページ（
              <Link href="/houi/area" className="underline hover:text-rose-600">
                エリア別の一覧
              </Link>
              ）は、その街の地理の構造を書いた文章があり、住宅統計の公表値もあるものだけを索引に載せます。文章の無い頁は残しますが、検索の対象にはしません。
            </li>
            <li>
              都道府県ページは、県ごとの地理と相場の傾きを書いた
              <Link href="/houi/pref" className="underline hover:text-rose-600">
                都道府県の一覧
              </Link>
              から辿れます。
            </li>
            <li>
              本命星ごとの年盤（例:{" "}
              <Link
                href="/houi/2026/1"
                className="underline hover:text-rose-600"
              >
                2026年の一白水星
              </Link>
              ）は、その年・その星の判定が頁ごとに変わるため索引の対象です。同じ組み合わせの月盤は、年盤の補助として残し、検索の対象にはしません。
            </li>
            <li>
              記事と使い方ガイドは、操作しなくても読める解説として索引の対象です。
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            地域ページの書き方
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            市区町村と都道府県の解説では、日々変わりうる件数や家賃の額を文章に書きません。表がその日の公表値を出します。文章が担当するのは、どの方位に何があるか、海や山で行き止まりになるか、といった地理の構造です。方位は、出発地の代表点（県の頁では県の面積重心）からの大圏方位角を、気学の伝統区分で切った結果です。分からないこと、データが届いていないことは、分からないと書きます。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            広告とアフィリエイト
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            第三者配信の広告を利用する場合があります。A8.netのアフィリエイトプログラムに参加しており、リンクから商品やサービスを申し込むと紹介料を受け取ることがあります。アフィリエイトの広告枠には「広告」と表示します。紹介料の有無は、方位の判定や記事の結論には影響しません。詳細は
            <Link href="/privacy" className="underline hover:text-rose-600">
              プライバシーポリシー
            </Link>
            をご覧ください。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            誤りと連絡
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            記述の誤りや出典の更新に気づかれた場合は、
            <Link href="/contact" className="underline hover:text-rose-600">
              お問い合わせフォーム
            </Link>
            からご連絡ください。運営者の表記は
            <Link href="/about" className="underline hover:text-rose-600">
              このサイトについて
            </Link>
            にあります。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            判定について
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            九星気学は伝統的な考え方であり、科学的に効果が確認されたものではありません。判定結果は参考情報としてご利用ください。流派によって方位や吉凶の考え方は異なります。本サイトの情報を用いた判断によって生じた損害について、運営者は責任を負いかねます。
          </p>
        </section>
      </article>
    </div>
  );
}
