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
            {SITE_NAME}は、{SITE_TAGLINE}ためのサービスです。九星気学の方位盤と、実際に募集中の賃貸物件のデータを同じ基準で突き合わせ、「どの方位のどの物件へ、いつ動くか」を検討できるようにしています。
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

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-slate-300 pb-2">
            データの出典
          </h2>
          <dl className="mt-4 text-sm text-slate-700 space-y-3">
            <div>
              <dt className="font-bold text-xs text-slate-500">物件情報</dt>
              <dd className="leading-relaxed">
                一般に公開されている賃貸情報サイトから定期的に取得しています。同じ部屋が複数の不動産会社から重複して掲載されるため、建物名・階・間取り・面積・賃料の一致でまとめています。掲載が終了したものは順次除外していますが、取得の間隔があるため、既に募集が終わっている場合があります。最新の募集状況は掲載元でご確認ください。
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
                九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺、土用の期間をサイト内で計算しています。方位は出発地からの方位角で判定し、磁北を用いる場合はその時点の地磁気偏角で補正します。
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
              賃料・面積・築年数などは掲載元の情報をそのまま用いており、正確性を保証するものではありません。契約前に必ず掲載元および不動産会社にご確認ください。
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
