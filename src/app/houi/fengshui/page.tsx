import Link from "next/link";
import type { Metadata } from "next";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { FengShuiLookup } from "@/components/houi/FengShuiLookup";
import { AdBanner } from "@/components/ads/AdBanner";

/**
 * 風水（八宅）の頁。
 *
 * ## なぜ独立させたか（利用者の指摘、2026-09-04）
 *
 * 「風水の要素が見れるものがまだサイトに見つからない」。実装は前から
 * あったが、**置き場所が `/houi` の 4 番目の節だけ**だった。専用の URL
 * が無く、ナビの見出しは「本命星と吉方位を調べる」で、サイトのどこにも
 * 「風水」という語が出ない。**中にあると分からないものは、無いのと同じ。**
 *
 * 同じことが `/houi/area` でも起きていて、そのときも「入口が /houi の
 * 中ほどのボタン 1 つしか無かった」と書いてある（siteStructure）。
 * 作った機能に URL とナビの行を与えないと、検索から来た人にしか届かない。
 *
 * ## 九星気学と混ぜない
 *
 * 八宅は**別の流派**で、既定では判定に使っていない。頁を分けたことで
 * その線がはっきりする。**点にして足さない**という決め事は変えていない。
 * 合計すると、どちらの流派の答えでもない数字ができる。
 *
 * 引き方だけはそろえてある（自分が何かを引いて、その人にとっての
 * 8 方位を読む）ので、`/houi` と行き来できるようにしておく。
 */

const TITLE = "風水（八宅）で自分の吉方位を調べる";
const DESCRIPTION =
  "生まれ年と性別から本命卦を引き、八宅風水でいう生気・天医・延年・伏位の四吉方と、絶命・五鬼・六殺・禍害の四凶方がどの方位に当たるかを一覧で確認できます。九星気学とは別の流派として、並べて読めます。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/houi/fengshui" },
};

export const revalidate = 60;

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-slate-800 md:p-8">
      <div className="mx-auto max-w-[1700px]">
        {/* 県ページに無くて指摘された（#802）ので、ここには最初から
            付けておく。検索結果に階層が出る */}
        <nav className="text-[11px] text-slate-500">
          <Link href="/houi" className="underline hover:text-rose-600">
            本命星と吉方位
          </Link>
          <span className="mx-1">/</span>
          <span>風水（八宅）</span>
        </nav>

        <h1 className="mt-2 font-serif text-2xl font-bold">{TITLE}</h1>
        <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-slate-600">
          {
            "生まれ年と性別から本命卦を引き、その人にとっての 8 方位を読みます。九星気学とは"
          }
          <b>別の流派</b>
          {
            "です。当サイトの判定（段階評価）は九星気学で行っていて、八宅は既定では使っていません。"
          }
        </p>

        <section className="mt-8">
          <FengShuiLookup />
        </section>

        {/*
          両方を並べたときの読み方。足し算をしない理由をここに書く。
          頁を分けたぶん、分けた意味を書かないと「どちらが正しいのか」
          という問いだけが残る。
        */}
        <section className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-sm font-bold">九星気学の結果と食い違うとき</h2>
          <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-slate-700">
            {
              "方位の良し悪しは流派によって違います。両方が吉の方位もあれば、片方だけの方位もあります。当サイトは"
            }
            <b>点にして合計しません</b>
            {
              "。足すと、どちらの流派の答えでもない数字ができるためです。両方をそのまま出すので、どちらを重く見るかは読む人が決めてください。"
            }
          </p>
          <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-slate-500">
            {
              "八宅は「住まいの向き」と「その人の本命卦」の組み合わせを見る考え方で、引越しの方位を測る九星気学とは、そもそも見ている対象が違います。同じ 8 方位に同じ名前が並ぶので同種に見えますが、由来は別です。"
            }
          </p>
        </section>

        <div className="mt-8">
          <AdBanner />
        </div>

        <section className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-sm font-bold">九星気学の側も見る</h2>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link
                href="/houi"
                className="font-semibold text-indigo-600 underline"
              >
                本命星と吉方位の早見表
              </Link>
              <span className="ml-1 text-slate-600">
                生まれ年から本命星を引き、その年の吉方位・五黄殺・暗剣殺・歳破・本命殺を見ます。
              </span>
            </li>
            <li>
              <Link
                href="/houi/area"
                className="font-semibold text-indigo-600 underline"
              >
                吉方位にある街を調べる
              </Link>
              <span className="ml-1 text-slate-600">
                いま住んでいる市区町村から見て、どの方位にどの街があるかを引きます。
              </span>
            </li>
            <li>
              <Link
                href="/relocation/simulator"
                className="font-semibold text-indigo-600 underline"
              >
                引越し先を試算する
              </Link>
              <span className="ml-1 text-slate-600">
                出発地と目的地を入れて、その移動の方位と時期を確かめます。
              </span>
            </li>
          </ul>
        </section>

        <ContentDisclaimer />
      </div>
    </div>
  );
}
