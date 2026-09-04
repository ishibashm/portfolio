import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * 物件を貸したい・売りたいオーナー向けの案内。
 *
 * ## なぜ作るか
 *
 * 掲載したいという需要がある（利用者の指摘）。ただし掲載を受け付けるには
 * 個人情報を預かることになり、集めてしまった記録は後から消せない。
 * **まず「何をする場所で、何をしないか」だけを置く。**この頁は
 * 申し込みを受け付けない。連絡は既存の /contact に寄せ、新しく集める
 * 項目を増やさない。
 *
 * ## 免許の線
 *
 * 広告として掲載すること、自ら貸主の物件を載せることは宅地建物取引業に
 * 当たらない。**当たるのは媒介・代理**（条件の交渉、契約書の作成、
 * 重要事項説明）で、これには免許が要る。この頁ではその線を先に書いておく。
 * 後から「やっぱりできません」と言うほうが不誠実になる。
 *
 * ## 数字を約束しない
 *
 * 閲覧数や成約率は書かない。実績が無いうちに書けば嘘になり、書けるように
 * なっても毎日動く数字を静的な頁に置くと腐る。
 */

const TITLE = "物件を掲載したいオーナーの方へ";
const DESCRIPTION =
  "方位と日取りで住まいを探す人が読むサイトです。掲載の考え方、いまできること、当サイトがしないこと（媒介・代理）をまとめました。掲載の受け付けは準備中です。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/owners" },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/owners`,
    type: "website",
    images: ["/ogp.png"],
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="border-b border-slate-300 pb-2 font-serif text-lg font-bold">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

export default function OwnersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] font-sans text-slate-900">
      <main className="mx-auto max-w-[1700px] px-5 py-10 md:py-14">
        <nav className="text-xs text-slate-500">
          <Link href="/" className="font-bold hover:text-rose-600">
            {SITE_NAME}
          </Link>
          <span className="mx-2">/</span>
          <span>オーナーの方へ</span>
        </nav>

        <h1 className="mt-6 font-serif text-3xl font-bold leading-tight md:text-4xl">
          {TITLE}
        </h1>
        <p className="mt-5 max-w-[70ch] border-l-4 border-rose-300 pl-4 text-sm leading-7 text-slate-600">
          {DESCRIPTION}
        </p>

        <div className="mt-2 grid gap-x-12 lg:grid-cols-2">
          <div>
            <Section title="ここを読んでいるのは、どういう人か">
              <p>
                このサイトの利用者は、住む場所を
                <b>方位と日取りから決めようとしている人</b>
                です。今住んでいる場所を起点に、行ける方位と動ける時期が絞られた状態で物件を探します。
              </p>
              <p>
                そのため、探し方が一般の賃貸サイトと違います。地域や駅で絞るのではなく、
                <b>先に方位が決まっていて、その中で住める部屋を探す</b>
                という順番になります。同じ物件でも、出発地が違えば候補に入る人と入らない人がいます。
              </p>
              <p>
                件数の多さで勝負するサイトではありません。
                <b>読者の数は多くありません</b>
                が、探し方が限られているぶん、条件に合う物件は見つけにくく、見つかれば真剣に検討されます。
              </p>
            </Section>

            <Section title="いまできること">
              <p>
                <b>掲載の受け付けはまだ始めていません。</b>
                掲載を検討されている場合は、
                <Link
                  href="/contact"
                  className="font-bold text-indigo-600 underline"
                >
                  お問い合わせ
                </Link>
                からご連絡ください。物件の所在地・種別・おおよその条件をうかがい、掲載を始めた際にご案内します。
              </p>
              <p>
                この段階でお預かりするのは、お名前・連絡先・ご相談の内容だけです。
                <b>物件の詳しい情報を登録する仕組みはまだありません。</b>
              </p>
            </Section>
          </div>

          <div>
            <Section title="当サイトがしないこと">
              <p>
                <b>媒介と代理は行いません。</b>
                条件の交渉、契約書の作成、重要事項説明といった業務は宅地建物取引業に当たり、免許を持つ事業者でなければ行えません。当サイトは免許を持っていません。
              </p>
              <p>
                掲載を始めた後も、当サイトの役割は
                <b>物件を見つけてもらうところまで</b>
                です。その先の手続きは、オーナーの方ご自身か、依頼している不動産会社にお願いすることになります。
              </p>
              <p>
                掲載する場合は、貸主ご自身なのか不動産会社を通すのかを
                <b>取引態様として明示</b>
                します。募集が終わった物件は下げます。これは不動産の広告に共通する決まりで、当サイトの方針ではありません。
              </p>
            </Section>

            <Section title="これから作るもの">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>掲載の申し込みと、内容を確認したうえでの公開</li>
                <li>方位から探す一覧に、掲載物件が並ぶようにすること</li>
                <li>
                  リフォーム・リノベーションの情報（貸す前・売る前の判断材料）
                </li>
              </ul>
              <p>
                順番と時期は決まっていません。
                <b>需要を確かめてから作ります。</b>
                ご要望があれば、上のお問い合わせからお聞かせください。
              </p>
            </Section>
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-stone-200 bg-white/70 p-5 text-xs leading-relaxed text-slate-600">
          このサイトの判定は九星気学と暦の考え方によるもので、
          <b>科学的に効果が確認されたものではありません</b>
          。物件の価値や賃料と方位の吉凶は無関係です。掲載にあたって、方位が良いことを理由に条件を有利に扱うことはありません。
        </div>
      </main>
    </div>
  );
}
