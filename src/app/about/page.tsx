import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME, SITE_TAGLINE, CORE_ROUTES } from "@/lib/siteStructure";

/**
 * 運営者情報とデータの出典。
 *
 * AdSense の審査では、誰が運営していて何を根拠に情報を出しているかが見られる。
 * 判定の限界と免責もここに明記しておく。占いの判定を断定的に出すページなので、
 * 何を保証していないかを書いておかないと誤解を招く。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "このサイトについて",
  description: `${SITE_NAME}の運営者情報、データの出典、判定の考え方、免責事項について説明しています。`,
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      {/* 幅は全画面で 1700px に揃える（/guide/[slug] と同じ理由）。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <h1 className="text-3xl font-bold font-serif tracking-tight">
          このサイトについて
        </h1>

        <section className="mt-8">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            何をするサイトか
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            {SITE_NAME}は、{SITE_TAGLINE}
            ためのサービスです。九星気学の方位盤と、公開されている住まいの統計（家賃の水準・空き家率・地価・成約価格）を同じ基準で突き合わせ、「いつ、どの方位のどの街へ動くか」を検討できるようにしています。募集中の部屋の一覧は出していません（2026-09-20
            に、掲載元の規約に従って取り込みを止めました）。実際の募集は各社のサイトでご確認ください。
          </p>
          <ul className="mt-4 text-sm text-slate-700 space-y-2 list-disc pl-5">
            {CORE_ROUTES.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="font-semibold hover:text-rose-600">
                  {r.label}
                </Link>
                <span className="text-xs text-slate-600"> — {r.summary}</span>
              </li>
            ))}
          </ul>
        </section>

        {/*
          「何をするサイトか」は機能の一覧で、**決めるときに何の役に立つか**は
          どこにも書いていなかった（記事 29 本もすべて個別の論点で、入口が無い）。
          判定を断定的に出す画面がある一方、**しないこと**を正面から書いた場所が
          免責しか無いのは案内として足りない。ここに置く。

          **移り変わる数字を書かないこと。**掲載を集計できた市区町村の数は
          毎晩の巡回で動くので、ここに書くと確実に古くなる（CLAUDE.md 4 節の
          「残数は必ず実測してから言う」と同じ理由）。構造だけを書く。
        */}
        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            決めるために、この道具が何をするか
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            引越しの決断が重いのは、選択肢が多すぎて比べられないからです。このサイトがするのは、どの未来が来るかを当てることではなく、比べられる形に整えることです。
          </p>
          <dl className="mt-4 text-sm text-slate-700 space-y-3">
            <div>
              <dt className="font-bold text-xs text-slate-500">候補を絞る</dt>
              <dd className="leading-relaxed">
                全国の市区町村を、方位の吉凶と住まいの統計の両方で絞り込みます。まず動ける日を決め、その日に開いている方位の街だけを並べます。検討できる数まで候補を減らすところが、手作業ではいちばん手間の掛かる部分です。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-slate-500">
                前提を1つに固定する
              </dt>
              <dd className="leading-relaxed">
                生年月日と出発地は「使用中のプロフィール」1つに決まり、どの画面も同じ値を読みます。各ページの上部に「この設定でこの方位を出しています」と表示します。判定の基準は常に真北、暦の日付は常に日本時間なので、閲覧する場所や時刻で答えが変わることはありません。真北で判定する理由は
                <Link
                  href="/blog/where-feng-shui-came-from"
                  className="underline hover:text-rose-600"
                >
                  風水はどこから来たのか
                </Link>
                に書いています。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-slate-500">
                分からないことは、分からないと書く
              </dt>
              <dd className="leading-relaxed">
                方位ごとの一覧で候補が出ないとき、「掲載を集計できていないだけ」と「陸が尽きている」を分けて書きます。流派によって算出が分かれる箇所は、どちらかを選ばず両方を併記します。方位磁針で測ると別の方位に見える地点には、その注意を添えます。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-slate-500">
                「動かない」も答えとして出す
              </dt>
              <dd className="leading-relaxed">
                避けるべきとされる方位や時期は、そのまま表示します。見送るという選択も検討できるようにしてあります。
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            反対に、この道具が決めないこともあります。方位の判定は参考にする条件の1つで、家賃、災害リスク、契約条件、通勤時間、医療・教育環境、家族の合意は別に確かめる必要があります。判定の考え方がいつ・誰の手で形になったものかは
            <Link
              href="/blog/where-kigaku-and-houi-came-from"
              className="underline hover:text-rose-600"
            >
              九星気学と方位はどこから来たのか
            </Link>
            に、操作の手順は
            <Link href="/guide" className="underline hover:text-rose-600">
              使い方の案内
            </Link>
            にまとめています。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            データの出典
          </h2>
          <dl className="mt-4 text-sm text-slate-700 space-y-3">
            <div>
              <dt className="font-bold text-xs text-slate-500">住まいの統計</dt>
              <dd className="leading-relaxed">
                市区町村ごとの借家の家賃と空き家率は、e-Stat「統計でみる市区町村のすがた」（2023
                年住宅・土地統計調査）の公表値です。成約価格と地価公示は国土交通省の公開データを使っています。いずれも公表の周期で更新されるもので、いま募集中の部屋の情報ではありません。
                <br />
                以前は賃貸情報サイトから募集中の部屋を取得して並べていましたが、掲載元の規約に従って
                2026 年 9 月に取り込みを止め、物件の一覧も閉じました。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-slate-500">座標</dt>
              <dd className="leading-relaxed">
                国土地理院の住所検索APIを用いて住所から求めています。番地まで特定できない場合は町丁目の代表点になります。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-slate-500">地域の統計</dt>
              <dd className="leading-relaxed">
                市区町村ごとの所得統計など、公的に公開されている統計を利用しています。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-slate-500">方位・暦の計算</dt>
              <dd className="leading-relaxed">
                九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺、土用の期間をサイト内で計算しています。方位は出発地から目的地への大圏方位角で求め、判定の基準は常に真北です。磁北は「方位磁針で測るとずれる」という注意として表示するだけで、吉凶の判定には使いません。地磁気偏角は出発地ごとに求め、取得できない場合は補正しません。暦の日付は日本時間で切り替えます。
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            判定について（免責）
          </h2>
          <ul className="mt-4 text-sm text-slate-700 space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              九星気学は伝統的な考え方であり、科学的に効果が確認されたものではありません。判定結果は参考情報としてご利用ください。
            </li>
            <li>
              流派によって方位や吉凶の考え方は異なります。本サイトの判定と異なる見解があることをご了承ください。算出方法が複数ある箇所では、両方の結果を併記しています。
            </li>
            <li>
              家賃の水準・空き家率・地価・成約価格は公的統計の公表値で、個々の物件の条件ではありません。実際の賃料や募集状況は各社のサイトでご確認ください。
            </li>
            <li>
              本サイトの情報を用いた判断によって生じた損害について、運営者は責任を負いかねます。
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            運営者
          </h2>
          <dl className="mt-4 text-sm text-slate-700 space-y-2">
            <div className="flex gap-3">
              <dt className="font-bold text-xs text-slate-500 w-24 shrink-0 pt-0.5">
                運営
              </dt>
              <dd>M. Ishibashi</dd>
            </div>
            <div className="flex gap-3">
              <dt className="font-bold text-xs text-slate-500 w-24 shrink-0 pt-0.5">
                サイト名
              </dt>
              <dd>{SITE_NAME}（cloud-palette.com）</dd>
            </div>
            <div className="flex gap-3">
              <dt className="font-bold text-xs text-slate-500 w-24 shrink-0 pt-0.5">
                連絡先
              </dt>
              <dd>
                <Link href="/contact" className="font-semibold hover:text-rose-600 underline">
                  お問い合わせフォーム
                </Link>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            広告について
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            本サイトでは第三者配信の広告を利用する場合があります。取り扱いの詳細は
            <Link href="/privacy" className="underline hover:text-rose-600">
              プライバシーポリシー
            </Link>
            をご覧ください。
          </p>
        </section>
      </article>
    </div>
  );
}
